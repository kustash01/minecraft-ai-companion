import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutonomousLifeEngine } from '../../../src/behavior/autonomous-life.js';

describe('AutonomousLifeEngine Tests', () => {
  let lifeEngine;
  let mockAgent;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      version: '1.20.4',
      food: 20,
      time: { timeOfDay: 6000 },
      entity: {
        position: {
          x: 100,
          y: 64,
          z: 200,
          clone: () => ({ x: 100, y: 64, z: 200 }),
          offset: () => ({ x: 100, y: 64, z: 200 }),
          distanceTo: (other) => Math.hypot(100 - other.x, 64 - other.y, 200 - other.z),
        },
      },
      inventory: {
        items: () => [
          { name: 'oak_log', count: 4 },
          { name: 'stick', count: 4 },
        ],
      },
      findBlocks: vi.fn(() => []),
      findBlock: vi.fn(() => null),
      recipesFor: vi.fn(() => [{ result: { id: 1 } }]),
      craft: vi.fn(),
      equip: vi.fn(),
      lookAt: vi.fn(),
      chat: vi.fn(),
    };

    mockAgent = {
      name: 'Ryan',
      mcBot: { bot: mockBot },
      movementController: { isMoving: () => false },
    };

    lifeEngine = new AutonomousLifeEngine(mockAgent);
  });

  it('autonomously crafts planks when having wood logs in inventory', async () => {
    await lifeEngine.tick();
    expect(mockBot.craft).toHaveBeenCalled();
  });

  it('triggers food consumption reflex when hunger drops', async () => {
    mockBot.food = 10;
    mockBot.inventory.items = () => [{ name: 'bread', count: 3 }];
    mockBot.activateItem = vi.fn();
    mockBot.deactivateItem = vi.fn();

    await lifeEngine.tick();
    expect(mockBot.equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'bread' }), 'hand');
    expect(mockBot.activateItem).toHaveBeenCalled();
  });

  it('uses the movement controller without aborting when selecting a personal activity', async () => {
    mockBot.inventory.items = () => [];
    mockBot.findBlocks = vi.fn((options) => {
      if (options.maxDistance !== 18) return [];
      return [{ x: 110, y: 64, z: 205, offset: (x, y, z) => ({ x: 110 + x, y: 64 + y, z: 205 + z }) }];
    });
    mockBot.blockAt = vi.fn(() => ({ name: 'grass_block' }));
    mockAgent.movementController.moveTo = vi.fn();

    await lifeEngine.tick();

    expect(mockAgent.movementController.moveTo).toHaveBeenCalled();
  });
});
