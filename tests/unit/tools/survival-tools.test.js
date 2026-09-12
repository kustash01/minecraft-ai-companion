import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerSurvivalTools } from '../../../src/tools/survival.js';

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    entities: {},
    pathfinder: { setGoal: vi.fn(), isMoving: () => false },
    ...overrides,
  };
}

describe('Survival tools - sleep', () => {
  it('sleeps in a nearby bed', async () => {
    const registry = new ToolRegistry();
    const sleep = vi.fn().mockResolvedValue(true);
    const bedBlock = { name: 'red_bed', position: { x: 1, y: 64, z: 0 } };
    const bot = baseBot({
      findBlock: () => bedBlock,
      blockAt: () => bedBlock,
      sleep,
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
    });
    registerSurvivalTools(registry, { bot });

    const res = await registry.execute('sleep', {});
    expect(res.success).toBe(true);
    expect(sleep).toHaveBeenCalledWith(bedBlock);
  });

  it('reports when no bed is nearby', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({ findBlock: () => null });
    registerSurvivalTools(registry, { bot });
    const res = await registry.execute('sleep', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('Кровати');
  });

  it('translates the daytime error into a human message', async () => {
    const registry = new ToolRegistry();
    const bedBlock = { name: 'red_bed', position: { x: 0, y: 64, z: 0 } };
    const bot = baseBot({
      findBlock: () => bedBlock,
      blockAt: () => bedBlock,
      sleep: vi.fn().mockRejectedValue(new Error('You can only sleep at night')),
    });
    registerSurvivalTools(registry, { bot });
    const res = await registry.execute('sleep', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('только ночью');
  });
});

describe('Survival tools - collect_nearby_items', () => {
  it('reports when there is nothing to collect', async () => {
    const registry = new ToolRegistry();
    registerSurvivalTools(registry, { bot: baseBot() });
    const res = await registry.execute('collect_nearby_items', {});
    expect(res.success).toBe(true);
    expect(res.data).toContain('нет');
  });

  it('walks toward dropped items and counts collected ones', async () => {
    const registry = new ToolRegistry();
    // A drop that becomes invalid after first poll => counts as collected.
    let polls = 0;
    const drop = {
      name: 'item',
      position: { x: 2, y: 64, z: 0 },
      get isValid() { return polls++ < 1; },
    };
    const bot = baseBot({
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
      entities: { 1: drop },
    });
    registerSurvivalTools(registry, { bot });
    const res = await registry.execute('collect_nearby_items', {});
    expect(res.success).toBe(true);
    expect(bot.pathfinder.setGoal).toHaveBeenCalled();
  });

  it('fails gracefully without pathfinder', async () => {
    const registry = new ToolRegistry();
    registerSurvivalTools(registry, { bot: baseBot({ pathfinder: null }) });
    const res = await registry.execute('collect_nearby_items', {});
    expect(res.success).toBe(false);
  });
});
