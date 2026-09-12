import { createLogger } from '../utils/logger.js';

const logger = createLogger('RECONCILIATION');

export class RealityReconciliation {
  constructor({ agentName }) {
    this.agentName = agentName;
    this.expectations = new Map();
    this.mismatches = [];
    
    // Tracking confidence for action types
    this.confidenceScores = new Map(); // actionType -> { successCount, totalCount }
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 15);
  }

  setExpectation(action, expected) {
    const id = this._generateId();
    const expectation = {
      id,
      action,
      expected,
      actual: null,
      match: null,
      timestamp: Date.now(),
      reconciled: false
    };
    
    this.expectations.set(id, expectation);
    logger.info(`[${this.agentName}] Установлено ожидание [${id}] для действия: ${action}`);
    return id;
  }

  reconcile(expectationId, actual) {
    const expectation = this.expectations.get(expectationId);
    if (!expectation) {
      logger.warn(`[${this.agentName}] Ожидание ${expectationId} не найдено для согласования`);
      return false;
    }
    
    expectation.actual = actual;
    expectation.reconciled = true;
    
    // Simple deep equality or heuristic check
    expectation.match = this._compareExpectation(expectation.expected, actual);
    
    const actionType = expectation.action.split(' ')[0]; // Basic heuristic
    this.adjustConfidence(actionType, expectation.match);
    
    if (expectation.match) {
      logger.info(`[${this.agentName}] Реальность совпала с ожиданиями для [${expectationId}]`);
    } else {
      logger.warn(`[${this.agentName}] Расхождение с реальностью для [${expectationId}]`);
      this._recordMismatch(expectation);
    }
    
    return expectation.match;
  }

  autoReconcile(expectationId, worldStateSnapshot) {
    const expectation = this.expectations.get(expectationId);
    if (!expectation) return false;
    
    // This requires complex logic to extract 'actual' from worldStateSnapshot based on 'expected' format.
    // For now, we simulate extraction.
    const extractedActual = {}; 
    for (const key of Object.keys(expectation.expected)) {
      if (worldStateSnapshot[key] !== undefined) {
        extractedActual[key] = worldStateSnapshot[key];
      }
    }
    
    return this.reconcile(expectationId, extractedActual);
  }

  _compareExpectation(expected, actual) {
    if (!expected || !actual) return false;
    
    for (const key in expected) {
      if (typeof expected[key] === 'object' && expected[key] !== null) {
        // simplified nested check
        if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
          return false;
        }
      } else {
        if (expected[key] !== actual[key]) {
          return false;
        }
      }
    }
    return true;
  }

  _recordMismatch(expectation) {
    this.mismatches.push(expectation);
    if (this.mismatches.length > 50) {
      this.mismatches.shift(); // Keep last 50
    }
  }

  getUnreconciled() {
    return Array.from(this.expectations.values()).filter(e => !e.reconciled);
  }

  getRecentMismatches(count = 10) {
    return this.mismatches.slice(-count);
  }

  getAccuracy() {
    let total = 0;
    let matches = 0;
    
    for (const exp of this.expectations.values()) {
      if (exp.reconciled) {
        total++;
        if (exp.match) matches++;
      }
    }
    
    return total > 0 ? matches / total : 1.0;
  }

  getAccuracyPercentage() {
    return Math.round(this.getAccuracy() * 100);
  }

  getActionAccuracy(actionType) {
    const stats = this.confidenceScores.get(actionType);
    if (!stats || stats.totalCount === 0) return 1.0;
    return stats.successCount / stats.totalCount;
  }

  adjustConfidence(actionType, success) {
    if (!this.confidenceScores.has(actionType)) {
      this.confidenceScores.set(actionType, { successCount: 0, totalCount: 0 });
    }
    
    const stats = this.confidenceScores.get(actionType);
    stats.totalCount++;
    if (success) {
      stats.successCount++;
    }
  }

  shouldDoubleCheck(actionType) {
    const accuracy = this.getActionAccuracy(actionType);
    return accuracy < 70; // if less than 70% accurate, double check
  }

  getState() {
    return {
      overallAccuracy: this.getAccuracy(),
      pendingExpectations: this.getUnreconciled().length,
      confidenceScores: Object.fromEntries(this.confidenceScores.entries())
    };
  }
}
