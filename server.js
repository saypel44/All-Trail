/**
 * server.js  –  Quick Tracker backend (SQLite edition)
 *
 * Database: qt.sqlite  (auto-created on first run)
 *
 * Tables:
 *   users   – id, name, username, password_hash, joined_at
 *   logs    – id, username, date, habit, value, logged_at
 *   alarms  – id, username, from_time, to_time, category, sound
 *
 * HOW TO RUN:
 *   node server.js
 *
 * Then open:  http://localhost:3000
 */

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const Database = require('better-sqlite3');

// ── Config ───────────────────────────────────────────────
const PORT    = 3000;
const DB_FILE = path.join(__dirname, 'qt.sqlite');

// ── Open / create database ───────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// ── Create tables if they don't exist yet ────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    joined_at     TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL,
    date      TEXT    NOT NULL,
    habit     TEXT    NOT NULL,
    value     TEXT,
    logged_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alarms (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL,
    from_time  TEXT    NOT NULL,
    to_time    TEXT    NOT NULL,
    category   TEXT,
    sound      TEXT,
    created_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

console.log('✅  Database ready →', DB_FILE);

// ── Prepared statements ──────────────────────────────────
const stmts = {
  findUser:     db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser:   db.prepare('INSERT INTO users (name, username, password_hash, joined_at) VALUES (?, ?, ?, ?)'),
  findSession:  db.prepare('SELECT * FROM sessions WHERE token = ?'),
  insertSession:db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)'),
  getLogs:      db.prepare('SELECT * FROM logs WHERE username = ? ORDER BY logged_at DESC'),
  insertLog:    db.prepare('INSERT INTO logs (username, date, habit, value, logged_at) VALUES (?, ?, ?, ?, ?)'),
  deleteLogs:   db.prepare('DELETE FROM logs WHERE username = ?'),
  getAlarms:    db.prepare('SELECT * FROM alarms WHERE username = ?'),
  insertAlarm:  db.prepare('INSERT INTO alarms (username, from_time, to_time, category, sound, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteAlarms: db.prepare('DELETE FROM alarms WHERE username = ?'),
};

// ── Helpers ──────────────────────────────────────────────
function hashPass(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}
function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}
function resolveUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const session = stmts.findSession.get(token);
  return session ? session.username : null;
}

// ── CORS + JSON helpers ──────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function json(res, status, body) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ── Static file server ───────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};
function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    setCORS(res);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (_) {
    json(res, 404, { error: 'File not found: ' + path.basename(filePath) });
  }
}

// ── Request router ───────────────────────────────────────
const server = http.createServer(async (req, res) => {

  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0];

  // ── POST /api/signup ─────────────────────────────────
  if (req.method === 'POST' && url === '/api/signup') {
    const { name, username, password } = await readBody(req);
    if (!name || !username || !password)
      return json(res, 400, { error: 'name, username and password are required.' });
    if (stmts.findUser.get(username))
      return json(res, 409, { error: 'Username already taken.' });

    stmts.insertUser.run(name, username, hashPass(password), new Date().toISOString());
    const token = makeToken();
    stmts.insertSession.run(token, username, new Date().toISOString());
    return json(res, 200, { token, name, username });
  }

  // ── POST /api/login ──────────────────────────────────
  if (req.method === 'POST' && url === '/api/login') {
    const { username, password } = await readBody(req);
    const user = stmts.findUser.get(username);
    if (!user || user.password_hash !== hashPass(password))
      return json(res, 401, { error: 'Incorrect username or password.' });

    const token = makeToken();
    stmts.insertSession.run(token, username, new Date().toISOString());
    return json(res, 200, { token, name: user.name, username });
  }

  // ── GET /api/data ────────────────────────────────────
  if (req.method === 'GET' && url === '/api/data') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });

    const logs   = stmts.getLogs.all(username);
    const alarms = stmts.getAlarms.all(username);
    return json(res, 200, { logs, alarms });
  }

  // ── POST /api/data ───────────────────────────────────
  if (req.method === 'POST' && url === '/api/data') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });

    const { logs = [], alarms = [] } = await readBody(req);
    const now = new Date().toISOString();

    stmts.deleteLogs.run(username);
    for (const log of logs) {
      stmts.insertLog.run(username, log.date, log.habit, log.value ?? null, log.logged_at || now);
    }

    stmts.deleteAlarms.run(username);
    for (const alarm of alarms) {
      stmts.insertAlarm.run(username, alarm.from_time, alarm.to_time, alarm.category ?? null, alarm.sound ?? null, alarm.created_at || now);
    }

    return json(res, 200, { ok: true });
  }

  // ── Static files ─────────────────────────────────────
  if (req.method === 'GET') {
    if (url === '/' || url === '/index.html')
      return serveStatic(res, path.join(__dirname, 'spttool.html'));
    if (url === '/spttool.css')
      return serveStatic(res, path.join(__dirname, 'spttool.css'));
    if (url === '/spttool.js')
      return serveStatic(res, path.join(__dirname, 'spttool.js'));
    if (url === '/logo.png')
      return serveStatic(res, path.join(__dirname, 'logo.png'));
  }

  json(res, 404, { error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`\n✅  Quick Tracker server running`);
  console.log(`   Open →  http://localhost:${PORT}\n`);
  console.log('   Tables: users | logs | alarms | sessions\n');
});