import { describe, it, expect, vi } from 'vitest';
import { KinematicsEngine } from '../../../src/behavior/kinematics.js';

describe('KinematicsEngine Tests', () => {
  it('correctly equips best axe for woodcutting', async () => {
    const equipMock = vi.fn();
    const mockBot = {
      inventory: {
        items: () => [
          { name: 'dirt', count: 64 },
          { name: 'wooden_axe', count: 1 },
          { name: 'iron_axe', count: 1 },
          { name: 'stick', count: 10 },
        ],
      },
      equip: equipMock,
    };

    await KinematicsEngine.equipBestTool(mockBot, 'wood');
    expect(equipMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'iron_axe' }), 'hand');
  });

  it('correctly equips best pickaxe for stone mining', async () => {
    const equipMock = vi.fn();
    const mockBot = {
      inventory: {
        items: () => [
          { name: 'wooden_pickaxe', count: 1 },
          { name: 'diamond_pickaxe', count: 1 },
          { name: 'stone_pickaxe', count: 1 },
        ],
      },
      equip: equipMock,
    };

    await KinematicsEngine.equipBestTool(mockBot, 'stone');
    expect(equipMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'diamond_pickaxe' }), 'hand');
  });

  it('correctly performs crouch nod', async () => {
    const setControlMock = vi.fn();
    const mockBot = {
      setControlState: setControlMock,
    };

    await KinematicsEngine.crouchNod(mockBot, 2);
    expect(setControlMock).toHaveBeenCalledWith('sneak', true);
    expect(setControlMock).toHaveBeenCalledWith('sneak', false);
    expect(setControlMock).toHaveBeenCalledTimes(4); // 2 down, 2 up
  });

  it('correctly swings arm', () => {
    const swingMock = vi.fn();
    const mockBot = { swingArm: swingMock };

    KinematicsEngine.swingArm(mockBot);
    expect(swingMock).toHaveBeenCalledWith('right');
  });
});
