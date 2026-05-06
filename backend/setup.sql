-- ─────────────────────────────────────────────────────────
--  Quick Tracker  –  MySQL bootstrap
--  Run once:  #Kenchosum333
-- ─────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS users_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE users_db;

-- ── Users (id, username, password) ───────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  username      VARCHAR(60)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Activity logs ─────────────────────────────────────────
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
);

-- ── Alarms ────────────────────────────────────────────────
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
);

SELECT 'users_db ready ✓' AS status;