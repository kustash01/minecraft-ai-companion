import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerInventoryTools } from '../../../src/tools/inventory.js';
import { registerFarmingTools } from '../../../src/tools/farming.js';
import { registerMovementTools } from '../../../src/tools/movement.js';

describe('Universal Atomic Tools', () => {
  it('equips items to off-hand and armor slots without restrictions', async () => {
    const registry = new ToolRegistry();
    const equip = vi.fn();
    const bot = {
      version: '1.20.1',
      inventory: {
        items: () => [
          { type: 1, name: 'shield' },
          { type: 2, name: 'elytra' },
          { type: 3, name: 'diamond_helmet' },
        ],
      },
      equip,
    };

    registerInventoryTools(registry, { bot, worldState: {} });

    // Test off-hand equip
    const resOffhand = await registry.execute('equip_item', { itemName: 'shield', destination: 'off-hand' });
    expect(resOffhand.success).toBe(true);
    expect(equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'shield' }), 'off-hand');

    // Test elytra to torso
    const resElytra = await registry.execute('equip_item', { itemName: 'elytra', destination: 'chestplate' });
    expect(resElytra.success).toBe(true);
    expect(equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'elytra' }), 'torso');
  });

  it('swaps hands using swap_hands tool (F key emulation)', async () => {
    const registry = new ToolRegistry();
    const moveSlotItem = vi.fn();
    const bot = {
      quickBarSlot: 0,
      inventory: { slots: { 45: { name: 'shield' } }, items: () => [] },
      moveSlotItem,
    };

    registerInventoryTools(registry, { bot, worldState: {} });
    const res = await registry.execute('swap_hands', {});
    expect(res.success).toBe(true);
    expect(moveSlotItem).toHaveBeenCalledWith(36, 45);
  });

  it('selects hotbar slots using hotbar_select', async () => {
    const registry = new ToolRegistry();
    const setQuickBarSlot = vi.fn();
    const bot = { setQuickBarSlot, inventory: { items: () => [] } };

    registerInventoryTools(registry, { bot, worldState: {} });
    const res = await registry.execute('hotbar_select', { slot: 3 });
    expect(res.success).toBe(true);
    expect(setQuickBarSlot).toHaveBeenCalledWith(3);
  });

  it('executes friendly crouch_salute', async () => {
    const registry = new ToolRegistry();
    const setControlState = vi.fn();
    const bot = { setControlState };

    registerMovementTools(registry, { bot, worldState: {} });
    const res = await registry.execute('crouch_salute', { times: 2 });
    expect(res.success).toBe(true);
    expect(setControlState).toHaveBeenCalledWith('sneak', true);
  });
});
