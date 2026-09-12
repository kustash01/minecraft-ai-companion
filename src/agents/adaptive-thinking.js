import { createLogger } from '../utils/logger.js';

const logger = createLogger('ADAPTIVE_THINKING');

/**
 * @typedef {'FAST_PATH'|'EVENT_DRIVEN'|'NORMAL_TICK'|'DEEP_THINKING'} LayerType
 */

export class AdaptiveThinkingController {
  /**
   * @param {Object} options
   * @param {string} options.agentName
   * @param {Object} options.cognitiveEngine
   * @param {Object} options.fastPath
   * @param {Object} options.eventBus
   */
  constructor({ agentName, cognitiveEngine, fastPath, eventBus }) {
    this.agentName = agentName;
    this.cognitiveEngine = cognitiveEngine;
    this.fastPath = fastPath;
    this.eventBus = eventBus;
    
    this.activityLevel = 'idle'; // 'idle' | 'working' | 'group' | 'danger'
    this.lastTickTime = Date.now();
    this.lastLLMCallTime = 0;
    
    logger.info(`Инициализирован AdaptiveThinkingController для агента ${agentName}`);
  }

  /**
   * @param {string} level - 'idle' | 'working' | 'group' | 'danger'
   */
  setActivityLevel(level) {
    const validLevels = ['idle', 'working', 'group', 'danger'];
    if (validLevels.includes(level) && this.activityLevel !== level) {
      this.activityLevel = level;
      logger.debug(`[${this.agentName}] Уровень активности изменен на: ${level}`);
    }
  }

  /**
   * @returns {number} Текущий интервал в миллисекундах
   */
  getTickInterval() {
    switch (this.activityLevel) {
      case 'danger':
        return 7500; // 5-10 seconds
      case 'group':
        return 15000; // 10-20 seconds
      case 'working':
        return 22500; // 15-30 seconds
      case 'idle':
      default:
        return 45000; // 30-60 seconds
    }
  }

  /**
   * Проверяет, пришло ли время для NORMAL_TICK
   * @returns {boolean}
   */
  shouldTick() {
    const now = Date.now();
    const interval = this.getTickInterval();
    if (now - this.lastTickTime >= interval) {
      this.lastTickTime = now;
      return true;
    }
    return false;
  }

  /**
   * Фиксирует время последнего вызова LLM
   */
  recordLLMCall() {
    this.lastLLMCallTime = Date.now();
  }

  /**
   * Оценивает событие и решает, на каком слое его обработать.
   * @param {Object} event
   * @param {string} event.type
   * @param {any} [event.payload]
   * @returns {{ layer: LayerType, priority: number, shouldCallLLM: boolean }}
   */
  evaluateEvent(event) {
    // 1. FAST_PATH проверки
    const fastPathEvents = ['entity_hurt', 'creeper_nearby', 'low_health', 'falling'];
    if (fastPathEvents.includes(event.type)) {
      return { layer: 'FAST_PATH', priority: 10, shouldCallLLM: false };
    }

    // 4. DEEP_THINKING проверки
    const deepThinkingEvents = ['complex_goal_planning', 'conflict_resolution', 'craft_strategy'];
    if (deepThinkingEvents.includes(event.type)) {
      return { layer: 'DEEP_THINKING', priority: 5, shouldCallLLM: true };
    }

    // 2. EVENT_DRIVEN проверки
    const eventDrivenEvents = ['chat', 'player_joined', 'inventory_full', 'death', 'respawn', 'block_broken'];
    if (eventDrivenEvents.includes(event.type)) {
      return { layer: 'EVENT_DRIVEN', priority: 8, shouldCallLLM: true };
    }

    // 3. NORMAL_TICK fallback
    return { layer: 'NORMAL_TICK', priority: 3, shouldCallLLM: true };
  }

  /**
   * Возвращает текущее состояние для дашборда
   * @returns {Object}
   */
  getState() {
    return {
      agentName: this.agentName,
      activityLevel: this.activityLevel,
      currentIntervalMs: this.getTickInterval(),
      timeSinceLastTick: Date.now() - this.lastTickTime,
      timeSinceLastLLM: Date.now() - this.lastLLMCallTime,
    };
  }
}
