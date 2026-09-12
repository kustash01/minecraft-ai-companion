import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerRidingCombatTools } from '../../../src/tools/riding-combat.js';

function baseBot(overrides = {}) {
  return {
    version: '1.20.4',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 } },
    entities: {},
    vehicle: null,
    inventory: { items: () => [] },
    equip: vi.fn(),
    lookAt: vi.fn(),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    mount: vi.fn(),
    dismount: vi.fn(),
    ...overrides,
  };
}

describe('Riding tools', () => {
  it('mounts the nearest horse and reports success', async () => {
    const registry = new ToolRegistry();
    const horse = { name: 'horse', position: { x: 1, y: 64, z: 0 } };
    const bot = baseBot({
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: (p) => Math.hypot(p.x, (p.y||64)-64, p.z) } },
      entities: { 1: horse },
      mount: vi.fn().mockImplementation(function () { bot.vehicle = horse; }),
    });
    registerRidingCombatTools(registry, { bot });
    const res = await registry.execute('mount_entity', {});
    expect(res.success).toBe(true);
    expect(bot.mount).toHaveBeenCalledWith(horse);
  });

  it('reports when there is nothing to ride', async () => {
    const registry = new ToolRegistry();
    registerRidingCombatTools(registry, { bot: baseBot() });
    const res = await registry.execute('mount_entity', {});
    expect(res.success).toBe(false);
  });

  it('refuses to mount when already riding', async () => {
    const registry = new ToolRegistry();
    registerRidingCombatTools(registry, { bot: baseBot({ vehicle: { name: 'horse' } }) });
    const res = await registry.execute('mount_entity', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('уже верхом');
  });

  it('dismounts when riding', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({ vehicle: { name: 'boat' } });
    registerRidingCombatTools(registry, { bot });
    const res = await registry.execute('dismount_entity', {});
    expect(res.success).toBe(true);
    expect(bot.dismount).toHaveBeenCalled();
  });
});

describe('Bow tool', () => {
  it('requires a bow', async () => {
    const registry = new ToolRegistry();
    registerRidingCombatTools(registry, { bot: baseBot() });
    const res = await registry.execute('shoot_bow', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('лука');
  });

  it('requires arrows', async () => {
    const registry = new ToolRegistry();
    const bot = baseBot({ inventory: { items: () => [{ name: 'bow' }] } });
    registerRidingCombatTools(registry, { bot });
    const res = await registry.execute('shoot_bow', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('стрел');
  });

  it('charges and releases at the nearest hostile', async () => {
    const registry = new ToolRegistry();
    const skeleton = { name: 'skeleton', position: { x: 5, y: 64, z: 0, offset: () => ({ x: 5, y: 65, z: 0 }) }, height: 1.8, isValid: true };
    const bot = baseBot({
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: (p) => Math.hypot(p.x, (p.y||64)-64, p.z) } },
      entities: { 1: skeleton },
      inventory: { items: () => [{ name: 'bow' }, { name: 'arrow', count: 10 }] },
    });
    registerRidingCombatTools(registry, { bot });
    const res = await registry.execute('shoot_bow', { chargeMs: 400 });
    expect(res.success).toBe(true);
    expect(bot.activateItem).toHaveBeenCalled();
    expect(bot.deactivateItem).toHaveBeenCalled();
    expect(res.data).toContain('skeleton');
  });
});
