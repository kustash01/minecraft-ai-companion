import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerWorldInteractionTools } from '../../../src/tools/world-interaction.js';

function baseBot(overrides = {}) {
  const pos = {
    x: 0, y: 64, z: 0,
    distanceTo: () => 1,
    offset: (dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz, offset: () => ({}) }),
  };
  return {
    version: '1.20.4',
    entity: { position: pos, yaw: 0, pitch: 0, height: 1.8 },
    pathfinder: { setGoal: vi.fn() },
    inventory: { items: () => [], slots: new Array(46).fill(null) },
    entities: {},
    equip: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    look: vi.fn().mockResolvedValue(undefined),
    activateBlock: vi.fn().mockResolvedValue(undefined),
    activateEntity: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    blockAt: () => ({ name: 'wheat', position: { x: 1, y: 64, z: 0, offset: () => ({}) } }),
    ...overrides,
  };
}

function makeRegistry(bot) {
  const registry = new ToolRegistry();
  registerWorldInteractionTools(registry, { bot });
  return registry;
}

describe('use_item_on_block', () => {
  it('fails when the item is not in inventory', async () => {
    const bot = baseBot();
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item_on_block', { itemName: 'bone_meal', x: 1, y: 64, z: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('bone_meal');
  });

  it('equips the item and right-clicks the block', async () => {
    const bot = baseBot({ inventory: { items: () => [{ name: 'bone_meal', count: 5 }], slots: [] } });
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item_on_block', { itemName: 'bone_meal', x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(bot.equip).toHaveBeenCalled();
    expect(bot.activateBlock).toHaveBeenCalled();
  });

  it('fails when there is no block at coordinates', async () => {
    const bot = baseBot({ blockAt: () => null });
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item_on_block', { x: 1, y: 64, z: 0 });
    expect(res.success).toBe(false);
  });
});

describe('use_item', () => {
  it('fails when the item is missing', async () => {
    const bot = baseBot();
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item', { itemName: 'ender_pearl' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('ender_pearl');
  });

  it('activates and deactivates the held item', async () => {
    const bot = baseBot({ inventory: { items: () => [{ name: 'firework_rocket', count: 3 }], slots: [] } });
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item', { itemName: 'firework_rocket' });
    expect(res.success).toBe(true);
    expect(bot.activateItem).toHaveBeenCalled();
    expect(bot.deactivateItem).toHaveBeenCalled();
  });
});

describe('use_item_on_entity', () => {
  it('fails when the entity is not nearby', async () => {
    const bot = baseBot();
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item_on_entity', { entityName: 'horse', itemName: 'saddle' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('horse');
  });

  it('uses the item on a matched entity', async () => {
    const horse = { name: 'horse', height: 1.6, position: { x: 1, y: 64, z: 0, distanceTo: () => 1, offset: () => ({}) } };
    const bot = baseBot({
      entities: { 1: horse },
      inventory: { items: () => [{ name: 'saddle', count: 1 }], slots: [] },
    });
    // distanceTo on bot position must compare to horse
    bot.entity.position.distanceTo = () => 1;
    const registry = makeRegistry(bot);
    const res = await registry.execute('use_item_on_entity', { entityName: 'horse', itemName: 'saddle' });
    expect(res.success).toBe(true);
    expect(bot.activateEntity).toHaveBeenCalledWith(horse);
  });
});

describe('interact_block', () => {
  it('fails on air / missing block', async () => {
    const bot = baseBot({ blockAt: () => ({ name: 'air' }) });
    const registry = makeRegistry(bot);
    const res = await registry.execute('interact_block', { x: 1, y: 64, z: 0 });
    expect(res.success).toBe(false);
  });

  it('activates a real block (e.g. lever)', async () => {
    const bot = baseBot({ blockAt: () => ({ name: 'lever', position: { x: 1, y: 64, z: 0, offset: () => ({}) } }) });
    const registry = makeRegistry(bot);
    const res = await registry.execute('interact_block', { x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(bot.activateBlock).toHaveBeenCalled();
  });
});

describe('elytra_fly', () => {
  it('fails when elytra is not worn', async () => {
    const bot = baseBot();
    const registry = makeRegistry(bot);
    const res = await registry.execute('elytra_fly', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('литр');
  });

  it('takes off when elytra is worn on the chest slot', async () => {
    const slots = new Array(46).fill(null);
    slots[6] = { name: 'elytra', count: 1 };
    const bot = baseBot({
      inventory: { items: () => [], slots },
      setControlState: vi.fn(),
    });
    const registry = makeRegistry(bot);
    const res = await registry.execute('elytra_fly', {});
    expect(res.success).toBe(true);
    expect(bot.setControlState).toHaveBeenCalledWith('jump', true);
  });
});

describe('tame_animal', () => {
  it('fails when the animal is not nearby', async () => {
    const bot = baseBot();
    const registry = makeRegistry(bot);
    const res = await registry.execute('tame_animal', { entityName: 'wolf' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('wolf');
  });

  it('feeds a wolf with bones', async () => {
    const wolf = { name: 'wolf', height: 0.85, isValid: true, metadata: [], position: { x: 1, y: 64, z: 0, distanceTo: () => 1, offset: () => ({}) } };
    const bot = baseBot({
      entities: { 1: wolf },
      inventory: { items: () => [{ name: 'bone', count: 4 }], slots: [] },
    });
    const registry = makeRegistry(bot);
    const res = await registry.execute('tame_animal', { entityName: 'wolf', itemName: 'bone' });
    expect(res.success).toBe(true);
    expect(bot.activateEntity).toHaveBeenCalled();
  });
});
