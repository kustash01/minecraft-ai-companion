export class ActionAdmissionError extends Error {
  constructor(code = 'ACTION_ADMISSION_DENIED') {
    super(code === 'ACTION_UNAVAILABLE_PHASE1'
      ? 'Gameplay tools are temporarily unavailable during the actuator-safety rollout.'
      : 'Another gameplay action is already active.');
    this.name = 'ActionAdmissionError';
    this.code = code;
  }
}

/** Owns the only gameplay-mutation lease for one agent instance. */
export class AgentActionCoordinator {
  constructor({ clock = () => Date.now(), timeoutMs = 5000, onQuarantine = null, onLateSettlement = null } = {}) {
    this.clock = clock;
    this.timeoutMs = timeoutMs;
    this.lifecycle = 'open';
    this.lease = null;
    this.generation = 0;
    this.onQuarantine = onQuarantine;
    this.onLateSettlement = onLateSettlement;
    this.audit = { admitted: 0, denied: 0, preemptions: 0, quarantines: 0, lastOwner: null, quarantinedLease: null, lateSettlement: null };
  }

  run({ owner, execute }) {
    if (this.lifecycle !== 'open' || this.lease) {
      this.audit.denied++;
      return Promise.reject(new ActionAdmissionError());
    }
    const controller = new AbortController();
    const lease = {
      owner,
      requestId: `${owner}:${++this.generation}:${this.clock()}`,
      generation: this.generation,
      controller,
      startedAt: this.clock(),
      settled: false,
      promise: null,
    };
    this.lease = lease;
    this.audit.admitted++;
    this.audit.lastOwner = owner;
    lease.promise = Promise.resolve()
      .then(() => execute({ signal: controller.signal, requestId: lease.requestId, generation: lease.generation }))
      .finally(() => {
        lease.settled = true;
        if (this.lease === lease) this.lease = null;
        if (this.lifecycle === 'quarantined' && this.audit.quarantinedLease?.requestId === lease.requestId && !this.audit.lateSettlement) {
          this.audit.lateSettlement = Object.freeze({ requestId: lease.requestId, settledAt: this.clock() });
          try { this.onLateSettlement?.(this.audit.lateSettlement); } catch (_) {}
        }
      });
    return lease.promise;
  }

  preempt(reason = 'external') {
    if (!this.lease) return Promise.resolve();
    this.audit.preemptions++;
    this.lease.controller.abort(reason);
    return this.lease.promise.catch(() => {});
  }

  async stop() {
    if (this.lifecycle === 'stopped' || this.lifecycle === 'quarantined') return this.lifecycle;
    this.lifecycle = 'stopping';
    const settling = this.preempt('shutdown');
    const outcome = await Promise.race([
      settling.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), this.timeoutMs)),
    ]);
    if (outcome === 'timeout') {
      this.lifecycle = 'quarantined';
      this.audit.quarantines++;
      this.audit.quarantinedLease = Object.freeze({
        owner: this.lease?.owner || null,
        requestId: this.lease?.requestId || null,
        generation: this.lease?.generation || null,
        startedAt: this.lease?.startedAt || null,
        quarantinedAt: this.clock(),
      });
      try { this.onQuarantine?.(this.audit.quarantinedLease); } catch (_) {}
    } else {
      this.lifecycle = 'stopped';
    }
    return this.lifecycle;
  }

  hasLease() { return Boolean(this.lease); }

  getSnapshot() {
    return JSON.parse(JSON.stringify({
      lifecycle: this.lifecycle,
      lease: this.lease ? { owner: this.lease.owner, requestId: this.lease.requestId, generation: this.lease.generation, startedAt: this.lease.startedAt } : null,
      audit: this.audit,
    }));
  }
}
