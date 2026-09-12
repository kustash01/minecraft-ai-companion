import { createLogger } from '../utils/logger.js';
import { telemetry } from '../utils/telemetry.js';

const logger = createLogger('API_BUDGET');

export class APIBudgetManager {
  /**
   * @param {Object} options
   * @param {number} [options.maxGlobalRPM=60] - Увеличено с 14 до 60
   * @param {number} [options.maxPerAgentRPM=15] - Увеличено с 4 до 15
   * @param {string[]} options.agents
   */
  constructor({ maxGlobalRPM = 60, maxPerAgentRPM = 15, agents = [] }) {
    this.maxGlobalRPM = maxGlobalRPM;
    this.maxPerAgentRPM = maxPerAgentRPM;
    
    this.globalRequestsThisMinute = 0;
    this.windowStart = Date.now();
    this.requestQueue = [];
    this.activeRequests = 0;
    this.maxConcurrent = 1;
    
    this.agentsStats = {};
    for (const agent of agents) {
      this.agentsStats[agent] = {
        requestsThisMinute: 0,
        activeRequests: 0,
        totalRequests: 0,
        totalTokensEstimated: 0,
        lastRequestTime: 0,
        cooldownUntil: null,
        priority: 'normal'
      };
    }

    // Запускаем окно сброса лимитов каждую минуту
    this._resetInterval = setInterval(() => this.resetMinuteWindow(), 60000);
    logger.info(`Инициализирован APIBudgetManager (Global RPM: ${this.maxGlobalRPM}, Per-Agent RPM: ${this.maxPerAgentRPM})`);
  }

  /**
   * Сбрасывает счетчики за минуту
   */
  resetMinuteWindow() {
    this.windowStart = Date.now();
    this.globalRequestsThisMinute = 0;
    
    for (const agent in this.agentsStats) {
      this.agentsStats[agent].requestsThisMinute = 0;
    }
    this._processQueue();
    logger.debug('Минутное окно API-лимитов сброшено.');
  }

  /**
   * @param {string} agentName
   * @returns {boolean}
   */
  canAgentThink(agentName) {
    const stats = this.agentsStats[agentName];
    if (!stats) return false;
    
    if (stats.cooldownUntil && Date.now() < stats.cooldownUntil) {
      return false;
    }

    if (this.globalRequestsThisMinute >= this.maxGlobalRPM) {
      return false;
    }

    if (stats.requestsThisMinute >= this.maxPerAgentRPM) {
      return false;
    }

    return true;
  }

  /**
   * Запрашивает слот для выполнения LLM-запроса
   * @param {string} agentName 
   * @param {'normal_tick'|'event_driven'|'deep_thinking'|'emergency'} priority 
   * @param {string} eventType 
   * @returns {Promise<boolean>}
   */
  async requestSlot(agentName, priority, eventType, options = {}) {
    if (!this.agentsStats[agentName]) {
      logger.warn(`Агент ${agentName} не зарегистрирован в APIBudgetManager`);
      return false;
    }

    const priorityWeights = {
      'emergency': 4,
      'event_driven': 3,
      'deep_thinking': 2,
      'normal_tick': 1
    };

    return new Promise((resolve) => {
      let settled = false;
      let timeoutTimer = null;
      const signal = options.signal;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      };
      const onAbort = () => {
        const index = this.requestQueue.indexOf(requestObj);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
          requestObj.wasQueued = false;
          telemetry.decrement('queuedRequests');
        }
        finish(false);
      };
      const requestObj = {
        agentName,
        priorityWeight: priorityWeights[priority] || 1,
        priorityLabel: priority,
        eventType,
        resolve: finish,
        timestamp: Date.now()
        ,wasQueued: false
      };

      if (signal?.aborted) {
        finish(false);
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      // Экстренные запросы пропускаются без очереди, если есть хоть малейший бюджет,
      // или даже с перерасходом, если это вопрос выживания
      if (priority === 'emergency') {
        this._grantSlot(requestObj);
        return;
      }

      this.requestQueue.push(requestObj);
      requestObj.wasQueued = true;
      telemetry.increment('queuedRequests');
      this.requestQueue.sort((a, b) => b.priorityWeight - a.priorityWeight); // По убыванию приоритета
      
      this._processQueue();

      // Таймаут ожидания слота - 10 секунд
      timeoutTimer = setTimeout(() => {
        const index = this.requestQueue.indexOf(requestObj);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
          requestObj.wasQueued = false;
          logger.debug(`[${agentName}] Отклонен запрос слота по таймауту (${priority})`);
          finish(false);
          telemetry.decrement('queuedRequests');
        }
      }, 10000);
    });
  }

  /**
   * Обрабатывает очередь запросов
   * @private
   */
  _processQueue() {
    if (this.requestQueue.length === 0 || this.activeRequests >= this.maxConcurrent) return;

    const index = this.requestQueue.findIndex((req) => this.canAgentThink(req.agentName));
    if (index === -1) return;
    const nextReq = this.requestQueue[index];
    
    if (this.activeRequests < this.maxConcurrent && this.canAgentThink(nextReq.agentName)) {
      this.requestQueue.splice(index, 1);
      this._grantSlot(nextReq);
      
      // Рекурсивно проверяем следующий
      this._processQueue();
    }
  }

  /**
   * Выдает слот
   * @private
   */
  _grantSlot(req) {
    this.globalRequestsThisMinute++;
    this.activeRequests++;
    const stats = this.agentsStats[req.agentName];
    stats.requestsThisMinute++;
    stats.activeRequests++;
    stats.totalRequests++;
    stats.lastRequestTime = Date.now();
    if (req.wasQueued) {
      req.wasQueued = false;
      telemetry.decrement('queuedRequests');
    }
    
    logger.debug(`[${req.agentName}] Слот выдан (Приоритет: ${req.priorityLabel}, Событие: ${req.eventType}). Global reqs: ${this.globalRequestsThisMinute}/${this.maxGlobalRPM}`);
    req.resolve(true);
  }

  /**
   * Сообщает менеджеру о завершении запроса
   * @param {string} agentName 
   */
  releaseSlot(agentName) {
    // В будущем тут можно освобождать слоты для параллельных лимитов, 
    // но для RPM-базированных просто фиксируем.
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.agentsStats[agentName]) {
      this.agentsStats[agentName].activeRequests = Math.max(0, this.agentsStats[agentName].activeRequests - 1);
    }
    this._processQueue();
  }

  /**
   * Блокирует агенту доступ к API на заданное время
   * @param {string} agentName 
   * @param {number} durationMs 
   */
  setCooldown(agentName, durationMs) {
    if (this.agentsStats[agentName]) {
      this.agentsStats[agentName].cooldownUntil = Date.now() + durationMs;
      logger.info(`[${agentName}] Установлен кулдаун на ${durationMs}мс`);
    }
  }

  /**
   * Возвращает статистику для дашборда
   * @returns {Object}
   */
  getStats() {
    return {
      global: {
        requestsThisMinute: this.globalRequestsThisMinute,
        maxGlobalRPM: this.maxGlobalRPM,
        queueLength: this.requestQueue.length,
        activeRequests: this.activeRequests,
        windowStart: this.windowStart
      },
      perAgent: this.agentsStats
    };
  }

  dispose() {
    if (this._resetInterval) {
      clearInterval(this._resetInterval);
      this._resetInterval = null;
    }
    for (const request of this.requestQueue.splice(0)) request.resolve(false);
  }
}
