'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

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

// ── Middleware ───────────────────────────
app.use(cors());
app.use(express.json());
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

  // Users Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(120)  NOT NULL,
      username      VARCHAR(60)   NOT NULL UNIQUE,
      password_hash VARCHAR(255)  NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Activity Logs Table
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

  // Alarms Table
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

  // NEW: Check-ins / Survey Results Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS checkins (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT NOT NULL,
      score        INT,
      feedback     TEXT,
      recommendations JSON,
      date         DATE,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅  DB tables ready (including Check-ins)');
}

// ── Auth Helpers ──────────────────────────────────────────
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

// ── ROUTES ────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'spttool.html')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Auth
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    const db = await getPool();
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute('INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)', [name, username, hash]);
    res.json({ token: signToken(result.insertId), username, name });
  } catch (err) { res.status(500).json({ error: 'Username taken or DB error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await getPool();
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signToken(rows[0].id), username: rows[0].username, name: rows[0].name });
  } catch (err) { res.status(500).json({ error: 'Login error' }); }
});

// Logs
app.get('/api/logs', verifyToken, async (req, res) => {
  const db = await getPool();
  const [rows] = await db.execute(`SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM logs WHERE user_id = ? ORDER BY date DESC`, [req.userId]);
  res.json(rows);
});

app.post('/api/logs', verifyToken, async (req, res) => {
  const { habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note } = req.body;
  const db = await getPool();
  await db.execute(`INSERT INTO logs (user_id, habit_name, habit_icon, date, duration, unit, display_unit, start_time, end_time, note) VALUES (?,?,?,?,?,?,?,?,?,?)`, 
    [req.userId, habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note]);
  res.json({ ok: true });
});

// NEW: Survey / Check-in Route
app.post('/api/checkins', verifyToken, async (req, res) => {
  try {
    const { score, feedback, recommendations, date } = req.body;
    const db = await getPool();
    await db.execute(`INSERT INTO checkins (user_id, score, feedback, recommendations, date) VALUES (?, ?, ?, ?, ?)`,
      [req.userId, score, feedback, JSON.stringify(recommendations), date]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Check-in save failed' }); }
});

app.get('/api/checkins', verifyToken, async (req, res) => {
  const db = await getPool();
  const [rows] = await db.execute(`SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 1`, [req.userId]);
  res.json(rows);
});

// Alarms
app.get('/api/alarms', verifyToken, async (req, res) => {
  const db = await getPool();
  const [rows] = await db.execute(`SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM alarms WHERE user_id = ?`, [req.userId]);
  res.json(rows);
});

app.post('/api/alarms', verifyToken, async (req, res) => {
  const { from_time, to_time, category, sound, date } = req.body;
  const db = await getPool();
  await db.execute(`INSERT INTO alarms (user_id, from_time, to_time, category, sound, date) VALUES (?,?,?,?,?,?)`, 
    [req.userId, from_time, to_time, category, sound, date]);
  res.json({ ok: true });
});

// ── Start ──
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
});