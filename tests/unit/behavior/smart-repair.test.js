import { describe, expect, it, vi } from 'vitest';
import { SmartCraterRepair } from '../../../src/behavior/smart-repair.js';
import vec3 from 'vec3';

describe('SmartCraterRepair', () => {
  it('detects wooden planks when an explosion damages a wooden structure', () => {
    const worldBlocks = new Map();
    // Surrounding blocks are oak planks
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        worldBlocks.set(`${x},60,${z}`, { name: 'oak_planks' });
      }
    }

    const bot = {
      blockAt: (pos) => worldBlocks.get(`${pos.x},${pos.y},${pos.z}`) || { name: 'air' },
    };

    const analysis = SmartCraterRepair.analyzeCraterEnvironment(bot, { x: 0, y: 60, z: 0 }, 2);
    expect(analysis.dominantSurface).toBe('oak_planks');
    expect(analysis.dominantSubsurface).toBe('oak_planks');
  });

  it('detects grass surface and dirt subsurface for outdoor landscape craters', () => {
    const worldBlocks = new Map();
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        worldBlocks.set(`${x},64,${z}`, { name: 'grass_block' });
        worldBlocks.set(`${x},63,${z}`, { name: 'dirt' });
      }
    }

    const bot = {
      blockAt: (pos) => worldBlocks.get(`${pos.x},${pos.y},${pos.z}`) || { name: 'air' },
    };

    const analysis = SmartCraterRepair.analyzeCraterEnvironment(bot, { x: 0, y: 64, z: 0 }, 2);
    expect(analysis.dominantSurface).toBe('grass_block');
    expect(analysis.dominantSubsurface).toBe('dirt');
  });

  it('picks matching blocks from inventory or closest alternative', () => {
    const bot = {
      inventory: {
        items: () => [
          { name: 'cobblestone', count: 32 },
          { name: 'dirt', count: 16 },
        ],
      },
    };

    // Asking for grass_block when only dirt is in inventory -> should pick dirt
    const match = SmartCraterRepair.findBestBlockInInventory(bot, 'grass_block');
    expect(match).not.toBeNull();
    expect(match.name).toBe('dirt');

    // Asking for stone -> should pick cobblestone
    const stoneMatch = SmartCraterRepair.findBestBlockInInventory(bot, 'stone');
    expect(stoneMatch).not.toBeNull();
    expect(stoneMatch.name).toBe('cobblestone');
  });
});
