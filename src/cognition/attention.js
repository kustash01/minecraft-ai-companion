import logger from '../utils/logger.js';

export const AttentionLevel = {
  FOREGROUND: 'FOREGROUND', // Active target / primary focus
  NEARBY: 'NEARBY',         // Immediate surroundings (0-8 blocks)
  BACKGROUND: 'BACKGROUND', // Ambient world state (8-32 blocks)
  MEMORY: 'MEMORY',         // Long-term recalled associations
};

export class AttentionManager {
  constructor(options = {}) {
    this.primaryFocus = null; // Current foreground focus { type, id, position, name }
    this.peripheralTargets = []; // High salience nearby objects
    this.focusLockedUntil = 0;
    this.lastGlanceTime = 0;
    this.glanceIntervalMs = options.glanceIntervalMs || 4000;
  }

  /**
   * Calculate the salience (prominence) score of a stimulus/entity.
   * @param {object} stimulus - { type, name, distance, isHostile, isPlayer, isRare, isHazard }
   * @param {object} context - { activeGoal, playerPosition, currentHealth }
   * @returns {number} Salience score between 0.0 and 1.0
   */
  calculateSalience(stimulus, context = {}) {
    let score = 0.1;

    // 1. Immediate Danger / Hostility
    if (stimulus.isHostile) {
      if (stimulus.name === 'creeper') score += 0.75;
      else if (stimulus.name === 'skeleton' || stimulus.name === 'witch') score += 0.55;
      else score += 0.45;

      // Distance multiplier
      if (stimulus.distance < 4) score += 0.3;
      else if (stimulus.distance < 8) score += 0.15;
    }

    // 2. Environmental Hazards (Lava / Falling / Fire)
    if (stimulus.isHazard) {
      score += 0.6;
    }

    // 3. Player Presence & Activity
    if (stimulus.isPlayer) {
      if (stimulus.distance < 3) score += 0.5;
      else if (stimulus.distance < 10) score += 0.3;
      if (stimulus.isSpeaking || stimulus.isInteracting) score += 0.4;
    }

    // 4. Rare Items / Valuable Ores
    if (stimulus.isRare || ['diamond', 'ancient_debris', 'emerald', 'gold_ore'].includes(stimulus.name)) {
      score += 0.5;
    }

    // 5. Goal Relevance
    if (context.activeGoal && stimulus.name && context.activeGoal.toLowerCase().includes(stimulus.name.toLowerCase())) {
      score += 0.35;
    }

    return Math.min(1.0, score);
  }

  /**
   * Evaluate nearby entities and blocks, categorizing into attention tiers.
   * @param {object} worldState
   * @param {object} context
   */
  updateAttention(worldState, context = {}) {
    const nearby = worldState.nearbyEntities || [];
    const scoredTargets = [];

    for (const ent of nearby) {
      const isHostile = ['zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman', 'drowned', 'pillager'].includes(ent.name);
      const isPlayer = ent.type === 'player';
      const salience = this.calculateSalience({
        type: ent.type,
        name: ent.name,
        distance: ent.distance,
        isHostile,
        isPlayer,
      }, context);

      scoredTargets.push({
        entity: ent,
        salience,
        tier: salience >= 0.7 ? AttentionLevel.FOREGROUND : (salience >= 0.35 ? AttentionLevel.NEARBY : AttentionLevel.BACKGROUND),
      });
    }

    // Sort descending by salience
    scoredTargets.sort((a, b) => b.salience - a.salience);

    this.peripheralTargets = scoredTargets.slice(0, 5);

    // If an emergency/high salience target appears (e.g. creeper < 6 blocks), take foreground focus
    const highest = scoredTargets[0];
    if (highest && highest.salience >= 0.8) {
      this.primaryFocus = highest;
    } else if (Date.now() > this.focusLockedUntil) {
      // Normal focus selection
      this.primaryFocus = highest || null;
    }

    return {
      foreground: this.primaryFocus,
      peripheral: this.peripheralTargets,
    };
  }

  /**
   * Lock attention onto a primary target for a specified duration.
   */
  lockFocus(target, durationMs = 3000) {
    this.primaryFocus = { entity: target, salience: 1.0, tier: AttentionLevel.FOREGROUND };
    this.focusLockedUntil = Date.now() + durationMs;
  }

  /**
   * Check if the bot should glance at peripheral surroundings.
   */
  shouldGlancePeriphery() {
    const now = Date.now();
    if (now - this.lastGlanceTime > this.glanceIntervalMs && !this.isFocusLocked()) {
      this.lastGlanceTime = now;
      return true;
    }
    return false;
  }

  isFocusLocked() {
    return Date.now() < this.focusLockedUntil;
  }
}
