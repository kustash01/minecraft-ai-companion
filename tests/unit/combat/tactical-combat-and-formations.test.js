import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TacticalCombatAI, CombatStrategy, combatAI } from '../../../src/combat/combat-ai.js';
import { MovementController } from '../../../src/control/movement-controller.js';
import { InitiativeController } from '../../../src/personality/initiative.js';

describe('TacticalCombatAI Engine', () => {
  let combat;

  beforeEach(() => {
    combat = new TacticalCombatAI();
  });

  it('should identify correct tactical strategy for skeletons and strays', () => {
    expect(combat.getStrategyForMob('Skeleton')).toBe(CombatStrategy.RANGED_INTERCEPT);
    expect(combat.getStrategyForMob('stray')).toBe(CombatStrategy.RANGED_INTERCEPT);
    expect(combat.getStrategyForMob('pillager')).toBe(CombatStrategy.RANGED_INTERCEPT);
  });

  it('should identify kiting strategy for creepers', () => {
    expect(combat.getStrategyForMob('creeper')).toBe(CombatStrategy.KITE_HIT);
  });

  it('should equip best available weapon from inventory', async () => {
    const mockItems = [
      { name: 'wooden_sword' },
      { name: 'iron_sword' },
      { name: 'diamond_sword' },
      { name: 'shield' },
      { name: 'bread', count: 5 },
    ];

    const equipped = [];
    const mockBot = {
      inventory: { items: () => mockItems },
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
  });

  it('should execute skeleton zigzag sprint and critical strike', async () => {
    const controlStates = {};
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, distanceTo: () => 6.0 },
        onGround: true,
      },
      lookAt: vi.fn(async () => {}),
      setControlState: vi.fn((state, val) => {
        controlStates[state] = val;
      }),
      inventory: { items: () => [{ name: 'iron_sword' }] },
      pvp: { attack: vi.fn() },
    };

    const targetSkeleton = {
      name: 'skeleton',
      isValid: true,
      position: { x: 6, y: 64, z: 0, offset: () => ({ x: 6, y: 65.5, z: 0 }) },
    };

    const handled = await combat.executeCombatTick(mockBot, targetSkeleton);
    expect(handled).toBe(true);
    expect(controlStates.sprint).toBe(true);
    expect(controlStates.forward).toBe(true);
  });
});

describe('MovementController Dynamic Formations', () => {
  it('should assign unique non-overlapping formation angles for all 6 agents', () => {
    const agents = ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'];
    const controllers = agents.map((name) => new MovementController({ agentName: name }));

    const angles = controllers.map((c) => c.formation.angleOffset);
    const uniqueAngles = new Set(angles);

    // Each agent must have a distinct formation position
    expect(uniqueAngles.size).toBe(6);
  });

  it('should calculate distinct target coordinates around player based on role', async () => {
    const sam = new MovementController({ agentName: 'Sam' });
    const alex = new MovementController({ agentName: 'Alex' });

    expect(sam.formation.role).toBe('scout_left');
    expect(alex.formation.role).toBe('quartermaster_rear');
    expect(sam.formation.baseDist).not.toBe(alex.formation.baseDist);
  });
});

describe('InitiativeController Silent Healing', () => {
  it('should silently eat food and not chat when health/food is low', async () => {
    const chatMock = vi.fn();
    const eatMock = vi.fn(async () => {});

    const mockBot = {
      food: 12,
      health: 14,
      entity: { position: { x: 0, y: 64, z: 0 } },
      chat: chatMock,
      autoEat: { eat: eatMock },
    };

    const initiative = new InitiativeController({
      bot: mockBot,
      worldState: { nearbyEntities: [] },
      memoryManager: null,
      aiBrain: { isProcessing: false, getState: () => 'IDLE' },
      config: { bot: { initiative: 'balanced' } },
    });

    await initiative.evaluateSituation();

    expect(eatMock).toHaveBeenCalled();
    // Must NOT spam chat with health messages
    expect(chatMock).not.toHaveBeenCalled();
  });
});
