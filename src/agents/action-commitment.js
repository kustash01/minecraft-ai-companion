import { createLogger } from '../utils/logger.js';

const logger = createLogger('ACTION_COMMITMENT');

export class ActionCommitmentManager {
  /**
   * @param {Object} options
   * @param {string} options.agentName
   */
  constructor({ agentName }) {
    this.agentName = agentName;
    
    /** 
     * @type {{ type: string, description: string, startedAt: number, estimatedDuration: number, progress: number, priority: number } | null}
     */
    this.currentAction = null;
    
    /** @type {Array<Object>} */
    this.actionHistory = [];
    
    this.interruptCount = 0;
    this.pendingInterrupts = [];
    
    logger.info(`Инициализирован ActionCommitmentManager для ${agentName}`);
  }

  /**
   * Принимает обязательство по выполнению действия
   * @param {Object} action
   * @param {string} action.type
   * @param {string} action.description
   * @param {number} action.estimatedDuration
   * @param {number} [action.priority=5]
   */
  commitTo(action) {
    if (this.currentAction) {
      this.interrupt('NEW_COMMITMENT');
    }
    
    this.currentAction = {
      ...action,
      priority: action.priority || 5,
      startedAt: Date.now(),
      progress: 0.0
    };
    
    logger.debug(`[${this.agentName}] Начато действие: ${this.currentAction.description} (Приоритет: ${this.currentAction.priority})`);
  }

  /**
   * Проверяет, можно ли прервать текущее действие
   * @param {Object} newEvent
   * @param {number} newEvent.priority
   * @param {boolean} [newEvent.isEmergency=false]
   * @returns {boolean}
   */
  canInterrupt(newEvent) {
    if (!this.currentAction) return true;

    const isEmergency = Boolean(newEvent?.isEmergency || newEvent?.type === 'emergency' || (newEvent?.priority && newEvent.priority >= 9));

    // Emergency (health < 3, creeper, lava, fire) → ALWAYS interrupt
    if (isEmergency) return true;

    // Current action completed → interrupt (transition)
    if (this.currentAction.progress >= 1.0) return true;

    // Higher priority action (new priority > current priority + 2) → interrupt
    if (newEvent?.priority && newEvent.priority > this.currentAction.priority + 2) return true;

    const timeSinceStart = Date.now() - this.currentAction.startedAt;
    
    // If action started < 3 seconds ago → resist interrupt (anti-twitching)
    if (timeSinceStart < 3000) {
      return false;
    }

    return false;
  }

  /**
   * Принудительно прерывает текущее действие
   * @param {string} reason
   */
  interrupt(reason) {
    if (!this.currentAction) return;

    this.interruptCount++;
    this._recordToHistory('INTERRUPTED', reason);
    
    logger.debug(`[${this.agentName}] Действие прервано: ${this.currentAction.description}. Причина: ${reason}`);
    this.currentAction = null;
  }

  /**
   * Завершает текущее действие
   * @param {string} outcome
   */
  complete(outcome) {
    if (!this.currentAction) return;

    this.currentAction.progress = 1.0;
    this._recordToHistory('COMPLETED', outcome);
    
    logger.debug(`[${this.agentName}] Действие завершено: ${this.currentAction.description}. Итог: ${outcome}`);
    this.currentAction = null;
  }

  /**
   * Внутренний метод для записи истории
   * @private
   */
  _recordToHistory(status, reasonOrOutcome) {
    this.actionHistory.unshift({
      ...this.currentAction,
      status,
      detail: reasonOrOutcome,
      endedAt: Date.now()
    });

    // Оставляем только последние 20
    if (this.actionHistory.length > 20) {
      this.actionHistory.pop();
    }
  }

  /**
   * 0.0-1.0, how strongly committed
   * @returns {number}
   */
  getCommitmentStrength() {
    if (!this.currentAction) return 0.0;
    
    const timeSpent = Date.now() - this.currentAction.startedAt;
    const estDuration = this.currentAction.estimatedDuration || 10000;
    
    // Чем дольше делаем, тем сильнее приверженность
    let strength = Math.min(timeSpent / estDuration, 1.0);
    
    // В самом начале (первые 3 сек) приверженность искусственно высокая, чтобы не было дёрганий
    if (timeSpent < 3000) {
      strength = Math.max(strength, 0.8);
    }
    
    return strength;
  }

  /**
   * Возвращает отложенные прерывания
   * @returns {Array<Object>}
   */
  getPendingInterrupts() {
    return this.pendingInterrupts;
  }

  /**
   * Возвращает состояние для дашборда
   * @returns {Object}
   */
  getState() {
    return {
      agentName: this.agentName,
      currentAction: this.currentAction,
      commitmentStrength: this.getCommitmentStrength(),
      interruptCount: this.interruptCount,
      historyLength: this.actionHistory.length
    };
  }
}
