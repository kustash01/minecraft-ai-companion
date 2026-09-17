import { describe, it, expect, beforeEach } from 'vitest';
import vec3 from 'vec3';
import { CombatMicroEngine } from '../../../src/behavior/combat-micro-engine.js';
import { AdrenalineController } from '../../../src/behavior/adrenaline-controller.js';

describe('CombatMicroEngine — прыжковые криты, W-Tap, серкл-стрейф и пробивание щита', () => {
  let bot;
  let adrenaline;
  let combat;

  beforeEach(() => {
    bot = {
      health: 20,
      food: 20,
      entity: {
        position: vec3(0, 64, 0),
        velocity: vec3(0, -0.2, 0), // фаза падения
        onGround: false,
      },
      inventory: {
        items: () => [{ name: 'iron_axe' }]
      }
    };
    adrenaline = new AdrenalineController();
    combat = new CombatMicroEngine(bot, adrenaline);
  });

  it('оценивает готовность кулдауна оружия', () => {
    // В начале кулдаун не готов
    combat.lastAttackTime = Date.now();
    const notReady = combat.evaluateCooldownReadiness('sword');
    expect(typeof notReady.isReady).toBe('boolean');

    // Спустя 800мс меч полностью заряжен
    combat.lastAttackTime = Date.now() - 800;
    const ready = combat.evaluateCooldownReadiness('sword');
    expect(ready.isReady).toBe(true);
    expect(ready.cooldownPercent).toBe(1.0);
  });

  it('фиксирует крит в фазе падения (velocity.y < -0.05)', () => {
    bot.entity.velocity.y = -0.25;
    const res = combat.evaluateJumpCritStrike();
    expect(res.canStrike).toBe(true);
    expect(typeof res.isCrit).toBe('boolean');
    expect(typeof res.timingOffsetMs).toBe('number');
  });

  it('смазывает крит при ударе на взлёте прыжка (velocity.y > 0.05)', () => {
    bot.entity.velocity.y = 0.35; // активный взлёт
    const res = combat.evaluateJumpCritStrike();
    expect(res.isCrit).toBe(false);
    expect(res.reason).toContain('взлёт');
  });

  it('оценивает сброс спринта W-Tap', () => {
    const wTap = combat.evaluateWTapReset();
    expect(wTap.releaseDurationMs).toBeGreaterThan(15);
    expect(typeof wTap.successfulReset).toBe('boolean');
  });

  it('генерирует направления серкл-стрейфа', () => {
    const target = { position: vec3(2, 64, 2) };
    const move = combat.getCircleStrafeMove(target);
    expect(typeof move.strafeLeft).toBe('boolean');
    expect(typeof move.strafeRight).toBe('boolean');
    expect(move.strafeLeft !== move.strafeRight).toBe(true);
  });

  it('определяет необходимость пробивания щита топором', () => {
    const blockingEnemy = {
      metadata: [1], // 0x01 = blocking with shield
    };
    const check = combat.checkAxeShieldStun(blockingEnemy);
    expect(check.hasAxe).toBe(true);
    expect(check.shouldAxeStun).toBe(true);
  });
});
