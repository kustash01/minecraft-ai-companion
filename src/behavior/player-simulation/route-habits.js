import logger from '../../utils/logger.js';

export class RouteHabitsManager {
  constructor() {
    this.familiarRoutes = new Map(); // 'base_to_mine' -> [{x,y,z}, ...]
    this.visitCounts = new Map();
  }

  /**
   * Register or record a familiar walking route.
   */
  recordRoute(name, waypoints) {
    this.familiarRoutes.set(name, waypoints);
    this.visitCounts.set(name, (this.visitCounts.get(name) || 0) + 1);
    logger.debug(`[ROUTE-HABIT] Learned familiar route: ${name} (${waypoints.length} waypoints)`);
  }

  /**
   * Retrieve a known familiar route.
   */
  getRoute(name) {
    return this.familiarRoutes.get(name) || null;
  }

  hasRoute(name) {
    return this.familiarRoutes.has(name);
  }
}

export const routeHabits = new RouteHabitsManager();
