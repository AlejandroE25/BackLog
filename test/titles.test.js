const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, login } = require('./helpers');

test('creates a title and lists it', async () => {
  const a = await login(app());
  const res = await a.post('/api/titles').send({ title: 'Dune', kind: 'movie' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.title, 'Dune');
  const list = await a.get('/api/titles');
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(list.body.map((t) => t.title), ['Dune']);
});

test('rejects empty or whitespace title', async () => {
  const a = await login(app());
  for (const title of ['', '   ', undefined]) {
    const res = await a.post('/api/titles').send({ title, kind: 'movie' });
    assert.strictEqual(res.status, 400);
  }
});

test('rejects invalid kind', async () => {
  const a = await login(app());
  const res = await a.post('/api/titles').send({ title: 'X', kind: 'book' });
  assert.strictEqual(res.status, 400);
});

test('lists newest first', async () => {
  const a = await login(app());
  await a.post('/api/titles').send({ title: 'A', kind: 'movie' });
  await a.post('/api/titles').send({ title: 'B', kind: 'show' });
  const list = await a.get('/api/titles');
  assert.deepStrictEqual(list.body.map((t) => t.title), ['B', 'A']);
});

test('healthz responds ok', async () => {
  const res = await request(app()).get('/healthz');
  assert.strictEqual(res.status, 200);
});
