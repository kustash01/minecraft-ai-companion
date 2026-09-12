import logger from '../utils/logger.js';

export class BaseStateManager {
  constructor() {
    this.homePoints = new Map(); // 'main_base' | 'outpost' | 'farm' | 'mine' | 'bed' | 'workshop' -> { x,y,z }
    this.securityScore = 0.8; // 0.0 - 1.0 (light levels + fencing)
    this.storageChestsCount = 0;
    this.farmsCount = 0;
  }

  setHomePoint(type, coords) {
    this.homePoints.set(type, { ...coords });
    logger.info(`[BASE] Home point registered: ${type} at (${coords.x}, ${coords.y}, ${coords.z})`);
  }

  getHomePoint(type = 'main_base') {
    return this.homePoints.get(type) || this.homePoints.get('main_base') || null;
  }

  getAllHomePoints() {
    const res = {};
    for (const [k, v] of this.homePoints.entries()) {
      res[k] = v;
    }
    return res;
  }
}

export const baseState = new BaseStateManager();
