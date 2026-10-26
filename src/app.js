const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const { authRoutes, readName } = require('./auth');
const { createOmdb, UpstreamError } = require('./omdb');
const { createTmdb } = require('./tmdb');

const KINDS = ['movie', 'show'];
const MAX_REVIEW = 5000;

function createApp(dbPath, { passcode, secret, omdbKey, tmdbToken, fetch }) {
  if (!passcode || !secret) throw new Error('passcode and secret are required');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS titles (
    id INTEGER PRIMARY KEY,
    imdb_id TEXT UNIQUE,
    title TEXT NOT NULL,
    year TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('movie','show')),
    poster_url TEXT,
    plot TEXT,
    imdb_rating TEXT,
    note TEXT,
    added_by TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    watched_at TEXT,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    review TEXT
  )`);

  const app = express();
  app.set('trust proxy', 1); // Azure terminates TLS in front of us
  app.use(express.json());
  const page = (name) => path.join(__dirname, '..', 'public', name);

  // Visitors see the public page; the app only once signed in. Same URL, so never cache it.
  app.get('/', (req, res) => {
    res.set({ Vary: 'Cookie', 'Cache-Control': 'no-cache' });
    res.sendFile(page(readName(req, secret) ? 'index.html' : 'public.html'));
  });
  app.get('/login', (req, res) => res.sendFile(page('index.html')));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

  app.get('/healthz', (req, res) => res.send('ok'));

  // Public, read-only. Explicit column lists: never expose notes, who added what, or ids.
  const PUBLIC = 'imdb_id, title, year, kind, poster_url, plot';
  const publicQueue = db.prepare(`SELECT ${PUBLIC} FROM titles WHERE watched_at IS NULL ORDER BY id DESC`);
  const publicWatched = db.prepare(`SELECT ${PUBLIC}, rating, review, watched_at FROM titles WHERE watched_at IS NOT NULL ORDER BY watched_at DESC, id DESC`);
  app.get('/api/public', (req, res) => res.json({ queue: publicQueue.all(), watched: publicWatched.all() }));
  app.get('/public', (req, res) => res.sendFile(page('public.html')));

  authRoutes(app, { passcode, secret });

  const omdb = omdbKey && createOmdb({ apiKey: omdbKey, fetch });
  const tmdb = tmdbToken && createTmdb({ token: tmdbToken, fetch });

  app.get('/api/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters' });
    if (!omdb) return res.status(503).json({ error: 'Search is not configured' });
    try {
      res.json(await omdb.search(q));
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      console.error(e.message);
      res.status(502).json({ error: 'Search is unavailable right now' });
    }
  });

  app.get('/api/titles', (req, res) => {
    res.json(db.prepare('SELECT * FROM titles ORDER BY id DESC').all());
  });

  const getTitle = db.prepare('SELECT * FROM titles WHERE id = ?');

  app.get('/api/titles/:id/details', async (req, res) => {
    const t = getTitle.get(req.params.id);
    if (!t || !t.imdb_id) return res.status(404).json({ error: 'No details for that title' });
    if (!omdb) return res.status(503).json({ error: 'Details are not configured' });
    try {
      // streaming info is a bonus: if TMDB fails, the rundown still loads
      const [d, watch] = await Promise.all([
        omdb.details(t.imdb_id),
        tmdb ? tmdb.providers(t.imdb_id, t.kind).catch((e) => { console.error(e.message); return null; }) : null,
      ]);
      if (!d) return res.status(404).json({ error: 'No details for that title' });
      res.json({ ...d, watch });
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      console.error(e.message);
      res.status(502).json({ error: 'Details are unavailable right now' });
    }
  });
  const cleanNote = (n) => (typeof n === 'string' ? n.trim() || null : null);

  app.post('/api/titles', async (req, res) => {
    const { imdb_id: imdbId, kind } = req.body;
    const note = cleanNote(req.body.note);

    if (imdbId !== undefined) {
      if (typeof imdbId !== 'string' || !/^tt\d{5,10}$/.test(imdbId)) return res.status(400).json({ error: 'Invalid IMDb id' });
      if (db.prepare('SELECT 1 FROM titles WHERE imdb_id = ?').get(imdbId)) {
        return res.status(409).json({ error: 'Already in the list' });
      }
      if (!omdb) return res.status(503).json({ error: 'Search is not configured' });
      let d;
      try {
        d = await omdb.lookup(imdbId);
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e;
        console.error(e.message);
        return res.status(502).json({ error: 'IMDb lookup is unavailable right now' });
      }
      if (!d) return res.status(404).json({ error: 'Title not found' });
      try {
        const { lastInsertRowid } = db
          .prepare(`INSERT INTO titles (imdb_id, title, year, kind, poster_url, plot, imdb_rating, note, added_by)
                    VALUES (@imdb_id, @title, @year, @kind, @poster_url, @plot, @imdb_rating, @note, @added_by)`)
          .run({ ...d, note, added_by: req.user });
        return res.status(201).json(getTitle.get(lastInsertRowid));
      } catch (e) {
        // two people adding the same title at once: the UNIQUE index decides
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Already in the list' });
        throw e;
      }
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Kind must be movie or show' });
    const { lastInsertRowid } = db
      .prepare('INSERT INTO titles (title, kind, note, added_by) VALUES (?, ?, ?, ?)')
      .run(title, kind, note, req.user);
    res.status(201).json(getTitle.get(lastInsertRowid));
  });

  app.patch('/api/titles/:id', (req, res) => {
    if (req.user !== 'me') return res.status(403).json({ error: 'Only the owner can review' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !getTitle.get(id)) return res.status(404).json({ error: 'Title not found' });
    const { rating, review } = req.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1 to 5' });
    if (review !== undefined && (typeof review !== 'string' || review.length > MAX_REVIEW)) {
      return res.status(400).json({ error: `Review must be text under ${MAX_REVIEW} characters` });
    }
    // watched_at is set on the first review only, so edits keep the original date
    db.prepare("UPDATE titles SET rating = ?, review = ?, watched_at = COALESCE(watched_at, datetime('now')) WHERE id = ?")
      .run(rating, review?.trim() || null, id);
    res.json(getTitle.get(id));
  });

  app.delete('/api/titles/:id', (req, res) => {
    const id = Number(req.params.id);
    const t = Number.isInteger(id) && getTitle.get(id);
    if (!t) return res.status(404).json({ error: 'Title not found' });
    const allowed = req.user === 'me' || (t.added_by === req.user && !t.watched_at);
    if (!allowed) return res.status(403).json({ error: "You can only remove your own titles that aren't watched yet" });
    db.prepare('DELETE FROM titles WHERE id = ?').run(id);
    res.status(204).end();
  });

  return app;
}

module.exports = { createApp };
