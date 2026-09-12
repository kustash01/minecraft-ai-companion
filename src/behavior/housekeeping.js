import logger from '../utils/logger.js';

export class HousekeepingEngine {
  constructor() {
    this.lastCleanupTime = 0;
    this.cleanupCooldownMs = 1000 * 60 * 10; // 10 minutes cooldown after cleanup
  }

  /**
   * Calculate probability of deciding to sort chests or tidy inventory based on actual context.
   * @param {object} params
   * @param {number} params.disorderRatio - 0.0 (clean) to 1.0 (messy/scattered items in chests)
   * @param {boolean} params.isHome - true if currently at base
   * @param {boolean} params.hasUrgentGoal - true if actively building, fighting, or on an expedition
   * @param {number} params.habitScore - 0.0 to 1.0 (bot preference for cleanliness)
   * @returns {object} { shouldClean: boolean, probability: number, reason: string }
   */
  evaluateHousekeeping({
    disorderRatio = 0.5,
    isHome = true,
    hasUrgentGoal = false,
    habitScore = 0.6,
  } = {}) {
    if (!isHome) {
      return { shouldClean: false, probability: 0, reason: 'Не на базе' };
    }

    if (hasUrgentGoal) {
      return { shouldClean: false, probability: 0.02, reason: 'Есть срочная активная задача' };
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastCleanupTime;

    // Strong penalty if cleaned recently
    let recentPenalty = 0.0;
    if (timeSinceLast < this.cleanupCooldownMs) {
      recentPenalty = 0.85 * (1.0 - (timeSinceLast / this.cleanupCooldownMs));
    }

    // Dynamic formula
    const rawProb = (disorderRatio * 0.5) + (habitScore * 0.3) - recentPenalty;
    const finalProb = Math.max(0.01, Math.min(0.90, rawProb));

    const roll = Math.random();
    const shouldClean = roll <= finalProb;

    if (shouldClean) {
      this.lastCleanupTime = now;
      logger.info(`[HOUSEKEEPING] Decided to do natural chest cleanup (Prob: ${(finalProb * 100).toFixed(1)}%)`);
    }

    return {
      shouldClean,
      probability: finalProb,
      reason: shouldClean ? 'Пора навести порядок в сундуках' : 'Сундуки пока в нормальном состоянии или недавно убирались',
    };
  }

  recordManualRequest() {
    this.lastCleanupTime = 0; // Reset cooldown when player directly requests cleanup
  }
}

export const housekeeping = new HousekeepingEngine();
