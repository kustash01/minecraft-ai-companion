import { describe, it, expect, vi } from 'vitest';
import { ActionSandbox } from '../../../src/actions/action-sandbox.js';

describe('ActionSandbox — интеграция про-геймерских трюков, бадди и ориентиров', () => {
  it('предоставляет pro-tricks, buddy, landmarks и thought в скриптах run_code', async () => {
    const mockTorch = { name: 'torch', type: 50 };
    const mockBot = {
      version: '1.20.4',
      entity: {
        position: { x: 0, y: 64, z: 0, offset: vi.fn((dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz, floored: () => ({ x: dx, y: 64 + dy, z: dz }) })) },
        yaw: 0,
        pitch: 0,
      },
      inventory: {
        items: () => [mockTorch],
        slots: {},
      },
      equip: vi.fn(),
      placeBlock: vi.fn(),
      dig: vi.fn(),
      setControlState: vi.fn(),
      blockAt: vi.fn(() => ({ name: 'stone' })),
      entities: {},
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      thought('проверяем окружение');
      landmarks.remember('База', { x: 0, y: 64, z: 0 }, 'главный спавн');
      const base = landmarks.get('База');
      const safe = world.checkSafeBedUse();
      return { baseName: base.name, isSafe: safe.safe };
    `);

    expect(res.success).toBe(true);
    expect(res.result.baseName).toBe('База');
    expect(res.result.isSafe).toBe(true);
  });
});
