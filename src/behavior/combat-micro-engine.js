import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('COMBAT_MICRO_ENGINE');

/**
 * CombatMicroEngine ? ?????-???????? ???????? ? ?????????????? ??? Minecraft 1.9+.
 * 
 * ????????:
 * 1. ????????? ????? ? ?????????? ????????? velocity.y ? ?????? ????????? ?? ??????/???????.
 * 2. W-Tap / S-Tap ????? ??????? ??? ????????????? ??????? ? ????????????? ????????????? ????????? ??????.
 * 3. ?????-?????? ?????? ???????? ? ?????????? ?? ?????.
 * 4. ?????????? ???? ??????? (Axe Shield Disable).
 */
export class CombatMicroEngine {
  constructor(bot, adrenalineController = null) {
    this.bot = bot;
    this.adrenaline = adrenalineController;
    this.lastAttackTime = 0;
    this.strafeDirection = 1;
    this.lastStrafeSwitch = Date.now();
  }

  evaluateCooldownReadiness(weaponType = 'sword') {
    const now = Date.now();
    const baseCooldownMs = weaponType === 'axe' ? 1000 : 625;
    const elapsed = now - this.lastAttackTime;
    const cooldownPercent = Math.min(1.0, elapsed / baseCooldownMs);

    if (cooldownPercent >= 0.98) {
      return { isReady: true, cooldownPercent: 1.0, prematureSwing: false };
    }

    const state = HumanErrorEngine.getPsychophysiologicalState(this.bot);
    const impatienceNoise = HumanErrorEngine.gaussian(state.stress * 0.4, 0.12);

    if (cooldownPercent >= 0.78 && impatienceNoise > 0.32) {
      logger.debug(`[COMBAT] ???????????? ???? ?? ??????? ???????? (${(cooldownPercent * 100).toFixed(0)}%, ????????? ????)`);
      return { isReady: true, cooldownPercent, prematureSwing: true };
    }

    return { isReady: false, cooldownPercent, prematureSwing: false };
  }

  evaluateJumpCritStrike() {
    const botVelocityY = this.bot?.entity?.velocity?.y ?? 0;
    const timingEval = HumanErrorEngine.evaluateCritTiming(this.bot);

    if (timingEval.timingOffsetMs < -45 || botVelocityY > 0.05) {
      return {
        canStrike: true,
        isCrit: false,
        timingOffsetMs: timingEval.timingOffsetMs,
        reason: 'удар на взлёте прыжка (ранний клик, нет крита)',
      };
    }

    if (timingEval.timingOffsetMs > 65 || (this.bot?.entity?.onGround && botVelocityY >= 0)) {
      return {
        canStrike: true,
        isCrit: false,
        timingOffsetMs: timingEval.timingOffsetMs,
        reason: 'удар после приземления (запоздалый клик, нет крита)',
      };
    }

    return {
      canStrike: true,
      isCrit: true,
      timingOffsetMs: timingEval.timingOffsetMs,
      reason: 'идеальный крит в фазе падения',
    };
  }

  evaluateWTapReset() {
    const state = HumanErrorEngine.getPsychophysiologicalState(this.bot);
    const efficiency = this.adrenaline ? this.adrenaline.getYerkesDodsonEfficiency() : 0.85;

    const baseRelease = 50 + (1.0 - efficiency) * 35 + state.fatigue * 25;
    const releaseDurationMs = Math.max(15, Math.round(HumanErrorEngine.gaussian(baseRelease, 15)));

    if (releaseDurationMs < 25) {
      return {
        releaseDurationMs,
        successfulReset: false,
        reason: 'слишком короткое касание W (спринт не сбросился)',
      };
    }
    if (releaseDurationMs > 105) {
      return {
        releaseDurationMs,
        successfulReset: false,
        reason: 'палец задержался на сбросе (потеря скорости)',
      };
    }

    return {
      releaseDurationMs,
      successfulReset: true,
      reason: 'чистый W-Tap с максимальным нокбеком',
    };
  }

  getCircleStrafeMove(targetEntity) {
    const now = Date.now();
    const switchInterval = HumanErrorEngine.gaussian(1800, 300);

    let switchOccurred = false;
    if (now - this.lastStrafeSwitch > switchInterval) {
      this.strafeDirection = -this.strafeDirection;
      this.lastStrafeSwitch = now;
      switchOccurred = true;
    }

    return {
      strafeLeft: this.strafeDirection === -1,
      strafeRight: this.strafeDirection === 1,
      switchOccurred,
    };
  }

  checkAxeShieldStun(targetEntity) {
    if (!targetEntity) return { shouldAxeStun: false, hasAxe: false };

    const isBlocking = Boolean(targetEntity.metadata && (Number(targetEntity.metadata[0]) & 0x01) !== 0);
    const hasAxe = Boolean(this.bot?.inventory?.items()?.some(i => i.name.includes('_axe')));

    return {
      shouldAxeStun: isBlocking && hasAxe,
      hasAxe,
    };
  }

  recordAttack() {
    this.lastAttackTime = Date.now();
  }
}
