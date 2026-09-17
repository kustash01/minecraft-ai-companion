import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MEMORY');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDir = path.join(__dirname, '..', '..', 'data');

export class LongTermMemory {
  constructor(dbPath = null) {
    const dataDir = dbPath ? path.dirname(dbPath) : defaultDataDir;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const resolvedPath = dbPath || path.join(defaultDataDir, 'companion_memory.db');
    this.db = new Database(resolvedPath, { timeout: 5000 });
    try {
      this.db.pragma('journal_mode = WAL');
    } catch (e) {
      // WAL mode optional if locked
    }
    this._initTables();
    logger.info(`Долгосрочная память SQLite инициализирована: ${resolvedPath}`);
  }

  _initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pois (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        z REAL NOT NULL,
        dimension TEXT DEFAULT 'overworld',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS player_profile (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mc_day INTEGER,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        location_x REAL,
        location_y REAL,
        location_z REAL,
        participants TEXT,
        outcome TEXT,
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS diary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mc_day INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS free_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '',
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // --- POI Operations ---
  addPOI(name, type, { x, y, z }, notes = '', dimension = 'overworld') {
    const stmt = this.db.prepare(`
      INSERT INTO pois (name, type, x, y, z, dimension, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, type, x, y, z, dimension, notes);
    return info.lastInsertRowid;
  }

  getPOIs(type = null) {
    if (type) {
      return this.db.prepare('SELECT * FROM pois WHERE type = ? ORDER BY id DESC').all(type);
    }
    return this.db.prepare('SELECT * FROM pois ORDER BY id DESC').all();
  }

  getPOIByName(name) {
    return this.db.prepare('SELECT * FROM pois WHERE name LIKE ? LIMIT 1').get(`%${name}%`);
  }

  // --- Facts Operations ---
  setFact(key, value, category = 'general') {
    const stmt = this.db.prepare(`
      INSERT INTO facts (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : String(value), category);
  }

  getFact(key) {
    const row = this.db.prepare('SELECT value FROM facts WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  getAllFacts() {
    return this.db.prepare('SELECT key, value, category FROM facts').all();
  }

  // --- Player Profile ---
  setPlayerPreference(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO player_profile (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  getPlayerPreference(key) {
    const row = this.db.prepare('SELECT value FROM player_profile WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  getPlayerProfile() {
    return this.db.prepare('SELECT key, value FROM player_profile').all();
  }

  // --- Episodic Operations ---
  addEpisode({ mcDay, eventType, summary, x = null, y = null, z = null, participants = '', outcome = '', importance = 5 }) {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (mc_day, event_type, summary, location_x, location_y, location_z, participants, outcome, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(mcDay, eventType, summary, x, y, z, participants, outcome, importance);
  }

  getRecentEpisodes(limit = 10, minImportance = 0) {
    return this.db.prepare(`
      SELECT * FROM episodes WHERE importance >= ? ORDER BY id DESC LIMIT ?
    `).all(minImportance, limit);
  }

  searchEpisodes(query) {
    return this.db.prepare(`
      SELECT * FROM episodes WHERE summary LIKE ? OR event_type LIKE ? ORDER BY id DESC LIMIT 10
    `).all(`%${query}%`, `%${query}%`);
  }

  // --- Diary Operations ---
  addDiaryEntry(mcDay, title, content) {
    const stmt = this.db.prepare(`
      INSERT INTO diary (mc_day, title, content)
      VALUES (?, ?, ?)
    `);
    return stmt.run(mcDay, title, content);
  }

  getDiaryEntries(limit = 10) {
    return this.db.prepare('SELECT * FROM diary ORDER BY id DESC LIMIT ?').all(limit);
  }

  getDiaryByDay(mcDay) {
    return this.db.prepare('SELECT * FROM diary WHERE mc_day = ? ORDER BY id ASC').all(mcDay);
  }

  // --- Free Notes / Thoughts Operations ---
  addNote(content, tags = '', importance = 5) {
    const stmt = this.db.prepare(`
      INSERT INTO free_notes (content, tags, importance)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(String(content), String(tags || ''), Number(importance) || 5);
    return info.lastInsertRowid;
  }

  getRecentNotes(limit = 10) {
    return this.db.prepare(`
      SELECT * FROM free_notes ORDER BY id DESC LIMIT ?
    `).all(limit);
  }

  searchNotes(query, limit = 5) {
    return this.db.prepare(`
      SELECT * FROM free_notes WHERE content LIKE ? OR tags LIKE ? ORDER BY id DESC LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
  }

  deleteNote(idOrSubstring) {
    if (typeof idOrSubstring === 'number' || (!isNaN(Number(idOrSubstring)) && String(idOrSubstring).trim() !== '')) {
      return this.db.prepare('DELETE FROM free_notes WHERE id = ?').run(Number(idOrSubstring));
    }
    return this.db.prepare('DELETE FROM free_notes WHERE content LIKE ?').run(`%${idOrSubstring}%`);
  }

  close() {
    this.db.close();
  }
}
