import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerInventoryTools } from '../../../src/tools/inventory.js';

/**
 * Mock bot with a realistic inventory.slots layout:
 * 5-8 armor, 9-35 main, 36-44 hotbar, 45 off-hand.
 */
function makeMockBot() {
  const slots = new Array(46).fill(null);
  slots[5] = { name: 'iron_helmet', count: 1, slot: 5 };
  slots[8] = { name: 'iron_boots', count: 1, slot: 8 };
  slots[45] = { name: 'shield', count: 1, slot: 45 };
  slots[36] = { name: 'diamond_pickaxe', count: 1, slot: 36 };
  slots[37] = { name: 'diamond_sword', count: 1, slot: 37 };
  slots[38] = { name: 'torch', count: 32, slot: 38 };
  slots[9] = { name: 'cooked_beef', count: 5, slot: 9 };
  slots[10] = { name: 'oak_log', count: 12, slot: 10 };

  const items = slots.filter((s, i) => s && i >= 9); // items() excludes armor/offhand
  return {
    version: '1.20.4',
    heldItem: slots[36],
    inventory: {
      slots,
      items: () => items,
    },
  };
}

describe('inspect_inventory', () => {
  let registry;
  const setup = (bot) => {
    registry = new ToolRegistry();
    registerInventoryTools(registry, { bot, worldState: { getInventorySummary: () => '' } });
  };

  it('reads armor, off-hand, held item and hotbar', async () => {
    setup(makeMockBot());
    const res = await registry.execute('inspect_inventory', {});
    expect(res.success).toBe(true);
    expect(res.data.armor.head.name).toBe('iron_helmet');
    expect(res.data.armor.feet.name).toBe('iron_boots');
    expect(res.data.offHand.name).toBe('shield');
    expect(res.data.held.name).toBe('diamond_pickaxe');
    expect(res.data.hotbar[0].name).toBe('diamond_pickaxe');
  });

  it('classifies tools, weapons and useful flags', async () => {
    setup(makeMockBot());
    const res = await registry.execute('inspect_inventory', {});
    expect(res.data.tools).toContain('diamond_pickaxe');
    expect(res.data.weapons).toContain('diamond_sword');
    expect(res.data.flags.hasFood).toBe(true);
    expect(res.data.flags.hasTorch).toBe(true);
    expect(res.data.flags.hasPickaxe).toBe(true);
    expect(res.data.flags.hasSword).toBe(true);
    expect(res.data.flags.hasShield).toBe(true);
  });

  it('counts free slots', async () => {
    setup(makeMockBot());
    const res = await registry.execute('inspect_inventory', {});
    // 36 storage slots (9..44), 5 occupied -> 31 free.
    expect(res.data.freeSlots).toBe(31);
  });

  it('fails gracefully before spawn', async () => {
    setup({ version: '1.20.4' });
    const res = await registry.execute('inspect_inventory', {});
    expect(res.success).toBe(false);
  });
});
