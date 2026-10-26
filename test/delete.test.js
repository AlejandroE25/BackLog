const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, login } = require('./helpers');

async function setup() {
  const a = app();
  const friend = await login(a, 'friend');
  const me = await login(a, 'me');
  const mine = (await me.post('/api/titles').send({ title: 'Mine', kind: 'movie' })).body.id;
  const theirs = (await friend.post('/api/titles').send({ title: 'Theirs', kind: 'movie' })).body.id;
  return { a, friend, me, mine, theirs };
}
const titles = async (agent) => (await agent.get('/api/titles')).body.map((t) => t.title).sort();

test('anonymous gets 401', async () => {
  assert.strictEqual((await request(app()).delete('/api/titles/1')).status, 401);
});

test('friend can delete their own unwatched title', async () => {
  const { friend, theirs } = await setup();
  assert.strictEqual((await friend.delete(`/api/titles/${theirs}`)).status, 204);
  assert.deepStrictEqual(await titles(friend), ['Mine']);
});

test("friend cannot delete the owner's title", async () => {
  const { friend, mine } = await setup();
  assert.strictEqual((await friend.delete(`/api/titles/${mine}`)).status, 403);
  assert.deepStrictEqual(await titles(friend), ['Mine', 'Theirs']);
});

test('friend cannot delete their own title once it is watched', async () => {
  const { friend, me, theirs } = await setup();
  await me.patch(`/api/titles/${theirs}`).send({ rating: 4, review: 'good' });
  assert.strictEqual((await friend.delete(`/api/titles/${theirs}`)).status, 403);
  assert.deepStrictEqual(await titles(me), ['Mine', 'Theirs']);
});

test('owner can delete anything, including watched titles', async () => {
  const { me, theirs, mine } = await setup();
  await me.patch(`/api/titles/${theirs}`).send({ rating: 2 });
  assert.strictEqual((await me.delete(`/api/titles/${theirs}`)).status, 204);
  assert.strictEqual((await me.delete(`/api/titles/${mine}`)).status, 204);
  assert.deepStrictEqual(await titles(me), []);
});

test('unknown or non-numeric id is 404', async () => {
  const { me, friend } = await setup();
  assert.strictEqual((await me.delete('/api/titles/999')).status, 404);
  assert.strictEqual((await friend.delete('/api/titles/abc')).status, 404);
});

test('a deleted imdb title can be added again', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ Title: 'Dune', Year: '2021', Type: 'movie', imdbID: 'tt1160419', Poster: 'N/A', Plot: 'N/A', imdbRating: 'N/A' }) });
  const a = await login(require('../src/app').createApp(':memory:', { passcode: 'letmein', secret: 'test-secret', omdbKey: 'k', fetch }));
  const { body } = await a.post('/api/titles').send({ imdb_id: 'tt1160419' });
  await a.delete(`/api/titles/${body.id}`);
  assert.strictEqual((await a.post('/api/titles').send({ imdb_id: 'tt1160419' })).status, 201);
});
