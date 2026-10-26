const { test } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { login, opts } = require('./helpers');

const json = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const DUNE = {
  Response: 'True',
  Search: [
    { Title: 'Dune', Year: '2021', imdbID: 'tt1160419', Type: 'movie', Poster: 'https://img/dune.jpg' },
    { Title: 'Dune: Prophecy', Year: '2024–', imdbID: 'tt10466872', Type: 'series', Poster: 'N/A' },
    { Title: 'Some Episode', Year: '2020', imdbID: 'tt1', Type: 'episode', Poster: 'N/A' },
  ],
};

const appWith = (fetchImpl) => createApp(':memory:', { ...opts, omdbKey: 'k', fetch: fetchImpl });

test('search requires login', async () => {
  const request = require('supertest');
  assert.strictEqual((await request(appWith(json(DUNE))).get('/api/search?q=dune')).status, 401);
});

test('search normalizes results: kind, null poster, drops episodes', async () => {
  const a = await login(appWith(json(DUNE)));
  const res = await a.get('/api/search?q=dune');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, [
    { imdb_id: 'tt1160419', title: 'Dune', year: '2021', kind: 'movie', poster_url: 'https://img/dune.jpg' },
    { imdb_id: 'tt10466872', title: 'Dune: Prophecy', year: '2024–', kind: 'show', poster_url: null },
  ]);
});

test('short or missing query is rejected without calling OMDb', async () => {
  let calls = 0;
  const a = await login(appWith(async () => { calls++; return json(DUNE)(); }));
  assert.strictEqual((await a.get('/api/search?q=d')).status, 400);
  assert.strictEqual((await a.get('/api/search')).status, 400);
  assert.strictEqual(calls, 0);
});

test('no matches gives an empty list', async () => {
  const a = await login(appWith(json({ Response: 'False', Error: 'Movie not found!' })));
  const res = await a.get('/api/search?q=zzzzzz');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, []);
});

test('upstream failure becomes 502, not a crash', async () => {
  const bad = await login(appWith(json({}, 500)));
  assert.strictEqual((await bad.get('/api/search?q=dune')).status, 502);
  const down = await login(appWith(async () => { throw new Error('network'); }));
  assert.strictEqual((await down.get('/api/search?q=dune')).status, 502);
  const badKey = await login(appWith(json({ Response: 'False', Error: 'Invalid API key!' })));
  assert.strictEqual((await badKey.get('/api/search?q=dune')).status, 502);
});

test('repeat queries are served from cache', async () => {
  let calls = 0;
  const a = await login(appWith(async () => { calls++; return json(DUNE)(); }));
  await a.get('/api/search?q=Dune');
  await a.get('/api/search?q=dune');
  assert.strictEqual(calls, 1);
});

test('search is unavailable (503) when no OMDb key is configured', async () => {
  const a = await login(createApp(':memory:', opts));
  assert.strictEqual((await a.get('/api/search?q=dune')).status, 503);
});

test('API key is sent upstream but never returned to the client', async () => {
  let url;
  const a = await login(appWith(async (u) => { url = u; return json(DUNE)(); }));
  const res = await a.get('/api/search?q=dune');
  assert.match(url, /apikey=k/);
  assert.doesNotMatch(JSON.stringify(res.body), /apikey|"k"/);
});
