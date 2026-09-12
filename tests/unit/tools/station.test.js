import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerStationTools } from '../../../src/tools/station.js';

async function ids() {
  const mc = (await import('minecraft-data')).default('1.20.4');
  return {
    sword: mc.itemsByName.diamond_sword.id,
    lapis: mc.itemsByName.lapis_lazuli.id,
    book: mc.itemsByName.book.id,
  };
}

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    experience: { level: 30 },
    pathfinder: { setGoal: vi.fn() },
    inventory: { items: () => [] },
    ...overrides,
  };
}

describe('Enchanting', () => {
  it('needs the item present', async () => {
    const registry = new ToolRegistry();
    registerStationTools(registry, { bot: baseBot() });
    const res = await registry.execute('enchant_item', { itemName: 'diamond_sword' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Нет предмета');
  });

  it('needs lapis lazuli', async () => {
    const registry = new ToolRegistry();
    const { sword } = await ids();
    const bot = baseBot({ inventory: { items: () => [{ type: sword, name: 'diamond_sword' }] } });
    registerStationTools(registry, { bot });
    const res = await registry.execute('enchant_item', { itemName: 'diamond_sword' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('лазурит');
  });

  it('enchants when table, lapis and XP are available', async () => {
    const registry = new ToolRegistry();
    const { sword, lapis } = await ids();
    const table = {
      enchantments: [{ level: 5 }, { level: 12 }, { level: 25 }],
      putTargetItem: vi.fn(),
      putLapis: vi.fn(),
      enchant: vi.fn(),
      targetItem: () => null,
      takeTargetItem: vi.fn(),
      close: vi.fn(),
    };
    const bot = baseBot({
      inventory: { items: () => [{ type: sword, name: 'diamond_sword' }, { type: lapis, name: 'lapis_lazuli', count: 3 }] },
      findBlock: () => ({ position: { x: 1, y: 64, z: 0 } }),
      openEnchantmentTable: vi.fn().mockResolvedValue(table),
    });
    registerStationTools(registry, { bot });
    const res = await registry.execute('enchant_item', { itemName: 'diamond_sword' });
    expect(res.success).toBe(true);
    expect(table.enchant).toHaveBeenCalledWith(2); // highest affordable (25 <= level 30)
  });
});

describe('Anvil', () => {
  it('combines two items', async () => {
    const registry = new ToolRegistry();
    const { sword } = await ids();
    const anvil = { combine: vi.fn(), rename: vi.fn(), close: vi.fn() };
    const bot = baseBot({
      inventory: { items: () => [{ type: sword, name: 'diamond_sword', count: 1, slot: 9 }, { type: sword, name: 'diamond_sword', count: 1, slot: 10 }] },
      findBlock: () => ({ position: { x: 1, y: 64, z: 0 } }),
      openAnvil: vi.fn().mockResolvedValue(anvil),
    });
    registerStationTools(registry, { bot });
    const res = await registry.execute('anvil_combine', { itemName: 'diamond_sword', secondItemName: 'diamond_sword', newName: 'Экскалибур' });
    expect(res.success).toBe(true);
    expect(anvil.combine).toHaveBeenCalled();
  });

  it('renames an item', async () => {
    const registry = new ToolRegistry();
    const { sword } = await ids();
    const anvil = { combine: vi.fn(), rename: vi.fn(), close: vi.fn() };
    const bot = baseBot({
      inventory: { items: () => [{ type: sword, name: 'diamond_sword' }] },
      findBlock: () => ({ position: { x: 1, y: 64, z: 0 } }),
      openAnvil: vi.fn().mockResolvedValue(anvil),
    });
    registerStationTools(registry, { bot });
    const res = await registry.execute('anvil_rename', { itemName: 'diamond_sword', newName: 'Меч' });
    expect(res.success).toBe(true);
    expect(anvil.rename).toHaveBeenCalledWith(expect.objectContaining({ name: 'diamond_sword' }), 'Меч');
  });

  it('reports when no anvil is nearby', async () => {
    const registry = new ToolRegistry();
    const { sword } = await ids();
    const bot = baseBot({
      inventory: { items: () => [{ type: sword, name: 'diamond_sword' }] },
      findBlock: () => null,
    });
    registerStationTools(registry, { bot });
    const res = await registry.execute('anvil_rename', { itemName: 'diamond_sword', newName: 'X' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Наковальни');
  });
});
