const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { login, opts } = require('./helpers');

const DUNE = {
  Response: 'True', Title: 'Dune', Year: '2021', Type: 'movie', imdbID: 'tt1160419', Poster: 'N/A',
  Plot: 'Short.', imdbRating: '8.0', Rated: 'PG-13', Runtime: '155 min', Genre: 'Action, Adventure',
  Director: 'Denis Villeneuve', Actors: 'Timothée Chalamet, Zendaya', Awards: 'Won 6 Oscars', imdbVotes: '800,000',
  Ratings: [{ Source: 'Rotten Tomatoes', Value: '83%' }],
};
const FULL = { ...DUNE, Plot: 'The long plot.' };
const reply = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const appWith = (f) => createApp(':memory:', { ...opts, omdbKey: 'k', fetch: f });

test('details requires login', async () => {
  assert.strictEqual((await request(appWith(reply(DUNE))).get('/api/titles/1/details')).status, 401);
});

test('details returns the full IMDb rundown with the long plot, N/A as null', async () => {
  const urls = [];
  const a = await login(appWith(async (u) => { urls.push(u); return reply(urls.length === 1 ? DUNE : { ...FULL, Awards: 'N/A' })(); }), 'friend');
  const { body: t } = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  const res = await a.get(`/api/titles/${t.id}/details`);
  assert.strictEqual(res.status, 200);
  assert.match(urls[1], /plot=full/);
  assert.deepStrictEqual(res.body, {
    imdb_id: 'tt1160419', plot: 'The long plot.', rated: 'PG-13', runtime: '155 min', genre: 'Action, Adventure',
    director: 'Denis Villeneuve', actors: 'Timothée Chalamet, Zendaya', awards: null, imdb_votes: '800,000',
    ratings: [{ source: 'Rotten Tomatoes', value: '83%' }], watch: null,
  });
});

test('details for an unknown title is 404; OMDb outage is 502', async () => {
  let fail = false;
  const a = await login(appWith(async () => (fail ? { ok: false, status: 500, json: async () => ({}) } : reply(DUNE)())));
  assert.strictEqual((await a.get('/api/titles/99/details')).status, 404);
  const { body: t } = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  fail = true;
  assert.strictEqual((await a.get(`/api/titles/${t.id}/details`)).status, 502);
});

const US = { link: 'https://tmdb/watch', flatrate: [{ provider_name: 'Max', logo_path: '/m.png' }], rent: [{ provider_name: 'Apple TV', logo_path: '/a.png' }] };
const tmdbFetch = (calls, { fail = false, results = { US } } = {}) => async (url, opts) => {
  if (!String(url).includes('themoviedb')) return reply(DUNE)();
  calls.push({ url: String(url), auth: opts.headers.Authorization });
  if (fail) return { ok: false, status: 500, json: async () => ({}) };
  if (String(url).includes('/find/')) return reply({ movie_results: [{ id: 438631 }], tv_results: [] })();
  return reply({ results })();
};
const withTmdb = (f) => createApp(':memory:', { ...opts, omdbKey: 'k', tmdbToken: 'tok', fetch: f });

test('details include US watch providers from TMDB, sent with the bearer token', async () => {
  const calls = [];
  const a = await login(withTmdb(tmdbFetch(calls)));
  const { body: t } = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  const res = await a.get(`/api/titles/${t.id}/details`);
  assert.deepStrictEqual(res.body.watch, {
    link: 'https://tmdb/watch', stream: ['Max'], rent: ['Apple TV'], buy: [],
  });
  assert.match(calls[0].url, /\/find\/tt1160419/);
  assert.match(calls[1].url, /\/movie\/438631\/watch\/providers/);
  assert.strictEqual(calls[0].auth, 'Bearer tok');
});

test('no US listing or a TMDB outage leaves watch null without failing details', async () => {
  for (const f of [tmdbFetch([], { results: {} }), tmdbFetch([], { fail: true })]) {
    const a = await login(withTmdb(f));
    const { body: t } = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
    const res = await a.get(`/api/titles/${t.id}/details`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.watch, null);
  }
});
