import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import path from 'path';

const logger = createLogger('COMPANY_MEMORY');

export class CompanyMemory {
  /**
   * @param {Object} options
   * @param {string} options.dbPath - Path to the SQLite DB file
   */
  constructor({ dbPath }) {
    this.dbPath = dbPath;
    this.db = null;
  }

  init() {
    try {
      this.db = new Database(this.dbPath, { timeout: 5000 });
      try {
        this.db.pragma('journal_mode = WAL');
      } catch (e) {
        // WAL mode optional if locked
      }
      logger.info(`Подключение к базе памяти компании: ${this.dbPath}`);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS company_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER,
          type TEXT,
          description TEXT,
          participants TEXT,
          significance INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS inside_jokes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER,
          joke_text TEXT,
          origin_event TEXT,
          participants TEXT,
          times_referenced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS shared_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          type TEXT,
          x REAL,
          y REAL,
          z REAL,
          dimension TEXT,
          discovered_by TEXT,
          shared_with TEXT
        );

        CREATE TABLE IF NOT EXISTS group_achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER,
          description TEXT,
          participants TEXT,
          achievement_type TEXT
        );

        CREATE TABLE IF NOT EXISTS company_projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          status TEXT,
          description TEXT,
          participants TEXT,
          started_at INTEGER,
          completed_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS company_promises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER,
          promise TEXT,
          made_by TEXT,
          made_to TEXT,
          status TEXT DEFAULT 'open',
          fulfilled_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS company_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER,
          summary TEXT,
          participants TEXT,
          resolved_at INTEGER
        );
      `);
      logger.info('Таблицы памяти компании успешно инициализированы.');
    } catch (err) {
      logger.error(`Ошибка при инициализации БД компании: ${err.message}`);
    }
  }

  /**
   * @param {Object} event
   * @param {string} event.type
   * @param {string} event.description
   * @param {string[]} event.participants
   * @param {number} event.significance (1-10)
   */
  recordEvent(event) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO company_events (timestamp, type, description, participants, significance)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(Date.now(), event.type, event.description, JSON.stringify(event.participants || []), event.significance || 1);
  }

  /**
   * @param {Object} joke
   * @param {string} joke.joke_text
   * @param {string} joke.origin_event
   * @param {string[]} joke.participants
   */
  recordJoke(joke) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO inside_jokes (created_at, joke_text, origin_event, participants, times_referenced)
      VALUES (?, ?, ?, ?, 0)
    `);
    stmt.run(Date.now(), joke.joke_text, joke.origin_event, JSON.stringify(joke.participants || []));
  }

  /**
   * @param {string} name 
   * @param {string} type 
   * @param {Object} pos {x, y, z, dimension}
   * @param {string} discoveredBy 
   */
  shareLocation(name, type, pos, discoveredBy) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO shared_locations (name, type, x, y, z, dimension, discovered_by, shared_with)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(name, type, pos.x, pos.y, pos.z, pos.dimension || 'overworld', discoveredBy, JSON.stringify([]));
  }

  /**
   * @param {string} name 
   * @param {string} agentName 
   * @returns {boolean}
   */
  getLocationSharedWith(name, agentName) {
    if (!this.db) return false;
    const stmt = this.db.prepare('SELECT shared_with FROM shared_locations WHERE name = ?');
    const row = stmt.get(name);
    if (!row) return false;
    const sharedWith = JSON.parse(row.shared_with || '[]');
    return sharedWith.includes(agentName);
  }

  /**
   * @param {string} locationName 
   * @param {string} agentName 
   */
  shareLocationWith(locationName, agentName) {
    if (!this.db) return;
    const stmt = this.db.prepare('SELECT shared_with FROM shared_locations WHERE name = ?');
    const row = stmt.get(locationName);
    if (row) {
      const sharedWith = JSON.parse(row.shared_with || '[]');
      if (!sharedWith.includes(agentName)) {
        sharedWith.push(agentName);
        const updateStmt = this.db.prepare('UPDATE shared_locations SET shared_with = ? WHERE name = ?');
        updateStmt.run(JSON.stringify(sharedWith), locationName);
      }
    }
  }

  /**
   * @param {Object} achievement 
   */
  recordAchievement(achievement) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO group_achievements (timestamp, description, participants, achievement_type)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(Date.now(), achievement.description, JSON.stringify(achievement.participants || []), achievement.achievement_type);
  }

  recordPromise({ promise, madeBy, madeTo = '', status = 'open' }) {
    if (!this.db || !promise || !madeBy) return null;
    const result = this.db.prepare(`INSERT INTO company_promises (created_at, promise, made_by, made_to, status) VALUES (?, ?, ?, ?, ?)`)
      .run(Date.now(), String(promise).slice(0, 240), madeBy, madeTo, status);
    return result.lastInsertRowid;
  }

  getOpenPromises(person = null) {
    if (!this.db) return [];
    if (!person) return this.db.prepare("SELECT * FROM company_promises WHERE status = 'open' ORDER BY created_at DESC").all();
    return this.db.prepare("SELECT * FROM company_promises WHERE status = 'open' AND (made_by = ? OR made_to = ?) ORDER BY created_at DESC").all(person, person);
  }

  fulfillPromise(id) {
    if (!this.db) return false;
    return this.db.prepare("UPDATE company_promises SET status = 'fulfilled', fulfilled_at = ? WHERE id = ? AND status = 'open'").run(Date.now(), id).changes > 0;
  }

  recordConflict({ summary, participants = [] }) {
    if (!this.db || !summary) return null;
    const result = this.db.prepare('INSERT INTO company_conflicts (created_at, summary, participants) VALUES (?, ?, ?)').run(Date.now(), String(summary).slice(0, 240), JSON.stringify(participants));
    return result.lastInsertRowid;
  }

  getRecentConflicts(count = 10) {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM company_conflicts ORDER BY created_at DESC LIMIT ?').all(count).map(row => ({ ...row, participants: JSON.parse(row.participants || '[]') }));
  }

  resolveConflict(id) {
    if (!this.db) return false;
    return this.db.prepare('UPDATE company_conflicts SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL').run(Date.now(), id).changes > 0;
  }

  /**
   * @param {number} count 
   * @returns {Array}
   */
  getRecentEvents(count = 10) {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM company_events ORDER BY timestamp DESC LIMIT ?').all(count).map(row => ({
      ...row,
      participants: JSON.parse(row.participants)
    }));
  }

  /**
   * @returns {Array}
   */
  getJokes() {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM inside_jokes ORDER BY created_at DESC').all().map(row => ({
      ...row,
      participants: JSON.parse(row.participants)
    }));
  }

  /**
   * @param {number} jokeId 
   */
  referenceJoke(jokeId) {
    if (!this.db) return;
    this.db.prepare('UPDATE inside_jokes SET times_referenced = times_referenced + 1 WHERE id = ?').run(jokeId);
  }

  /**
   * @param {string} agentName 
   * @returns {Array}
   */
  getSharedLocations(agentName) {
    if (!this.db) return [];
    const allLocations = this.db.prepare('SELECT * FROM shared_locations').all();
    return allLocations.filter(loc => {
      const sharedWith = JSON.parse(loc.shared_with || '[]');
      return sharedWith.includes(agentName) || loc.discovered_by === agentName;
    });
  }

  /**
   * @param {string} [status] 
   * @returns {Array}
   */
  getProjects(status) {
    if (!this.db) return [];
    let query = 'SELECT * FROM company_projects';
    let params = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    return this.db.prepare(query).all(...params).map(row => ({
      ...row,
      participants: JSON.parse(row.participants)
    }));
  }

  /**
   * @param {Object} project 
   */
  createProject(project) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO company_projects (name, status, description, participants, started_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(project.name, project.status || 'active', project.description, JSON.stringify(project.participants || []), Date.now());
  }

  /**
   * @param {number} projectId 
   * @param {string} status 
   */
  updateProjectStatus(projectId, status) {
    if (!this.db) return;
    const completedAt = status === 'completed' ? Date.now() : null;
    const stmt = this.db.prepare(`
      UPDATE company_projects 
      SET status = ?, completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `);
    stmt.run(status, completedAt, projectId);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Подключение к БД памяти компании закрыто.');
    }
  }
}
