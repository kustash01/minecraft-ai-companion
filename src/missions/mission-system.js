import logger from '../utils/logger.js';

export const MissionTypes = {
  EXPLORE: 'Explore',
  GATHER: 'Gather',
  BUILD: 'Build',
  MINE: 'Mine',
  PROTECT: 'Protect',
  FARM: 'Farm',
  TRADE: 'Trade',
  RECOVER: 'Recover',
  TRAVEL: 'Travel',
  FIND_STRUCTURE: 'FindStructure',
  EXPEDITION: 'Expedition',
};

export class MissionSystem {
  constructor() {
    this.activeMission = null;
    this.completedMissions = [];
  }

  /**
   * Create and launch a structured mission with checkpoints.
   */
  startMission(type, objective, steps = [], requirements = {}) {
    this.activeMission = {
      id: `mission-${Date.now()}`,
      type,
      objective,
      steps: steps.map((s, idx) => ({ id: idx + 1, desc: s, status: 'pending' })),
      currentStepIndex: 0,
      requirements,
      progress: 0,
      startedAt: Date.now(),
      status: 'in_progress',
    };
    logger.info(`[MISSION] Started mission: [${type}] "${objective}" with ${steps.length} steps`);
    return this.activeMission;
  }

  completeStep(stepIndex = null) {
    if (!this.activeMission) return;
    const idx = stepIndex !== null ? stepIndex : this.activeMission.currentStepIndex;
    if (this.activeMission.steps[idx]) {
      this.activeMission.steps[idx].status = 'completed';
      this.activeMission.currentStepIndex = idx + 1;
      this.activeMission.progress = Math.round((this.activeMission.currentStepIndex / this.activeMission.steps.length) * 100);

      if (this.activeMission.currentStepIndex >= this.activeMission.steps.length) {
        this.activeMission.status = 'completed';
        this.completedMissions.push(this.activeMission);
        logger.info(`[MISSION] Mission completed: "${this.activeMission.objective}"`);
      }
    }
  }

  getActiveMission() {
    return this.activeMission;
  }
}

export const missionSystem = new MissionSystem();
