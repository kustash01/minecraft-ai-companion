import { createLogger } from '../utils/logger.js';
import { sceneObserver } from '../perception/scene-observer.js';

const logger = createLogger('AI');

/**
 * ContextManager — управление контекстом для LLM.
 * Формирует релевантную информацию для каждого запроса.
 */
export class ContextManager {
  constructor(config) {
    this.config = config;
    this.maxHistoryLength = 20;
    this.recentHistory = [];
    this.bot = null;
  }

  /**
   * Attach the live mineflayer bot so the context can include a first-person
   * scene description (terrain, compass, what is around). Optional: without it
   * the context falls back to the flat WorldState summary.
   */
  setBot(bot) {
    this.bot = bot || null;
  }

  /**
   * Строит контекстную строку для AI из текущего WorldState.
   * @param {WorldState} worldState — объект состояния мира
   * @param {string|null} currentTask — текущая задача
   * @param {Array} recentHistory — недавняя история
   * @returns {string}
   */
  buildContext(worldState, currentTask, recentHistory = [], memoryManager = null) {
    const parts = [];

    parts.push('[СОСТОЯНИЕ МИРА]');

    if (worldState && worldState.getSummary) {
      parts.push(worldState.getSummary());
    } else if (worldState && worldState.position) {
      // Fallback если передан snapshot
      const pos = worldState.position;
      parts.push(`Позиция: [${pos.x}, ${pos.y}, ${pos.z}]`);
      parts.push(`Здоровье: ${worldState.health || 20}/20, Еда: ${worldState.food || 20}/20`);
    }

    // Живое зрение: что бот реально видит вокруг (рельеф, стороны света, объекты).
    if (this.bot?.entity) {
      try {
        const scene = sceneObserver.observe(this.bot);
        if (scene) {
          parts.push(`\n[ЧТО Я ВИЖУ]\n${sceneObserver.describe(scene)}`);
        }
      } catch (err) {
        logger.debug(`Не удалось построить сцену для контекста: ${err.message}`);
      }
    }

    if (currentTask) {
      parts.push(`\n[ТЕКУЩАЯ ЗАДАЧА]\n${currentTask}`);
    }

    if (memoryManager && memoryManager.getMemoryContext) {
      const memContext = memoryManager.getMemoryContext(worldState?.position);
      if (memContext) {
        parts.push(`\n${memContext}`);
      }
    }

    // Недавняя история (сжатая)
    const history = recentHistory.length > 0 ? recentHistory : this.recentHistory;
    if (history.length > 0) {
      const historyText = this._summarizeHistory(history);
      parts.push(`\n[НЕДАВНЯЯ ИСТОРИЯ]\n${historyText}`);
    }

    return parts.join('\n');
  }

  /**
   * Добавляет сообщение в историю.
   */
  addToHistory(role, content) {
    this.recentHistory.push({ role, content, timestamp: Date.now() });
    // Ограничиваем размер
    if (this.recentHistory.length > this.maxHistoryLength) {
      this.recentHistory = this.recentHistory.slice(-this.maxHistoryLength);
    }
  }

  /**
   * Сжимает историю до читаемого формата.
   */
  _summarizeHistory(messages) {
    if (!messages || messages.length === 0) return '';
    return messages
      .slice(-10) // Последние 10 сообщений
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 150) : m.content}`)
      .join('\n');
  }

  /**
   * Очистка истории.
   */
  clearHistory() {
    this.recentHistory = [];
  }
}
