const { test } = require('node:test');
const assert = require('node:assert');
const { app, login } = require('./helpers');

async function withTitle() {
  const a = app();
  const friend = await login(a, 'friend');
  const me = await login(a, 'me');
  const { body } = await friend.post('/api/titles').send({ title: 'Dune', kind: 'movie' });
  return { friend, me, id: body.id };
}

test('owner marks watched with rating and review', async () => {
  const { me, id } = await withTitle();
  const res = await me.patch(`/api/titles/${id}`).send({ rating: 4, review: 'Great sandworms' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.rating, 4);
  assert.strictEqual(res.body.review, 'Great sandworms');
  assert.ok(res.body.watched_at);
});

test('friend gets 403 and the title stays unwatched', async () => {
  const { me, friend, id } = await withTitle();
  assert.strictEqual((await friend.patch(`/api/titles/${id}`).send({ rating: 5 })).status, 403);
  const [t] = (await me.get('/api/titles')).body;
  assert.strictEqual(t.watched_at, null);
});

test('anonymous gets 401', async () => {
  const request = require('supertest');
  assert.strictEqual((await request(app()).patch('/api/titles/1').send({ rating: 3 })).status, 401);
});

test('rating must be an integer 1-5', async () => {
  const { me, id } = await withTitle();
  for (const rating of [0, 6, 2.5, '4', null, undefined]) {
    assert.strictEqual((await me.patch(`/api/titles/${id}`).send({ rating })).status, 400, `rating ${rating}`);
  }
});

test('review must be a string and is trimmed; empty becomes null', async () => {
  const { me, id } = await withTitle();
  assert.strictEqual((await me.patch(`/api/titles/${id}`).send({ rating: 3, review: 42 })).status, 400);
  assert.strictEqual((await me.patch(`/api/titles/${id}`).send({ rating: 3, review: 'x'.repeat(5001) })).status, 400);
  const res = await me.patch(`/api/titles/${id}`).send({ rating: 3, review: '   ' });
  assert.strictEqual(res.body.review, null);
});

test('unknown or non-numeric id is 404', async () => {
  const { me } = await withTitle();
  assert.strictEqual((await me.patch('/api/titles/999').send({ rating: 3 })).status, 404);
  assert.strictEqual((await me.patch('/api/titles/abc').send({ rating: 3 })).status, 404);
});

test('review can be edited later and watched_at is kept', async () => {
  const { me, id } = await withTitle();
  const first = (await me.patch(`/api/titles/${id}`).send({ rating: 3, review: 'ok' })).body;
  const second = (await me.patch(`/api/titles/${id}`).send({ rating: 5, review: 'better on rewatch' })).body;
  assert.strictEqual(second.rating, 5);
  assert.strictEqual(second.review, 'better on rewatch');
  assert.strictEqual(second.watched_at, first.watched_at);
});

test('only rating/review are writable', async () => {
  const { me, id } = await withTitle();
  const res = await me.patch(`/api/titles/${id}`).send({ rating: 4, title: 'Hacked', added_by: 'me' });
  assert.strictEqual(res.body.title, 'Dune');
  assert.strictEqual(res.body.added_by, 'friend');
});
