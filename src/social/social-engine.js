import logger from '../utils/logger.js';

export class SocialEngine {
  constructor() {
    this.itemReservations = new Map(); // itemName -> { count, purpose, reservedBy, reservedAt }
    this.activePromises = []; // [{ promiseText, player, createdAt }]
  }

  /**
   * Reserve a specific item stack for a project or player.
   */
  reserveItem(itemName, count, purpose = 'project', reservedBy = 'player') {
    const current = this.itemReservations.get(itemName)?.count || 0;
    this.itemReservations.set(itemName, {
      count: current + count,
      purpose,
      reservedBy,
      reservedAt: Date.now(),
    });
    logger.info(`[SOCIAL] Reserved ${count}x ${itemName} for "${purpose}" by ${reservedBy}`);
  }

  /**
   * Get total reserved quantity of an item.
   */
  getReservedCount(itemName) {
    return this.itemReservations.get(itemName)?.count || 0;
  }

  /**
   * Release reserved items.
   */
  releaseReservation(itemName, count = null) {
    if (!this.itemReservations.has(itemName)) return;
    if (count === null || count >= this.itemReservations.get(itemName).count) {
      this.itemReservations.delete(itemName);
    } else {
      this.itemReservations.get(itemName).count -= count;
    }
  }

  /**
   * Record a social promise made to a player.
   */
  addPromise(player, promiseText) {
    this.activePromises.push({
      player,
      promiseText,
      createdAt: Date.now(),
    });
    logger.info(`[SOCIAL] Promise recorded to ${player}: "${promiseText}"`);
  }

  getPromises() {
    return [...this.activePromises];
  }
}

export const socialEngine = new SocialEngine();
