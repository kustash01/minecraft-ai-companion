import logger from '../utils/logger.js';

export class LongTermProjectManager {
  constructor() {
    this.projects = new Map(); // id -> { name, style, bom: { item: count }, progress: 0-100, status }
  }

  createProject(id, name, style = 'simple', bom = {}) {
    this.projects.set(id, {
      id,
      name,
      style,
      bom, // Bill of materials e.g. { oak_planks: 120, cobblestone: 64, glass: 16 }
      collected: {},
      progress: 0,
      status: 'planned', // 'planned' | 'gathering' | 'building' | 'completed'
      createdAt: Date.now(),
    });
    logger.info(`[PROJECT] New project created: "${name}" (${style})`);
  }

  getProject(id) {
    return this.projects.get(id) || null;
  }

  /**
   * Calculate missing materials given current inventory.
   */
  calculateMissingMaterials(projectId, inventoryItems = []) {
    const proj = this.projects.get(projectId);
    if (!proj) return {};

    const currentCounts = {};
    for (const it of inventoryItems) {
      currentCounts[it.name] = (currentCounts[it.name] || 0) + it.count;
    }

    const missing = {};
    for (const [item, req] of Object.entries(proj.bom)) {
      const have = currentCounts[item] || 0;
      if (have < req) {
        missing[item] = req - have;
      }
    }

    return missing;
  }
}

export const projectManager = new LongTermProjectManager();
