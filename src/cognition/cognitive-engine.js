import { createLogger } from '../utils/logger.js';
import { eventBus, EventTypes, EventPriority } from '../events/event-bus.js';
import { AttentionManager } from './attention.js';
import { PersonalContextEngine } from './context-engine.js';
import { BeliefModel } from './belief-model.js';
import { FastPathRouter } from './fast-path.js';
import { EventAppraisalEngine } from './event-appraisal.js';

const logger = createLogger('COGNITION');

export class CognitiveEngine {
  constructor({
    config,
    toolRegistry,
    contextManager,
    provider,
    memoryManager = null,
    aiBrain = null,
  }) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.contextManager = contextManager;
    this.provider = provider;
    this.memoryManager = memoryManager;
    this.aiBrain = aiBrain;

    this.attention = new AttentionManager();
    this.contextEngine = new PersonalContextEngine();
    this.beliefModel = new BeliefModel();
    this.fastPath = new FastPathRouter();
    this.eventAppraisal = new EventAppraisalEngine({ profile: config?.agentProfile || {} });
    this.latestAppraisal = null;
    // A bounded, per-agent journal of private decisions.  This is deliberately
    // owned by cognition so a decision remains available even when durable
    // memory is absent (for example in unit tests or an offline mock).
    this.decisionLedger = [];
    this.maxDecisionLedger = Number.isSafeInteger(config?.decisionLedgerLimit)
      ? Math.max(1, config.decisionLedgerLimit)
      : 50;

    this.isRunning = false;
    this.cycleIntervalMs = 3000;
    this.timer = null;
    this.currentCycle = 0;
    this.latestDeliberationSummary = {
      decision: 'Ожидание указаний',
      reason: 'Ситуация стабильна',
      confidence: 1.0,
      nextAction: 'idle',
    };
  }

  /**
   * Run one complete 10-stage cognitive cycle.
   * @param {object} worldState - Current perception snapshot
   * @param {object} botInstance - Mineflayer bot
   * @returns {object} Cycle summary result
   */
  async runCycle(worldState, botInstance = null) {
    this.currentCycle++;
    const cycleId = this.currentCycle;
    logger.debug(`[COGNITIVE CYCLE #${cycleId}] Starting 10-stage loop`);

    // 1. PERCEPTION
    if (!worldState) {
      return { stage: 'PERCEPTION', status: 'no_world_state' };
    }

    // 2. SITUATION UNDERSTANDING & ATTENTION
    const attentionInfo = this.attention.updateAttention(worldState, {
      activeGoal: this.contextEngine.activeGoal,
    });
    this.contextEngine.updateContext({ worldState });

    // Check for high-salience event triggers
    if (attentionInfo.foreground && attentionInfo.foreground.salience >= 0.8) {
      eventBus.emitEvent(EventTypes.DANGER_DETECTED, {
        target: attentionInfo.foreground.entity,
      }, EventPriority.HIGH);
      this.latestAppraisal = this.appraiseEvent({
        type: 'danger_detected',
        category: 'setback',
        tags: ['danger'],
        risk: attentionInfo.foreground.salience,
        goalRelevance: this.contextEngine.activeGoal ? 0.6 : 0.2,
        confidence: 1,
      }, {
        equipmentReadiness: worldState.health > 14 ? 0.7 : 0.3,
        busy: this.contextEngine.botActivity === 'idle' ? 0 : 0.7,
      });
    }

    // 3. FAST-PATH REFLEX CHECK
    const reflex = this.fastPath.evaluateReflex(worldState, botInstance, this.contextEngine);
    if (reflex.handled) {
      logger.info(`[COGNITIVE CYCLE #${cycleId}] Fast-Path reflex executed: ${reflex.actionName}`);
      this.latestDeliberationSummary = {
        decision: `Быстрый рефлекс: ${reflex.actionName}`,
        reason: 'Мгновенная реакция на угрозу',
        confidence: 0.95,
        nextAction: reflex.actionName,
      };
      return { stage: 'FAST_PATH', action: reflex.actionName };
    }

    // 4. MEMORY RETRIEVAL & INTENTIONS
    let relevantMemories = [];
    if (this.memoryManager) {
      relevantMemories = this.memoryManager.search(this.contextEngine.activeGoal || 'general', 3);
    }

    // 5. GOAL & DELIBERATION SUMMARY
    const situation = this.contextEngine.getSituationSummary();
    this.latestDeliberationSummary = {
      decision: this.contextEngine.activeGoal ? `Выполняю цель: ${this.contextEngine.activeGoal}` : 'Патрулирую и наблюдаю за окружением',
      reason: situation.threats,
      confidence: 0.88,
      nextAction: this.contextEngine.botActivity,
    };

    logger.debug(`[COGNITIVE CYCLE #${cycleId}] Completed successfully`);
    return {
      cycleId,
      deliberation: this.latestDeliberationSummary,
      attention: attentionInfo,
      appraisal: this.latestAppraisal,
    };
  }

  /** Appraise a fact without turning it into speech or executing an action. */
  appraiseEvent(event, context = {}) {
    this.latestAppraisal = this.eventAppraisal.appraise(event, {
      goalRelevance: this.contextEngine.activeGoal ? 0.5 : 0,
      ...context,
    });
    this._recordDecision(this.latestAppraisal, event, context);
    this.contextEngine.addEvent({
      eventType: this.latestAppraisal.eventType,
      meaning: this.latestAppraisal.meaning,
      decision: this.latestAppraisal.decision,
    });
    const tags = new Set(event.tags || []);
    if (tags.has('hungry')) {
      this.contextEngine.updateContext({ moodUpdate: { stress: Math.min(1, this.contextEngine.moodState.stress + 0.12), satisfaction: Math.max(0, this.contextEngine.moodState.satisfaction - 0.1) } });
    }
    if (tags.has('hurt')) {
      this.contextEngine.updateContext({ moodUpdate: { stress: Math.min(1, this.contextEngine.moodState.stress + 0.2), caution: Math.min(1, this.contextEngine.moodState.caution + 0.12) } });
    }
    return this.latestAppraisal;
  }

  /**
   * Return the most recent private decisions without exposing mutable state.
   * The returned order is chronological (oldest to newest within the window).
   */
  getDecisionLedger(limit = 5) {
    const boundedLimit = Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : 5;
    if (boundedLimit === 0) return [];
    return this.decisionLedger
      .slice(-boundedLimit)
      .map(record => this._clonePlain(record));
  }

  _recordDecision(appraisal, event = {}, context = {}) {
    const record = {
      recordedAt: Date.now(),
      appraisal: this._clonePlain(appraisal),
    };
    this.decisionLedger.push(record);
    if (this.decisionLedger.length > this.maxDecisionLedger) {
      this.decisionLedger.splice(0, this.decisionLedger.length - this.maxDecisionLedger);
    }

    // Durable memory is optional.  Keep this best-effort so a reduced/mock
    // memory manager can never make perception or chat handling fail.
    const rememberEpisode = this.memoryManager?.episodic?.rememberEpisode;
    if (typeof rememberEpisode !== 'function') return;
    try {
      const decision = appraisal.decision || {};
      const reasons = Array.isArray(decision.reasonCodes) ? decision.reasonCodes.join(', ') : '';
      const importance = Math.max(3, Math.min(10, Math.round(
        3 + (appraisal.meaning?.personalValue || 0) * 2 +
        (appraisal.meaning?.groupValue || 0) * 2 +
        (appraisal.meaning?.risk || 0) * 2
      )));
      rememberEpisode.call(this.memoryManager.episodic, {
        mcDay: event.mcDay ?? context.mcDay ?? null,
        eventType: `decision:${appraisal.eventType}`,
        summary: `Решение: ${decision.action || 'unknown'}; речь: ${decision.speech || 'unknown'}${reasons ? `; причины: ${reasons}` : ''}`,
        outcome: decision.action || '',
        importance,
      });
    } catch (error) {
      logger.warn(`[COGNITION] Не удалось сохранить decision ledger в долговременную память: ${error.message}`);
    }
  }

  _clonePlain(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  /**
   * Start periodic autonomous thinking cycles.
   */
  start(getWorldStateFn, botInstance = null) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('[COGNITION] Cognitive Engine loop started');

    this.timer = setInterval(async () => {
      try {
        const ws = getWorldStateFn ? getWorldStateFn() : null;
        if (ws) {
          await this.runCycle(ws, botInstance);
        }
      } catch (err) {
        logger.error(`[COGNITION] Error in cognitive cycle: ${err.message}`);
      }
    }, this.cycleIntervalMs);
  }

  /**
   * Stop periodic loop.
   */
  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[COGNITION] Cognitive Engine loop stopped');
  }

  getSafeDeliberationSummary() {
    return this.latestDeliberationSummary;
  }
}
