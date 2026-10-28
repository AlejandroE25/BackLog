const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, login } = require('./helpers');

async function seeded() {
  const a = app();
  const friend = await login(a, 'friend');
  const me = await login(a, 'me');
  await friend.post('/api/titles').send({ title: 'Queued', kind: 'movie', note: 'private note' });
  const { body } = await friend.post('/api/titles').send({ title: 'Seen', kind: 'show' });
  await me.patch(`/api/titles/${body.id}`).send({ rating: 5, review: 'Loved it' });
  return a;
}

test('public feed needs no login and splits queue / watched', async () => {
  const res = await request(await seeded()).get('/api/public');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.queue.map((t) => t.title), ['Queued']);
  assert.deepStrictEqual(res.body.watched.map((t) => [t.title, t.rating, t.review]), [['Seen', 5, 'Loved it']]);
});

test('public feed exposes only whitelisted fields', async () => {
  const { queue, watched } = (await request(await seeded()).get('/api/public')).body;
  assert.deepStrictEqual(Object.keys(queue[0]).sort(), ['imdb_id', 'kind', 'plot', 'poster_url', 'title', 'year']);
  assert.deepStrictEqual(Object.keys(watched[0]).sort(), ['imdb_id', 'kind', 'plot', 'poster_url', 'rating', 'review', 'title', 'watched_at', 'year']);
  assert.doesNotMatch(JSON.stringify({ queue, watched }), /private note|added_by|friend/);
});

test('public page is served, and the private API is still locked', async () => {
  const a = await seeded();
  assert.strictEqual((await request(a).get('/public')).status, 200);
  for (const path of ['/api/titles', '/api/me', '/api/search?q=dune']) {
    assert.strictEqual((await request(a).get(path)).status, 401, path);
  }
  assert.strictEqual((await request(a).post('/api/titles').send({ title: 'x', kind: 'movie' })).status, 401);
});

test('empty list gives empty arrays', async () => {
  const res = await request(app()).get('/api/public');
  assert.deepStrictEqual(res.body, { inProgress: [], queue: [], watched: [] });
});
