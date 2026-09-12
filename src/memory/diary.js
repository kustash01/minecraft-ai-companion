import { createLogger } from '../utils/logger.js';

const logger = createLogger('MEMORY');

export class Diary {
  constructor(longTermMemory) {
    this.storage = longTermMemory;
  }

  /**
   * Записывает новое событие в дневник.
   */
  logEntry(mcDay, title, content) {
    const info = this.storage.addDiaryEntry(mcDay, title, content);
    logger.info(`[ДНЕВНИК] День ${mcDay}: ${title}`);
    return info;
  }

  /**
   * Получает последние записи дневника.
   */
  getRecentEntries(limit = 5) {
    return this.storage.getDiaryEntries(limit);
  }

  /**
   * Получает записи за конкретный день.
   */
  getEntriesByDay(mcDay) {
    return this.storage.getDiaryByDay(mcDay);
  }

  /**
   * Возвращает форматированный текст дневника для AI.
   */
  getFormattedSummary(limit = 5) {
    const entries = this.getRecentEntries(limit);
    if (entries.length === 0) return 'Дневник пуст.';

    return entries
      .map(e => `[День ${e.mc_day}] ${e.title}: ${e.content}`)
      .join('\n');
  }
}
