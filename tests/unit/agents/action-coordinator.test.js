import { describe, expect, it, vi } from 'vitest';
import { ActionAdmissionError, AgentActionCoordinator } from '../../../src/agents/action-coordinator.js';

describe('AgentActionCoordinator', () => {
  it('admits one gameplay action and retains its lease until settlement', async () => {
    let resolveAction;
    const coordinator = new AgentActionCoordinator();
    const action = coordinator.run({ owner: 'runtime:food', execute: () => new Promise((resolve) => { resolveAction = resolve; }) });
    await expect(coordinator.run({ owner: 'other', execute: async () => {} })).rejects.toMatchObject({ code: 'ACTION_ADMISSION_DENIED' });
    expect(coordinator.hasLease()).toBe(true);
    resolveAction('done');
    await expect(action).resolves.toBe('done');
    expect(coordinator.hasLease()).toBe(false);
  });

  it('keeps a preempted lease until its executor settles', async () => {
    let resolveAction;
    const coordinator = new AgentActionCoordinator();
    const action = coordinator.run({ owner: 'runtime:food', execute: ({ signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {});
      resolveAction = resolve;
    }) });
    await Promise.resolve();
    const preemption = coordinator.preempt('danger');
    expect(coordinator.hasLease()).toBe(true);
    resolveAction();
    await preemption;
    await action;
    expect(coordinator.hasLease()).toBe(false);
  });

  it('quarantines after shutdown timeout and never reopens admission', async () => {
    let resolveAction;
    const coordinator = new AgentActionCoordinator({ timeoutMs: 1 });
    const action = coordinator.run({ owner: 'runtime:food', execute: () => new Promise((resolve) => { resolveAction = resolve; }) });
    await expect(coordinator.stop()).resolves.toBe('quarantined');
    expect(coordinator.getSnapshot()).toMatchObject({ lifecycle: 'quarantined', audit: { quarantinedLease: { owner: 'runtime:food' } } });
    await expect(coordinator.run({ owner: 'later', execute: async () => {} })).rejects.toBeInstanceOf(ActionAdmissionError);
    resolveAction();
    await action;
    expect(coordinator.getSnapshot().audit.lateSettlement).toMatchObject({ requestId: expect.any(String) });
  });
});
