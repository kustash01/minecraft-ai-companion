import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanMotor } from '../../../src/behavior/human-motor.js';
import { CampLifeEngine } from '../../../src/behavior/camp-life.js';
import { TeamCooperationEngine } from '../../../src/behavior/team-cooperation.js';

describe('HumanMotor Simulation Engine', () => {
  it('should organize hotbar into standard human slots (weapons, tools, food)', async () => {
    const mockItems = [
      { name: 'iron_sword', slot: 10 },
      { name: 'diamond_pickaxe', slot: 11 },
      { name: 'bread', slot: 12 },
    ];

    const moves = [];
    const mockBot = {
      inventory: {
        items: () => mockItems,
        slots: {},
      },
      moveSlotItem: vi.fn(async (from, to) => {
        moves.push({ from, to });
      }),
    };

    await HumanMotor.organizeHotbar(mockBot);

    // Slot 36 is Hotbar 1 (Sword), Slot 37 is Hotbar 2 (Pickaxe), Slot 44 is Hotbar 9 (Food)
    expect(mockBot.moveSlotItem).toHaveBeenCalledWith(10, 36);
    expect(mockBot.moveSlotItem).toHaveBeenCalledWith(11, 37);
    expect(mockBot.moveSlotItem).toHaveBeenCalledWith(12, 44);
  });

  it('should activate MLG water clutch when falling at high vertical speed', async () => {
    const mockBot = {
      username: 'Jack',
      entity: {
        velocity: { x: 0, y: -0.85, z: 0 },
        isInWater: false,
        yaw: 0,
      },
      inventory: {
        items: () => [{ name: 'water_bucket' }],
      },
      equip: vi.fn(async () => {}),
      look: vi.fn(async () => {}),
      activateItem: vi.fn(),
    };

    const saved = await HumanMotor.checkWaterClutch(mockBot);
    expect(saved).toBe(true);
    expect(mockBot.equip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'water_bucket' }),
      'hand'
    );
    expect(mockBot.activateItem).toHaveBeenCalled();
  });
});

describe('CampLifeEngine Daily Routines', () => {
  it('should place torch when current block light level is low (< 7)', async () => {
    const mockBot = {
      username: 'Ryan',
      world: {},
      entity: {
        position: {
          x: 10,
          y: 64,
          z: 20,
          floored: () => ({
            x: 10,
            y: 64,
            z: 20,
            offset: (dx, dy, dz) => ({ x: 10 + dx, y: 64 + dy, z: 20 + dz }),
          }),
        },
      },
      blockAt: vi.fn((pos) => {
        if (pos.y === 64) return { light: 4, name: 'air' };
        if (pos.y === 63) return { name: 'stone', boundingBox: 'block' };
        return null;
      }),
      inventory: {
        items: () => [{ name: 'torch' }],
      },
      equip: vi.fn(async () => {}),
      placeBlock: vi.fn(async () => {}),
    };

    const placed = await CampLifeEngine.placeTorchIfNeeded(mockBot);
    expect(placed).toBe(true);
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });

  it('should sleep in bed when night arrives (time > 12500)', async () => {
    const mockBed = { name: 'red_bed', position: { x: 5, y: 64, z: 5 } };
    const mockBot = {
      username: 'Sam',
      time: { timeOfDay: 13000 },
      isSleeping: false,
      findBlock: vi.fn(() => mockBed),
      sleep: vi.fn(async () => {}),
    };

    const slept = await CampLifeEngine.sleepAtNight(mockBot);
    expect(slept).toBe(true);
    expect(mockBot.sleep).toHaveBeenCalledWith(mockBed);
  });
});

describe('TeamCooperationEngine Item Sharing', () => {
  it('should toss items to target player via Q and perform crouch greeting', async () => {
    const mockItem = { name: 'bread', type: 297, count: 5 };
    const mockBot = {
      username: 'Alex',
      players: {
        kustash01: {
          entity: {
            position: {
              x: 0,
              y: 64,
              z: 2,
              offset: () => ({ x: 0, y: 65.5, z: 2 }),
            },
          },
        },
      },
      inventory: {
        items: () => [mockItem],
      },
      lookAt: vi.fn(async () => {}),
      toss: vi.fn(async () => {}),
      setControlState: vi.fn(),
    };

    const tossed = await TeamCooperationEngine.tossItemToTarget(mockBot, 'kustash01', 'bread', 2);
    expect(tossed).toBe(true);
    expect(mockBot.lookAt).toHaveBeenCalled();
    expect(mockBot.toss).toHaveBeenCalledWith(297, null, 2);
  });
});
