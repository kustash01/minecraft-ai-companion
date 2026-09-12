import { createLogger } from '../utils/logger.js';

const logger = createLogger('AI');

export class FriendshipSystem {
  constructor(memoryManager, ownerName = 'kustash01') {
    this.memoryManager = memoryManager;
    this.owner = ownerName;
    this.trustLevel = 50; // 0 - 100
    this.activityCounts = {
      mining: 0,
      building: 0,
      combat: 0,
      exploration: 0,
    };
  }

  load() {
    if (!this.memoryManager) return;
    const storedTrust = this.memoryManager.longTerm.getPlayerPreference('trust_level');
    if (storedTrust) this.trustLevel = parseInt(storedTrust, 10);

    const storedActivities = this.memoryManager.longTerm.getPlayerPreference('preferred_activities');
    if (storedActivities) {
      try {
        this.activityCounts = JSON.parse(storedActivities);
      } catch (e) {}
    }
  }

  recordActivity(type) {
    if (this.activityCounts[type] !== undefined) {
      this.activityCounts[type]++;
      this.trustLevel = Math.min(100, this.trustLevel + 1);
      this._save();
      logger.info(`[ДРУЖБА] Активность ${type} (+1). Уровень доверия: ${this.trustLevel}/100`);
    }
  }

  getFavoriteActivity() {
    let top = 'exploration';
    let max = 0;
    for (const [k, v] of Object.entries(this.activityCounts)) {
      if (v > max) {
        max = v;
        top = k;
      }
    }
    return top;
  }

  _save() {
    if (!this.memoryManager) return;
    this.memoryManager.longTerm.setPlayerPreference('trust_level', this.trustLevel);
    this.memoryManager.longTerm.setPlayerPreference('preferred_activities', this.activityCounts);
  }
}
