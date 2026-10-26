const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const { authRoutes } = require('./auth');
const { createOmdb, UpstreamError } = require('./omdb');

const KINDS = ['movie', 'show'];

function createApp(dbPath, { passcode, secret, omdbKey, fetch }) {
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
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/healthz', (req, res) => res.send('ok'));

  authRoutes(app, { passcode, secret });

  const omdb = omdbKey && createOmdb({ apiKey: omdbKey, fetch });

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

  app.post('/api/titles', (req, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { kind } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Kind must be movie or show' });
    const note = typeof req.body.note === 'string' ? req.body.note.trim() || null : null;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO titles (title, kind, note, added_by) VALUES (?, ?, ?, ?)')
      .run(title, kind, note, req.user);
    res.status(201).json(db.prepare('SELECT * FROM titles WHERE id = ?').get(lastInsertRowid));
  });

  return app;
}

module.exports = { createApp };
