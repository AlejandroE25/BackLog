const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, login, opts } = require('./helpers');

test('api requires login', async () => {
  const a = app();
  assert.strictEqual((await request(a).get('/api/titles')).status, 401);
  assert.strictEqual((await request(a).post('/api/titles').send({ title: 'X', kind: 'movie' })).status, 401);
});

test('static page and healthz stay public', async () => {
  const a = app();
  assert.strictEqual((await request(a).get('/')).status, 200);
  assert.strictEqual((await request(a).get('/healthz')).status, 200);
});

test('wrong passcode is rejected, no cookie set', async () => {
  const res = await request(app()).post('/api/login').send({ passcode: 'nope', name: 'me' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.headers['set-cookie'], undefined);
});

test('missing passcode or unknown name is rejected', async () => {
  const a = app();
  assert.strictEqual((await request(a).post('/api/login').send({ name: 'me' })).status, 401);
  assert.strictEqual((await request(a).post('/api/login').send({ passcode: opts.passcode, name: 'admin' })).status, 400);
});

test('login sets httpOnly cookie and /api/me returns the name', async () => {
  const a = app();
  const res = await request(a).post('/api/login').send({ passcode: opts.passcode, name: 'friend' });
  assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  const agent = await login(a, 'friend');
  assert.deepStrictEqual((await agent.get('/api/me')).body, { name: 'friend' });
});

test('added_by comes from the cookie, not the body', async () => {
  const agent = await login(app(), 'friend');
  const res = await agent.post('/api/titles').send({ title: 'Dune', kind: 'movie', added_by: 'me' });
  assert.strictEqual(res.body.added_by, 'friend');
});

test('tampered cookie is rejected', async () => {
  const a = app();
  const forged = 'session=me.' + 'a'.repeat(43);
  assert.strictEqual((await request(a).get('/api/titles').set('Cookie', forged)).status, 401);
  const real = (await request(a).post('/api/login').send({ passcode: opts.passcode, name: 'friend' })).headers['set-cookie'][0];
  const swapped = real.split(';')[0].replace('friend', 'me');
  assert.strictEqual((await request(a).get('/api/me').set('Cookie', swapped)).status, 401);
});

test('logout clears the session', async () => {
  const agent = await login(app());
  await agent.post('/api/logout');
  assert.strictEqual((await agent.get('/api/me')).status, 401);
});
