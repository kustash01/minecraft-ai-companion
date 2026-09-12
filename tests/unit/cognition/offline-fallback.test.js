import { describe, expect, it } from 'vitest';
import { OfflineFallbackEngine } from '../../../src/cognition/offline-fallback.js';

describe('OfflineFallbackEngine', () => {
  it('keeps the critical-health contract regardless of other priorities', () => {
    const engine = new OfflineFallbackEngine({ profile: { traits: { thrill_seeking: 1 } } });
    const decision = engine.getFallbackAction(
      { health: 10, food: 20, timeOfDay: 18000 },
      { description: 'вернуть вещи после смерти', urgent: true },
      { recentErrors: ['death'] },
    );
    expect(decision.action).toBe('eat_food');
    expect(decision.priority).toBe('safety');
  });

  it('uses a saved route for a goal instead of blindly following the player', () => {
    const engine = new OfflineFallbackEngine();
    const route = { name: 'шахта у реки', forGoal: 'найти железо' };
    const decision = engine.getFallbackAction({ health: 20, food: 20, timeOfDay: 6000 }, 'найти железо', { savedRoutes: [route] });
    expect(decision.action).toBe('follow_saved_route');
    expect(decision.factors.routes).toBe(1);
  });

  it('lets resilient, risk-tolerant characters retry after a loss', () => {
    const engine = new OfflineFallbackEngine({ profile: { traits: { recovery_drive: 0.9, thrill_seeking: 0.9, risk_attitude: 0.8 } } });
    const decision = engine.getFallbackAction(
      { health: 18, food: 18, timeOfDay: 7000 },
      { description: 'вернуть вещи из шахты' },
      { recentErrors: [{ type: 'death', description: 'погиб в шахте' }] },
    );
    expect(decision.action).toBe('retry_with_adaptation');
  });

  it('lets cautious characters prepare before returning to a dangerous goal', () => {
    const engine = new OfflineFallbackEngine({ profile: { traits: { recovery_drive: 0.5, loss_aversion: 0.9, risk_attitude: 0.1 } } });
    const decision = engine.getFallbackAction(
      { health: 18, food: 18, timeOfDay: 7000 },
      { description: 'вернуть вещи после смерти' },
      { recentErrors: ['потерял вещи в лаве'] },
    );
    expect(decision.action).toBe('prepare_and_return');
  });

  it('honours an unfinished plan before routine behaviour', () => {
    const engine = new OfflineFallbackEngine();
    const decision = engine.getFallbackAction(
      { health: 20, food: 18, timeOfDay: 6000 },
      { description: 'построить склад' },
      { plan: { nextAction: 'prepare_for_goal' } },
    );
    expect(decision.action).toBe('prepare_for_goal');
  });

  it('returns home at night unless the character explicitly accepts the risk', () => {
    const cautious = new OfflineFallbackEngine({ profile: { traits: { risk_attitude: 0.2 } } });
    expect(cautious.getFallbackAction({ health: 20, timeOfDay: 15000 }, 'добывать руду').action).toBe('go_home');

    const bold = new OfflineFallbackEngine({ profile: { traits: { risk_attitude: 0.9, thrill_seeking: 0.9 } } });
    expect(bold.getFallbackAction({ health: 20, timeOfDay: 15000 }, { description: 'добывать руду', urgent: true }).action).toBe('continue_carefully');
  });

  it('eats when hunger is low and food is available', () => {
    const engine = new OfflineFallbackEngine();
    const decision = engine.getFallbackAction({ health: 20, food: 5, timeOfDay: 6000, inventory: [{ name: 'bread', count: 2 }] });
    expect(decision.action).toBe('eat_food');
  });

  it('keeps the legacy follow-player default with no goal or context', () => {
    const engine = new OfflineFallbackEngine();
    expect(engine.getFallbackAction({ health: 20, food: 20, timeOfDay: 6000 }).action).toBe('follow_player');
  });
});
