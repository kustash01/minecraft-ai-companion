import { describe, it, expect, beforeEach } from 'vitest';
import { PersonalContextEngine } from '../../../src/cognition/context-engine.js';
import { BeliefModel, ConfidenceTier } from '../../../src/cognition/belief-model.js';
import { FastPathRouter } from '../../../src/cognition/fast-path.js';
import { CognitiveEngine } from '../../../src/cognition/cognitive-engine.js';

describe('PersonalContextEngine', () => {
  let ctx;
  beforeEach(() => {
    ctx = new PersonalContextEngine();
  });

  it('should track player and bot activities', () => {
    ctx.updateContext({
      playerActivity: 'building_house',
      botActivity: 'gathering_wood',
      activeGoal: 'Собрать 32 дубовых бревна',
    });

    const summary = ctx.getSituationSummary();
    expect(summary.playerActivity).toBe('building_house');
    expect(summary.botActivity).toBe('gathering_wood');
    expect(summary.activeGoal).toBe('Собрать 32 дубовых бревна');
  });

  it('should maintain deferred intentions', () => {
    ctx.addDeferredIntention('Отсортировать сундуки на складе', 'idle');
    expect(ctx.deferredIntentions.length).toBe(1);
    expect(ctx.deferredIntentions[0].intention).toBe('Отсортировать сундуки на складе');
  });
});

describe('BeliefModel', () => {
  let model;
  beforeEach(() => {
    model = new BeliefModel();
  });

  it('should categorize certainty tiers correctly', () => {
    model.setBelief('diamond_layer', -58, 0.95, 'observed');
    model.setBelief('village_nearby', true, 0.65, 'inferred');
    model.setBelief('ancient_city', null, 0.2, 'memory');

    expect(model.getBelief('diamond_layer').tier).toBe(ConfidenceTier.CERTAIN);
    expect(model.getBelief('village_nearby').tier).toBe(ConfidenceTier.PROBABLE);
    expect(model.getBelief('ancient_city').tier).toBe(ConfidenceTier.UNCERTAIN);
  });
});

describe('FastPathRouter', () => {
  let router;
  beforeEach(() => {
    router = new FastPathRouter();
  });

  it('should trigger immediate reflex on close creeper', () => {
    const worldState = {
      health: 20,
      food: 20,
      nearbyEntities: [{ name: 'creeper', distance: 2.5, position: { x: 10, y: 64, z: 20 } }],
    };

    const res = router.evaluateReflex(worldState, {});
    expect(res.handled).toBe(true);
    expect(res.actionName).toBe('evade_creeper');
  });
});

describe('CognitiveEngine', () => {
  it('should execute a 10-stage cycle without crashing', async () => {
    const engine = new CognitiveEngine({
      config: {},
      toolRegistry: null,
      contextManager: null,
      provider: null,
    });

    const worldState = {
      position: { x: 100, y: 64, z: 200 },
      health: 20,
      food: 20,
      timeOfDay: 6000,
      nearbyEntities: [],
    };

    const res = await engine.runCycle(worldState);
    expect(res.cycleId).toBe(1);
    expect(res.deliberation).toBeDefined();
    expect(res.deliberation.confidence).toBeGreaterThan(0.5);
  });
});
