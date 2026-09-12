import { createLogger } from '../utils/logger.js';
import { KinematicsEngine } from './kinematics.js';

const logger = createLogger('TEAM_COOPERATION');

/**
 * TeamCooperationEngine — командное взаимодействие, передача вещей через Q,
 * охрана работающих напарников и дружеские эмоции (GG, приседания).
 */
export class TeamCooperationEngine {
  /**
   * Передача предмета игроку или напарнику (Q Toss)
   */
  static async tossItemToTarget(bot, targetName, itemName, count = 1) {
    if (!bot || !bot.inventory) return false;

    const targetPlayer = bot.players?.[targetName]?.entity;
    if (!targetPlayer || !targetPlayer.position) return false;

    const item = bot.inventory.items().find((i) => i.name === itemName || i.name.includes(itemName));
    if (!item) return false;

    try {
      // Поворачиваемся к игроку
      await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0), true);

      // Бросаем предмет клавишей Q
      if (typeof bot.toss === 'function') {
        await bot.toss(item.type, null, Math.min(count, item.count));
      } else if (typeof bot.tossStack === 'function') {
        await bot.tossStack(item);
      }

      logger.info(`[${bot.username || 'Bot'}] 🎁 Сбросил ${count}x ${item.name} для ${targetName}`);

      // Дружеский кивок
      await KinematicsEngine.crouchNod(bot, 2);
      return true;
    } catch (err) {
      logger.debug(`Toss item error: ${err.message}`);
      return false;
    }
  }

  /**
   * Празднование победы / выполнения задачи (GG crouch spam + jump)
   */
  static async celebrate(bot) {
    if (!bot || typeof bot.setControlState !== 'function') return;

    try {
      for (let i = 0; i < 3; i++) {
        bot.setControlState('sneak', true);
        if (i === 1 && bot.entity?.onGround) {
          bot.setControlState('jump', true);
          setTimeout(() => bot?.setControlState?.('jump', false), 200);
        }
        KinematicsEngine.swingArm(bot);
        await new Promise((r) => setTimeout(r, 120));
        bot.setControlState('sneak', false);
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e) {}
  }
}
