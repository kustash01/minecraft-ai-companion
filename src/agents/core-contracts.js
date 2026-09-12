/**
 * core-contracts.js — Phase 1 of the Agent Core redesign.
 *
 * Pure, frozen vocabulary for the future multi-agent runtime. This module
 * intentionally has NO imports from the existing codebase, NO Mineflayer,
 * NO timers, NO singletons, NO LLM calls and NO side effects. Nothing in
 * the running system imports it yet; behavior is unchanged.
 *
 * Ownership semantics (pinned by the Phase 1 architecture review):
 * - AgentRuntime (Phase 3) will own: lifecycle, decision/action revisions,
 *   per-agent event inbox, and all state transitions.
 * - AgentInstance remains the composition root and compatibility façade.
 * - WorldState stays observation-only: health/food/position are
 *   observations, never durable AgentState truth.
 * - Planner owns the plan lifecycle; the runtime owns decision/action
 *   lifecycle.
 * - MovementController mode is actuator state. `currentTask` becomes a
 *   compatibility projection, not an authority.
 * - `goal`, `intent`, `plan`, `action` on AgentState are nullable OPAQUE
 *   slots. Their internal shapes are owned by Planner/Runtime and are
 *   deliberately NOT frozen by this contract.
 */

export const SCHEMA_VERSION = 1;

export const AGENT_LIFECYCLES = Object.freeze([
  'created',
  'starting',
  'running',
  'stopping',
  'stopped',
]);

export const EVENT_AUDIENCES = Object.freeze(['agent', 'broadcast', 'company']);

export const EVENT_PRIORITIES = Object.freeze(['emergency', 'high', 'normal', 'low']);

export const BUDGET_CLASSES = Object.freeze(['emergency', 'interactive', 'deliberative', 'background']);

const REVISION_FIELDS = Object.freeze(['observation', 'goal', 'plan', 'action']);

const REVISION_KEYS = Object.freeze({
  observation: 'observationRevision',
  goal: 'goalRevision',
  plan: 'planRevision',
  action: 'actionRevision',
});

// ---------------------------------------------------------------------------
// Serializability discipline
// ---------------------------------------------------------------------------

/**
 * Deep-check that a value is plain JSON-serializable data:
 * only null, primitives, plain objects and arrays. Rejects functions,
 * class instances, Dates, Maps, undefined, Infinity and NaN.
 * @param {*} value
 * @returns {boolean}
 */
export function isPlainSerializable(value) {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainSerializable);
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value).every(isPlainSerializable);
  }
  return false; // undefined, function, symbol, bigint
}

/**
 * Deep-clone a value, throwing if it is not plain serializable data.
 * @template T
 * @param {T} value
 * @param {string} [label]
 * @returns {T}
 */
function clonePlain(value, label = 'value') {
  if (!isPlainSerializable(value)) {
    throw new TypeError(`${label} must be plain JSON-serializable data`);
  }
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Shared validation helpers (tool-validator style: { valid, errors })
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNonNegativeInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function isTimestamp(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isUnitInterval(v) {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

function fail(errors, condition, message) {
  if (!condition) errors.push(message);
}

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------

export const DRIVE_NAMES = Object.freeze([
  'hunger',
  'fear',
  'curiosity',
  'fatigue',
  'stress',
  'motivation',
  'sociability',
]);

/**
 * Internal pressures, each in [0, 1]. Defaults are neutral.
 * @param {Object.<string, number>} [partial]
 * @returns {Object.<string, number>}
 */
export function createDrives(partial = {}) {
  const drives = {};
  for (const name of DRIVE_NAMES) {
    const raw = partial[name];
    if (raw === undefined || raw === null) {
      drives[name] = 0.5;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new TypeError(`drive "${name}" must be a finite number, got ${raw}`);
    }
    drives[name] = Math.max(0, Math.min(1, raw));
  }
  return drives;
}

// ---------------------------------------------------------------------------
// AgentState
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {string} options.agentId
 * @param {string} [options.lifecycle]
 * @param {Object} [options.drives]
 * @param {Object} [options.capabilities] — immutable runtime capability posture
 * @param {*} [options.goal]    — opaque slot, owned by goal system
 * @param {*} [options.intent]  — opaque slot, owned by runtime
 * @param {*} [options.plan]    — opaque slot, owned by Planner
 * @param {*} [options.action]  — opaque slot, owned by runtime/executor
 * @param {*} [options.observationSummary] — compact observation digest
 * @param {Object} [options.decisionMetadata]
 * @param {number} [options.now] — explicit clock (required for purity)
 * @returns {Object} AgentState
 */
export function createAgentState(options) {
  const {
    agentId,
    lifecycle = 'created',
    drives = {},
    capabilities = {},
    goal = null,
    intent = null,
    plan = null,
    action = null,
    observationSummary = null,
    decisionMetadata = {},
    now,
  } = options || {};

  if (!isNonEmptyString(agentId)) {
    throw new TypeError('createAgentState: agentId must be a non-empty string');
  }
  if (!AGENT_LIFECYCLES.includes(lifecycle)) {
    throw new TypeError(`createAgentState: unknown lifecycle "${lifecycle}"`);
  }
  if (!isTimestamp(now)) {
    throw new TypeError('createAgentState: explicit numeric "now" is required');
  }

  const state = {
    schemaVersion: SCHEMA_VERSION,
    agentId,
    lifecycle,
    revision: 0,
    observationRevision: 0,
    goalRevision: 0,
    planRevision: 0,
    actionRevision: 0,
    drives: createDrives(drives),
    capabilities: clonePlain(capabilities, 'capabilities'),
    goal: clonePlain(goal, 'goal'),
    intent: clonePlain(intent, 'intent'),
    plan: clonePlain(plan, 'plan'),
    action: clonePlain(action, 'action'),
    observationSummary: clonePlain(observationSummary, 'observationSummary'),
    decisionMetadata: clonePlain(decisionMetadata, 'decisionMetadata'),
    updatedAt: now,
  };

  return state;
}

/**
 * Immutably advance one revision counter. The top-level `revision` always
 * advances together with the specific sub-revision. Returns a NEW state;
 * the input is not mutated.
 * @param {Object} state
 * @param {'observation'|'goal'|'plan'|'action'} field
 * @param {number} now — explicit clock
 * @returns {Object} new AgentState
 */
export function advanceRevision(state, field, now) {
  if (!REVISION_FIELDS.includes(field)) {
    throw new TypeError(`advanceRevision: unknown revision field "${field}"`);
  }
  if (!isTimestamp(now)) {
    throw new TypeError('advanceRevision: explicit numeric "now" is required');
  }
  const key = REVISION_KEYS[field];
  return {
    ...state,
    revision: state.revision + 1,
    [key]: state[key] + 1,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// AgentEvent
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {string} options.eventId
 * @param {string} options.type
 * @param {string} options.source — emitter id (agent id, 'world', 'player:<name>', 'system')
 * @param {string|null} options.target — agent id, or null for broadcast/company
 * @param {'agent'|'broadcast'|'company'} options.audience
 * @param {'emergency'|'high'|'normal'|'low'} [options.priority]
 * @param {number} options.occurredAt — explicit clock
 * @param {number|null} [options.expiresAt]
 * @param {string|null} [options.correlationId]
 * @param {number} [options.observationRevision]
 * @param {*} [options.payload]
 * @returns {Object} AgentEvent
 */
export function createAgentEvent(options) {
  const {
    eventId,
    type,
    source,
    target = null,
    audience,
    priority = 'normal',
    occurredAt,
    expiresAt = null,
    correlationId = null,
    observationRevision = 0,
    payload = null,
  } = options || {};

  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventId,
    type,
    source,
    target,
    audience,
    priority,
    occurredAt,
    expiresAt,
    correlationId,
    observationRevision,
    payload: clonePlain(payload, 'payload'),
  };

  const { valid, errors } = validateAgentEvent(event);
  if (!valid) {
    throw new TypeError(`createAgentEvent: ${errors.join('; ')}`);
  }
  return event;
}

/**
 * Legal target/audience combinations:
 * - audience 'agent'     → target MUST be a specific agent id.
 * - audience 'broadcast' → target MUST be null (all agents).
 * - audience 'company'   → target MUST be null (company infrastructure only).
 * @param {Object} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentEvent(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['event must be an object'] };
  }
  fail(errors, isNonEmptyString(event.eventId), 'eventId must be a non-empty string');
  fail(errors, isNonEmptyString(event.type), 'type must be a non-empty string');
  fail(errors, isNonEmptyString(event.source), 'source must be a non-empty string');
  fail(errors, EVENT_AUDIENCES.includes(event.audience), `audience must be one of ${EVENT_AUDIENCES.join(', ')}`);
  fail(errors, EVENT_PRIORITIES.includes(event.priority), `priority must be one of ${EVENT_PRIORITIES.join(', ')}`);
  fail(errors, isTimestamp(event.occurredAt), 'occurredAt must be a finite timestamp >= 0');
  fail(
    errors,
    event.expiresAt === null || isTimestamp(event.expiresAt),
    'expiresAt must be null or a finite timestamp >= 0'
  );
  if (event.expiresAt !== null && isTimestamp(event.occurredAt) && isTimestamp(event.expiresAt)) {
    fail(errors, event.expiresAt > event.occurredAt, 'expiresAt must be after occurredAt');
  }
  fail(errors, isNonNegativeInt(event.observationRevision), 'observationRevision must be an integer >= 0');

  if (event.audience === 'agent') {
    fail(errors, isNonEmptyString(event.target), 'audience "agent" requires a non-null target agent id');
  } else if (event.audience === 'broadcast' || event.audience === 'company') {
    fail(errors, event.target === null, `audience "${event.audience}" requires target to be null`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * PURE expiry check. `now` is an explicit parameter — this function never
 * reads the wall clock, so it is deterministic and testable.
 * @param {Object} event
 * @param {number} now — explicit clock
 * @returns {boolean}
 */
export function isEventExpired(event, now) {
  if (!isTimestamp(now)) {
    throw new TypeError('isEventExpired: explicit numeric "now" is required');
  }
  if (event.expiresAt === null || event.expiresAt === undefined) return false;
  return now >= event.expiresAt;
}

// ---------------------------------------------------------------------------
// DecisionRequest (submission contract for the Phase 3 scheduler)
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {string} options.requestId
 * @param {string} options.agentId
 * @param {*} options.snapshotRef — opaque reference to the observation/state
 *        snapshot the decision should be based on (id or revision, NOT the
 *        snapshot itself).
 * @param {string[]} [options.triggerEventIds]
 * @param {'emergency'|'interactive'|'deliberative'|'background'} [options.budgetClass]
 * @param {number} options.submittedAt — explicit clock
 * @returns {Object} DecisionRequest
 */
export function createDecisionRequest(options) {
  const {
    requestId,
    agentId,
    snapshotRef = null,
    triggerEventIds = [],
    budgetClass = 'deliberative',
    submittedAt,
  } = options || {};

  if (!isNonEmptyString(requestId)) {
    throw new TypeError('createDecisionRequest: requestId must be a non-empty string');
  }
  if (!isNonEmptyString(agentId)) {
    throw new TypeError('createDecisionRequest: agentId must be a non-empty string');
  }
  if (!BUDGET_CLASSES.includes(budgetClass)) {
    throw new TypeError(`createDecisionRequest: budgetClass must be one of ${BUDGET_CLASSES.join(', ')}`);
  }
  if (!isTimestamp(submittedAt)) {
    throw new TypeError('createDecisionRequest: explicit numeric "submittedAt" is required');
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    agentId,
    snapshotRef: clonePlain(snapshotRef, 'snapshotRef'),
    triggerEventIds: clonePlain(triggerEventIds, 'triggerEventIds'),
    budgetClass,
    submittedAt,
  };
}

// ---------------------------------------------------------------------------
// DecisionProposal
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {string} options.proposalId
 * @param {string} options.agentId
 * @param {number} options.basedOnStateRevision
 * @param {number} options.basedOnObservationRevision
 * @param {number} options.basedOnGoalRevision
 * @param {number} options.basedOnPlanRevision
 * @param {number} options.basedOnActionRevision
 * @param {*} options.intent — opaque intent descriptor
 * @param {'emergency'|'high'|'normal'|'low'} [options.priority]
 * @param {number} [options.confidence] — [0, 1]
 * @param {boolean} [options.requiresLLM]
 * @param {string} [options.reason]
 * @param {number} options.createdAt — explicit clock
 * @param {number|null} [options.expiresAt]
 * @param {*} [options.action] — optional opaque action descriptor
 * @returns {Object} DecisionProposal
 */
export function createDecisionProposal(options) {
  const {
    proposalId,
    agentId,
    basedOnStateRevision,
    basedOnObservationRevision,
    basedOnGoalRevision,
    basedOnPlanRevision,
    basedOnActionRevision,
    intent,
    priority = 'normal',
    confidence = 0.5,
    requiresLLM = false,
    reason = '',
    createdAt,
    expiresAt = null,
    action = null,
  } = options || {};

  const proposal = {
    schemaVersion: SCHEMA_VERSION,
    proposalId,
    agentId,
    basedOnStateRevision,
    basedOnObservationRevision,
    basedOnGoalRevision,
    basedOnPlanRevision,
    basedOnActionRevision,
    intent: clonePlain(intent, 'intent'),
    priority,
    confidence,
    requiresLLM: Boolean(requiresLLM),
    reason,
    createdAt,
    expiresAt,
    action: clonePlain(action, 'action'),
  };

  const { valid, errors } = validateDecisionProposal(proposal);
  if (!valid) {
    throw new TypeError(`createDecisionProposal: ${errors.join('; ')}`);
  }
  return proposal;
}

/**
 * @param {Object} proposal
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDecisionProposal(proposal) {
  const errors = [];
  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['proposal must be an object'] };
  }
  fail(errors, isNonEmptyString(proposal.proposalId), 'proposalId must be a non-empty string');
  fail(errors, isNonEmptyString(proposal.agentId), 'agentId must be a non-empty string');
  for (const key of [
    'basedOnStateRevision',
    'basedOnObservationRevision',
    'basedOnGoalRevision',
    'basedOnPlanRevision',
    'basedOnActionRevision',
  ]) {
    fail(errors, isNonNegativeInt(proposal[key]), `${key} must be an integer >= 0`);
  }
  fail(errors, EVENT_PRIORITIES.includes(proposal.priority), `priority must be one of ${EVENT_PRIORITIES.join(', ')}`);
  fail(errors, isUnitInterval(proposal.confidence), 'confidence must be a number in [0, 1]');
  fail(errors, isTimestamp(proposal.createdAt), 'createdAt must be a finite timestamp >= 0');
  fail(
    errors,
    proposal.expiresAt === null || isTimestamp(proposal.expiresAt),
    'expiresAt must be null or a finite timestamp >= 0'
  );
  if (proposal.expiresAt !== null && isTimestamp(proposal.createdAt) && isTimestamp(proposal.expiresAt)) {
    fail(errors, proposal.expiresAt > proposal.createdAt, 'expiresAt must be after createdAt');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Staleness rule (pinned by the Phase 1 review, Finding 1):
 *
 * A proposal is current iff ALL of:
 *   basedOnGoalRevision   === state.goalRevision
 *   basedOnPlanRevision   === state.planRevision
 *   basedOnActionRevision === state.actionRevision
 *   and the proposal is not expired at `now`.
 *
 * Observation staleness is intentionally NOT checked by revision equality:
 * observations advance constantly, so equality would discard valid work.
 * Observation staleness is handled via `expiresAt` instead.
 *
 * PURE: `now` is explicit.
 * @param {Object} proposal
 * @param {Object} state — AgentState
 * @param {number} now — explicit clock
 * @returns {boolean}
 */
export function isProposalCurrent(proposal, state, now) {
  if (!isTimestamp(now)) {
    throw new TypeError('isProposalCurrent: explicit numeric "now" is required');
  }
  if (proposal.basedOnGoalRevision !== state.goalRevision) return false;
  if (proposal.basedOnPlanRevision !== state.planRevision) return false;
  if (proposal.basedOnActionRevision !== state.actionRevision) return false;
  if (proposal.expiresAt !== null && proposal.expiresAt !== undefined && now >= proposal.expiresAt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ActionRequest / ActionResult
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {string} options.requestId
 * @param {string} options.agentId
 * @param {*} options.action — opaque action descriptor
 * @param {number} options.basedOnActionRevision
 * @param {boolean} [options.interruptible]
 * @param {number} options.requestedAt — explicit clock
 * @param {number|null} [options.expiresAt]
 * @returns {Object} ActionRequest
 */
export function createActionRequest(options) {
  const {
    requestId,
    agentId,
    action,
    basedOnActionRevision,
    interruptible = true,
    requestedAt,
    expiresAt = null,
  } = options || {};

  if (!isNonEmptyString(requestId)) {
    throw new TypeError('createActionRequest: requestId must be a non-empty string');
  }
  if (!isNonEmptyString(agentId)) {
    throw new TypeError('createActionRequest: agentId must be a non-empty string');
  }
  if (!isNonNegativeInt(basedOnActionRevision)) {
    throw new TypeError('createActionRequest: basedOnActionRevision must be an integer >= 0');
  }
  if (!isTimestamp(requestedAt)) {
    throw new TypeError('createActionRequest: explicit numeric "requestedAt" is required');
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    agentId,
    action: clonePlain(action, 'action'),
    basedOnActionRevision,
    interruptible: Boolean(interruptible),
    requestedAt,
    expiresAt,
  };
}

/**
 * @param {Object} options
 * @param {string} options.requestId — MUST match the originating ActionRequest
 * @param {string} options.agentId
 * @param {*} options.action — echoed action descriptor
 * @param {number} options.basedOnActionRevision
 * @param {boolean} options.success
 * @param {*} [options.outcome]
 * @param {string|null} [options.error]
 * @param {number} options.startedAt — explicit clock
 * @param {number} options.completedAt — explicit clock
 * @param {number} [options.observationRevision]
 * @returns {Object} ActionResult
 */
export function createActionResult(options) {
  const {
    requestId,
    agentId,
    action = null,
    basedOnActionRevision,
    success,
    outcome = null,
    error = null,
    startedAt,
    completedAt,
    observationRevision = 0,
  } = options || {};

  if (!isNonEmptyString(requestId)) {
    throw new TypeError('createActionResult: requestId must be a non-empty string');
  }
  if (!isNonEmptyString(agentId)) {
    throw new TypeError('createActionResult: agentId must be a non-empty string');
  }
  if (!isNonNegativeInt(basedOnActionRevision)) {
    throw new TypeError('createActionResult: basedOnActionRevision must be an integer >= 0');
  }
  if (typeof success !== 'boolean') {
    throw new TypeError('createActionResult: success must be a boolean');
  }
  if (!isTimestamp(startedAt) || !isTimestamp(completedAt)) {
    throw new TypeError('createActionResult: explicit numeric "startedAt" and "completedAt" are required');
  }
  if (completedAt < startedAt) {
    throw new TypeError('createActionResult: completedAt must be >= startedAt');
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    agentId,
    action: clonePlain(action, 'action'),
    basedOnActionRevision,
    success,
    outcome: clonePlain(outcome, 'outcome'),
    error,
    startedAt,
    completedAt,
    observationRevision,
  };
}
