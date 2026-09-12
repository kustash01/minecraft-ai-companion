import logger from '../../utils/logger.js';
import { adaptiveCamera } from '../adaptive-camera.js';

export class GazeLookManager {
  constructor() {
    this.isLooking = false;
    this.lastCornerCheck = 0;
  }

  /**
   * Look at target position before moving/interacting (Eyes First).
   */
  async lookAtTarget(botInstance, targetPos, emergency = false) {
    if (!botInstance || !targetPos) return;
    try {
      this.isLooking = true;
      await adaptiveCamera.lookAt(botInstance, targetPos, { emergency });
    } catch (err) {
      logger.debug(`[GAZE] Look error: ${err.message}`);
    } finally {
      this.isLooking = false;
    }
  }

  /**
   * Perform a quick corner check (glance left and right).
   */
  async checkCorner(botInstance) {
    if (!botInstance?.look || Date.now() - this.lastCornerCheck < 5000) return;
    this.lastCornerCheck = Date.now();
    try {
      const currentYaw = botInstance.entity.yaw;
      const currentPitch = botInstance.entity.pitch;

      // Smooth glance left
      await adaptiveCamera.look(botInstance, currentYaw + 0.5, currentPitch, { steps: 4 });
      // Smooth glance right
      await adaptiveCamera.look(botInstance, currentYaw - 0.5, currentPitch, { steps: 4 });
      // Reset forward smoothly
      await adaptiveCamera.look(botInstance, currentYaw, currentPitch, { steps: 3 });
    } catch (err) {
      logger.debug(`[GAZE] Corner check error: ${err.message}`);
    }
  }
}

export const gazeLook = new GazeLookManager();
