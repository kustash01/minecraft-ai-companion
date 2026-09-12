import { createLogger } from '../utils/logger.js';

const logger = createLogger('MEMORY');

export class EpisodicMemory {
  constructor(longTermMemory) {
    this.storage = longTermMemory;
  }

  /**
   * Запоминает важное событие.
   */
  rememberEpisode({
    mcDay,
    eventType,
    summary,
    position = null,
    participants = '',
    outcome = '',
    importance = 5,
  }) {
    // Сохраняем только события с достаточной важностью
    if (importance < 3) return null;

    const x = position ? position.x : null;
    const y = position ? position.y : null;
    const z = position ? position.z : null;

    const result = this.storage.addEpisode({
      mcDay,
      eventType,
      summary,
      x,
      y,
      z,
      participants,
      outcome,
      importance,
    });

    logger.info(`[ЭПИЗОД] (${eventType}, важность ${importance}): ${summary}`);
    return result;
  }

  /**
   * Получает релевантные воспоминания по запросу или последние.
   */
  recall(query = null, limit = 5) {
    if (query) {
      return this.storage.searchEpisodes(query);
    }
    return this.storage.getRecentEpisodes(limit, 4);
  }

  /**
   * Форматирует воспоминания для контекста AI.
   */
  getFormattedMemories(limit = 5) {
    const episodes = this.recall(null, limit);
    if (episodes.length === 0) return 'Нет сохранённых воспоминаний.';

    return episodes
      .map(e => `• [День ${e.mc_day || '?'}] ${e.summary} (${e.outcome || 'успешно'})`)
      .join('\n');
  }
}
