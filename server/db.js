// server/db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const DB_FILE = path.join(__dirname, 'data.db');
let _db = null;

async function openDb(){
  if (_db) return _db;
  _db = await open({ filename: DB_FILE, driver: sqlite3.Database });
  return _db;
}

async function initDb(){
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      UNIQUE(user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

module.exports = { openDb, initDb };
