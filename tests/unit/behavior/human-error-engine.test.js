import { describe, it, expect } from 'vitest';
import { HumanErrorEngine } from '../../../src/behavior/human-error-engine.js';

describe('HumanErrorEngine — психофизиологическое моделирование погрешностей', () => {
  it('генерирует Гауссово распределение вокруг среднего (Бокс-Мюллер)', () => {
    const samples = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(HumanErrorEngine.gaussian(100, 10));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(98);
    expect(mean).toBeLessThan(102);
  });

  it('рассчитывает стресс и усталость на основе физиологии (HP, голод, враги)', () => {
    const calmBot = {
      health: 20,
      food: 20,
      foodSaturation: 5,
      entities: {},
    };
    const calmState = HumanErrorEngine.getPsychophysiologicalState(calmBot);
    expect(calmState.stress).toBeLessThan(0.15);
    expect(calmState.fatigue).toBeLessThan(0.15);
    expect(calmState.focus).toBeGreaterThan(0.85);

    const panickedBot = {
      health: 4, // критическое здоровье (< 6)
      food: 4,   // истощение (< 6)
      foodSaturation: 0,
      entity: { position: { distanceTo: () => 3 } },
      entities: {
        1: { name: 'zombie', position: { x: 1, y: 0, z: 1 } },
        2: { name: 'skeleton', position: { x: 2, y: 0, z: 2 } },
      },
    };
    const panickedState = HumanErrorEngine.getPsychophysiologicalState(panickedBot);
    expect(panickedState.stress).toBeGreaterThan(0.6);
    expect(panickedState.fatigue).toBeGreaterThan(0.6);
    expect(panickedState.focus).toBeLessThan(0.4);
  });

  it('оценивает тайминг прыжкового крита (Jump Crit) без плоского Math.random', () => {
    const bot = { health: 20, food: 20, foodSaturation: 5 };
    const evalResult = HumanErrorEngine.evaluateCritTiming(bot);
    expect(typeof evalResult.isCrit).toBe('boolean');
    expect(typeof evalResult.timingOffsetMs).toBe('number');
    expect(typeof evalResult.reason).toBe('string');
  });

  it('оценивает реакцию на поднятие щита и судорожное опускание', () => {
    const calmBot = { health: 20, food: 20, foodSaturation: 5 };
    const calmEval = HumanErrorEngine.evaluateShieldReaction(calmBot);
    expect(calmEval.reactionDelayMs).toBeGreaterThanOrEqual(40);
    expect(calmEval.earlyDrop).toBe(false);

    const highPanicBot = { health: 2, food: 2, foodSaturation: 0 };
    const panicEval = HumanErrorEngine.evaluateShieldReaction(highPanicBot);
    expect(panicEval.reactionDelayMs).toBeGreaterThan(calmEval.reactionDelayMs);
  });

  it('моделирует оценку зоны досягаемости и холостые взмахи (Attack Reach / Whiff)', () => {
    const bot = { health: 20, food: 20, foodSaturation: 5 };

    // В упор (2.0м) — гарантированный взмах по цели
    const closeHit = HumanErrorEngine.evaluateAttackReach(bot, 2.0);
    expect(closeHit.shouldSwing).toBe(true);
    expect(closeHit.isWhiff).toBe(false);

    // Слишком далеко (4.5м) — игрок не машет по воздуху, а сближается
    const tooFar = HumanErrorEngine.evaluateAttackReach(bot, 4.5);
    expect(tooFar.shouldSwing).toBe(false);
  });

  it('добавляет микро-дрожание мыши (Mouse Jitter) на основе нормального распределения', () => {
    const bot = { health: 10, food: 10, foodSaturation: 2 };
    const rawYaw = 1.0;
    const rawPitch = 0.5;
    const jittered = HumanErrorEngine.applyMouseJitter(bot, rawYaw, rawPitch);
    expect(jittered.yaw).not.toBe(rawYaw);
    expect(jittered.pitch).toBeGreaterThanOrEqual(-Math.PI / 2);
    expect(jittered.pitch).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('рассчитывает время поиска в захламлённом сундуке и задержку крафта', () => {
    const bot = { health: 18, food: 18, foodSaturation: 3 };
    const chestScan = HumanErrorEngine.evaluateChestSearchDelay(27, bot);
    expect(chestScan.delayMs).toBeGreaterThan(150);

    const craftHesitation = HumanErrorEngine.evaluateCraftingHesitation(bot, 2);
    expect(craftHesitation).toBeGreaterThan(50);
  });

  it('рассчитывает Гауссову паузу геймера вместо плоского рандома', () => {
    const pause = HumanErrorEngine.evaluateGamerPause(200, 500);
    expect(pause).toBeGreaterThanOrEqual(200);
    expect(pause).toBeLessThanOrEqual(500);
  });

  it('предоставляет биометрические методы chance, range, jitter, coinFlip, choice', () => {
    expect(HumanErrorEngine.chance(0)).toBe(false);
    expect(HumanErrorEngine.chance(1)).toBe(true);
    expect(typeof HumanErrorEngine.chance(0.5)).toBe('boolean');

    const ranged = HumanErrorEngine.range(100, 200);
    expect(ranged).toBeGreaterThanOrEqual(100);
    expect(ranged).toBeLessThanOrEqual(200);

    const jitterVal = HumanErrorEngine.jitter(0.1);
    expect(jitterVal).toBeGreaterThanOrEqual(-0.1);
    expect(jitterVal).toBeLessThanOrEqual(0.1);

    const coin = HumanErrorEngine.coinFlip();
    expect([1, -1]).toContain(coin);

    const choice = HumanErrorEngine.choice(['a', 'b', 'c']);
    expect(['a', 'b', 'c']).toContain(choice);
  });
});
