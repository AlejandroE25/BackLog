const crypto = require('crypto');

const NAMES = ['me', 'friend'];
const COOKIE = 'session';
const MAX_AGE = 30 * 24 * 3600;

const sign = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
const same = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

function readName(req, secret) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [name, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!NAMES.includes(name) || !sig || !same(sig, sign(secret, name))) return null;
  return name;
}

function authRoutes(app, { passcode, secret }) {
  app.post('/api/login', (req, res) => {
    const { passcode: given, name } = req.body;
    if (typeof given !== 'string' || !same(given, passcode)) return res.status(401).json({ error: 'Wrong passcode' });
    if (!NAMES.includes(name)) return res.status(400).json({ error: 'Pick me or friend' });
    const cookie = `${COOKIE}=${name}.${sign(secret, name)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${req.secure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookie);
    res.json({ name });
  });

  app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.json({});
  });

  // everything registered after this point requires a session
  app.use('/api', (req, res, next) => {
    req.user = readName(req, secret);
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    next();
  });

  app.get('/api/me', (req, res) => res.json({ name: req.user }));
}

module.exports = { authRoutes, readName };
