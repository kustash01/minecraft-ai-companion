import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerBrewingTools } from '../../../src/tools/brewing.js';

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    pathfinder: { setGoal: vi.fn() },
    inventory: { items: () => [] },
    ...overrides,
  };
}

describe('brew_potion', () => {
  it('needs the ingredient', async () => {
    const registry = new ToolRegistry();
    registerBrewingTools(registry, { bot: baseBot() });
    const res = await registry.execute('brew_potion', { ingredientName: 'nether_wart' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('ингредиента');
  });

  it('needs bottles', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({ inventory: { items: () => [{ name: 'nether_wart', count: 1 }] } });
    registerBrewingTools(registry, { bot });
    const res = await registry.execute('brew_potion', { ingredientName: 'nether_wart' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('бутылок');
  });

  it('needs blaze powder fuel', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({ inventory: { items: () => [{ name: 'nether_wart', count: 1 }, { name: 'water_bottle', count: 3 }] } });
    registerBrewingTools(registry, { bot });
    const res = await registry.execute('brew_potion', { ingredientName: 'nether_wart' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('blaze_powder');
  });

  it('reports when no brewing stand is nearby', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      inventory: { items: () => [{ name: 'nether_wart', count: 1 }, { name: 'water_bottle', count: 3 }, { name: 'blaze_powder', count: 2 }] },
      findBlock: () => null,
    });
    registerBrewingTools(registry, { bot });
    const res = await registry.execute('brew_potion', { ingredientName: 'nether_wart' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('стойки');
  });

  it('loads the stand and brews when everything is present', async () => {
    const registry = new ToolRegistry();
    // Window with the brewing layout: inventory section starts at slot 5.
    const slots = new Array(41).fill(null);
    slots[5] = { name: 'blaze_powder', count: 2, slot: 5 };
    slots[6] = { name: 'water_bottle', count: 3, slot: 6 };
    slots[7] = { name: 'nether_wart', count: 1, slot: 7 };
    const win = {
      slots,
      inventoryStart: 5,
      inventoryEnd: 41,
      close: vi.fn(),
    };
    const clickWindow = vi.fn().mockImplementation(async (slot) => {
      // Simulate items leaving the inventory section and, for slot 3, brewing done.
      if (slot >= 5) slots[slot] = null;
      slots[3] = null; // ingredient consumed => brew complete on next poll
    });
    const bot = baseBot({
      inventory: { items: () => [{ name: 'nether_wart', count: 1 }, { name: 'water_bottle', count: 3 }, { name: 'blaze_powder', count: 2 }] },
      findBlock: () => ({ position: { x: 1, y: 64, z: 0 } }),
      openBlock: vi.fn().mockResolvedValue(win),
      clickWindow,
    });
    registerBrewingTools(registry, { bot });
    const res = await registry.execute('brew_potion', { ingredientName: 'nether_wart' });
    expect(res.success).toBe(true);
    expect(bot.openBlock).toHaveBeenCalled();
    expect(clickWindow).toHaveBeenCalled();
  });
});
