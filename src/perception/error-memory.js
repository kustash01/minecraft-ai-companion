import { createLogger } from '../utils/logger.js';

const logger = createLogger('ERROR_MEMORY');

/**
 * Система памяти об ошибках - бот УЧИТСЯ на своих ошибках!
 *
 * - Помнит последние 100 ошибок
 * - Если ошибился дважды подряд - в 3-й раз шанс ↓
 * - После успеха - шанс ошибки ↓
 * - Анализирует паттерны ошибок
 */
export class ErrorMemory {
  constructor(agentName = 'Bot') {
    this.agentName = agentName;
    this.errorHistory = [];
    this.successHistory = [];
    this.maxHistoryLength = 100;
    this.learningMultiplier = 1.0;
  }

  /**
   * Записывает ошибку и обновляет обучение
   */
  recordError(errorType, errorData = {}) {
    const error = {
      type: errorType,
      timestamp: Date.now(),
      data: errorData,
    };

    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistoryLength) {
      this.errorHistory.shift();
    }

    this._updateLearning();
  }

  /**
   * Записывает успех (успешно выполненное действие без ошибок)
   */
  recordSuccess(actionType, actionData = {}) {
    const success = {
      type: actionType,
      timestamp: Date.now(),
      data: actionData,
    };

    this.successHistory.push(success);
    if (this.successHistory.length > this.maxHistoryLength) {
      this.successHistory.shift();
    }

    this._updateLearning();
  }

  /**
   * Обновляет множитель обучения на основе истории
   */
  _updateLearning() {
    let learning = 1.0;

    // Проверяем последние 5 действий на ошибки
    const recentErrors = this._getRecentErrors(5);
    const recentSuccesses = this._getRecentSuccesses(5);

    // Если было много ошибок подряд - УЧИМСЯ и ошибаемся меньше
    if (recentErrors.length >= 2) {
      learning -= 0.1 * recentErrors.length; // -10% за каждую ошибку
    }

    // Если было много успехов - становимся увереннее но ошибаемся больше (переуверенность)
    if (recentSuccesses.length >= 3) {
      learning += 0.05 * (recentSuccesses.length - 2); // +5% за каждый успех после 2-го
    }

    // Проверяем повторяющиеся ошибки
    const repeatErrors = this._getRepeatingErrors();
    learning -= 0.15 * repeatErrors.length; // -15% за каждую повторяющуюся ошибку

    // Ограничиваем множитель
    this.learningMultiplier = Math.max(0.3, Math.min(1.5, learning));
  }

  /**
   * Получает множитель ошибок для конкретного типа действия
   */
  getErrorModifier(actionType) {
    // Проверяем историю этого типа действия
    const recentForThisAction = this.errorHistory
      .filter(e => e.type === actionType)
      .slice(-5);

    let modifier = this.learningMultiplier;

    // Если недавно ошибились в этом действии - становимся осторожнее
    if (recentForThisAction.length > 0) {
      modifier *= (1 - 0.2 * recentForThisAction.length); // -20% за каждую ошибку
    }

    return Math.max(0.2, modifier); // Минимум 0.2x (бот всё ещё может ошибиться)
  }

  /**
   * Получает последние N ошибок
   */
  _getRecentErrors(count = 10) {
    return this.errorHistory.slice(-count);
  }

  /**
   * Получает последние N успехов
   */
  _getRecentSuccesses(count = 10) {
    return this.successHistory.slice(-count);
  }

  /**
   * Получает ошибки которые повторяются
   */
  _getRepeatingErrors() {
    const errorCounts = {};

    for (const error of this.errorHistory.slice(-20)) {
      errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
    }

    return Object.entries(errorCounts)
      .filter(([_, count]) => count >= 2)
      .map(([type, _]) => type);
  }

  /**
   * Получить статистику ошибок
   */
  getStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      totalSuccesses: this.successHistory.length,
      learningMultiplier: this.learningMultiplier.toFixed(2),
      recentErrors: this._getRecentErrors(5).map(e => e.type),
      repeatingErrors: this._getRepeatingErrors(),
      successRate: this._calculateSuccessRate(),
    };

    return stats;
  }

  /**
   * Вычисляет процент успехов
   */
  _calculateSuccessRate() {
    const total = this.errorHistory.length + this.successHistory.length;
    if (total === 0) return 100;
    return Math.round((this.successHistory.length / total) * 100);
  }

  /**
   * Получить описание обучения
   */
  getDescription() {
    const stats = this.getStats();
    let desc = `📚 Память об ошибках для ${this.agentName}\n`;
    desc += `✅ Успехов: ${stats.totalSuccesses}\n`;
    desc += `❌ Ошибок: ${stats.totalErrors}\n`;
    desc += `📊 % Успеха: ${stats.successRate}%\n`;
    desc += `🧠 Множитель обучения: ${stats.learningMultiplier}x\n`;

    if (stats.repeatingErrors.length > 0) {
      desc += `⚠️ Повторяющиеся ошибки: ${stats.repeatingErrors.join(', ')}\n`;
    }

    return desc;
  }
}
