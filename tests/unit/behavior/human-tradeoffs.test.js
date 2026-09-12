import { describe, it, expect } from 'vitest';
import { HumanTradeoffs } from '../../../src/behavior/human-tradeoffs.js';

describe('HumanTradeoffs (Contextual decisions without arbitrary RNG dice rolls)', () => {
  describe('Tool conservation vs Survival sacrifice', () => {
    it('should sacrifice a cheap stone pickaxe to escape a pit trap', () => {
      const cheapTool = {
        name: 'stone_pickaxe',
        maxDurability: 131,
        durabilityUsed: 129, // 2 hits left!
      };

      const decision = HumanTradeoffs.evaluateToolUsage({
        tool: cheapTool,
        isTrapped: true,
        nearbyTeammate: 'kustash01',
      });

      expect(decision.action).toBe('sacrifice_to_escape');
      expect(decision.reason).toBe('freedom_over_cheap_tool');
    });

    it('should call teammate for help instead of breaking a Silk Touch pickaxe', () => {
      const preciousTool = {
        name: 'diamond_pickaxe',
        maxDurability: 1561,
        durabilityUsed: 1555,
        nbt: {
          value: {
            Enchantments: {
              value: {
                value: [{ id: { value: 'minecraft:silk_touch' }, lvl: { value: 1 } }],
              },
            },
          },
        },
      };

      const decision = HumanTradeoffs.evaluateToolUsage({
        tool: preciousTool,
        isTrapped: true,
        nearbyTeammate: 'kustash01',
      });

      expect(decision.action).toBe('call_teammate_for_help');
      expect(decision.teammate).toBe('kustash01');
      expect(decision.reason).toBe('precious_tool_needs_help');
    });
  });

  describe('Door & Gate contextual behavior', () => {
    it('should leave doors wide open when fleeing from danger', () => {
      const decision = HumanTradeoffs.evaluateDoorDecision({
        isRunningFromThreat: true,
        isShuttlingItems: false,
      });

      expect(decision.closeDoor).toBe(false);
      expect(decision.reason).toBe('fleeing_for_life');
    });

    it('should leave doors open when actively shuttling items between storage and chests', () => {
      const decision = HumanTradeoffs.evaluateDoorDecision({
        isRunningFromThreat: false,
        isShuttlingItems: true,
      });

      expect(decision.closeDoor).toBe(false);
      expect(decision.reason).toBe('shuttling_between_chests');
    });

    it('should close door to secure base in peaceful conditions', () => {
      const decision = HumanTradeoffs.evaluateDoorDecision({
        isRunningFromThreat: false,
        isShuttlingItems: false,
        lastPassTime: 0,
      });

      expect(decision.closeDoor).toBe(true);
      expect(decision.reason).toBe('secure_base');
    });
  });

  describe('Food sharing and cure prioritization', () => {
    it('should share high-quality food with an injured teammate', () => {
      const mockBot = {
        version: '1.20.1',
        health: 20,
        food: 20,
        inventory: {
          items: () => [
            { name: 'bread', count: 10 },
            { name: 'golden_carrot', count: 16 },
          ],
        },
      };

      const decision = HumanTradeoffs.evaluateFoodDecision(mockBot, {
        nearbyTeammate: 'kustash01',
        teammateHealth: 6, // Low HP!
      });

      expect(decision.action).toBe('share_with_teammate');
      expect(decision.recipient).toBe('kustash01');
      expect(decision.item.name).toBe('golden_carrot');
    });

    it('should prioritize drinking milk when afflicted with poison', () => {
      const poisonedBot = {
        version: '1.20.1',
        health: 12,
        food: 15,
        inventory: {
          items: () => [
            { name: 'bread', count: 5 },
            { name: 'milk_bucket', count: 1 },
          ],
        },
      };

      const decision = HumanTradeoffs.evaluateFoodDecision(poisonedBot, {
        activeEffects: [{ name: 'poison' }],
      });

      expect(decision.action).toBe('drink_cure');
      expect(decision.item.name).toBe('milk_bucket');
    });
  });

  describe('Torch conservation and intersection placement', () => {
    it('should conserve torches when <= 3 and in a regular corridor', () => {
      const decision = HumanTradeoffs.evaluateTorchDecision({
        torchCount: 2,
        isDark: true,
        inCave: true,
        isIntersection: false,
        timeSinceLastTorch: 10000,
      });

      expect(decision.shouldPlace).toBe(false);
      expect(decision.reason).toBe('conserving_scarce_torches');
    });

    it('should place a scarce torch at a cave intersection/fork', () => {
      const decision = HumanTradeoffs.evaluateTorchDecision({
        torchCount: 2,
        isDark: true,
        inCave: true,
        isIntersection: true,
        timeSinceLastTorch: 20000,
      });

      expect(decision.shouldPlace).toBe(true);
      expect(decision.reason).toBe('scarce_torches_save_for_intersection');
    });

    it('should place torches regularly when inventory has ample supply', () => {
      const decision = HumanTradeoffs.evaluateTorchDecision({
        torchCount: 32,
        isDark: true,
        inCave: true,
        isIntersection: false,
        timeSinceLastTorch: 9000,
      });

      expect(decision.shouldPlace).toBe(true);
      expect(decision.reason).toBe('normal_cave_lighting');
    });
  });
});
