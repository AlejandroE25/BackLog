const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, login } = require('./helpers');

const isApp = (res) => res.text.includes('id="app"');
const isPublic = (res) => res.text.includes('id="watchedSection"') && !res.text.includes('id="app"');

test('anonymous visitors get the public page at /', async () => {
  const res = await request(app()).get('/');
  assert.strictEqual(res.status, 200);
  assert.ok(isPublic(res));
});

test('logged-in users get the app at /', async () => {
  const res = await (await login(app())).get('/');
  assert.strictEqual(res.status, 200);
  assert.ok(isApp(res));
});

test('a forged or tampered cookie still gets the public page', async () => {
  const res = await request(app()).get('/').set('Cookie', 'session=me.' + 'a'.repeat(43));
  assert.ok(isPublic(res));
});

test('/login serves the sign-in app shell, /public stays public for everyone', async () => {
  const a = app();
  assert.ok(isApp(await request(a).get('/login')));
  assert.ok(isPublic(await request(a).get('/public')));
  assert.ok(isPublic(await (await login(a)).get('/public')));
});

test('/ is never cached across login states', async () => {
  const res = await request(app()).get('/');
  assert.match(res.headers.vary, /Cookie/i);
  assert.match(res.headers['cache-control'], /no-cache|no-store/);
});

test('favicon assets are served and both pages link them', async () => {
  const a = app();
  for (const [path, type] of [['/favicon.svg', /svg/], ['/favicon.ico', /icon/], ['/apple-touch-icon.png', /png/]]) {
    const res = await request(a).get(path);
    assert.strictEqual(res.status, 200, path);
    assert.match(res.headers['content-type'], type, path);
  }
  for (const path of ['/public', '/login']) {
    assert.match((await request(a).get(path)).text, /rel="icon" href="\/favicon\.svg"/, path);
  }
});
