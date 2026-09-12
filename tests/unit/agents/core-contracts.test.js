import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  AGENT_LIFECYCLES,
  EVENT_AUDIENCES,
  EVENT_PRIORITIES,
  BUDGET_CLASSES,
  DRIVE_NAMES,
  isPlainSerializable,
  createDrives,
  createAgentState,
  advanceRevision,
  createAgentEvent,
  validateAgentEvent,
  isEventExpired,
  createDecisionRequest,
  createDecisionProposal,
  validateDecisionProposal,
  isProposalCurrent,
  createActionRequest,
  createActionResult,
} from '../../../src/agents/core-contracts.js';

const NOW = 1_700_000_000_000;

function makeState(overrides = {}) {
  return createAgentState({ agentId: 'Sam', now: NOW, ...overrides });
}

function roundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('core-contracts: AgentState', () => {
  it('creates a JSON-serializable state with all required fields and defaults', () => {
    const state = makeState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.agentId).toBe('Sam');
    expect(state.lifecycle).toBe('created');
    expect(state.revision).toBe(0);
    expect(state.observationRevision).toBe(0);
    expect(state.goalRevision).toBe(0);
    expect(state.planRevision).toBe(0);
    expect(state.actionRevision).toBe(0);
    expect(state.goal).toBeNull();
    expect(state.intent).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.action).toBeNull();
    expect(state.capabilities).toEqual({});
    expect(state.updatedAt).toBe(NOW);
    for (const name of DRIVE_NAMES) {
      expect(state.drives[name]).toBe(0.5);
    }
    // Round-trip equality, not just stringify success.
    expect(roundTrip(state)).toEqual(state);
    expect(isPlainSerializable(state)).toBe(true);
  });

  it('accepts an explicit lifecycle and clamps drives to [0, 1]', () => {
    const state = makeState({
      lifecycle: 'running',
      drives: { hunger: 1.7, fear: -0.2, curiosity: 0.9 },
    });
    expect(state.lifecycle).toBe('running');
    expect(state.drives.hunger).toBe(1);
    expect(state.drives.fear).toBe(0);
    expect(state.drives.curiosity).toBe(0.9);
  });

  it('rejects invalid constructor input', () => {
    expect(() => createAgentState({ now: NOW })).toThrow(TypeError);
    expect(() => createAgentState({ agentId: 'Sam', now: NOW, lifecycle: 'flying' })).toThrow(TypeError);
    expect(() => createAgentState({ agentId: 'Sam' })).toThrow(TypeError); // no explicit now
  });

  it('deep-clones opaque slots and rejects non-serializable content', () => {
    const goal = { text: 'исследовать горы', nested: { refs: [1, 2] } };
    const state = makeState({ goal });
    goal.nested.refs.push(99);
    expect(state.goal.nested.refs).toEqual([1, 2]);

    expect(() => makeState({ goal: { bad: undefined } })).toThrow(TypeError);
    expect(() => makeState({ plan: { step: () => {} } })).toThrow(TypeError);
    expect(() => makeState({ action: new Map() })).toThrow(TypeError);
    expect(() => makeState({ observationSummary: new Date() })).toThrow(TypeError);
    expect(() => makeState({ capabilities: { eat: undefined } })).toThrow(TypeError);
  });

  it('advanceRevision is monotonic, immutable, and touches only the named sub-revision', () => {
    const s0 = makeState();
    const s1 = advanceRevision(s0, 'goal', NOW + 10);
    expect(s1.revision).toBe(1);
    expect(s1.goalRevision).toBe(1);
    expect(s1.planRevision).toBe(0);
    expect(s1.actionRevision).toBe(0);
    expect(s1.observationRevision).toBe(0);
    expect(s1.updatedAt).toBe(NOW + 10);
    // Original untouched.
    expect(s0.revision).toBe(0);
    expect(s0.goalRevision).toBe(0);

    const s2 = advanceRevision(s1, 'goal', NOW + 20);
    expect(s2.revision).toBe(2);
    expect(s2.goalRevision).toBe(2);
    expect(() => advanceRevision(s1, 'bogus', NOW)).toThrow(TypeError);
    expect(() => advanceRevision(s1, 'goal')).toThrow(TypeError);
  });

  it('exposes lifecycle vocabulary', () => {
    expect(AGENT_LIFECYCLES).toEqual(['created', 'starting', 'running', 'stopping', 'stopped']);
  });
});

describe('core-contracts: createDrives', () => {
  it('rejects non-numeric drive values', () => {
    expect(() => createDrives({ hunger: 'lots' })).toThrow(TypeError);
  });
});

describe('core-contracts: AgentEvent', () => {
  const baseEvent = {
    eventId: 'evt-1',
    type: 'danger_detected',
    source: 'Sam',
    target: 'Max',
    audience: 'agent',
    occurredAt: NOW,
  };

  it('creates a valid targeted event and round-trips it', () => {
    const event = createAgentEvent(baseEvent);
    expect(event.schemaVersion).toBe(SCHEMA_VERSION);
    expect(event.priority).toBe('normal');
    expect(event.expiresAt).toBeNull();
    expect(roundTrip(event)).toEqual(event);
    expect(validateAgentEvent(event).valid).toBe(true);
  });

  it('enforces target/audience combinations', () => {
    // targeted requires non-null target
    expect(() => createAgentEvent({ ...baseEvent, target: null, audience: 'agent' })).toThrow(TypeError);
    // broadcast requires null target
    const broadcast = createAgentEvent({ ...baseEvent, target: null, audience: 'broadcast' });
    expect(broadcast.target).toBeNull();
    expect(() => createAgentEvent({ ...baseEvent, audience: 'broadcast' })).toThrow(TypeError);
    // company requires null target
    expect(() => createAgentEvent({ ...baseEvent, audience: 'company' })).toThrow(TypeError);
    const company = createAgentEvent({ ...baseEvent, target: null, audience: 'company' });
    expect(validateAgentEvent(company).valid).toBe(true);
    expect(EVENT_AUDIENCES).toContain('agent');
    expect(EVENT_PRIORITIES).toEqual(['emergency', 'high', 'normal', 'low']);
  });

  it('rejects malformed events via the validator', () => {
    expect(validateAgentEvent(null).valid).toBe(false);
    expect(validateAgentEvent({ ...baseEvent, eventId: '' }).valid).toBe(false);
    expect(validateAgentEvent({ ...baseEvent, priority: 'whenever' }).valid).toBe(false);
    expect(validateAgentEvent({ ...baseEvent, occurredAt: -5 }).valid).toBe(false);
    expect(
      validateAgentEvent({ ...baseEvent, occurredAt: NOW, expiresAt: NOW - 1 }).valid
    ).toBe(false);
    expect(validateAgentEvent({ ...baseEvent, observationRevision: -1 }).valid).toBe(false);
  });

  it('isEventExpired is a pure function of (event, now)', () => {
    const event = createAgentEvent({ ...baseEvent, expiresAt: NOW + 1000 });
    expect(isEventExpired(event, NOW)).toBe(false);
    expect(isEventExpired(event, NOW + 999)).toBe(false);
    expect(isEventExpired(event, NOW + 1000)).toBe(true);
    expect(isEventExpired(event, NOW + 5000)).toBe(true);
    // No expiry → never expired.
    const noExpiry = createAgentEvent(baseEvent);
    expect(isEventExpired(noExpiry, Number.MAX_SAFE_INTEGER)).toBe(false);
    // Explicit now is mandatory.
    expect(() => isEventExpired(event)).toThrow(TypeError);
  });

  it('deep-clones payload and rejects non-serializable payloads', () => {
    const payload = { entities: [{ name: 'zombie', distance: 4 }] };
    const event = createAgentEvent({ ...baseEvent, payload });
    payload.entities.push({ name: 'creeper', distance: 2 });
    expect(event.payload.entities).toHaveLength(1);
    expect(() => createAgentEvent({ ...baseEvent, payload: { at: new Date() } })).toThrow(TypeError);
  });
});

describe('core-contracts: DecisionRequest', () => {
  it('creates a serializable request with defaults', () => {
    const req = createDecisionRequest({
      requestId: 'req-1',
      agentId: 'Sam',
      snapshotRef: { observationRevision: 7 },
      triggerEventIds: ['evt-1'],
      submittedAt: NOW,
    });
    expect(req.schemaVersion).toBe(SCHEMA_VERSION);
    expect(req.budgetClass).toBe('deliberative');
    expect(roundTrip(req)).toEqual(req);
    expect(BUDGET_CLASSES).toContain(req.budgetClass);
  });

  it('validates required fields and budget class', () => {
    expect(() => createDecisionRequest({ agentId: 'Sam', submittedAt: NOW })).toThrow(TypeError);
    expect(() => createDecisionRequest({ requestId: 'r', submittedAt: NOW })).toThrow(TypeError);
    expect(() =>
      createDecisionRequest({ requestId: 'r', agentId: 'Sam', submittedAt: NOW, budgetClass: 'free' })
    ).toThrow(TypeError);
    expect(() => createDecisionRequest({ requestId: 'r', agentId: 'Sam' })).toThrow(TypeError);
  });
});

describe('core-contracts: DecisionProposal', () => {
  function makeProposal(state, overrides = {}) {
    return createDecisionProposal({
      proposalId: 'prop-1',
      agentId: state.agentId,
      basedOnStateRevision: state.revision,
      basedOnObservationRevision: state.observationRevision,
      basedOnGoalRevision: state.goalRevision,
      basedOnPlanRevision: state.planRevision,
      basedOnActionRevision: state.actionRevision,
      intent: { kind: 'explore', direction: 'north' },
      confidence: 0.8,
      reason: 'curiosity high, area unexplored',
      createdAt: NOW,
      ...overrides,
    });
  }

  it('creates a valid proposal and round-trips it', () => {
    const state = makeState();
    const proposal = makeProposal(state);
    expect(proposal.schemaVersion).toBe(SCHEMA_VERSION);
    expect(proposal.priority).toBe('normal');
    expect(proposal.requiresLLM).toBe(false);
    expect(roundTrip(proposal)).toEqual(proposal);
    expect(validateDecisionProposal(proposal).valid).toBe(true);
  });

  it('validator rejects malformed proposals', () => {
    const state = makeState();
    const valid = makeProposal(state);
    expect(validateDecisionProposal(null).valid).toBe(false);
    expect(validateDecisionProposal({ ...valid, confidence: 1.5 }).valid).toBe(false);
    expect(validateDecisionProposal({ ...valid, priority: 'meh' }).valid).toBe(false);
    expect(validateDecisionProposal({ ...valid, basedOnGoalRevision: -1 }).valid).toBe(false);
    expect(validateDecisionProposal({ ...valid, expiresAt: valid.createdAt }).valid).toBe(false);
    // Factory enforces the same invariants eagerly.
    expect(() => makeProposal(state, { confidence: 1.5 })).toThrow(TypeError);
    expect(() => makeProposal(state, { createdAt: NOW, expiresAt: NOW })).toThrow(TypeError);
  });

  it('isProposalCurrent: goal/plan/action revision equality, expiry for observation staleness', () => {
    let state = makeState();
    const proposal = makeProposal(state, { expiresAt: NOW + 60_000 });

    expect(isProposalCurrent(proposal, state, NOW + 1)).toBe(true);

    // Observation revision advanced alone → still current (handled via expiry).
    state = advanceRevision(state, 'observation', NOW + 10);
    expect(isProposalCurrent(proposal, state, NOW + 10)).toBe(true);

    // Goal revision advanced → stale.
    let stale = advanceRevision(makeState(), 'goal', NOW + 10);
    expect(isProposalCurrent(proposal, stale, NOW + 10)).toBe(false);

    // Plan revision advanced → stale.
    stale = advanceRevision(makeState(), 'plan', NOW + 10);
    expect(isProposalCurrent(proposal, stale, NOW + 10)).toBe(false);

    // Action revision advanced → stale.
    stale = advanceRevision(makeState(), 'action', NOW + 10);
    expect(isProposalCurrent(proposal, stale, NOW + 10)).toBe(false);

    // Expired → stale even with matching revisions.
    expect(isProposalCurrent(proposal, state, NOW + 60_000)).toBe(false);

    // Never expiring proposal stays current at matching revisions.
    const timeless = makeProposal(state);
    expect(isProposalCurrent(timeless, state, Number.MAX_SAFE_INTEGER)).toBe(true);

    // Pure: explicit now required.
    expect(() => isProposalCurrent(proposal, state)).toThrow(TypeError);
  });
});

describe('core-contracts: ActionRequest / ActionResult', () => {
  it('creates a serializable action request with defaults', () => {
    const req = createActionRequest({
      requestId: 'act-1',
      agentId: 'Sam',
      action: { kind: 'move_to', x: 10, y: 64, z: -5 },
      basedOnActionRevision: 3,
      requestedAt: NOW,
    });
    expect(req.schemaVersion).toBe(SCHEMA_VERSION);
    expect(req.interruptible).toBe(true);
    expect(req.expiresAt).toBeNull();
    expect(roundTrip(req)).toEqual(req);
  });

  it('validates action request fields', () => {
    expect(() =>
      createActionRequest({ agentId: 'Sam', action: {}, basedOnActionRevision: 0, requestedAt: NOW })
    ).toThrow(TypeError);
    expect(() =>
      createActionRequest({ requestId: 'a', agentId: 'Sam', action: {}, basedOnActionRevision: -1, requestedAt: NOW })
    ).toThrow(TypeError);
    expect(() =>
      createActionRequest({ requestId: 'a', agentId: 'Sam', action: {}, basedOnActionRevision: 0 })
    ).toThrow(TypeError);
  });

  it('creates a serializable action result with timing invariants', () => {
    const result = createActionResult({
      requestId: 'act-1',
      agentId: 'Sam',
      basedOnActionRevision: 3,
      success: true,
      outcome: { reached: true },
      startedAt: NOW,
      completedAt: NOW + 1500,
      observationRevision: 4,
    });
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.error).toBeNull();
    expect(roundTrip(result)).toEqual(result);

    expect(() =>
      createActionResult({
        requestId: 'act-1',
        agentId: 'Sam',
        basedOnActionRevision: 3,
        success: true,
        startedAt: NOW + 2000,
        completedAt: NOW,
      })
    ).toThrow(TypeError);
    expect(() =>
      createActionResult({
        requestId: 'act-1',
        agentId: 'Sam',
        basedOnActionRevision: 3,
        success: 'yes',
        startedAt: NOW,
        completedAt: NOW,
      })
    ).toThrow(TypeError);
  });
});

describe('core-contracts: serializability discipline', () => {
  it('isPlainSerializable rejects class instances, functions, undefined and non-finite numbers', () => {
    expect(isPlainSerializable(null)).toBe(true);
    expect(isPlainSerializable({ a: [1, 'x', true, null] })).toBe(true);
    expect(isPlainSerializable({ f: () => {} })).toBe(false);
    expect(isPlainSerializable({ u: undefined })).toBe(false);
    expect(isPlainSerializable(new Date())).toBe(false);
    expect(isPlainSerializable(new Map())).toBe(false);
    expect(isPlainSerializable({ n: NaN })).toBe(false);
    expect(isPlainSerializable({ n: Infinity })).toBe(false);
  });

  it('state built with every populated slot remains round-trip equal', () => {
    const state = makeState({
      lifecycle: 'running',
      drives: { hunger: 0.8, fear: 0.1 },
      goal: { kind: 'long_term', text: 'исследовать регион' },
      intent: { kind: 'explore' },
      plan: { id: 'plan_1', steps: ['a', 'b'] },
      action: { kind: 'move_to', x: 1, y: 2, z: 3 },
      observationSummary: { entities: 3, threats: 0 },
      decisionMetadata: { lastDecisionId: 'prop-9', why: 'test' },
    });
    expect(roundTrip(state)).toEqual(state);
    expect(isPlainSerializable(state)).toBe(true);
  });
});
