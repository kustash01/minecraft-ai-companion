import { createLogger } from '../utils/logger.js';
import { adaptiveCamera } from './adaptive-camera.js';
import { HumanErrorEngine } from './human-error-engine.js';

/**
 * KinematicsEngine — естественная человеческая моторика, жесты,
 * приседания-кивки, правильная экипировка инструментов и плавные движения.
 */
export class KinematicsEngine {
  /**
   * Приседание-кивок (Crouch Nod) — классическое приветствие игроков в Minecraft.
   * @param {Object} bot - Mineflayer bot
   * @param {number} [times=2] - Количество приседаний
   */
  static async crouchNod(bot, times = 2) {
    if (!bot || typeof bot.setControlState !== 'function') return;

    for (let i = 0; i < times; i++) {
      try {
        bot.setControlState('sneak', true);
        await new Promise(r => setTimeout(r, HumanErrorEngine.range(120, 180)));
        bot.setControlState('sneak', false);
        await new Promise(r => setTimeout(r, HumanErrorEngine.range(100, 150)));
      } catch (e) {}
    }
  }

  /**
   * Взмах рукой (Swing Arm) при работе, жестах или указании направления.
   * @param {Object} bot
   */
  static swingArm(bot) {
    if (!bot || typeof bot.swingArm !== 'function') return;
    try {
      bot.swingArm('right');
    } catch (e) {}
  }

  /**
   * Плавный взгляд в сторону цели (без резкого телепорта взгляда).
   * @param {Object} bot
   * @param {Object} targetPos - vec3 position
   * @param {boolean} [emergency=false]
   */
  static async naturalLookAt(bot, targetPos, emergency = false) {
    if (!bot || !bot.entity || !targetPos) return;
    try {
      await adaptiveCamera.lookAt(bot, targetPos, { emergency });
    } catch (e) {}
  }

  /**
   * Автоматическая экипировка наилучшего инструмента в руку.
   * @param {Object} bot
   * @param {'wood'|'stone'|'dirt'|'combat'|'food'} targetType
   */
  static async equipBestTool(bot, targetType) {
    if (!bot || !bot.inventory || typeof bot.equip !== 'function') return;

    const items = bot.inventory.items();
    if (!items || items.length === 0) return;

    let bestItem = null;

    if (targetType === 'wood') {
      // Ищем топор (netherite > diamond > iron > stone > golden > wooden)
      const axes = ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe'];
      for (const axeName of axes) {
        bestItem = items.find(i => i.name === axeName);
        if (bestItem) break;
      }
    } else if (targetType === 'stone') {
      // Ищем кирку
      const pickaxes = ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe'];
      for (const pickName of pickaxes) {
        bestItem = items.find(i => i.name === pickName);
        if (bestItem) break;
      }
    } else if (targetType === 'combat') {
      // Ищем меч или топор
      const weapons = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'iron_axe', 'wooden_sword'];
      for (const wName of weapons) {
        bestItem = items.find(i => i.name === wName);
        if (bestItem) break;
      }
    } else if (targetType === 'dirt') {
      // Ищем лопату
      const shovels = ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel'];
      for (const sName of shovels) {
        bestItem = items.find(i => i.name === sName);
        if (bestItem) break;
      }
    }

    if (bestItem) {
      try {
        await bot.equip(bestItem, 'hand');
      } catch (e) {}
    }
  }

  /**
   * Выбросить предмет другу/игроку (Drop / Toss).
   * @param {Object} bot
   * @param {string} itemName
   * @param {number} [count=1]
   */
  static async tossItem(bot, itemName, count = 1) {
    if (!bot || !bot.inventory || typeof bot.toss !== 'function') return false;

    const item = bot.inventory.items().find(i => i.name.includes(itemName));
    if (!item) return false;

    try {
      const mcData = (await import('minecraft-data')).default(bot.version);
      const itemType = mcData.itemsByName[item.name];
      if (itemType) {
        await bot.toss(itemType.id, null, Math.min(count, item.count));
        KinematicsEngine.swingArm(bot);
        return true;
      }
    } catch (e) {
      logger.debug(`Ошибка выброса предмета: ${e.message}`);
    }
    return false;
  }
}
