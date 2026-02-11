const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const sharp = require('sharp');
const { requireAuth, handleLogin, handleLogout } = require('./lib/auth');
const { scanLibrary, buildClientLibrary, validatePath } = require('./lib/scanner');

const MUSIC_ROOT = path.resolve(process.env.MUSIC_ROOT || 'C:\\Users\\woojin\\Music\\flac');
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Scan library at startup
const library = scanLibrary(MUSIC_ROOT);
const clientLibrary = buildClientLibrary(library);

const app = express();

// Trust reverse proxy (NPM/Cloudflare) for secure cookies + rate limiting
if (IS_PROD) app.set('trust proxy', 1);

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
      manifestSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session
app.use(session({
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
}));

// Login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip,
});

// ── Public static assets (before auth) ──

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'manifest.json'));
});

// ── Public routes ──

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'login.html'));
});

app.post('/login', loginLimiter, handleLogin);

// ── Auth gate ──

app.use(requireAuth);

// ── Authenticated routes ──

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'index.html'));
});

app.get('/player.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'player.css'));
});

app.get('/player.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'player', 'player.js'));
});

app.post('/logout', handleLogout);

// ── API routes ──

app.get('/api/library', (req, res) => {
  res.json(clientLibrary);
});

app.get('/api/cover/:artistIdx/:albumIdx', (req, res) => {
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

  const width = parseInt(req.query.w, 10) || 400;
  const clampedWidth = Math.min(Math.max(width, 50), 1200);

  sharp(coverPath)
    .resize(clampedWidth, clampedWidth, { fit: 'cover' })
    .jpeg({ quality: 75, progressive: true })
    .toBuffer()
    .then(buf => {
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buf);
    })
    .catch(() => {
      res.sendFile(coverPath);
    });
});

app.get('/api/stream/:artistIdx/:albumIdx/:trackIdx', (req, res) => {
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

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
