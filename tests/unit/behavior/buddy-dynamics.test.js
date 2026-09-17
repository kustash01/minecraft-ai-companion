import { describe, it, expect, vi } from 'vitest';
import { BuddyDynamics } from '../../../src/behavior/buddy-dynamics.js';

describe('BuddyDynamics — кооперативный этикет и забота о напарнике', () => {
  it('находит сущность напарника по нику или первую попавшуюся', () => {
    const mockBot = {
      entity: { id: 0 },
      entities: {
        1: { id: 1, type: 'player', username: 'kustash01', position: { x: 5, y: 64, z: 5 } },
      },
    };

    const buddy = BuddyDynamics.findBuddy(mockBot, 'kustash01');
    expect(buddy).not.toBeNull();
    expect(buddy.username).toBe('kustash01');
  });

  it('делится лутом с напарником (shareLoot)', async () => {
    const mockItem = { name: 'iron_ingot', type: 265, count: 10 };
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, distanceTo: () => 2 },
        yaw: 0,
        pitch: 0,
      },
      entities: {
        1: { id: 1, type: 'player', username: 'kustash01', position: { x: 2, y: 64, z: 0, offset: () => ({ x: 2, y: 65.6, z: 0 }) } },
      },
      inventory: { items: () => [mockItem] },
      lookAt: vi.fn(),
      equip: vi.fn(),
      toss: vi.fn(),
      setControlState: vi.fn(),
    };

    const res = await BuddyDynamics.shareLoot(mockBot, 'kustash01', 'iron_ingot', 5);
    expect(res).toBe(true);
    expect(mockBot.equip).toHaveBeenCalledWith(mockItem, 'hand');
    expect(mockBot.toss).toHaveBeenCalledWith(mockItem.type, null, 5);
  });

  it('оказывает экстренную помощь едой (checkEmergencyHeal)', async () => {
    const mockFood = { name: 'cooked_beef', type: 364, count: 8 };
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, distanceTo: () => 3 },
        yaw: 0,
        pitch: 0,
      },
      entities: {
        1: { id: 1, type: 'player', username: 'kustash01', position: { x: 3, y: 64, z: 0, offset: () => ({ x: 3, y: 65.6, z: 0 }) } },
      },
      inventory: { items: () => [mockFood] },
      chat: vi.fn(),
      lookAt: vi.fn(),
      equip: vi.fn(),
      toss: vi.fn(),
      setControlState: vi.fn(),
    };

    const helped = await BuddyDynamics.checkEmergencyHeal(mockBot, 'kustash01');
    expect(helped).toBe(true);
    expect(mockBot.chat).toHaveBeenCalledWith(expect.stringContaining('поешь'));
  });

  it('уступает узкий проход напарнику (yieldHallway)', async () => {
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, distanceTo: () => 1.8 },
      },
      entities: {
        1: { id: 1, type: 'player', username: 'kustash01', position: { x: 0, y: 64, z: 1.8 } },
      },
      setControlState: vi.fn(),
    };

    const yielded = await BuddyDynamics.yieldHallway(mockBot, 'kustash01');
    expect(yielded).toBe(true);
    expect(mockBot.setControlState).toHaveBeenCalledWith('back', true);
  });

  it('исполняет победный танец (celebrateVictory)', async () => {
    const mockBot = {
      entity: { onGround: true },
      setControlState: vi.fn(),
    };

    await BuddyDynamics.celebrateVictory(mockBot);
    expect(mockBot.setControlState).toHaveBeenCalledWith('sneak', true);
    expect(mockBot.setControlState).toHaveBeenCalledWith('jump', true);
  });
});
