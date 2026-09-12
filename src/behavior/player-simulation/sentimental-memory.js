import logger from '../../utils/logger.js';

export class SentimentalMemoryManager {
  constructor() {
    this.cherishedItems = new Map(); // itemName -> { story, attachedAt, importance }
    this.specialLocations = new Map(); // locationName -> { story, coords, biome }
  }

  attachItemStory(itemName, story) {
    this.cherishedItems.set(itemName, {
      story,
      attachedAt: Date.now(),
      importance: 'high',
    });
    logger.info(`[SENTIMENTAL] Cherished item remembered: ${itemName} ("${story}")`);
  }

  isItemCherished(itemName) {
    return this.cherishedItems.has(itemName);
  }

  getItemStory(itemName) {
    return this.cherishedItems.get(itemName) || null;
  }
}

export const sentimentalMemory = new SentimentalMemoryManager();
