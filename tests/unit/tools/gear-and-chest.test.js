import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerCombatTools } from '../../../src/tools/combat.js';
import { registerInteractionTools } from '../../../src/tools/interaction.js';

describe('equip_best_gear', () => {
  it('equips best gear via combatAI', async () => {
    const registry = new ToolRegistry();
    const bot = { entity: { position: { x: 0, y: 64, z: 0 } }, inventory: { items: () => [] }, entities: {} };
    registerCombatTools(registry, { bot });
    const res = await registry.execute('equip_best_gear', {});
    // combatAI.equipBestGear on an empty mock inventory should not throw.
    expect(res.success).toBe(true);
  });

  it('fails gracefully before spawn', async () => {
    const registry = new ToolRegistry();
    registerCombatTools(registry, { bot: {} });
    const res = await registry.execute('equip_best_gear', {});
    expect(res.success).toBe(false);
  });
});

describe('list_chest_contents', () => {
  it('reads chest items without withdrawing', async () => {
    const registry = new ToolRegistry();
    const close = vi.fn();
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
      blockAt: () => ({ name: 'chest' }),
      openContainer: vi.fn().mockResolvedValue({
        containerItems: () => [{ name: 'iron_ingot', count: 12 }, { name: 'bread', count: 3 }],
        close,
      }),
    };
    registerInteractionTools(registry, { bot });
    const res = await registry.execute('list_chest_contents', { x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(res.data).toContain('iron_ingot');
    expect(res.items).toHaveLength(2);
    expect(close).toHaveBeenCalled();
  });

  it('reports empty chests', async () => {
    const registry = new ToolRegistry();
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
      blockAt: () => ({ name: 'barrel' }),
      openContainer: vi.fn().mockResolvedValue({ containerItems: () => [], close: vi.fn() }),
    };
    registerInteractionTools(registry, { bot });
    const res = await registry.execute('list_chest_contents', { x: 1, y: 64, z: 0 });
    expect(res.success).toBe(true);
    expect(res.data).toContain('пусто');
  });

  it('rejects a chest that is too far', async () => {
    const registry = new ToolRegistry();
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 6 } },
      blockAt: () => ({ name: 'chest' }),
    };
    registerInteractionTools(registry, { bot });
    const res = await registry.execute('list_chest_contents', { x: 5, y: 64, z: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('далеко');
  });
});
