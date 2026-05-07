'use strict';

/* ═══════════════════════════════════════════════════════════
   server.js  –  Quick Tracker backend
   Stack: Express → mysql2 → MySQL  (users_db database)
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path'); // Needed to fix your CSS/JS paths

const app = express();
const PORT = 3000;

// ── Config ────────────────────────────────────────────────
const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '#Kenchosum333', 
  database: process.env.DB_NAME     || 'users_db',
};

const JWT_SECRET  = process.env.JWT_SECRET  || 'change-me-in-production-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// ── Middleware (CRITICAL ORDER) ───────────────────────────
app.use(cors());
app.use(express.json());

// THIS LINE FIXES THE "BEAUTY LOST" ISSUE
// It tells Express to serve your CSS/JS files from the current folder
app.use(express.static(__dirname));

// ── DB Pool ───────────────────────────────────────────────
let pool;
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 10 });
  }
  return pool;
}

// ── Bootstrap DB tables ───────────────────────────────────
async function initDB() {
  const db = await getPool();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(120)  NOT NULL,
      username      VARCHAR(60)   NOT NULL UNIQUE,
      password_hash VARCHAR(255)  NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT          NOT NULL,
      habit_name   VARCHAR(120),
      habit_icon   VARCHAR(10),
      date         DATE,
      duration     DOUBLE,
      unit         VARCHAR(20),
      display_unit VARCHAR(40),
      start_time   VARCHAR(10),
      end_time     VARCHAR(10),
      note         TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS alarms (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT         NOT NULL,
      from_time  VARCHAR(10),
      to_time    VARCHAR(10),
      category   VARCHAR(80),
      sound      VARCHAR(40),
      date       DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅  DB tables ready (users, logs, alarms)');
}

// ── JWT helpers ───────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

// ══════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'spttool.html'));
});

// Favicon route to avoid harmless 404s in browser console
app.get('/favicon.ico', (req, res) => res.status(204).end());

// AUTH ROUTES
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'Required fields missing' });
    const db = await getPool();
    const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username taken' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute('INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)', [name, username, hash]);
    res.json({ token: signToken(result.insertId), username, name, userId: result.insertId });
  } catch (err) { res.status(500).json({ error: 'Signup error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await getPool();
    const [rows] = await db.execute('SELECT id, name, username, password_hash FROM users WHERE username = ?', [username]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) 
        return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signToken(rows[0].id), username: rows[0].username, name: rows[0].name, userId: rows[0].id });
  } catch (err) { res.status(500).json({ error: 'Login error' }); }
});

// LOGS ROUTES
app.get('/api/logs', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.execute(`SELECT id, habit_name AS habitName, habit_icon AS habitIcon, DATE_FORMAT(date,'%Y-%m-%d') AS date, duration, unit, display_unit AS displayUnit, start_time AS startTime, end_time AS endTime, note FROM logs WHERE user_id = ? ORDER BY date DESC, id DESC`, [req.userId]);
    res.json(rows);
  } catch (err) {
    console.error('Fetch logs error:', err);
    res.status(500).json({ error: 'Fetch logs error' });
  }
});

app.post('/api/logs', verifyToken, async (req, res) => {
  try {
    const { habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note } = req.body;
    const db = await getPool();
    const [result] = await db.execute(`INSERT INTO logs (user_id, habit_name, habit_icon, date, duration, unit, display_unit, start_time, end_time, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.userId, habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note]);
    res.json({ id: result.insertId, ok: true });
  } catch (err) { res.status(500).json({ error: 'Save log error' }); }
});

// ALARMS ROUTES
app.get('/api/alarms', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.execute(`SELECT id, from_time, to_time, category, sound, DATE_FORMAT(date,'%Y-%m-%d') AS date FROM alarms WHERE user_id = ? ORDER BY from_time ASC`, [req.userId]);
    res.json(rows);
  } catch (err) {
    console.error('Fetch alarms error:', err);
    res.status(500).json({ error: 'Fetch alarms error' });
  }
});

app.post('/api/alarms', verifyToken, async (req, res) => {
  try {
    const { from_time, to_time, category, sound, date } = req.body;
    const db = await getPool();
    const [result] = await db.execute(`INSERT INTO alarms (user_id, from_time, to_time, category, sound, date) VALUES (?, ?, ?, ?, ?, ?)`, [req.userId, from_time, to_time, category, sound || 'bell', date]);
    res.json({ id: result.insertId, ok: true });
  } catch (err) { res.status(500).json({ error: 'Save alarm error' }); }
});

// ── Start ─────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Quick Tracker server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌  Could not connect to MySQL:', err.message);
    process.exit(1);
  });