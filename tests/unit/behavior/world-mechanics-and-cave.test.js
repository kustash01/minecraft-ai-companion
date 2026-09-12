import { describe, it, expect, beforeEach, vi } from 'vitest';
import vec3 from 'vec3';
import { WorldState } from '../../../src/perception/world-state.js';
import { TacticalCombatAI, CombatStrategy } from '../../../src/combat/combat-ai.js';
import { CaveNavigation } from '../../../src/behavior/cave-navigation.js';
import { MovementController } from '../../../src/control/movement-controller.js';
import { BotActionWrapperExtended } from '../../../src/behavior/bot-action-wrapper-extended.js';

describe('WorldState Deep Perception & Inventory Mechanics', () => {
  let worldState;

  beforeEach(() => {
    worldState = new WorldState();
  });

  it('should perceive off-hand shield, held item, free slots, and torches', () => {
    const mockSlots = new Array(46).fill(null);
    mockSlots[5] = { name: 'diamond_helmet', slot: 5, durabilityUsed: 10 };
    mockSlots[6] = { name: 'iron_chestplate', slot: 6, durabilityUsed: 0 };
    mockSlots[36] = { name: 'diamond_sword', slot: 36, count: 1 };
    mockSlots[37] = { name: 'torch', slot: 37, count: 16 };
    mockSlots[38] = { name: 'bread', slot: 38, count: 12 };
    mockSlots[45] = { name: 'shield', slot: 45, count: 1 }; // Off-hand

    const mockBot = {
      entity: {
        position: {
          x: 42.4,
          y: 35.2,
          z: -88.7,
          floored: () => ({ x: 42, y: 35, z: -88 }),
        },
      },
      health: 19,
      food: 17,
      foodSaturation: 4,
      time: { timeOfDay: 15000 },
      isRaining: false,
      game: { gameMode: 'survival' },
      experience: { points: 100 },
      heldItem: mockSlots[36],
      inventory: {
        slots: mockSlots,
        items: () => [mockSlots[5], mockSlots[6], mockSlots[36], mockSlots[37], mockSlots[38], mockSlots[45]],
      },
      blockAt: vi.fn(() => ({ light: 3, skyLight: 0, name: 'stone' })),
      entities: {},
    };

    worldState.forceUpdate(mockBot);

    expect(worldState.offHand).toEqual(expect.objectContaining({ name: 'shield', slot: 45 }));
    expect(worldState.heldItem).toEqual(expect.objectContaining({ name: 'diamond_sword' }));
    expect(worldState.hasShield).toBe(true);
    expect(worldState.torchCount).toBe(16);
    expect(worldState.foodCount).toBe(12);
    expect(worldState.armor.length).toBe(2);
    expect(worldState.lightLevel).toBe(3);
    expect(worldState.isDark).toBe(true);
    expect(worldState.inCave).toBe(true);
    expect(worldState.freeSlots).toBe(33); // 36 main inventory slots minus 3 filled slots

    const summary = worldState.getSummary();
    expect(summary).toContain('Свет: 3/15 (в пещере)');
    expect(summary).toContain('оффхэнд: [shield]');
    expect(summary).toContain('Факелов: 16');
  });
});

describe('TacticalCombatAI Minecraft Mechanics & Shield Defense', () => {
  let combat;

  beforeEach(() => {
    combat = new TacticalCombatAI();
  });

  it('should auto-equip shield to off-hand and best armor to armor slots', async () => {
    const mockSlots = new Array(46).fill(null);
    const mockItems = [
      { name: 'iron_sword', count: 1 },
      { name: 'diamond_sword', count: 1 },
      { name: 'shield', count: 1 },
      { name: 'diamond_chestplate', count: 1 },
      { name: 'iron_helmet', count: 1 },
    ];

    const equipped = [];
    const mockBot = {
      inventory: {
        slots: mockSlots,
        items: () => mockItems,
      },
      heldItem: null,
      equip: vi.fn(async (item, dest) => {
        equipped.push({ item: item.name, dest });
      }),
    };

    await combat.equipBestGear(mockBot);

    expect(mockBot.equip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'diamond_sword' }),
      'hand'
    );
    expect(mockBot.equip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'shield' }),
      'off-hand'
    );
    expect(mockBot.equip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'diamond_chestplate' }),
      'torso'
    );
    expect(mockBot.equip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'iron_helmet' }),
      'head'
    );
  });

  it('should raise shield when creeper is in close explosion range', async () => {
    const controlStates = {};
    let activatedItem = false;

    const mockBot = {
      entity: {
        position: {
          x: 0,
          y: 64,
          z: 0,
          distanceTo: () => 2.4, // Creeper within explosion distance
        },
        onGround: true,
      },
      inventory: {
        slots: { 45: { name: 'shield' } },
        items: () => [{ name: 'iron_sword' }, { name: 'shield' }],
      },
      heldItem: { name: 'iron_sword' },
      lookAt: vi.fn(async () => {}),
      setControlState: vi.fn((state, val) => {
        controlStates[state] = val;
      }),
      activateItem: vi.fn((offHand) => {
        activatedItem = offHand;
      }),
      deactivateItem: vi.fn(),
      pvp: { attack: vi.fn() },
      attack: vi.fn(),
    };

    const targetCreeper = {
      name: 'creeper',
      isValid: true,
      position: { x: 2.4, y: 64, z: 0, offset: () => ({ x: 2.4, y: 65.2, z: 0 }) },
    };

    await combat.executeCombatTick(mockBot, targetCreeper);

    // Against close creeper, bot backpedals and raises shield
    expect(controlStates.back).toBe(true);
    expect(mockBot.activateItem).toHaveBeenCalledWith(true);
    expect(combat.isBlocking).toBe(true);
  });

  it('should execute bow shooting with aim jitter', async () => {
    let activated = false;
    let deactivated = false;
    let lookedAngles = null;

    const mockBot = {
      entity: {
        yaw: 1.0,
        pitch: 0.2,
      },
      inventory: {
        items: () => [{ name: 'bow' }],
      },
      heldItem: { name: 'bow' },
      equip: vi.fn(async () => {}),
      lookAt: vi.fn(async () => {}),
      look: vi.fn(async (yaw, pitch) => {
        lookedAngles = { yaw, pitch };
      }),
      activateItem: vi.fn(() => { activated = true; }),
      deactivateItem: vi.fn(() => { deactivated = true; }),
    };

    const target = {
      name: 'skeleton',
      position: { x: 15, y: 64, z: 0, offset: () => ({ x: 15, y: 65, z: 0 }) },
    };

    const shotPromise = combat.shootBow(mockBot, target);
    await shotPromise;

    expect(mockBot.lookAt).toHaveBeenCalled();
    expect(mockBot.look).toHaveBeenCalled();
    expect(activated).toBe(true);
    expect(deactivated).toBe(true);
  });
});

describe('CaveNavigation Torch Placement & Darkness Caution', () => {
  let caveNav;

  beforeEach(() => {
    caveNav = new CaveNavigation({ agentName: 'Alex' });
  });

  it('should identify floor spot with upward face normal and place torch', async () => {
    const placedBlocks = [];
    const mockBot = {
      username: 'Alex',
      entity: {
        position: {
          x: 10,
          y: 40,
          z: 10,
          floored: () => ({ x: 10, y: 40, z: 10 }),
        },
      },
      blockAt: vi.fn((pos) => {
        if (pos.y === 40) return { light: 3, name: 'air' };
        if (pos.y === 39) return { name: 'stone', boundingBox: 'block' };
        return null;
      }),
      inventory: {
        items: () => [{ name: 'torch', count: 8 }],
      },
      heldItem: { name: 'diamond_pickaxe' },
      equip: vi.fn(async () => {}),
      lookAt: vi.fn(async () => {}),
      placeBlock: vi.fn(async (ref, face) => {
        placedBlocks.push({ ref, face });
      }),
    };

    const spot = caveNav.findTorchSpot(mockBot);
    expect(spot).not.toBeNull();
    expect(spot.type).toBe('floor');
    expect(spot.faceVector).toEqual(vec3(0, 1, 0));

    const result = await caveNav.placeTorch(mockBot);
    expect(result).toBe(true);
    expect(mockBot.equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'torch' }), 'hand');
    // Restores diamond pickaxe
    expect(mockBot.equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'diamond_pickaxe' }), 'hand');
  });

  it('should apply darkness caution when in pitch dark without torches', () => {
    const mockMovementController = {
      setDarkCaution: vi.fn(),
    };

    const mockBot = {
      entity: {
        position: {
          x: 10,
          y: 25,
          z: 10,
          floored: () => ({ x: 10, y: 25, z: 10 }),
        },
        yaw: 0,
      },
      blockAt: vi.fn(() => ({ light: 2, skyLight: 0, name: 'air' })),
      inventory: {
        items: () => [], // No torches
      },
      look: vi.fn(async () => {}),
    };

    caveNav.handleDarknessCaution(mockBot, mockMovementController);
    expect(mockMovementController.setDarkCaution).toHaveBeenCalledWith(true);
  });
});

describe('MovementController Darkness Caution Integration', () => {
  it('should suppress sprinting while isDarkCaution is active', () => {
    const controlStates = {};
    const mockBot = {
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 10 }, onGround: true },
      players: {
        kustash01: { entity: { position: { x: 10, y: 64, z: 0 } } },
      },
      setControlState: vi.fn((state, val) => {
        controlStates[state] = val;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const controller = new MovementController({ agentName: 'Max', bot: mockBot });
    controller.targetPlayer = 'kustash01';
    controller.mode = 'following';

    // Enable dark caution
    controller.setDarkCaution(true);
    expect(controller.isDarkCaution).toBe(true);
    expect(controlStates.sprint).toBe(false);

    // Physics tick
    controller._onPhysicsTick();
    // Sprint must remain false in dark caution
    expect(controlStates.sprint).toBe(false);

    // Disable dark caution
    controller.setDarkCaution(false);
    expect(controller.isDarkCaution).toBe(false);
  });
});

describe('BotActionWrapperExtended Human-like Imperfections', () => {
  it('should handle block placement and mining with organic error handling', async () => {
    const mockBlock = {
      position: vec3(5, 64, 5),
      name: 'oak_log',
    };

    const mockBot = {
      dig: vi.fn(async () => true),
      placeBlock: vi.fn(async () => true),
      lookAt: vi.fn(async () => {}),
      blockAt: vi.fn(() => ({ name: 'air' })),
    };

    const wrapper = new BotActionWrapperExtended(mockBot, null, 'GeminiBot');

    const mineResult = await wrapper.mineBlock(mockBlock);
    expect(mineResult).toBe(true);
    expect(mockBot.dig).toHaveBeenCalledWith(mockBlock);

    const placeResult = await wrapper.placeBlock(mockBlock, vec3(0, 1, 0));
    expect(placeResult).toBe(true);
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });
});
