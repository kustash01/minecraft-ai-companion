import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerWorldTools } from '../../../src/tools/world.js';
import { registerCraftingTools } from '../../../src/tools/crafting.js';
import { registerMiningTools } from '../../../src/tools/mining.js';
import { registerCombatTools } from '../../../src/tools/combat.js';
import { registerInteractionTools } from '../../../src/tools/interaction.js';
import { registerMovementTools } from '../../../src/tools/movement.js';
import { EventHandler } from '../../../src/bot/event-handler.js';
import { InitiativeController } from '../../../src/personality/initiative.js';
import EventEmitter from 'events';

describe('Tools Stability & Bug Fixes', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('World Tools', () => {
    it('find_entity should not throw ReferenceError and should find matching entities', async () => {
      const mockBot = {
        entities: {
          1: { id: 1, name: 'cow', type: 'mob', position: { x: 5, y: 64, z: 5 } },
          2: { id: 2, username: 'kustash01', type: 'player', position: { x: 2, y: 64, z: 2 } },
        },
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: (pos) => Math.hypot(pos.x, pos.y - 64, pos.z) } },
      };

      registerWorldTools(registry, { bot: mockBot, worldState: {} });

      const result = await registry.execute('find_entity', { entityName: 'cow', maxDistance: 32 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('cow');
    });

    it('get_time should safely handle missing bot.time without crashing', async () => {
      const mockBot = { time: null };
      registerWorldTools(registry, { bot: mockBot, worldState: {} });

      const result = await registry.execute('get_time', {});
      expect(result.success).toBe(true);
      expect(result.data.timeOfDay).toBe(0);
    });
  });

  describe('Crafting Tools', () => {
    it('list_craftable should return message when inventory is empty', async () => {
      const mockBot = {
        version: '1.20.1',
        inventory: { items: () => [] },
        findBlock: () => null,
      };

      registerCraftingTools(registry, { bot: mockBot });
      const result = await registry.execute('list_craftable', {});
      expect(result.success).toBe(true);
      expect(result.data).toContain('Инвентарь пуст');
    });

    it('list_craftable should find available recipes with items in inventory', async () => {
      const mockBot = {
        version: '1.20.1',
        inventory: {
          items: () => [{ name: 'oak_log', count: 4, type: 100 }],
        },
        findBlock: () => null,
        recipesFor: vi.fn().mockImplementation((id) => {
          if (id === 105) return [{ result: { id: 105, count: 4 } }]; // planks
          return [];
        }),
      };

      registerCraftingTools(registry, { bot: mockBot });
      const result = await registry.execute('list_craftable', {});
      expect(result.success).toBe(true);
      expect(result.data).toContain('Доступно для крафта');
    });
  });

  describe('Mining Tools', () => {
    it('dig_block should auto-equip tool and check distance', async () => {
      const equipForBlock = vi.fn().mockResolvedValue(true);
      const dig = vi.fn().mockResolvedValue(true);
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
        blockAt: () => ({ name: 'stone' }),
        canDigBlock: () => true,
        tool: { equipForBlock },
        dig,
      };

      registerMiningTools(registry, { bot: mockBot });
      const result = await registry.execute('dig_block', { x: 1, y: 64, z: 1 });
      expect(result.success).toBe(true);
      expect(equipForBlock).toHaveBeenCalled();
      expect(dig).toHaveBeenCalled();
    });

    it('dig_block should reject if block is too far away', async () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 10 } },
        blockAt: () => ({ name: 'stone' }),
      };

      registerMiningTools(registry, { bot: mockBot });
      const result = await registry.execute('dig_block', { x: 10, y: 64, z: 10 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too far away');
    });
  });

  describe('Combat Tools', () => {
    it('stop_attack should safely handle undefined bot.pvp without throwing', async () => {
      const clearControlStates = vi.fn();
      const mockBot = {
        pvp: null,
        clearControlStates,
      };

      registerCombatTools(registry, { bot: mockBot });
      const result = await registry.execute('stop_attack', {});
      expect(result.success).toBe(true);
      expect(clearControlStates).toHaveBeenCalled();
    });
  });

  describe('Interaction Tools', () => {
    it('open_container should close window in finally block even if error occurs', async () => {
      const close = vi.fn();
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 2 } },
        blockAt: () => ({ name: 'chest' }),
        openContainer: vi.fn().mockResolvedValue({
          containerItems: () => { throw new Error('Parsing error'); },
          close,
        }),
      };

      registerInteractionTools(registry, { bot: mockBot });
      const result = await registry.execute('open_container', { x: 1, y: 64, z: 0 });
      expect(result.success).toBe(false);
      expect(close).toHaveBeenCalled();
    });

    it('open_container should reject if chest is farther than 4.5 blocks', async () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 6.0 } },
        blockAt: () => ({ name: 'chest' }),
      };

      registerInteractionTools(registry, { bot: mockBot });
      const result = await registry.execute('open_container', { x: 5, y: 64, z: 0 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('слишком далеко');
    });
  });

  describe('Movement Tools', () => {
    it('move_to should fail gracefully when pathfinder is missing', async () => {
      const mockBot = { pathfinder: null };
      registerMovementTools(registry, { bot: mockBot });

      const result = await registry.execute('move_to', { x: 10, y: 64, z: 10 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Pathfinder не инициализирован');
    });
  });

  describe('Lifecycle: EventHandler respawn', () => {
    it('should clear controls and process respawn event', () => {
      const mcBot = new EventEmitter();
      const clearControlStates = vi.fn();
      const botInstance = { clearControlStates, on: vi.fn(), removeListener: vi.fn() };
      mcBot.bot = botInstance;

      const movementController = { stop: vi.fn(), attachBot: vi.fn() };
      const humanController = { processEvent: vi.fn() };
      const deathHandler = { bot: null };

      const handler = new EventHandler(mcBot, null, null, { bot: { owner: 'kustash01' } }, {
        movementController,
        humanController,
        deathHandler,
      });
      handler.setup();

      mcBot.emit('respawn', { generation: 1, bot: botInstance });

      expect(clearControlStates).toHaveBeenCalled();
      expect(movementController.stop).toHaveBeenCalled();
      expect(humanController.processEvent).toHaveBeenCalledWith('respawned', expect.any(Object));
      expect(deathHandler.bot).toBe(botInstance);
    });
  });

  describe('Initiative: Respect waiting mode', () => {
    it('should not follow owner if movementController is in waiting mode', async () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 20 } },
        players: {
          kustash01: { entity: { position: { x: 20, y: 64, z: 0 } }, username: 'kustash01' },
        },
        pathfinder: { isMoving: () => false, setGoal: vi.fn() },
      };

      const movementController = {
        mode: 'waiting',
        isPaused: true,
        followPlayer: vi.fn(),
      };

      const initiative = new InitiativeController({
        bot: mockBot,
        config: { bot: { owner: 'kustash01', initiative: 'balanced' } },
        movementController,
      });

      await initiative.evaluateSituation();

      // Because mode is 'waiting', followPlayer must NOT be called!
      expect(movementController.followPlayer).not.toHaveBeenCalled();
      expect(mockBot.pathfinder.setGoal).not.toHaveBeenCalled();
    });
  });
});
