import { createLogger } from '../utils/logger.js';

const logger = createLogger('DELEGATION');

export class DelegationManager {
  constructor({ agentName }) {
    this.agentName = agentName;
    this.delegations = new Map(); // id -> delegation
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  delegate(to, taskDescription, importance = 5) {
    const id = this._generateId();
    const delegation = {
      id,
      from: this.agentName,
      to,
      task: taskDescription,
      status: 'pending',
      createdAt: Date.now(),
      respondedAt: null,
      completedAt: null,
      reminderCount: 0,
      response: null,
      importance
    };
    
    this.delegations.set(id, delegation);
    logger.info(`[${this.agentName}] Делегирована задача для ${to}: ${taskDescription}`);
    return delegation;
  }

  receiveRequest(delegation) {
    // Cloning the delegation object to store it locally
    const localDel = { ...delegation };
    this.delegations.set(localDel.id, localDel);
    logger.info(`[${this.agentName}] Получен запрос от ${localDel.from}: ${localDel.task}`);
    return true;
  }

  respondToRequest(delegationId, responseText, status) {
    const del = this.delegations.get(delegationId);
    if (!del) return false;
    
    del.response = responseText;
    del.status = status; // 'accepted' | 'declined' | 'deferred'
    del.respondedAt = Date.now();
    
    logger.info(`[${this.agentName}] Ответ на запрос ${delegationId}: ${status} - ${responseText}`);
    return true;
  }

  getPendingIncoming() {
    return Array.from(this.delegations.values()).filter(d => d.to === this.agentName && d.status === 'pending');
  }

  getPendingOutgoing() {
    return Array.from(this.delegations.values()).filter(d => d.from === this.agentName && (d.status === 'pending' || d.status === 'accepted' || d.status === 'deferred'));
  }

  getDeferred() {
    return Array.from(this.delegations.values()).filter(d => d.to === this.agentName && d.status === 'deferred');
  }

  complete(delegationId, result = null) {
    const del = this.delegations.get(delegationId);
    if (!del) return false;
    
    del.status = 'completed';
    del.completedAt = Date.now();
    del.response = result ? String(result) : 'Завершено';
    
    logger.info(`[${this.agentName}] Делегированная задача ${delegationId} завершена`);
    return true;
  }

  forget(delegationId) {
    const del = this.delegations.get(delegationId);
    if (!del) return false;
    
    del.status = 'forgotten';
    logger.info(`[${this.agentName}] Забыл о задаче ${delegationId}`);
    return true;
  }

  remind(delegationId) {
    const del = this.delegations.get(delegationId);
    if (!del) return false;
    
    del.reminderCount += 1;
    if (del.status === 'forgotten') {
      del.status = 'pending';
    }
    logger.info(`[${this.agentName}] Напоминание о задаче ${delegationId} (счетчик: ${del.reminderCount})`);
    return true;
  }

  shouldRemember(delegation) {
    const timeElapsed = Date.now() - delegation.createdAt;
    const minutesElapsed = timeElapsed / 60000;
    const importance = delegation.importance || 5;
    
    if (minutesElapsed < 1) return true;
    
    let forgetProbability = 0;
    
    if (importance >= 8) {
      forgetProbability = 0.05 + (minutesElapsed * 0.01);
    } else if (importance <= 3) {
      forgetProbability = 0.2 + (minutesElapsed * 0.05);
    } else {
      forgetProbability = 0.1 + (minutesElapsed * 0.02);
    }
    
    // Reminders decrease forget probability
    forgetProbability -= (delegation.reminderCount * 0.15);
    forgetProbability = Math.max(0, Math.min(0.95, forgetProbability)); // cap between 0 and 95%
    
    return Math.random() > forgetProbability;
  }

  checkDeferredTasks() {
    const remembered = [];
    const deferredTasks = this.getDeferred();
    
    for (const del of deferredTasks) {
      if (this.shouldRemember(del)) {
        // We remembered! Could transition to pending or something else, but for now we just return them
        remembered.push(del);
        logger.info(`[${this.agentName}] Вспомнил отложенную задачу: ${del.task}`);
      } else {
        // Chance to forget permanently
        if (Math.random() < 0.1) { // 10% chance to forget when checked
          this.forget(del.id);
        }
      }
    }
    return remembered;
  }

  getState() {
    return {
      agentName: this.agentName,
      delegations: Array.from(this.delegations.values())
    };
  }
}
