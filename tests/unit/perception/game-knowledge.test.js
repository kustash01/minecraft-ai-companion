import { describe, it, expect } from 'vitest';
import { FoodKnowledge, ToolKnowledge, ThreatKnowledge } from '../../../src/perception/game-knowledge.js';

describe('FoodKnowledge (Universal minecraft-data food analyzer)', () => {
  it('should identify food profiles across all tiers and special mechanics', () => {
    const gCarrot = FoodKnowledge.getFoodProfile('golden_carrot');
    expect(gCarrot.tier).toBe('elite_combat');
    expect(gCarrot.saturation).toBe(14.4);
    expect(gCarrot.foodPoints).toBe(6);

    const gApple = FoodKnowledge.getFoodProfile('golden_apple');
    expect(gApple.heals).toBe(true);
    expect(gApple.grantsEffects).toContain('regeneration');

    const milk = FoodKnowledge.getFoodProfile('milk_bucket');
    expect(milk.clearsEffects).toBe(true);

    const honey = FoodKnowledge.getFoodProfile('honey_bottle');
    expect(honey.clearsEffects).toBe(true);

    const chorus = FoodKnowledge.getFoodProfile('chorus_fruit');
    expect(chorus.tier).toBe('teleport_escape');

    const puffer = FoodKnowledge.getFoodProfile('pufferfish');
    expect(puffer.isHazard).toBe(true);

    const bread = FoodKnowledge.getFoodProfile('bread');
    expect(bread.foodPoints).toBe(5);
    expect(bread.isHazard).toBe(false);
  });

  it('should intelligently select the best food for different survival contexts', () => {
    const mockBot = {
      version: '1.20.1',
      inventory: {
        items: () => [
          { name: 'bread', count: 5 },
          { name: 'golden_carrot', count: 16 },
          { name: 'golden_apple', count: 3 },
          { name: 'milk_bucket', count: 1 },
          { name: 'pufferfish', count: 2 },
        ],
      },
    };

    // 1. Poisoned context -> chooses milk_bucket
    const cureFood = FoodKnowledge.selectBestFood(mockBot, { activeEffects: ['poison'] });
    expect(cureFood.name).toBe('milk_bucket');

    // 2. Critical combat context (HP < 10) -> chooses golden_apple
    const emergencyFood = FoodKnowledge.selectBestFood(mockBot, { inCombat: true, health: 6 });
    expect(emergencyFood.name).toBe('golden_apple');

    // 3. Normal combat context -> chooses golden_carrot (elite saturation)
    const combatFood = FoodKnowledge.selectBestFood(mockBot, { inCombat: true, health: 18 });
    expect(combatFood.name).toBe('golden_carrot');

    // 4. Peaceful snack -> prefers high saturation (golden_carrot over bread)
    const snack = FoodKnowledge.selectBestFood(mockBot, { inCombat: false, health: 20 });
    expect(snack.name).toBe('golden_carrot');
  });

  it('should fallback to rotten flesh only when dying of starvation', () => {
    const starvingBot = {
      version: '1.20.1',
      inventory: {
        items: () => [{ name: 'rotten_flesh', count: 4 }],
      },
    };

    // Not dying yet -> returns null (avoids food poisoning)
    const normalCheck = FoodKnowledge.selectBestFood(starvingBot, { foodLevel: 10, health: 20 });
    expect(normalCheck).toBeNull();

    // Starving to death (food = 0, health < 10) -> eats rotten flesh
    const survivalCheck = FoodKnowledge.selectBestFood(starvingBot, { foodLevel: 0, health: 5 });
    expect(survivalCheck).not.toBeNull();
    expect(survivalCheck.name).toBe('rotten_flesh');
  });
});

describe('ToolKnowledge (Material tiers, durability and enchantments)', () => {
  it('should classify precious tools vs cheap disposable tools', () => {
    const netheritePick = {
      name: 'netherite_pickaxe',
      maxDurability: 2031,
      durabilityUsed: 50,
    };
    const valNetherite = ToolKnowledge.getToolValue(netheritePick);
    expect(valNetherite.materialTier).toBe(6);
    expect(valNetherite.isPrecious).toBe(true);
    expect(valNetherite.canSacrifice).toBe(false);

    const stonePick = {
      name: 'stone_pickaxe',
      maxDurability: 131,
      durabilityUsed: 120,
    };
    const valStone = ToolKnowledge.getToolValue(stonePick);
    expect(valStone.materialTier).toBe(2);
    expect(valStone.isPrecious).toBe(false);
    expect(valStone.canSacrifice).toBe(true);
  });

  it('should recognize high-value enchantments like Mending, Silk Touch, and Fortune', () => {
    const ironPickWithMending = {
      name: 'iron_pickaxe',
      maxDurability: 250,
      durabilityUsed: 240,
      nbt: {
        value: {
          Enchantments: {
            value: {
              value: [
                { id: { value: 'minecraft:mending' }, lvl: { value: 1 } },
                { id: { value: 'minecraft:unbreaking' }, lvl: { value: 3 } },
              ],
            },
          },
        },
      },
    };

    const val = ToolKnowledge.getToolValue(ironPickWithMending);
    expect(val.hasMending).toBe(true);
    expect(val.isPrecious).toBe(true);
    expect(val.canSacrifice).toBe(false);
    expect(val.durabilityLeft).toBe(10);
  });
});

describe('ThreatKnowledge (Mob lethality and combat profiles)', () => {
  it('should evaluate lethality, explosion risk, and axe-wielders', () => {
    const botPos = { x: 0, y: 64, z: 0 };

    const creeper = { name: 'creeper', position: { x: 2, y: 64, z: 0 } };
    const creeperThreat = ThreatKnowledge.evaluateEntityThreat(creeper, botPos);
    expect(creeperThreat.threatLevel).toBe(9);
    expect(creeperThreat.isExplosive).toBe(true);
    expect(creeperThreat.isLethal).toBe(true);

    const vindicator = { name: 'vindicator', position: { x: 1.5, y: 64, z: 0 } };
    const vindicatorThreat = ThreatKnowledge.evaluateEntityThreat(vindicator, botPos);
    expect(vindicatorThreat.isAxeWielder).toBe(true);
    expect(vindicatorThreat.threatLevel).toBeGreaterThanOrEqual(10); // Close range bonus

    const skeleton = { name: 'skeleton', position: { x: 12, y: 64, z: 0 } };
    const skeletonThreat = ThreatKnowledge.evaluateEntityThreat(skeleton, botPos);
    expect(skeletonThreat.isRanged).toBe(true);
    expect(skeletonThreat.threatLevel).toBe(7);
  });
});
