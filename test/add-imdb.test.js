const { test } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { login, opts } = require('./helpers');

const DUNE = {
  Response: 'True', Title: 'Dune', Year: '2021', Type: 'movie', imdbID: 'tt1160419',
  Poster: 'https://img/dune.jpg', Plot: 'Spice.', imdbRating: '8.0',
};
const reply = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const appWith = (f) => createApp(':memory:', { ...opts, omdbKey: 'k', fetch: f });

test('adding by imdb_id fills details from OMDb, not from the client', async () => {
  const a = await login(appWith(reply(DUNE)), 'friend');
  const res = await a.post('/api/titles').send({ imdb_id: 'tt1160419', note: ' for movie night ', title: 'Hacked', kind: 'show' });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(
    { ...res.body, id: undefined, added_at: undefined },
    {
      id: undefined, imdb_id: 'tt1160419', title: 'Dune', year: '2021', kind: 'movie',
      poster_url: 'https://img/dune.jpg', plot: 'Spice.', imdb_rating: '8.0', note: 'for movie night',
      added_by: 'friend', added_at: undefined, watched_at: null, rating: null, review: null, in_progress: 0,
    },
  );
});

test('N/A poster, plot and rating become null', async () => {
  const a = await login(appWith(reply({ ...DUNE, Poster: 'N/A', Plot: 'N/A', imdbRating: 'N/A' })));
  const res = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  assert.strictEqual(res.body.poster_url, null);
  assert.strictEqual(res.body.plot, null);
  assert.strictEqual(res.body.imdb_rating, null);
});

test('series maps to show', async () => {
  const a = await login(appWith(reply({ ...DUNE, Type: 'series' })));
  assert.strictEqual((await a.post('/api/titles').send({ imdb_id: 'tt1160419' })).body.kind, 'show');
});

test('duplicate imdb_id gets 409 and skips the OMDb call', async () => {
  let calls = 0;
  const a = await login(appWith(async () => { calls++; return reply(DUNE)(); }));
  await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  const again = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  assert.strictEqual(again.status, 409);
  assert.match(again.body.error, /already/i);
  assert.strictEqual(calls, 1);
  assert.strictEqual((await a.get('/api/titles')).body.length, 1);
});

test('malformed imdb_id is rejected before calling OMDb', async () => {
  let calls = 0;
  const a = await login(appWith(async () => { calls++; return reply(DUNE)(); }));
  for (const imdb_id of ['dune', 'tt', 'tt12; DROP', 42]) {
    assert.strictEqual((await a.post('/api/titles').send({ imdb_id })).status, 400);
  }
  assert.strictEqual(calls, 0);
});

test('unknown imdb_id is 404, upstream failure is 502, no key is 503', async () => {
  const nf = await login(appWith(reply({ Response: 'False', Error: 'Incorrect IMDb ID.' })));
  assert.strictEqual((await nf.post('/api/titles').send({ imdb_id: 'tt9999999' })).status, 404);
  const down = await login(appWith(reply({}, 500)));
  assert.strictEqual((await down.post('/api/titles').send({ imdb_id: 'tt1160419' })).status, 502);
  const nokey = await login(createApp(':memory:', opts));
  assert.strictEqual((await nokey.post('/api/titles').send({ imdb_id: 'tt1160419' })).status, 503);
});

test('manual add still works', async () => {
  const a = await login(appWith(reply(DUNE)));
  assert.strictEqual((await a.post('/api/titles').send({ title: 'Home video', kind: 'movie' })).status, 201);
});
