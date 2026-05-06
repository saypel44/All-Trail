/**
 * server.js  —  Quick Tracker backend (SQLite + bcrypt edition)
 *
 * ENDPOINTS:
 *   POST /api/signup          — create account (bcrypt hashed)
 *   POST /api/login           — sign in, returns token
 *   POST /api/logout          — invalidate token
 *   POST /api/reset-password  — reset password by username
 *
 *   POST /api/logs            — save a single habit log entry
 *   GET  /api/logs            — fetch all logs for current user
 *   DELETE /api/logs/:id      — delete a single log entry
 *
 *   POST /api/alarms          — save a single alarm
 *   GET  /api/alarms          — fetch all alarms for current user
 *   DELETE /api/alarms/:id    — delete a single alarm
 *
 *   GET  /                    — serves spttool.html
 *   GET  /spttool.css         — serves CSS
 *   GET  /spttool.js          — serves JS
 */

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const Database = require('better-sqlite3');

const PORT        = 3000;
const DB_FILE     = path.join(__dirname, 'qt.sqlite');
const SALT_ROUNDS = 10;

// ── Open / create database ───────────────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    joined_at     TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL,
    habit_id     TEXT    NOT NULL,
    habit_name   TEXT    NOT NULL,
    habit_icon   TEXT,
    date         TEXT    NOT NULL,
    duration     REAL,
    unit         TEXT,
    display_unit TEXT,
    start_time   TEXT,
    end_time     TEXT,
    note         TEXT,
    logged_at    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alarms (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL,
    from_time    TEXT NOT NULL,
    to_time      TEXT NOT NULL,
    category     TEXT,
    sound        TEXT,
    date         TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

console.log('✅  Database ready →', DB_FILE);

// ── Prepared statements ──────────────────────────────────────────
const stmts = {
  findUser:      db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser:    db.prepare('INSERT INTO users (name, username, password_hash, joined_at) VALUES (?, ?, ?, ?)'),
  updatePass:    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?'),

  findSession:   db.prepare('SELECT * FROM sessions WHERE token = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

  getLogs:       db.prepare('SELECT * FROM logs WHERE username = ? ORDER BY date DESC, logged_at DESC'),
  insertLog:     db.prepare(`
    INSERT INTO logs (username, habit_id, habit_name, habit_icon, date, duration, unit, display_unit, start_time, end_time, note, logged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteLog:     db.prepare('DELETE FROM logs WHERE id = ? AND username = ?'),

  getAlarms:     db.prepare('SELECT * FROM alarms WHERE username = ? ORDER BY created_at DESC'),
  insertAlarm:   db.prepare(`
    INSERT INTO alarms (username, from_time, to_time, category, sound, date, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteAlarm:   db.prepare('DELETE FROM alarms WHERE id = ? AND username = ?'),
};

// ── Auth helpers ─────────────────────────────────────────────────
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

// ── HTTP helpers ─────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

// ── Static file server ───────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css',
  '.js': 'application/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};
function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    setCORS(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) {
    json(res, 404, { error: 'File not found: ' + path.basename(filePath) });
  }
}

// ── Router ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  if (req.method === 'OPTIONS') {
    setCORS(res); res.writeHead(204); return res.end();
  }

  const url = req.url.split('?')[0];

  // ── POST /api/signup ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/signup') {
    try {
      const { name, username, password } = await readBody(req);
      if (!name || !username || !password)
        return json(res, 400, { error: 'name, username and password are required.' });
      if (username.length < 3)
        return json(res, 400, { error: 'Username must be at least 3 characters.' });
      if (password.length < 6)
        return json(res, 400, { error: 'Password must be at least 6 characters.' });
      if (stmts.findUser.get(username.toLowerCase()))
        return json(res, 409, { error: 'That username is already taken.' });

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      stmts.insertUser.run(name, username.toLowerCase(), password_hash, new Date().toISOString());
      const token = makeToken();
      stmts.insertSession.run(token, username.toLowerCase(), new Date().toISOString());
      return json(res, 200, { token, name, username: username.toLowerCase() });
    } catch (err) {
      console.error('Signup error:', err);
      return json(res, 500, { error: 'Server error during signup.' });
    }
  }

  // ── POST /api/login ─────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/login') {
    try {
      const { username, password } = await readBody(req);
      if (!username || !password)
        return json(res, 400, { error: 'Please enter your username and password.' });
      const user = stmts.findUser.get(username.toLowerCase());
      const match = user && await bcrypt.compare(password, user.password_hash);
      if (!match)
        return json(res, 401, { error: 'Incorrect username or password.' });
      const token = makeToken();
      stmts.insertSession.run(token, user.username, new Date().toISOString());
      return json(res, 200, { token, name: user.name, username: user.username });
    } catch (err) {
      console.error('Login error:', err);
      return json(res, 500, { error: 'Server error during login.' });
    }
  }

  // ── POST /api/logout ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/logout') {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (token) stmts.deleteSession.run(token);
    return json(res, 200, { ok: true });
  }

  // ── POST /api/reset-password ────────────────────────────────────
  if (req.method === 'POST' && url === '/api/reset-password') {
    try {
      const { username, newPassword } = await readBody(req);
      if (!username || !newPassword)
        return json(res, 400, { error: 'username and newPassword are required.' });
      if (newPassword.length < 6)
        return json(res, 400, { error: 'Password must be at least 6 characters.' });
      const user = stmts.findUser.get(username.toLowerCase());
      if (!user)
        return json(res, 404, { error: 'No account found with that username.' });
      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      stmts.updatePass.run(hash, username.toLowerCase());
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('Reset error:', err);
      return json(res, 500, { error: 'Server error during reset.' });
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  LOGS
  // ════════════════════════════════════════════════════════════════

  // ── GET /api/logs ───────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/logs') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    const rows = stmts.getLogs.all(username);
    const logs = rows.map(r => ({
      id:          r.id,
      habitId:     r.habit_id,
      habitName:   r.habit_name,
      habitIcon:   r.habit_icon,
      date:        r.date,
      duration:    r.duration,
      unit:        r.unit,
      displayUnit: r.display_unit,
      startTime:   r.start_time,
      endTime:     r.end_time,
      note:        r.note,
      logged_at:   r.logged_at,
    }));
    return json(res, 200, logs);
  }

  // ── POST /api/logs ──────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/logs') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    try {
      const log = await readBody(req);
      const now = new Date().toISOString();
      const result = stmts.insertLog.run(
        username,
        log.habitId   || '',
        log.habitName || '',
        log.habitIcon || '📋',
        log.date      || now.split('T')[0],
        log.duration  ?? null,
        log.unit      || 'hrs',
        log.displayUnit || log.unit || 'hrs',
        log.startTime || null,
        log.endTime   || null,
        log.note      || '',
        now
      );
      return json(res, 200, { ok: true, id: result.lastInsertRowid });
    } catch (err) {
      console.error('Save log error:', err);
      return json(res, 500, { error: 'Server error saving log.' });
    }
  }

  // ── DELETE /api/logs/:id ────────────────────────────────────────
  const logDeleteMatch = url.match(/^\/api\/logs\/(\d+)$/);
  if (req.method === 'DELETE' && logDeleteMatch) {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    stmts.deleteLog.run(Number(logDeleteMatch[1]), username);
    return json(res, 200, { ok: true });
  }

  // ════════════════════════════════════════════════════════════════
  //  ALARMS
  // ════════════════════════════════════════════════════════════════

  // ── GET /api/alarms ─────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/alarms') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    const alarms = stmts.getAlarms.all(username);
    return json(res, 200, alarms);
  }

  // ── POST /api/alarms ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/alarms') {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    try {
      const alarm = await readBody(req);
      const now   = new Date().toISOString();
      const result = stmts.insertAlarm.run(
        username,
        alarm.from_time  || alarm.fromTime  || '',
        alarm.to_time    || alarm.toTime    || '',
        alarm.category   || null,
        alarm.sound      || null,
        alarm.date       || null,
        alarm.notes      || null,
        now
      );
      return json(res, 200, { ok: true, id: result.lastInsertRowid });
    } catch (err) {
      console.error('Save alarm error:', err);
      return json(res, 500, { error: 'Server error saving alarm.' });
    }
  }

  // ── DELETE /api/alarms/:id ──────────────────────────────────────
  const alarmDeleteMatch = url.match(/^\/api\/alarms\/(\d+)$/);
  if (req.method === 'DELETE' && alarmDeleteMatch) {
    const username = resolveUser(req);
    if (!username) return json(res, 401, { error: 'Not signed in.' });
    stmts.deleteAlarm.run(Number(alarmDeleteMatch[1]), username);
    return json(res, 200, { ok: true });
  }

  // ── Static files ────────────────────────────────────────────────
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
  console.log('\n✅  Quick Tracker server running');
  console.log('   Open →  http://localhost:' + PORT + '\n');
  console.log('   Tables: users | logs | alarms | sessions\n');
  console.log('   Routes:');
  console.log('   POST /api/signup   POST /api/login    POST /api/logout');
  console.log('   POST /api/reset-password');
  console.log('   GET  /api/logs     POST /api/logs     DELETE /api/logs/:id');
  console.log('   GET  /api/alarms   POST /api/alarms   DELETE /api/alarms/:id\n');
});