import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime } from '../../../src/agents/agent-runtime.js';
import { createAgentEvent } from '../../../src/agents/core-contracts.js';

const snapshot = (overrides = {}) => ({ food: 20, inventory: [], observedAt: 1, ...overrides });

function setup(overrides = {}) {
  let now = 1000;
  const execute = overrides.execute || vi.fn(async (request) => ({
    requestId: request.requestId, agentId: request.agentId, action: request.action,
    basedOnActionRevision: request.basedOnActionRevision, success: true,
    startedAt: now, completedAt: now,
  }));
  const runtime = new AgentRuntime({
    agentId: 'Sam', clock: () => now, observe: overrides.observe || (() => snapshot()), execute,
    abortAction: overrides.abortAction || vi.fn(), maxQueueSize: overrides.maxQueueSize || 3, capabilities: overrides.capabilities,
  });
  runtime.start();
  return { runtime, execute, advance: (ms = 1) => { now += ms; } };
}

function event(id, priority = 'normal', target = 'Sam', expiresAt = null) {
  return createAgentEvent({ eventId: id, type: 'test', source: 'world', target, audience: 'agent', priority, occurredAt: 1000, expiresAt });
}

describe('AgentRuntime', () => {
  it('keeps state isolated and only acts on a fresh hunger observation', async () => {
    const hungry = setup({ observe: () => snapshot({ food: 10, inventory: [{ name: 'bread', count: 1 }] }) });
    const full = setup();
    hungry.runtime.tick();
    full.runtime.tick();
    await Promise.resolve();
    expect(hungry.execute).toHaveBeenCalledTimes(1);
    expect(full.execute).not.toHaveBeenCalled();
    expect(hungry.runtime.getSnapshot().state.agentId).toBe('Sam');
    expect(full.runtime.getSnapshot().state.actionRevision).toBe(0);
  });

  it('orders, deduplicates, expires and bounds its targeted inbox', () => {
    const { runtime, advance } = setup({ maxQueueSize: 5 });
    expect(runtime.enqueue(event('normal'))).toBe(true);
    expect(runtime.enqueue(event('normal'))).toBe(false);
    expect(runtime.enqueue(event('other', 'high', 'Max'))).toBe(false);
    expect(runtime.enqueue(event('expired', 'low', 'Sam', 1001))).toBe(true);
    expect(runtime.enqueue(event('high', 'high'))).toBe(true);
    expect(runtime.enqueue(event('emergency', 'emergency'))).toBe(true);
    advance(2);
    runtime.tick();
    const audit = runtime.getSnapshot().audit;
    expect(audit.deduplicatedEvents).toBe(1);
    expect(audit.rejectedEvents).toBeGreaterThanOrEqual(1);
    expect(audit.expiredEvents).toBe(1);
  });

  it('does not advance observation revision for an unchanged snapshot', () => {
    const { runtime, advance } = setup();
    advance(2);
    runtime.tick();
    runtime.tick();
    expect(runtime.getSnapshot().state.observationRevision).toBe(1);
  });

  it('accepts a matching result and rejects a preempted result as stale', async () => {
    let resolveAction;
    const { runtime, execute, advance } = setup({
      observe: () => snapshot({ food: 10, inventory: [{ name: 'bread', count: 1 }] }),
      execute: vi.fn(() => new Promise((resolve) => { resolveAction = resolve; })),
    });
    runtime.tick();
    const request = execute.mock.calls[0][0];
    expect(runtime.getSnapshot().state.actionRevision).toBe(1);
    runtime.preempt('test');
    advance();
    resolveAction({ requestId: request.requestId, agentId: 'Sam', action: request.action, basedOnActionRevision: request.basedOnActionRevision, success: true, startedAt: 1000, completedAt: 1001 });
    await Promise.resolve();
    expect(runtime.getSnapshot().audit.staleResults).toBe(1);
    expect(runtime.getSnapshot().state.action).toBeNull();
  });

  it('accepts a matching terminal result after the action start revision', async () => {
    const { runtime, execute } = setup({
      observe: () => snapshot({ food: 10, inventory: [{ name: 'bread', count: 1 }] }),
    });
    runtime.tick();
    await Promise.resolve();
    const request = execute.mock.calls[0][0];
    expect(request.basedOnActionRevision).toBe(1);
    expect(runtime.getSnapshot().audit.actionCompletions).toBe(1);
    expect(runtime.getSnapshot().state.actionRevision).toBe(2);
    expect(runtime.getSnapshot().state.action).toBeNull();
  });

  it('submits an external action through the normal revision lifecycle', async () => {
    const { runtime, execute } = setup();
    const action = { kind: 'follow_player', playerName: 'Steve' };

    const terminal = await runtime.submitAction(action, { reason: 'player_command' });
    const request = execute.mock.calls[0][0];

    expect(request.action).toEqual(action);
    expect(request.basedOnActionRevision).toBe(1);
    expect(terminal).toEqual({
      accepted: true,
      stale: false,
      requestId: request.requestId,
      result: expect.objectContaining({ requestId: request.requestId, success: true }),
    });
    expect(runtime.getSnapshot().state.actionRevision).toBe(2);
    expect(runtime.getSnapshot().state.action).toBeNull();
  });

  it('keeps a preempted external result stale while the replacement remains active', async () => {
    const resolvers = [];
    const abortAction = vi.fn();
    const { runtime, execute } = setup({
      execute: vi.fn(() => new Promise((resolve) => { resolvers.push(resolve); })),
      abortAction,
    });

    const firstCompletion = runtime.submitAction({ kind: 'follow_player', playerName: 'Steve' });
    const firstRequest = execute.mock.calls[0][0];
    const secondCompletion = runtime.submitAction(
      { kind: 'stop_moving' },
      { reason: 'player_changed_mind', preempt: true },
    );
    const secondRequest = execute.mock.calls[1][0];

    expect(abortAction).toHaveBeenCalledWith(firstRequest.requestId);
    resolvers[0]({
      requestId: firstRequest.requestId,
      agentId: 'Sam',
      action: firstRequest.action,
      basedOnActionRevision: firstRequest.basedOnActionRevision,
      success: true,
      startedAt: 1000,
      completedAt: 1000,
    });
    await expect(firstCompletion).resolves.toEqual(expect.objectContaining({
      accepted: true,
      stale: true,
      requestId: firstRequest.requestId,
    }));
    expect(runtime.getSnapshot().state.action?.requestId).toBe(secondRequest.requestId);

    resolvers[1]({
      requestId: secondRequest.requestId,
      agentId: 'Sam',
      action: secondRequest.action,
      basedOnActionRevision: secondRequest.basedOnActionRevision,
      success: true,
      startedAt: 1000,
      completedAt: 1000,
    });
    await expect(secondCompletion).resolves.toEqual(expect.objectContaining({
      accepted: true,
      stale: false,
      requestId: secondRequest.requestId,
    }));
    expect(runtime.getSnapshot().audit.staleResults).toBe(1);
  });

  it('turns a malformed active executor result into an explicit failure', async () => {
    const { runtime } = setup({ execute: vi.fn(async () => ({})) });

    const terminal = await runtime.submitAction({ kind: 'follow_player', playerName: 'Steve' });

    expect(terminal).toEqual(expect.objectContaining({
      accepted: true,
      stale: false,
      result: expect.objectContaining({ success: false, error: 'MALFORMED_ACTION_RESULT' }),
    }));
    expect(runtime.getSnapshot().state.action).toBeNull();
    expect(runtime.getSnapshot().active).toBe(false);
    expect(runtime.getSnapshot().audit.actionFailures).toBe(1);
  });

  it('preempts immediately and waits for a started executor during graceful stop', async () => {
    let resolveAction;
    const abortAction = vi.fn();
    const { runtime } = setup({
      observe: () => snapshot({ food: 10, inventory: [{ name: 'bread', count: 1 }] }),
      execute: vi.fn(() => new Promise((resolve) => { resolveAction = resolve; })),
      abortAction,
    });
    runtime.tick();
    expect(runtime.enqueue(event('danger', 'emergency'))).toBe(true);
    expect(abortAction).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = runtime.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    resolveAction({ requestId: 'old', agentId: 'Sam', action: { kind: 'eat_food' }, basedOnActionRevision: 1, success: false, startedAt: 1000, completedAt: 1001 });
    await stopping;
    expect(runtime.getSnapshot().state.lifecycle).toBe('stopped');
  });

  it('finishes a degraded stop when its shutdown action rejects', async () => {
    const { runtime } = setup();

    const outcome = await runtime.stop({ shutdownAction: async () => { throw new Error('disconnect failed'); } });

    expect(outcome).toEqual({
      status: 'degraded',
      shutdownOutcome: { status: 'degraded', error: 'disconnect failed' },
    });
    expect(runtime.getSnapshot().state.lifecycle).toBe('stopped');
  });
});
