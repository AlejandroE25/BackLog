const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'backlog.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const port = process.env.PORT || 3000;
createApp(dbPath).listen(port, () => console.log(`Backlog on :${port}`));
