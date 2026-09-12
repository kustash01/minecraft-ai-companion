import { createLogger } from '../utils/logger.js';

const logger = createLogger('ERROR');

export class LoopDetector {
  constructor(maxRepeats = 4) {
    this.maxRepeats = maxRepeats;
    this.history = [];
    this.maxHistory = 15;
  }

  /**
   * Записывает вызов инструмента и проверяет на зацикливание.
   * @param {string} toolName
   * @param {Object} args
   * @returns {boolean} true если обнаружен бесконечный цикл
   */
  recordAndCheck(toolName, args = {}) {
    const signature = `${toolName}:${JSON.stringify(args)}`;
    this.history.push({ signature, timestamp: Date.now() });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Проверяем последние N вызовов
    if (this.history.length >= this.maxRepeats) {
      const recent = this.history.slice(-this.maxRepeats);
      const allSame = recent.every(item => item.signature === signature);

      if (allSame) {
        logger.warn(`⚠️ [ЗАЦИКЛИВАНИЕ] Инструмент ${toolName} вызван одинаково ${this.maxRepeats} раз подряд!`);
        return true;
      }
    }

    return false;
  }

  reset() {
    this.history = [];
  }
}
