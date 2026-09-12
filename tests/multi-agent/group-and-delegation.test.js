import { describe, it, expect, beforeEach } from 'vitest';
import { GroupManager } from '../../src/group/group-manager.js';
import { DelegationManager } from '../../src/group/delegation.js';
import { RealityReconciliation } from '../../src/cognition/reality-reconciliation.js';
import { SocialGraph } from '../../src/social/social-graph.js';
import { AGENT_PROFILES } from '../../src/agents/agent-profiles.js';

describe('Group Intelligence, Delegation & Reality Reconciliation', () => {
  let groupManager;
  let socialGraph;
  let samDelegation;
  let ryanDelegation;
  let reality;

  beforeEach(() => {
    socialGraph = new SocialGraph({
      agents: ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'],
      humanPlayer: 'kustash01',
    });

    groupManager = new GroupManager({
      socialGraph,
      profiles: AGENT_PROFILES,
    });

    samDelegation = new DelegationManager({ agentName: 'Sam' });
    ryanDelegation = new DelegationManager({ agentName: 'Ryan' });
    reality = new RealityReconciliation({ agentName: 'Sam' });
  });

  it('should support dynamic group lifecycle (propose, accept, activate, leave)', () => {
    const group = groupManager.proposeGroup(
      'Sam',
      ['Sam', 'Ryan', 'Max'],
      'Explore deep cave',
      'exploration'
    );

    expect(group).toBeDefined();
    expect(group.status).toBe('forming');
    expect(group.leader).toBe('Sam');

    groupManager.acceptGroupInvite('Ryan', group.id);
    groupManager.acceptGroupInvite('Max', group.id);

    const active = groupManager.activateGroup(group.id);
    expect(active.status).toBe('active');

    const agentGroup = groupManager.getAgentGroup('Ryan');
    expect(agentGroup.id).toBe(group.id);

    // Leave group
    groupManager.leaveGroup('Max', group.id, 'tired');
    expect(groupManager.getAgentGroup('Max')).toBeNull();
  });

  it('should manage agent-to-agent task delegation with pending intentions', () => {
    const del = samDelegation.delegate('Ryan', 'Принеси 10 угля из шахты');
    expect(del.status).toBe('pending');
    expect(del.from).toBe('Sam');
    expect(del.to).toBe('Ryan');

    // Ryan receives and defers ("потом")
    ryanDelegation.receiveRequest(del);
    ryanDelegation.respondToRequest(del.id, 'Давай потом, я занят', 'deferred');

    const deferred = ryanDelegation.getDeferred();
    expect(deferred.length).toBe(1);
    expect(deferred[0].status).toBe('deferred');
  });

  it('should compare intent vs outcome in Reality Reconciliation', () => {
    const expId = reality.setExpectation('mine_block', {
      blockMined: 'iron_ore',
      inventoryGained: 'iron_ore',
    });

    expect(expId).toBeDefined();
    expect(reality.getUnreconciled().length).toBe(1);

    // Reconcile with matching actual outcome
    reality.reconcile(expId, {
      blockMined: 'iron_ore',
      inventoryGained: 'iron_ore',
    });

    expect(reality.getUnreconciled().length).toBe(0);
    expect(reality.getAccuracy()).toBe(1.0);
  });
});
