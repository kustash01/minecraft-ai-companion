import { createLogger } from '../utils/logger.js';
import { BotActionWrapper } from './bot-action-wrapper.js';
import { CaveNavigation } from './cave-navigation.js';
import vec3 from 'vec3';

const logger = createLogger('CAMP_LIFE');

/**
 * CampLifeEngine — естественный быт игрока в Minecraft:
 * - Установка факелов в темноте и в шахтах
 * - Сон в кроватях при наступлении ночи
 * - Сбор спелого урожая и немедленный засев семян
 * - Автоматическая плавка руды и жарка еды в печи
 */
export class CampLifeEngine {
  /**
   * Установка факела если темно (уровень света < 7 или пещера)
   */
  static async placeTorchIfNeeded(bot, emotionalSystem = null) {
    if (!bot || !bot.entity) return false;
    const caveNav = new CaveNavigation({
      bot,
      emotionalSystem,
      agentName: bot.username || 'Bot',
    });
    return await caveNav.placeTorch(bot);
  }

  /**
   * Сон в кровати при наступлении ночи (время > 12500)
   */
  static async sleepAtNight(bot) {
    if (!bot || !bot.time || bot.time.timeOfDay < 12500 || bot.time.timeOfDay > 23500) return false;
    if (bot.isSleeping) return true;

    try {
      const bed = bot.findBlock({
        matching: (block) => block.name.includes('_bed'),
        maxDistance: 8,
      });

      if (bed) {
        await bot.sleep(bed);
        logger.info(`[${bot.username || 'Bot'}] 🛏️ Лёг спать в кровать на ночь`);
        return true;
      }
    } catch (err) {
      logger.debug(`Sleep error: ${err.message}`);
    }
    return false;
  }

  /**
   * Сбор спелых культур (пшеница, морковь, картошка) и засев семян
   */
  static async harvestAndReplant(bot, emotionalSystem = null) {
    if (!bot || !bot.findBlock) return false;

    try {
      const matureCrop = bot.findBlock({
        matching: (block) => {
          if (['wheat', 'carrots', 'potatoes'].includes(block.name)) {
            return block.metadata === 7 || block._properties?.age === 7;
          }
          if (block.name === 'beetroots') {
            return block.metadata === 3 || block._properties?.age === 3;
          }
          return false;
        },
        maxDistance: 6,
      });

      if (matureCrop) {
        // ✅ Используем wrapper с ошибками - может ломить не тот блок
        const wrapper = new BotActionWrapper(bot, emotionalSystem, bot.username || 'Bot');
        await wrapper.mineBlock(matureCrop);
        logger.info(`[${bot.username || 'Bot'}] 🌾 Собрал урожай: ${matureCrop.name}`);

        // Сразу засеваем обратно
        await new Promise((r) => setTimeout(r, 200));
        const cropToSeedMap = {
          wheat: 'wheat_seeds',
          beetroots: 'beetroot_seeds',
          carrots: 'carrot',
          potatoes: 'potato',
        };
        const seedName = cropToSeedMap[matureCrop.name] || matureCrop.name;
        const seedItem = bot.inventory?.items()?.find((i) => i.name === seedName || (seedName.includes('seed') && i.name.includes('seed')));

        if (seedItem) {
          const farmland = bot.blockAt(matureCrop.position.offset(0, -1, 0));
          if (farmland && farmland.name === 'farmland') {
            await bot.equip(seedItem, 'hand');

            // ✅ Используем wrapper для плейса семян
            await wrapper.placeBlock(farmland, vec3(0, 1, 0));
            logger.info(`[${bot.username || 'Bot'}] 🌱 Засеял семена ${seedItem.name}`);
          }
        }
        return true;
      }
    } catch (e) {}
    return false;
  }
}
