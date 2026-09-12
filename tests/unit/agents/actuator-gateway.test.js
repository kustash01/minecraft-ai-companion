import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActuatorAuditStore } from '../../../src/agents/actuator-audit-store.js';
import { ActuatorGateway } from '../../../src/agents/actuator-gateway.js';
import { AgentInstance } from '../../../src/agents/agent-instance.js';

const stores = [];

function auditStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actuator-audit-'));
  const store = new ActuatorAuditStore({ agentId: 'Sam', dataDir: directory });
  stores.push({ directory, store });
  return store;
}

afterEach(() => {
  for (const { directory, store } of stores.splice(0)) {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ActuatorGateway', () => {
  it('only equips and consumes food without invoking auto-eat or deactivateItem', async () => {
    const bot = {
      inventory: { items: () => [{ name: 'bread' }] },
      autoEat: { eat: vi.fn() },
      equip: vi.fn(async () => {}),
      consume: vi.fn(async () => {}),
      deactivateItem: vi.fn(),
    };
    const gateway = new ActuatorGateway({ mcBot: { bot }, agentId: 'Sam', auditStore: auditStore() });

    await expect(gateway.eatFood({ requestId: 'request' })).resolves.toEqual({ status: 'completed', code: null, item: 'bread' });
    expect(bot.equip).toHaveBeenCalledWith({ name: 'bread' }, 'hand');
    expect(bot.consume).toHaveBeenCalledOnce();
    expect(bot.autoEat.eat).not.toHaveBeenCalled();
    gateway.cancel('request');
    expect(bot.deactivateItem).not.toHaveBeenCalled();
  });

  it('persists pending quarantine and late settlement records per agent', async () => {
    let resolveAction;
    const store = auditStore();
    const gateway = new ActuatorGateway({ mcBot: { bot: {} }, agentId: 'Sam', timeoutMs: 1, auditStore: store, forceDisconnect: async () => ({ status: 'disconnected' }) });
    gateway.coordinator.run({ owner: 'runtime:food', execute: () => new Promise((resolve) => { resolveAction = resolve; }) });

    await expect(gateway.stop()).resolves.toMatchObject({ status: 'degraded', coordinator: 'quarantined' });
    expect(store.getRecent().records.map((entry) => entry.type)).toContain('quarantine_pending');
    resolveAction();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getRecent().records.map((entry) => entry.type)).toContain('late_settlement');
  });

  it('returns a closed unavailable result when Minecraft mutation APIs are absent', async () => {
    const gateway = new ActuatorGateway({ mcBot: { bot: null }, agentId: 'Sam', auditStore: auditStore() });
    await expect(gateway.eatFood()).resolves.toEqual({ status: 'unavailable', code: 'BOT_PRIMITIVE_UNAVAILABLE' });
  });

  it('rejects a stale bot generation and clears the bound bot on matching loss', async () => {
    const bot = {
      inventory: { items: () => [{ name: 'bread' }] },
      equip: vi.fn(async () => {}),
      consume: vi.fn(async () => {}),
    };
    const mcBot = { bot, connectionToken: 3 };
    const gateway = new ActuatorGateway({ mcBot, agentId: 'Sam', auditStore: auditStore() }).bind({ bot, generation: 2 });

    await expect(gateway.eatFood()).resolves.toEqual({ status: 'unavailable', code: 'BOT_PRIMITIVE_UNAVAILABLE' });
    expect(bot.consume).not.toHaveBeenCalled();
    gateway.bind({ bot, generation: 3 });
    await expect(gateway.handleConnectionLost({ generation: 2 })).resolves.toBe(false);
    await expect(gateway.handleConnectionLost({ generation: 3 })).resolves.toBe(true);
    await expect(gateway.eatFood()).resolves.toEqual({ status: 'unavailable', code: 'BOT_PRIMITIVE_UNAVAILABLE' });
  });

  it('keeps the agent snapshot available if audit reads fail', () => {
    const gateway = new ActuatorGateway({
      mcBot: { bot: null },
      agentId: 'Sam',
      auditStore: { append: () => false, getSnapshot: () => { throw new Error('database unavailable'); } },
    });
    expect(gateway.getSnapshot().auditPersistence).toMatchObject({ available: false, error: 'database unavailable' });
  });

  it('maps only completed gateway outcomes to successful runtime action results', async () => {
    const instance = {
      name: 'Sam',
      mcBot: { bot: { inventory: { items: () => [] } } },
      actuatorGateway: { eatFood: async () => ({ status: 'failed', code: 'NO_FOOD_AVAILABLE' }) },
      runtime: { getSnapshot: () => ({ state: { observationRevision: 3 } }) },
    };
    const request = { requestId: 'request', action: { kind: 'eat_food' }, basedOnActionRevision: 2 };
    await expect(AgentInstance.prototype._executeRuntimeAction.call(instance, request, { signal: new AbortController().signal }))
      .resolves.toMatchObject({ success: false, outcome: { status: 'failed', code: 'NO_FOOD_AVAILABLE' }, error: 'NO_FOOD_AVAILABLE' });
    instance.actuatorGateway.eatFood = async () => ({ status: 'completed', code: null, item: 'bread' });
    await expect(AgentInstance.prototype._executeRuntimeAction.call(instance, request, { signal: new AbortController().signal }))
      .resolves.toMatchObject({ success: true, outcome: { status: 'completed', code: null, item: 'bread' }, error: null });
  });
});
