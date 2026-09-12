import logger from '../utils/logger.js';

export class SessionManager {
  constructor(db = null) {
    this.db = db;
    this.sessionId = `session-${Date.now()}`;
    this.startTime = Date.now();
    this.activeGoalOnStart = null;
  }

  /**
   * Reconstruct session start summary from memory.
   */
  getReconstructedContext(memoryManager) {
    let summary = 'Мы только что зашли в мир.';
    if (!memoryManager) return summary;

    const base = memoryManager.getPOI('base') || memoryManager.getPOI('home');
    const recentEpisode = memoryManager.episodic ? memoryManager.episodic.getRecentEpisodes(1)[0] : null;

    if (base && recentEpisode) {
      summary = `Мы на базе (${base.x}, ${base.y}, ${base.z}). В прошлый раз мы: ${recentEpisode.description || 'исследовали мир'}.`;
    } else if (base) {
      summary = `Мы на базе на координатах (${base.x}, ${base.y}, ${base.z}).`;
    }

    logger.info(`[SESSION] Reconstructed start context: "${summary}"`);
    return summary;
  }

  /**
   * Save session statistics and summary upon exit.
   */
  saveSessionSummary(summaryText = 'Сессия успешно завершена') {
    const durationMinutes = Math.round((Date.now() - this.startTime) / 60000);
    logger.info(`[SESSION] Saving session ${this.sessionId} (Duration: ${durationMinutes} min): ${summaryText}`);
    return {
      sessionId: this.sessionId,
      durationMinutes,
      summary: summaryText,
    };
  }
}

export const sessionManager = new SessionManager();
