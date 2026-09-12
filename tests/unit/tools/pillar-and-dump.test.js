import { describe, it, expect, vi, beforeEach } from 'vitest';
import vec3 from 'vec3';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerMovementTools } from '../../../src/tools/movement.js';
import { registerInteractionTools } from '../../../src/tools/interaction.js';

describe('Movement & Interaction Tools (Pillaring & Clutter Dumping)', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('pillar_up tool', () => {
    it('should pillar up using available solid blocks (dirt, cobblestone, stone, planks, etc.)', async () => {
      const placed = [];
      const controlStates = {};
      const mockBot = {
        entity: {
          position: vec3(0, 64, 0),
          yaw: 0,
        },
        inventory: {
          items: () => [
            { name: 'cobblestone', count: 64 },
          ],
        },
        equip: vi.fn(async () => {}),
        look: vi.fn(async () => {}),
        setControlState: vi.fn((key, val) => {
          controlStates[key] = val;
        }),
        blockAt: vi.fn((pos) => {
          return { name: 'dirt', boundingBox: 'block', position: pos };
        }),
        placeBlock: vi.fn(async (ref, face) => {
          placed.push({ ref, face });
        }),
      };

      registerMovementTools(registry, { bot: mockBot });

      const result = await registry.execute('pillar_up', { height: 2 });
      expect(result.success).toBe(true);
      expect(mockBot.equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'cobblestone' }), 'hand');
      expect(mockBot.look).toHaveBeenCalledWith(0, -Math.PI / 2, true);
      expect(result.data).toContain('Построен столб');
    });

    it('should fail gracefully if no solid building blocks are in inventory', async () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'apple', count: 5 },
            { name: 'diamond_sword', count: 1 },
          ],
        },
      };

      registerMovementTools(registry, { bot: mockBot });

      const result = await registry.execute('pillar_up', { height: 2 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('нет твердых строительных блоков');
    });
  });

  describe('dump_clutter_to_chest tool', () => {
    it('should deposit junk/clutter into chest while preserving gear and building reserves', async () => {
      const deposited = [];
      const mockChest = {
        deposit: vi.fn(async (type, metadata, count) => {
          deposited.push({ type, count });
        }),
      };

      const mockBot = {
        version: '1.20.1',
        blockAt: vi.fn(() => ({ name: 'chest', position: vec3(1, 64, 1) })),
        openContainer: vi.fn(async () => mockChest),
        inventory: {
          items: () => [
            { name: 'diamond_sword', type: 1, count: 1 },
            { name: 'cooked_beef', type: 2, count: 16 },
            { name: 'cobblestone', type: 3, count: 64 }, // First building stack -> kept
            { name: 'cobblestone', type: 3, count: 64 }, // Second building stack -> dumped
            { name: 'rotten_flesh', type: 4, count: 32 }, // Junk -> dumped
            { name: 'wheat_seeds', type: 5, count: 18 },  // Junk -> dumped
          ],
        },
      };

      registerInteractionTools(registry, { bot: mockBot });

      const result = await registry.execute('dump_clutter_to_chest', { x: 1, y: 64, z: 1 });
      expect(result.success).toBe(true);
      expect(mockBot.openContainer).toHaveBeenCalled();
      // Should deposit second cobblestone, rotten flesh, wheat seeds (3 items)
      expect(mockChest.deposit).toHaveBeenCalledTimes(3);
      expect(result.data).toContain('Сброшено');
    });
  });
});
