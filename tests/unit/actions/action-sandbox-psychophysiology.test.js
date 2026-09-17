import { describe, it, expect, vi } from 'vitest';
import vec3 from 'vec3';
import { ActionSandbox } from '../../../src/actions/action-sandbox.js';

describe('ActionSandbox — психофизиология (адреналин, 3D слух, хотбар и комбат)', () => {
  it('предоставляет adrenaline, sound, hotbar и combat в контексте исполнения скриптов', async () => {
    const mockBot = {
      version: '1.20.4',
      entity: {
        position: vec3(0, 64, 0),
        velocity: vec3(0, -0.2, 0),
        yaw: 0,
        pitch: 0,
        onGround: false,
      },
      inventory: {
        items: () => [{ name: 'diamond_pickaxe', maxDurability: 1561, durabilityUsed: 50 }],
        slots: {},
      },
      setQuickBarSlot: vi.fn(),
      setControlState: vi.fn(),
      attack: vi.fn(),
      lookAt: vi.fn().mockResolvedValue(true),
      entities: {
        'target-1': {
          name: 'zombie',
          position: vec3(1, 64, 1),
          height: 1.8,
        }
      },
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      // 1. Проверяем adrenaline
      adrenaline.spike(0.4, 'опасность');
      const curAdrenaline = adrenaline.level;
      const efficiency = adrenaline.efficiency;

      // 2. Проверяем sound
      sound.setFocus('mining', 0.8);
      const heard = sound.hear('entity.creeper.primed', { x: 1, y: 64, z: 1 }, 1.0);

      // 3. Проверяем hotbar
      const slotRes = await hotbar.equipSemantic('pickaxe');

      // 4. Проверяем combat
      const critRes = await combat.jumpCrit('zombie');
      const wTapRes = await combat.wTap();

      return {
        adrenalineLevel: curAdrenaline,
        efficiency,
        soundHeard: heard.heard,
        slotIntended: slotRes.intendedSlot,
        critCanStrike: critRes.canStrike,
        wTapDone: typeof wTapRes.successfulReset === 'boolean',
      };
    `);

    expect(res.success).toBe(true);
    expect(res.result.adrenalineLevel).toBeGreaterThanOrEqual(0.4);
    expect(res.result.efficiency).toBeGreaterThan(0.2);
    expect(res.result.soundHeard).toBe(true);
    expect(res.result.slotIntended).toBe(1);
    expect(res.result.critCanStrike).toBe(true);
    expect(res.result.wTapDone).toBe(true);
  });
});
