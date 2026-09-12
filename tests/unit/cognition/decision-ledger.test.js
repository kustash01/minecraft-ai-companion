import { describe, it, expect } from 'vitest';
import { CognitiveEngine } from '../../../src/cognition/cognitive-engine.js';

function createEngine(options = {}) {
  return new CognitiveEngine({
    config: { agentProfile: { name: 'Alex', traits: { talkativeness: 0.4 } }, ...options.config },
    toolRegistry: null,
    contextManager: null,
    provider: null,
    memoryManager: options.memoryManager || null,
  });
}

describe('CognitiveEngine decision ledger', () => {
  it('keeps recent appraisals as private decisions and respects the limit', () => {
    const engine = createEngine({ config: { decisionLedgerLimit: 2 } });

    engine.appraiseEvent({ type: 'resource_found', category: 'resource', tags: ['resource'], personalNeed: 0.8 });
    engine.appraiseEvent({ type: 'danger_seen', category: 'setback', tags: ['danger'], risk: 0.7 });
    engine.appraiseEvent({ type: 'quiet_area', category: 'observation' });

    const ledger = engine.getDecisionLedger(10);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].appraisal.eventType).toBe('danger_seen');
    expect(ledger[1].appraisal.eventType).toBe('quiet_area');
    expect(ledger[0].appraisal.decision.action).toBeDefined();
    expect(engine.getDecisionLedger(0)).toEqual([]);
  });

  it('returns defensive copies and optionally persists through episodic memory', () => {
    const saved = [];
    const engine = createEngine({
      memoryManager: {
        episodic: {
          rememberEpisode(entry) {
            saved.push(entry);
          },
        },
      },
    });

    engine.appraiseEvent({
      type: 'diamonds_found',
      category: 'resource',
      tags: ['resource'],
      personalNeed: 0.8,
      mcDay: 12,
    });

    const ledger = engine.getDecisionLedger();
    expect(saved).toHaveLength(1);
    expect(saved[0].eventType).toBe('decision:diamonds_found');
    expect(saved[0].mcDay).toBe(12);
    ledger[0].appraisal.decision.action = 'tampered';
    expect(engine.getDecisionLedger()[0].appraisal.decision.action).not.toBe('tampered');
  });

  it('does not fail when memory is a partial mock or persistence throws', () => {
    const partial = createEngine({ memoryManager: {} });
    expect(() => partial.appraiseEvent({ type: 'quiet', category: 'observation' })).not.toThrow();
    expect(partial.getDecisionLedger()).toHaveLength(1);

    const failing = createEngine({
      memoryManager: { episodic: { rememberEpisode() { throw new Error('storage unavailable'); } } },
    });
    expect(() => failing.appraiseEvent({ type: 'quiet', category: 'observation' })).not.toThrow();
    expect(failing.getDecisionLedger()).toHaveLength(1);
  });
});
