const request = require('supertest');
const { createApp } = require('../src/app');

const opts = { passcode: 'letmein', secret: 'test-secret' };
const app = () => createApp(':memory:', opts);

async function login(a, name = 'me') {
  const agent = request.agent(a);
  const res = await agent.post('/api/login').send({ passcode: opts.passcode, name });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return agent;
}

module.exports = { app, login, opts };
