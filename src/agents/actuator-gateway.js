import { AgentActionCoordinator } from './action-coordinator.js';
import { ActuatorAuditStore } from './actuator-audit-store.js';

const FOOD_PATTERN = /bread|apple|cooked_|carrot|potato/;

function plain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function normalizedOutcome(value, fallback = { status: 'degraded', code: 'ADAPTER_NO_OUTCOME' }) {
  const outcome = plain(value);
  return outcome && typeof outcome === 'object' ? outcome : fallback;
}

/** Private boundary between the agent runtime and Minecraft mutation. */
export class ActuatorGateway {
  constructor({ mcBot, agentId, clock = () => Date.now(), timeoutMs = 5000, forceDisconnect = null, auditStore = null } = {}) {
    this.mcBot = mcBot;
    this.auditStore = auditStore || new ActuatorAuditStore({ agentId });
    this.coordinator = new AgentActionCoordinator({
      clock,
      timeoutMs,
      onQuarantine: (quarantinedLease) => this.auditStore.append('quarantine_pending', { quarantinedLease }),
      onLateSettlement: (lateSettlement) => this.auditStore.append('late_settlement', { lateSettlement }),
    });
    this.forceDisconnect = forceDisconnect || ((options) => this.mcBot?.forceDisconnect(options));
    this.stopPromise = null;
    this.generation = null;
    this.boundBot = null;
  }

  bind({ bot, generation }) {
    this.boundBot = bot || null;
    this.generation = Number.isInteger(generation) ? generation : null;
    return this;
  }

  async handleConnectionLost({ generation } = {}) {
    if (this.generation !== generation) return false;
    this.boundBot = null;
    await this.coordinator.preempt('connection_lost');
    return true;
  }

  _getBoundBot() {
    if (!this.boundBot) return null;
    if (this.mcBot?.bot !== this.boundBot || this.mcBot?.connectionToken !== this.generation) return null;
    return this.boundBot;
  }

  eatFood({ requestId, signal } = {}) {
    return this.coordinator.run({
      owner: `runtime:eat_food:${requestId || 'anonymous'}`,
      execute: async ({ signal: coordinatorSignal }) => {
        const bot = this._getBoundBot() || (this.generation === null ? this.mcBot?.bot : null);
        if (signal?.aborted || coordinatorSignal.aborted) return { status: 'cancelled_before_effect', phase: 'before_equip', code: 'CANCELLED_BEFORE_EFFECT' };
        if (!bot?.inventory?.items || typeof bot.equip !== 'function' || typeof bot.consume !== 'function') {
          return { status: 'unavailable', code: 'BOT_PRIMITIVE_UNAVAILABLE' };
        }
        const food = bot?.inventory?.items?.().find((item) => FOOD_PATTERN.test(item.name));
        if (!food) return { status: 'failed', code: 'NO_FOOD_AVAILABLE' };
        try {
          await bot.equip(food, 'hand');
        } catch (error) {
          return signal?.aborted || coordinatorSignal.aborted
            ? { status: 'effect_unknown', phase: 'equip_in_flight', code: 'ABORTED_DURING_AWAIT', error: error.message }
            : { status: 'failed', code: 'EQUIP_FAILED', error: error.message };
        }
        if (signal?.aborted || coordinatorSignal.aborted) return { status: 'effect_unknown', phase: 'equip_in_flight', code: 'ABORTED_DURING_AWAIT' };
        try {
          await bot.consume();
        } catch (error) {
          return signal?.aborted || coordinatorSignal.aborted
            ? { status: 'effect_unknown', phase: 'consume_in_flight', code: 'ABORTED_DURING_AWAIT', error: error.message }
            : { status: 'failed', code: 'CONSUME_FAILED', error: error.message };
        }
        return signal?.aborted || coordinatorSignal.aborted
          ? { status: 'effect_unknown', phase: 'consume_in_flight', code: 'ABORTED_DURING_AWAIT' }
          : { status: 'completed', code: null, item: food.name };
      },
    }).catch((error) => ({ status: 'failed', code: error?.code || 'ACTUATOR_FAILED', error: error?.message || String(error) })).then(plain);
  }

  cancel(requestId) {
    if (!this.coordinator.hasLease() || (requestId && !this.coordinator.getSnapshot().lease.requestId.includes(requestId))) return false;
    this.coordinator.preempt('runtime_cancel');
    return true;
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      const coordinator = await this.coordinator.stop();
      const disconnect = normalizedOutcome(await this.forceDisconnect({ reason: 'agent_stop' }));
      if (coordinator === 'stopped') this.auditStore.close();
      return { status: coordinator === 'quarantined' || disconnect.status === 'degraded' ? 'degraded' : 'stopped', coordinator, disconnect };
    })();
    return this.stopPromise;
  }

  getSnapshot() {
    let auditPersistence;
    try {
      auditPersistence = this.auditStore.getSnapshot();
    } catch (error) {
      auditPersistence = { available: false, error: error.message, recent: { available: false, records: [], error: error.message } };
    }
    return plain({ ...this.coordinator.getSnapshot(), auditPersistence });
  }
}
