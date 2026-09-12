import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function plain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/** Best-effort, per-agent append-only evidence for actuator shutdown anomalies. */
export class ActuatorAuditStore {
  constructor({ agentId, dataDir = path.join(process.cwd(), 'data') } = {}) {
    this.agentId = agentId;
    this.dataDir = dataDir;
    this.db = null;
    this.lastError = null;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      this.db = new Database(path.join(dataDir, `${String(agentId).toLowerCase()}_actuator_audit.db`), { timeout: 5000 });
      try { this.db.pragma('busy_timeout = 5000'); } catch (_) {}
      try { this.db.pragma('journal_mode = WAL'); } catch (_) {}
      this.db.exec(`CREATE TABLE IF NOT EXISTS actuator_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at INTEGER NOT NULL,
        type TEXT NOT NULL,
        record_json TEXT NOT NULL
      )`);
      this.insert = this.db.prepare('INSERT INTO actuator_audit (recorded_at, type, record_json) VALUES (?, ?, ?)');
      this.recent = this.db.prepare('SELECT recorded_at, type, record_json FROM actuator_audit ORDER BY id DESC LIMIT ?');
    } catch (error) {
      this.lastError = error.message;
      try { this.db?.close(); } catch (_) {}
      this.db = null;
    }
  }

  append(type, record) {
    if (!this.db) return false;
    try {
      this.insert.run(Date.now(), String(type), JSON.stringify(plain(record)));
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  getRecent(limit = 20) {
    if (!this.db) return { available: false, records: [], error: this.lastError };
    try {
      const bounded = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 20, 100));
      return {
        available: true,
        records: this.recent.all(bounded).map((row) => ({
          recordedAt: row.recorded_at,
          type: row.type,
          record: JSON.parse(row.record_json),
        })),
        error: this.lastError,
      };
    } catch (error) {
      this.lastError = error.message;
      return { available: false, records: [], error: this.lastError };
    }
  }

  getSnapshot() {
    return { available: Boolean(this.db), error: this.lastError, recent: this.getRecent() };
  }

  close() {
    if (!this.db) return;
    try { this.db.close(); } catch (error) { this.lastError = error.message; }
    this.db = null;
  }
}
