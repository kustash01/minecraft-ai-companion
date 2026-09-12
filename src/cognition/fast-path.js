import logger from '../utils/logger.js';

export class FastPathRouter {
  constructor() {
    this.lastReflexTime = 0;
    this.reflexCooldownMs = 800;
  }

  /**
   * Evaluate if the current world state warrants an instant reflex action without LLM call.
   * @param {object} worldState
   * @param {object} botInstance - Mineflayer bot
   * @param {object} context - PersonalContextEngine instance
   * @returns {object} { handled: boolean, actionName: string|null, data: any }
   */
  evaluateReflex(worldState, botInstance, context = {}) {
    const now = Date.now();
    if (now - this.lastReflexTime < this.reflexCooldownMs) {
      return { handled: false, reason: 'cooldown' };
    }

    const hp = worldState.health;
    const food = worldState.food;
    const nearby = worldState.nearbyEntities || [];

    // 1. Extreme Danger: Creeper within 4 blocks
    const dangerousCreeper = nearby.find(e => e.name === 'creeper' && e.distance < 4);
    if (dangerousCreeper && botInstance) {
      this.lastReflexTime = now;
      logger.warn('[FAST-PATH] Reflex: Creeper within 4 blocks! Backing up and shielding.');
      return {
        handled: true,
        actionName: 'evade_creeper',
        data: { creeperPos: dangerousCreeper.position },
      };
    }

    // 2. Health Critical (< 6 HP) and Hostiles Nearby -> Retreat
    const hostileClose = nearby.find(e => ['zombie', 'skeleton', 'spider'].includes(e.name) && e.distance < 6);
    if (hp <= 6 && hostileClose) {
      this.lastReflexTime = now;
      logger.warn('[FAST-PATH] Reflex: Low HP in combat! Tactical retreat.');
      return {
        handled: true,
        actionName: 'tactical_retreat',
        data: { threatPos: hostileClose.position },
      };
    }

    // 3. Urgent Hunger (< 12 food) and Food Available
    if (food <= 12 && botInstance?.autoEat?.eat) {
      // autoEat plugin handles eating automatically
    }

    return { handled: false, reason: 'no_immediate_reflex' };
  }
}

export const fastPathRouter = new FastPathRouter();
