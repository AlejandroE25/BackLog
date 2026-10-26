const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'backlog.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const { BACKLOG_PASSCODE: passcode, COOKIE_SECRET: secret } = process.env;
if (!passcode || !secret) {
  console.error('Set BACKLOG_PASSCODE and COOKIE_SECRET');
  process.exit(1);
}
const port = process.env.PORT || 3000;
createApp(dbPath, { passcode, secret }).listen(port, () => console.log(`Backlog on :${port}`));
