import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSystem, SkillNames } from '../../../src/behavior/player-simulation/skill-system.js';
import { MuscleMemoryEngine } from '../../../src/behavior/player-simulation/muscle-memory.js';
import { InventoryHabitsManager } from '../../../src/behavior/player-simulation/inventory-habits.js';
import { HumanErrorEngine } from '../../../src/behavior/player-simulation/mistakes.js';
import { EmotionalStateEngine } from '../../../src/personality/emotional-state.js';

describe('SkillSystem', () => {
  let sys;
  beforeEach(() => {
    sys = new SkillSystem();
  });

  it('should perform skill check and record practice', () => {
    const res = sys.checkSkill(SkillNames.MLG_WATER, {
      situationMod: 1.0,
      stressMod: 0.8,
    });
    expect(res.probability).toBeGreaterThan(0.1);
    expect(res.probability).toBeLessThanOrEqual(0.98);
    expect(res.practice).toBeGreaterThanOrEqual(1);
  });

  it('should calculate lower probability under high stress and poor equipment', () => {
    const resCalm = sys.checkSkill(SkillNames.PARKOUR, { stressMod: 1.0, equipmentMod: 1.0 });
    const resPanicked = sys.checkSkill(SkillNames.PARKOUR, { stressMod: 0.5, equipmentMod: 0.8 });
    expect(resPanicked.probability).toBeLessThan(resCalm.probability);
  });
});

describe('MuscleMemoryEngine', () => {
  let mm;
  beforeEach(() => {
    mm = new MuscleMemoryEngine();
  });

  it('should execute habituated sequence', async () => {
    let executed = false;
    mm.registerSequence('quick_torch_craft', async () => {
      executed = true;
      return { crafted: 4 };
    });

    const res = await mm.executeHabit('quick_torch_craft');
    expect(res.success).toBe(true);
    expect(executed).toBe(true);
  });
});

describe('InventoryHabitsManager', () => {
  let habits;
  beforeEach(() => {
    habits = new InventoryHabitsManager();
  });

  it('should map sword to slot 0 and water bucket to slot 6', () => {
    expect(habits.getIdealSlot('diamond_sword')).toBe(0);
    expect(habits.getIdealSlot('water_bucket')).toBe(6);
    expect(habits.getIdealSlot('cooked_beef')).toBe(7);
  });
});

describe('HumanErrorEngine', () => {
  it('should have higher lapse probability under extreme stress', () => {
    const errorEngine = new HumanErrorEngine();
    let lapsesInCalm = 0;
    let lapsesInStress = 0;

    for (let i = 0; i < 200; i++) {
      if (errorEngine.evaluateLapse({ stress: 0.0, isRushing: false }).hasLapse) lapsesInCalm++;
      if (errorEngine.evaluateLapse({ stress: 1.0, isRushing: true }).hasLapse) lapsesInStress++;
    }

    expect(lapsesInStress).toBeGreaterThan(lapsesInCalm);
  });
});

describe('EmotionalStateEngine', () => {
  let emo;
  beforeEach(() => {
    emo = new EmotionalStateEngine();
  });

  it('should increase stress on damage and recover on success', () => {
    const initialStress = emo.getMood().stress;
    emo.onDamageTaken(4);
    expect(emo.getMood().stress).toBeGreaterThan(initialStress);

    emo.onSuccess();
    expect(emo.getMood().confidence).toBeGreaterThan(0.6);
  });
});

describe('BehavioralVarianceEngine', () => {
  it('should select actions with diversity and apply recent action penalty', async () => {
    const { BehavioralVarianceEngine } = await import('../../../src/behavior/variance.js');
    const variance = new BehavioralVarianceEngine();

    const candidates = [
      { name: 'eat', baseValue: 1.0 },
      { name: 'mine', baseValue: 1.0 },
      { name: 'build', baseValue: 1.0 },
    ];

    const chosen1 = variance.selectActionWithVariance(candidates);
    expect(chosen1).toBeDefined();

    const selectedSet = new Set();
    for (let i = 0; i < 30; i++) {
      const c = variance.selectActionWithVariance(candidates);
      selectedSet.add(c.name);
    }
    expect(selectedSet.size).toBe(3); // All options were explored naturally
  });
});

describe('HousekeepingEngine', () => {
  it('should calculate cleanup probability and respect recent cleanup cooldown', async () => {
    const { HousekeepingEngine } = await import('../../../src/behavior/housekeeping.js');
    const hk = new HousekeepingEngine();

    const res1 = hk.evaluateHousekeeping({ disorderRatio: 0.8, isHome: true, hasUrgentGoal: false });
    expect(res1.probability).toBeGreaterThan(0.2);

    if (res1.shouldClean) {
      // Immediate next check should have near zero probability due to recent cleanup penalty
      const res2 = hk.evaluateHousekeeping({ disorderRatio: 0.8, isHome: true, hasUrgentGoal: false });
      expect(res2.probability).toBeLessThan(res1.probability);
    }
  });
});
