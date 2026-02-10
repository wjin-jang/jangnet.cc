const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { requireAuth, checkOrigin, handleLogin, handleLogout } = require('./lib/auth');
const { scanLibrary, buildClientLibrary, validatePath } = require('./lib/scanner');

const MUSIC_ROOT = path.resolve('C:\\Users\\woojin\\Music\\flac');
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Scan library at startup
const library = scanLibrary(MUSIC_ROOT);
const clientLibrary = buildClientLibrary(library);

const app = express();

// Helmet — CSP + security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Origin check on POSTs
app.use(checkOrigin);

// ── Player routes (all before static blog) ──

// Session — only for /player routes
const sessionMiddleware = session({
  name: 'jn_sid',
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
  },
});

app.use('/player', sessionMiddleware);

// Login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip,
});

// Public player routes
app.get('/player/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'login.html'));
});

app.post('/player/login', loginLimiter, handleLogin);

// Auth gate for everything else under /player
app.use('/player', requireAuth);

// Authenticated player routes
app.get('/player/player.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'player.css'));
});
app.get('/player/player.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'player.js'));
});
app.get('/player/', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'index.html'));
});

// Logout
app.post('/player/logout', handleLogout);

// ── API routes ──

app.get('/player/api/library', (req, res) => {
  res.json(clientLibrary);
});

app.get('/player/api/cover/:artistIdx/:albumIdx', (req, res) => {
  const ai = parseInt(req.params.artistIdx, 10);
  const ali = parseInt(req.params.albumIdx, 10);

  if (isNaN(ai) || isNaN(ali) || !library[ai] || !library[ai].albums[ali]) {
    return res.status(404).json({ error: 'Not found' });
  }

  const album = library[ai].albums[ali];
  if (!album.hasCover) {
    return res.status(404).json({ error: 'No cover' });
  }

  const coverPath = path.join(album.absolutePath, 'cover.jpg');
  if (!validatePath(coverPath, MUSIC_ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.sendFile(coverPath);
});

app.get('/player/api/stream/:artistIdx/:albumIdx/:trackIdx', (req, res) => {
  const ai = parseInt(req.params.artistIdx, 10);
  const ali = parseInt(req.params.albumIdx, 10);
  const ti = parseInt(req.params.trackIdx, 10);

  if (isNaN(ai) || isNaN(ali) || isNaN(ti)
      || !library[ai] || !library[ai].albums[ali]
      || !library[ai].albums[ali].tracks[ti]) {
    return res.status(404).json({ error: 'Not found' });
  }

  const track = library[ai].albums[ali].tracks[ti];
  if (!validatePath(track.absolutePath, MUSIC_ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let stat;
  try {
    stat = fs.statSync(track.absolutePath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'audio/flac',
    });

    fs.createReadStream(track.absolutePath, { start, end }).pipe(res);
  } else {
    res.set({
      'Content-Length': fileSize,
      'Content-Type': 'audio/flac',
      'Accept-Ranges': 'bytes',
    });

    fs.createReadStream(track.absolutePath).pipe(res);
  }
});

// ── Static blog (after player routes, excludes player/) ──

app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html'],
  dotfiles: 'ignore',
}));

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
