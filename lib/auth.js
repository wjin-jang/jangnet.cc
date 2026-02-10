const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const USERS_PATH = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) {
    console.error('users.json not found. Run: node init-users.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

const users = loadUsers();

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/player/login');
}

function checkOrigin(req, res, next) {
  if (req.method !== 'POST') return next();

  const origin = req.get('Origin');
  if (origin) {
    const host = req.get('Host');
    const allowed = [`http://${host}`, `https://${host}`];
    if (!allowed.includes(origin)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
}

async function handleLogin(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/player/login?error=1');
  }

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.redirect('/player/login?error=1');
  }

  const match = await bcrypt.compare(password, user.hash);
  if (!match) {
    return res.redirect('/player/login?error=1');
  }

  req.session.regenerate(err => {
    if (err) return res.redirect('/player/login?error=1');
    req.session.authenticated = true;
    req.session.username = username;
    res.redirect('/player/');
  });
}

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.redirect('/player/login');
  });
}

module.exports = { requireAuth, checkOrigin, handleLogin, handleLogout };
