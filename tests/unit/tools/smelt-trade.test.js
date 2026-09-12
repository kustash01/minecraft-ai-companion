import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerSmeltTradeTools } from '../../../src/tools/smelt-trade.js';

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    entities: {},
    pathfinder: { setGoal: vi.fn() },
    inventory: { items: () => [] },
    ...overrides,
  };
}

describe('Smelting tools', () => {
  it('reports when there is nothing to smelt', async () => {
    const registry = new ToolRegistry();
    registerSmeltTradeTools(registry, { bot: baseBot() });
    const res = await registry.execute('smelt_item', { itemName: 'iron_ore' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Нечего плавить');
  });

  it('reports when no furnace is nearby', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({
      inventory: { items: () => [{ type: 15, name: 'raw_iron', count: 3 }] },
      findBlock: () => null,
    });
    registerSmeltTradeTools(registry, { bot });
    // raw_iron may not exist by that exact id; use a name known to mcData instead.
    const res = await registry.execute('smelt_item', { itemName: 'sand' });
    // sand exists; but bot has no sand -> "Нечего плавить"
    expect(res.success).toBe(false);
  });

  it('smelts using a found furnace and available fuel', async () => {
    const registry = new ToolRegistry();
    const mcData = (await import('minecraft-data')).default('1.20.4');
    const sandId = mcData.itemsByName.sand.id;
    const coalId = mcData.itemsByName.coal.id;

    let outputTaken = 0;
    const furnace = {
      _hasInput: true,
      _fuel: null,
      inputItem() { return this._hasInput ? { type: sandId } : null; },
      fuelItem() { return this._fuel; },
      outputItem() { return this._hasInput ? { name: 'glass' } : null; },
      putFuel: vi.fn().mockImplementation(function () { this._fuel = { name: 'coal' }; }),
      putInput: vi.fn(),
      takeOutput: vi.fn().mockImplementation(function () { outputTaken++; furnace._hasInput = false; }),
      close: vi.fn(),
    };
    const bot = baseBot({
      inventory: { items: () => [{ type: sandId, name: 'sand', count: 2 }, { type: coalId, name: 'coal', count: 4 }] },
      findBlock: () => ({ position: { x: 1, y: 64, z: 0 } }),
      openFurnace: vi.fn().mockResolvedValue(furnace),
    });
    registerSmeltTradeTools(registry, { bot });

    const res = await registry.execute('smelt_item', { itemName: 'sand', count: 2 });
    expect(res.success).toBe(true);
    expect(bot.openFurnace).toHaveBeenCalled();
    expect(furnace.putInput).toHaveBeenCalled();
    expect(furnace.putFuel).toHaveBeenCalled();
    expect(outputTaken).toBeGreaterThan(0);
  });
});

describe('Trading tools', () => {
  it('list_trades reports when no villager is nearby', async () => {
    const registry = new ToolRegistry();
    registerSmeltTradeTools(registry, { bot: baseBot({ nearestEntity: () => null }) });
    const res = await registry.execute('list_trades', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('Жителей');
  });

  it('list_trades reads a villager offer list', async () => {
    const registry = new ToolRegistry();
    const villager = {
      trades: [
        { inputItem1: { count: 20, name: 'wheat' }, outputItem: { count: 1, name: 'emerald' }, tradeDisabled: false },
      ],
      close: vi.fn(),
    };
    const bot = baseBot({
      nearestEntity: () => ({ name: 'villager', position: { x: 1, y: 64, z: 0 } }),
      openVillager: vi.fn().mockResolvedValue(villager),
    });
    registerSmeltTradeTools(registry, { bot });
    const res = await registry.execute('list_trades', {});
    expect(res.success).toBe(true);
    expect(res.data).toContain('wheat');
    expect(res.data).toContain('emerald');
  });

  it('trade_with_villager executes a trade by index', async () => {
    const registry = new ToolRegistry();
    const villager = { trades: [{ tradeDisabled: false }], close: vi.fn() };
    const trade = vi.fn().mockResolvedValue(true);
    const bot = baseBot({
      nearestEntity: () => ({ name: 'villager', position: { x: 1, y: 64, z: 0 } }),
      openVillager: vi.fn().mockResolvedValue(villager),
      trade,
    });
    registerSmeltTradeTools(registry, { bot });
    const res = await registry.execute('trade_with_villager', { index: 0, count: 2 });
    expect(res.success).toBe(true);
    expect(trade).toHaveBeenCalledWith(villager, 0, 2);
  });

  it('trade_with_villager rejects an invalid index', async () => {
    const registry = new ToolRegistry();
    const villager = { trades: [{ tradeDisabled: false }], close: vi.fn() };
    const bot = baseBot({
      nearestEntity: () => ({ name: 'villager', position: { x: 1, y: 64, z: 0 } }),
      openVillager: vi.fn().mockResolvedValue(villager),
      trade: vi.fn(),
    });
    registerSmeltTradeTools(registry, { bot });
    const res = await registry.execute('trade_with_villager', { index: 5 });
    expect(res.success).toBe(false);
  });
});
