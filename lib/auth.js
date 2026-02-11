const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const USERS_PATH = path.join(__dirname, '..', 'users.json');
const COST_FACTOR = 12;

let users = [];

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) {
    console.error('users.json not found. Run: node init-users.js');
    process.exit(1);
  }
  users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

function saveUsers() {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

loadUsers();

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  const user = users.find(u => u.username === req.session.username);
  if (!user || !user.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

async function handleLogin(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/login?error=1');
  }

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.redirect('/login?error=1');
  }

  const match = await bcrypt.compare(password, user.hash);
  if (!match) {
    return res.redirect('/login?error=1');
  }

  req.session.regenerate(err => {
    if (err) return res.redirect('/login?error=1');
    req.session.authenticated = true;
    req.session.username = username;
    if (req.body.remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    res.redirect('/');
  });
}

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

// ── Account API ──

function getAccountInfo(req, res) {
  const user = users.find(u => u.username === req.session.username);
  res.json({
    username: req.session.username,
    admin: !!(user && user.admin),
  });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const user = users.find(u => u.username === req.session.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.hash);
  if (!match) return res.status(403).json({ error: 'Current password is incorrect' });

  user.hash = await bcrypt.hash(newPassword, COST_FACTOR);
  saveUsers();
  res.json({ ok: true });
}

// Admin-only
function listUsers(req, res) {
  res.json(users.map(u => ({ username: u.username, admin: !!u.admin })));
}

async function createUser(req, res) {
  const { username, password, admin } = req.body;
  if (!username || !password || password.length < 4) {
    return res.status(400).json({ error: 'Username and password (4+ chars) required' });
  }
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hash = await bcrypt.hash(password, COST_FACTOR);
  users.push({ username, hash, admin: !!admin });
  saveUsers();
  res.json({ ok: true });
}

async function resetPassword(req, res) {
  const { username, newPassword } = req.body;
  if (!username || !newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Username and new password required' });
  }

  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.hash = await bcrypt.hash(newPassword, COST_FACTOR);
  saveUsers();
  res.json({ ok: true });
}

function deleteUser(req, res) {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (username === req.session.username) return res.status(400).json({ error: 'Cannot delete yourself' });

  const idx = users.findIndex(u => u.username === username);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  users.splice(idx, 1);
  saveUsers();
  res.json({ ok: true });
}

module.exports = {
  requireAuth, requireAdmin, handleLogin, handleLogout,
  getAccountInfo, changePassword,
  listUsers, createUser, resetPassword, deleteUser,
};
