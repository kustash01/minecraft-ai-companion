import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerUtilityTools } from '../../../src/tools/utility.js';

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    inventory: { items: () => [] },
    equip: vi.fn(),
    lookAt: vi.fn(),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    fish: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('Fishing tool', () => {
  it('requires a fishing rod', async () => {
    const registry = new ToolRegistry();
    registerUtilityTools(registry, { bot: baseBot() });
    const res = await registry.execute('go_fishing', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('удочки');
  });

  it('equips the rod and fishes the requested number of times', async () => {
    const registry = new ToolRegistry();
    const fish = vi.fn().mockResolvedValue(true);
    const bot = baseBot({
      inventory: { items: () => [{ name: 'fishing_rod', type: 1 }] },
      fish,
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('go_fishing', { catches: 3 });
    expect(res.success).toBe(true);
    expect(bot.equip).toHaveBeenCalled();
    expect(fish).toHaveBeenCalledTimes(3);
    expect(res.data).toContain('3');
  });
});

describe('Bucket tool', () => {
  it('fills an empty bucket from a water source', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      inventory: { items: () => [{ name: 'bucket', type: 1 }] },
      blockAt: () => ({ name: 'water' }),
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('use_bucket', { action: 'fill', x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(res.data).toContain('воду');
    expect(bot.activateItem).toHaveBeenCalled();
  });

  it('refuses to fill when there is no liquid at the point', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      inventory: { items: () => [{ name: 'bucket', type: 1 }] },
      blockAt: () => ({ name: 'stone' }),
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('use_bucket', { action: 'fill', x: 1, y: 64, z: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('нет воды');
  });

  it('empties a full water bucket', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      inventory: { items: () => [{ name: 'water_bucket', type: 1 }] },
      blockAt: () => ({ name: 'air' }),
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('use_bucket', { action: 'empty', x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(res.data).toContain('воду');
  });

  it('rejects when the target is too far', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 9 } },
      inventory: { items: () => [{ name: 'bucket', type: 1 }] },
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('use_bucket', { action: 'fill', x: 9, y: 64, z: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('далеко');
  });
});

describe('Boat tool', () => {
  it('requires a boat in inventory', async () => {
    const registry = new ToolRegistry();
    registerUtilityTools(registry, { bot: baseBot({ placeEntity: vi.fn() }) });
    const res = await registry.execute('place_boat', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('лодки');
  });

  it('places a boat against a nearby surface', async () => {
    const registry = new ToolRegistry();
    const placeEntity = vi.fn().mockResolvedValue(true);
    const bot = baseBot({
      inventory: { items: () => [{ name: 'oak_boat', type: 1 }] },
      entity: { position: { x: 0, y: 64, z: 0, offset: (dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz }), distanceTo: () => 1 } },
      blockAt: (p) => ({ name: p.y < 64 ? 'water' : 'air', position: p }),
      placeEntity,
    });
    registerUtilityTools(registry, { bot });
    const res = await registry.execute('place_boat', {});
    expect(res.success).toBe(true);
    expect(placeEntity).toHaveBeenCalled();
  });
});
