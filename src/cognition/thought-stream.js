import { createLogger } from '../utils/logger.js';

const logger = createLogger('THOUGHT_STREAM');

/**
 * ThoughtStream — поток подсознания и внутреннего монолога бота:
 * Позволяет Gemini и фоновым процессам транслировать спонтанные мысли,
 * сомнения и размышления в реальном времени.
 */
export class ThoughtStream {
  constructor() {
    this.recentThoughts = [];
    this.listeners = new Set();
  }

  /**
   * Сгенерировать и зафиксировать мысль в потоке сознания
   */
  emit(thoughtText) {
    if (!thoughtText || typeof thoughtText !== 'string') return null;
    const clean = thoughtText.trim();
    if (!clean) return null;

    const entry = {
      text: clean,
      timestamp: Date.now(),
    };

    this.recentThoughts.push(entry);
    if (this.recentThoughts.length > 20) {
      this.recentThoughts.shift();
    }

    logger.info(`[💭 МЫСЛЬ] ${clean}`);

    for (const listener of this.listeners) {
      try { listener(entry); } catch (_) {}
    }

    return entry;
  }

  /**
   * Подписка на поток мыслей
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }
    return () => {};
  }

  /**
   * Получить недавние мысли
   */
  getRecent(limit = 5) {
    return this.recentThoughts.slice(-limit);
  }
}

export const thoughtStream = new ThoughtStream();
