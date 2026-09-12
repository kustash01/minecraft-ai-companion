function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Mechanical caps for a plural group conversation, never a content selector. */
export class GroupConversationWindow {
  constructor({ now = () => Date.now(), maxEntries = 500 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.windows = new Map();
    this.expired = new Map();
  }

  open(envelopeId, participantIds) {
    this.cleanup();
    let window = this.windows.get(envelopeId);
    if (window) return window;
    if (this.expired.has(envelopeId)) return null;
    const openedAt = this.now();
    window = {
      envelopeId,
      openedAt,
      immediateUntil: openedAt + 10000,
      expiresAt: openedAt + 45000,
      immediateCap: 1 + (hash(`cap-v1|${envelopeId}|${participantIds.join(',')}`) % 3),
      immediateReserved: 0,
      immediateSent: 0,
      delayedReserved: false,
      delayedSent: false,
      attempts: new Map(),
    };
    this.windows.set(envelopeId, window);
    if (this.windows.size > this.maxEntries) {
      const evicted = this.windows.keys().next().value;
      this.windows.delete(evicted);
      this.expired.set(evicted, openedAt + 45000);
    }
    return window;
  }

  claim({ envelopeId, agentId, phase, generation, participantIds }) {
    const now = this.now();
    const window = this.open(envelopeId, participantIds);
    if (!window) return { granted: false, reason: 'expired' };
    if (now >= window.expiresAt) return { granted: false, reason: 'expired' };
    const key = `${phase}:${agentId}`;
    if (window.attempts.has(key)) return { granted: false, reason: 'already_attempted' };
    if (phase === 'immediate') {
      if (now >= window.immediateUntil) return { granted: false, reason: 'immediate_closed' };
      if (window.immediateReserved + window.immediateSent >= window.immediateCap) return { granted: false, reason: 'immediate_cap' };
      window.immediateReserved++;
    } else {
      if (now < window.immediateUntil || window.immediateSent > 0 || this._hasImmediateSending(window) || window.delayedReserved || window.delayedSent) return { granted: false, reason: 'delayed_unavailable' };
      window.delayedReserved = true;
    }
    window.attempts.set(key, { agentId, phase, generation, status: 'reserved' });
    return { granted: true, expiresAt: phase === 'immediate' ? window.immediateUntil : window.expiresAt };
  }

  release({ envelopeId, agentId, phase, generation }) {
    const window = this.windows.get(envelopeId);
    const attempt = window?.attempts.get(`${phase}:${agentId}`);
    if (!attempt || !['reserved', 'sending'].includes(attempt.status) || attempt.generation !== generation) return false;
    attempt.status = 'released';
    if (phase === 'immediate') window.immediateReserved--;
    else window.delayedReserved = false;
    return true;
  }

  canSend({ envelopeId, agentId, phase, generation }) {
    const now = this.now();
    const window = this.windows.get(envelopeId);
    const attempt = window?.attempts.get(`${phase}:${agentId}`);
    if (!attempt || attempt.status !== 'reserved' || attempt.generation !== generation) return false;
    if (now >= window.expiresAt) return false;
    if (phase === 'immediate') return now < window.immediateUntil && !window.delayedReserved && !window.delayedSent;
    return now >= window.immediateUntil && window.immediateSent === 0 && !window.delayedSent;
  }

  commitSend({ envelopeId, agentId, phase, generation }) {
    const now = this.now();
    const window = this.windows.get(envelopeId);
    const attempt = window?.attempts.get(`${phase}:${agentId}`);
    if (!attempt || attempt.status !== 'reserved' || attempt.generation !== generation) return false;
    if (now >= window.expiresAt) return false;
    if (phase === 'immediate' && (now >= window.immediateUntil || window.delayedReserved || window.delayedSent)) return false;
    if (phase === 'delayed' && (now < window.immediateUntil || window.immediateSent > 0 || this._hasImmediateSending(window) || window.delayedSent)) return false;
    attempt.status = 'sending';
    return true;
  }

  finalize({ envelopeId, agentId, phase, generation }) {
    const window = this.windows.get(envelopeId);
    const attempt = window?.attempts.get(`${phase}:${agentId}`);
    if (!attempt || attempt.status !== 'sending' || attempt.generation !== generation) return false;
    attempt.status = 'sent';
    if (phase === 'immediate') {
      window.immediateReserved--;
      window.immediateSent++;
    } else {
      window.delayedReserved = false;
      window.delayedSent = true;
    }
    return true;
  }

  invalidateAgentGeneration({ agentId, generation }) {
    let changed = false;
    for (const window of this.windows.values()) {
      for (const attempt of window.attempts.values()) {
        if (attempt.agentId !== agentId || attempt.generation !== generation || ['released', 'sent'].includes(attempt.status)) continue;
        attempt.status = 'released';
        if (attempt.phase === 'immediate') window.immediateReserved = Math.max(0, window.immediateReserved - 1);
        else window.delayedReserved = false;
        changed = true;
      }
    }
    return changed;
  }

  get(envelopeId) { return this.windows.get(envelopeId) || null; }

  _hasImmediateSending(window) {
    return [...window.attempts.values()].some((attempt) => attempt.phase === 'immediate' && attempt.status === 'sending');
  }

  cleanup(now = this.now()) {
    for (const [id, window] of this.windows) {
      if (now >= window.expiresAt) {
        this.windows.delete(id);
        this.expired.set(id, now + 45000);
      }
    }
    for (const [id, expiresAt] of this.expired) {
      if (now >= expiresAt) this.expired.delete(id);
    }
  }

  clear() { this.windows.clear(); this.expired.clear(); }
}

export function stableSocialScore(envelopeId, agentId, phase) {
  return hash(`eligibility-v1|${envelopeId}|${agentId}|${phase}`) % 10000;
}
