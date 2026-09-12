import {
  advanceRevision,
  createActionRequest,
  createActionResult,
  createAgentState,
  isEventExpired,
  validateAgentEvent,
} from './core-contracts.js';

const PRIORITY = Object.freeze({ emergency: 0, high: 1, normal: 2, low: 3 });
const ACTION_RETRY_MS = 5000;

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Per-agent control loop for bounded, deterministic actions. Minecraft and
 * provider integrations stay behind the injected observer/executor boundary.
 */
export class AgentRuntime {
  constructor({ agentId, clock = () => Date.now(), observe, execute, abortAction = () => {}, classify = null, maxQueueSize = 64, capabilities = {} }) {
    if (typeof observe !== 'function' || typeof execute !== 'function') {
      throw new TypeError('AgentRuntime requires observe and execute functions');
    }
    this.agentId = agentId;
    this.clock = clock;
    this.observe = observe;
    this.execute = execute;
    this.abortAction = abortAction;
    this.classify = classify || AgentRuntime.classify;
    this.maxQueueSize = maxQueueSize;
    this.state = createAgentState({ agentId, capabilities, now: clock() });
    this.inbox = [];
    this.seenIds = [];
    this.activeAttempt = null;
    this.pendingAttempts = new Set();
    this.pendingTurn = false;
    this.turnRunning = false;
    this.lastDigest = null;
    this.lastObservation = null;
    this.lastActionAttemptAt = -Infinity;
    this.audit = { acceptedEvents: 0, rejectedEvents: 0, deduplicatedEvents: 0, expiredEvents: 0, evictedEvents: 0, observationFailures: 0, actionStarts: 0, actionFailures: 0, actionCompletions: 0, preemptions: 0, staleResults: 0, lastDecision: null };
  }

  static classify({ snapshot, pendingEvents }) {
    if (pendingEvents.some((event) => event.priority === 'emergency')) return null;
    const food = Array.isArray(snapshot?.inventory) ? snapshot.inventory.some((item) => item.count > 0 && /bread|apple|cooked_|carrot|potato/.test(item.name)) : false;
    if (snapshot?.food <= 16 && food) return { kind: 'eat_food', reason: 'hunger' };
    return null;
  }

  start() {
    if (this.state.lifecycle === 'running') return;
    if (this.state.lifecycle === 'stopping' || this.state.lifecycle === 'stopped') throw new Error('Runtime cannot be restarted');
    this.state = { ...this.state, lifecycle: 'running', updatedAt: this.clock() };
  }

  enqueue(event) {
    const check = validateAgentEvent(event);
    if (!check.valid || event.audience !== 'agent' || event.target !== this.agentId || this.state.lifecycle !== 'running') {
      this.audit.rejectedEvents++;
      return false;
    }
    if (this.seenIds.includes(event.eventId)) {
      this.audit.deduplicatedEvents++;
      return false;
    }
    this.seenIds.push(event.eventId);
    if (this.seenIds.length > this.maxQueueSize * 2) this.seenIds.shift();
    if (this.inbox.length >= this.maxQueueSize && !this._makeQueueRoom(event)) {
      this.audit.rejectedEvents++;
      return false;
    }
    this.inbox.push(copy(event));
    this.audit.acceptedEvents++;
    if (event.priority === 'emergency') {
      this.preempt('emergency_event');
      this._scheduleTurn();
    }
    return true;
  }

  _makeQueueRoom(incoming) {
    const candidate = [...this.inbox].sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || a.occurredAt - b.occurredAt)[0];
    if (!candidate || PRIORITY[incoming.priority] >= PRIORITY[candidate.priority]) return false;
    this.inbox.splice(this.inbox.indexOf(candidate), 1);
    this.audit.evictedEvents++;
    return true;
  }

  tick() {
    if (this.state.lifecycle !== 'running') return;
    if (this.turnRunning) {
      this.pendingTurn = true;
      return;
    }
    this.turnRunning = true;
    try {
      const now = this.clock();
      const events = this._drainEvents(now);
      let snapshot;
      try {
        snapshot = copy(this.observe());
        const digest = JSON.stringify(snapshot);
        if (digest !== this.lastDigest) {
          this.lastDigest = digest;
          this.lastObservation = snapshot;
          this.state = { ...advanceRevision(this.state, 'observation', now), observationSummary: snapshot };
        }
      } catch (error) {
        this.audit.observationFailures++;
        this.audit.lastDecision = { kind: 'observe_failed', reason: error.message, at: now };
        return;
      }
    if (this.pendingAttempts.size > 0 || !this.lastObservation) return;
      const candidate = this.classify({ snapshot: this.lastObservation, pendingEvents: events, state: copy(this.state), now });
      if (candidate?.kind === 'eat_food' && now - this.lastActionAttemptAt >= ACTION_RETRY_MS) this._startAction(candidate, now);
      else this.audit.lastDecision = { kind: candidate?.kind || 'idle', reason: candidate?.reason || 'stable', at: now };
    } finally {
      this.turnRunning = false;
      if (this.pendingTurn) {
        this.pendingTurn = false;
        this._scheduleTurn();
      }
    }
  }

  _drainEvents(now) {
    const live = [];
    for (const event of this.inbox) {
      if (isEventExpired(event, now)) this.audit.expiredEvents++;
      else live.push(event);
    }
    this.inbox = [];
    return live.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.occurredAt - b.occurredAt || a.eventId.localeCompare(b.eventId));
  }

  _startAction(candidate, now) {
    const next = advanceRevision(this.state, 'action', now);
    const requestId = `${this.agentId}:${next.actionRevision}:${now}`;
    const action = Object.hasOwn(candidate, 'action') ? copy(candidate.action) : { kind: candidate.kind };
    const request = createActionRequest({ requestId, agentId: this.agentId, action, basedOnActionRevision: next.actionRevision, interruptible: true, requestedAt: now });
    this.state = { ...next, action: { requestId, action, actionRevision: next.actionRevision, status: 'running', startedAt: now }, intent: action, decisionMetadata: { reason: candidate.reason } };
    const controller = new AbortController();
    const attempt = { request, controller, settled: null };
    this.activeAttempt = attempt;
    this.pendingAttempts.add(attempt);
    this.lastActionAttemptAt = now;
    this.audit.actionStarts++;
    this.audit.lastDecision = { kind: candidate.kind || action?.kind || 'action', reason: candidate.reason, at: now };
    let execution;
    try {
      execution = this.execute(request, { signal: controller.signal });
    } catch (error) {
      execution = Promise.reject(error);
    }
    attempt.completion = Promise.resolve(execution).then(
      (result) => this._applyResult(attempt, result),
      (error) => this._applyResult(attempt, this._failureResult(attempt, error?.message || String(error))),
    );
    return attempt;
  }

  _failureResult(attempt, error) {
    return createActionResult({
      requestId: attempt.request.requestId,
      agentId: this.agentId,
      action: attempt.request.action,
      basedOnActionRevision: attempt.request.basedOnActionRevision,
      success: false,
      error,
      startedAt: attempt.request.requestedAt,
      completedAt: Math.max(attempt.request.requestedAt, this.clock()),
      observationRevision: this.state.observationRevision,
    });
  }

  _normalizeResult(attempt, result) {
    try {
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('result must be an object');
      const normalized = createActionResult({
        requestId: result.requestId,
        agentId: result.agentId,
        action: result.action,
        basedOnActionRevision: result.basedOnActionRevision,
        success: result.success,
        outcome: result.outcome,
        error: result.error,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        observationRevision: result.observationRevision,
      });
      if (
        normalized.requestId !== attempt.request.requestId ||
        normalized.agentId !== this.agentId ||
        normalized.basedOnActionRevision !== attempt.request.basedOnActionRevision ||
        JSON.stringify(normalized.action) !== JSON.stringify(attempt.request.action)
      ) {
        throw new TypeError('result does not match its action request');
      }
      return normalized;
    } catch (_) {
      return this._failureResult(attempt, 'MALFORMED_ACTION_RESULT');
    }
  }

  _applyResult(attempt, result) {
    try {
      attempt.settled = true;
      const active = this.state.action;
      const ownsActiveRevision = active?.status === 'running' &&
        active.requestId === attempt.request.requestId &&
        active.actionRevision === attempt.request.basedOnActionRevision &&
        this.state.actionRevision === attempt.request.basedOnActionRevision;
      const normalized = this._normalizeResult(attempt, result);
      if (!ownsActiveRevision) {
        this.audit.staleResults++;
        return { accepted: true, stale: true, requestId: attempt.request.requestId, result: normalized };
      }
      const now = this.clock();
      this.state = { ...advanceRevision(this.state, 'action', now), action: null, intent: null, decisionMetadata: { reason: normalized.success ? 'action_completed' : 'action_failed', outcome: normalized.outcome || null, error: normalized.error || null } };
      if (normalized.success) this.audit.actionCompletions++; else this.audit.actionFailures++;
      this._scheduleTurn();
      return { accepted: true, stale: false, requestId: attempt.request.requestId, result: normalized };
    } finally {
      if (this.activeAttempt === attempt) this.activeAttempt = null;
      this.pendingAttempts.delete(attempt);
    }
  }

  async submitAction(action, { reason = 'external', preempt = false } = {}) {
    if (this.state.lifecycle !== 'running') {
      throw new Error('Runtime must be running to submit an action');
    }
    if (this.activeAttempt && !preempt) {
      return { accepted: false, stale: false, requestId: null, result: null };
    }
    if (this.activeAttempt) this.preempt(reason);
    const attempt = this._startAction({ action, reason }, this.clock());
    return attempt.completion;
  }

  preempt(reason = 'external') {
    const attempt = this.activeAttempt;
    if (!attempt || !this.state.action) return false;
    this.state = { ...advanceRevision(this.state, 'action', this.clock()), action: null, intent: null, decisionMetadata: { reason: `preempted:${reason}` } };
    this.activeAttempt = null;
    this.audit.preemptions++;
    attempt.controller.abort();
    try { this.abortAction(attempt.request.requestId); } catch (_) {}
    return true;
  }

  async stop({ timeoutMs = 5000, shutdownAction = null } = {}) {
    if (this.state.lifecycle === 'stopped') return { status: 'stopped' };
    this.state = { ...this.state, lifecycle: 'stopping', updatedAt: this.clock() };
    this.preempt('shutdown');
    let shutdownOutcome = null;
    if (shutdownAction) {
      try {
        shutdownOutcome = await shutdownAction();
      } catch (error) {
        shutdownOutcome = { status: 'degraded', error: error?.message || String(error) };
      }
    }
    const settled = await Promise.race([
      new Promise((resolve) => {
      const check = () => this.pendingAttempts.size === 0 ? resolve() : setTimeout(check, 10);
      check();
      }),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    this.inbox = [];
    const degraded = settled === false || shutdownOutcome?.status === 'degraded';
    this.state = {
      ...this.state,
      lifecycle: 'stopped',
      decisionMetadata: { ...this.state.decisionMetadata, shutdownOutcome },
      updatedAt: this.clock(),
    };
    return { status: degraded ? 'degraded' : 'stopped', shutdownOutcome };
  }

  _scheduleTurn() {
    queueMicrotask(() => this.tick());
  }

  hasActiveAction() { return Boolean(this.activeAttempt); }

  getSnapshot() { return copy({ state: this.state, audit: this.audit, queueLength: this.inbox.length, active: this.hasActiveAction() }); }
}
