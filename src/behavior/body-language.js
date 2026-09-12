import logger from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';

export class BodyLanguageEngine {
  constructor() {
    this.lastEyeContactTime = 0;
    this.lastShiftGreetingTime = 0;
  }

  /**
   * Universal Minecraft friendly greeting: shift-shift + arm swing.
   */
  async shiftGreeting(botInstance) {
    if (!botInstance?.setControlState) return;
    const now = Date.now();
    if (now - this.lastShiftGreetingTime < 4000) return;
    this.lastShiftGreetingTime = now;

    try {
      logger.info('[BODY-LANGUAGE] Performing friendly Shift-Shift greeting!');
      botInstance.setControlState('sneak', true);
      await sleep(180);
      botInstance.setControlState('sneak', false);
      await sleep(150);
      botInstance.setControlState('sneak', true);
      await sleep(180);
      botInstance.setControlState('sneak', false);

      if (botInstance.swingArm) {
        botInstance.swingArm();
      }
    } catch (err) {
      logger.debug(`[BODY-LANGUAGE] Shift greeting error: ${err.message}`);
    }
  }

  /**
   * Head nod up and down (Yes / Agreement).
   */
  async nodHead(botInstance) {
    if (!botInstance?.look || !botInstance.entity) return;
    try {
      const yaw = botInstance.entity.yaw;
      const basePitch = botInstance.entity.pitch;

      await botInstance.look(yaw, basePitch + 0.4, true);
      await sleep(120);
      await botInstance.look(yaw, basePitch - 0.2, true);
      await sleep(120);
      await botInstance.look(yaw, basePitch + 0.4, true);
      await sleep(120);
      await botInstance.look(yaw, basePitch, true);
    } catch (err) {
      logger.debug(`[BODY-LANGUAGE] Nod error: ${err.message}`);
    }
  }

  /**
   * Head shake left and right (No / Disagreement).
   */
  async shakeHead(botInstance) {
    if (!botInstance?.look || !botInstance.entity) return;
    try {
      const baseYaw = botInstance.entity.yaw;
      const pitch = botInstance.entity.pitch;

      await botInstance.look(baseYaw + 0.5, pitch, true);
      await sleep(120);
      await botInstance.look(baseYaw - 0.5, pitch, true);
      await sleep(120);
      await botInstance.look(baseYaw + 0.5, pitch, true);
      await sleep(120);
      await botInstance.look(baseYaw, pitch, true);
    } catch (err) {
      logger.debug(`[BODY-LANGUAGE] Shake error: ${err.message}`);
    }
  }

  /**
   * Victory / Celebration Dance (Rapid shift + Jump + Arm Swing).
   */
  async celebrateVictory(botInstance) {
    if (!botInstance?.setControlState) return;
    try {
      logger.info('[BODY-LANGUAGE] Celebrating victory!');
      botInstance.setControlState('jump', true);
      if (botInstance.swingArm) botInstance.swingArm();
      await sleep(250);
      botInstance.setControlState('jump', false);

      await this.shiftGreeting(botInstance);
    } catch (err) {
      logger.debug(`[BODY-LANGUAGE] Celebrate error: ${err.message}`);
    }
  }

  /**
   * Make mutual eye contact with player.
   */
  async makeEyeContact(botInstance, playerEntity) {
    if (!botInstance?.lookAt || !playerEntity?.position) return;
    const now = Date.now();
    if (now - this.lastEyeContactTime < 3000) return;
    this.lastEyeContactTime = now;

    try {
      // Look at player's eye level (head height ~ 1.62m)
      const eyePos = playerEntity.position.offset(0, 1.6, 0);
      await botInstance.lookAt(eyePos, true);
      logger.debug('[BODY-LANGUAGE] Eye contact made with player');
    } catch (err) {
      logger.debug(`[BODY-LANGUAGE] Eye contact error: ${err.message}`);
    }
  }

  nod(botInstance) {
    return this.nodHead(botInstance);
  }

  shake(botInstance) {
    return this.shakeHead(botInstance);
  }

  greet(botInstance) {
    return this.shiftGreeting(botInstance);
  }
}

export const bodyLanguage = new BodyLanguageEngine();
