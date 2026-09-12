import { describe, it, expect, beforeEach } from 'vitest';
import { BuildingEngine, BuildingStyles } from '../../../src/building/building-engine.js';
import { CraftPlanner } from '../../../src/crafting/craft-planner.js';
import { TacticalCombatAI } from '../../../src/combat/combat-ai.js';
import { MissionSystem, MissionTypes } from '../../../src/missions/mission-system.js';

describe('BuildingEngine', () => {
  let builder;
  beforeEach(() => {
    builder = new BuildingEngine();
  });

  it('should generate a valid 5x5 blueprint with door, windows, and torch', () => {
    const bp = builder.generateBlueprint(BuildingStyles.SIMPLE, { width: 5, length: 5, height: 4 }, 'oak_planks');
    expect(bp.style).toBe('simple');
    expect(bp.totalBlocks).toBeGreaterThan(30);

    const hasTorch = bp.blocks.some(b => b.block === 'torch');
    const hasGlass = bp.blocks.some(b => b.block === 'glass');
    expect(hasTorch).toBe(true);
    expect(hasGlass).toBe(true);
  });
});

describe('CraftPlanner', () => {
  let planner;
  beforeEach(() => {
    planner = new CraftPlanner();
  });

  it('should resolve recursive crafting tree for wooden pickaxe from logs', () => {
    const res = planner.resolveCraftTree('wooden_pickaxe', 1, {});
    expect(res.rawRequired.oak_log).toBeGreaterThan(0);
    expect(res.craftingSteps.length).toBeGreaterThanOrEqual(3); // planks -> sticks -> wooden_pickaxe
  });
});

describe('TacticalCombatAI', () => {
  let combat;
  beforeEach(() => {
    combat = new TacticalCombatAI();
  });

  it('should rank high-threat creeper and mobs attacking player highest', () => {
    const mobs = [
      { name: 'zombie', distance: 10, position: { x: 10, y: 64, z: 20 } },
      { name: 'creeper', distance: 3, position: { x: 2, y: 64, z: 2 } },
    ];
    const ranked = combat.rankTargets(mobs, { x: 0, y: 64, z: 0 });
    expect(ranked[0].name).toBe('creeper');
  });

  it('should check pillar safety against nearby elevated blocks', () => {
    const worldWithLedge = {
      nearbyBlocks: [{ x: 1, y: 65, z: 0 }],
    };
    const res = combat.verifyPillarSafety({ x: 0, y: 64, z: 0 }, worldWithLedge);
    expect(res.isSafe).toBe(false);
  });
});

describe('MissionSystem', () => {
  let ms;
  beforeEach(() => {
    ms = new MissionSystem();
  });

  it('should track multi-step mission progress', () => {
    ms.startMission(MissionTypes.BUILD, 'Построить ферму', ['Найти место', 'Вскопать землю', 'Посадить семена']);
    expect(ms.getActiveMission().progress).toBe(0);

    ms.completeStep();
    expect(ms.getActiveMission().progress).toBe(33);
    ms.completeStep();
    ms.completeStep();
    expect(ms.getActiveMission().status).toBe('completed');
  });
});
