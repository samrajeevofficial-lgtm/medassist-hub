const fs = require('fs');
const path = require('path');
const { open } = require('./sqlite');
const { dbFile } = require('./config');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = open(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dob          TEXT,
  gender       TEXT,
  blood_group  TEXT,
  height_cm    REAL,
  weight_kg    REAL,
  allergies    TEXT,
  conditions   TEXT,
  notes        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relation     TEXT,
  phone        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  dosage            TEXT NOT NULL,
  times             TEXT NOT NULL,          -- JSON array of "HH:MM"
  instructions      TEXT,                   -- e.g. "after food"
  start_date        TEXT NOT NULL,          -- YYYY-MM-DD
  end_date          TEXT,                   -- YYYY-MM-DD or NULL (ongoing)
  pills_remaining   INTEGER,
  pills_per_dose    INTEGER NOT NULL DEFAULT 1,
  refill_threshold  INTEGER NOT NULL DEFAULT 5,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id   INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_date  TEXT NOT NULL,            -- YYYY-MM-DD
  scheduled_time  TEXT NOT NULL,            -- HH:MM
  status          TEXT NOT NULL CHECK (status IN ('taken','skipped','missed')),
  logged_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (medication_id, scheduled_date, scheduled_time)
);

CREATE TABLE IF NOT EXISTS vitals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,               -- blood_pressure, heart_rate, blood_sugar, weight, temperature, spo2
  value1       REAL NOT NULL,
  value2       REAL,                        -- diastolic for blood_pressure
  context      TEXT,                        -- e.g. "fasting", "after meal"
  note         TEXT,
  recorded_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_name  TEXT NOT NULL,
  specialty    TEXT,
  location     TEXT,
  datetime     TEXT NOT NULL,               -- local "YYYY-MM-DDTHH:MM"
  reason       TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS triage_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symptoms     TEXT NOT NULL,
  severity     TEXT NOT NULL,
  result_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meds_user ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON dose_logs(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vitals_user_type ON vitals(user_id, type, recorded_at);
CREATE INDEX IF NOT EXISTS idx_appts_user ON appointments(user_id, datetime);
CREATE INDEX IF NOT EXISTS idx_triage_user ON triage_history(user_id, created_at);
`);

module.exports = db;
