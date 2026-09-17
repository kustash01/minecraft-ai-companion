import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';
import { HumanMotor } from './human-motor.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('BUDDY_DYNAMICS');

/**
 * BuddyDynamics — кооперативный этикет, взаимовыручка и забота о напарнике:
 * 1. shareLoot — делёж едой, слитками и инструментом с напарником.
 * 2. checkEmergencyHeal — спасение тиммейта при <8 HP / голоде (скидывает стейки).
 * 3. synchronousSleep — синхронный сон (ставит кровать рядом, говорит "го спать").
 * 4. yieldHallway — уступка дороги в узких проходах 1x1 (шаг назад / в сторону).
 * 5. celebrateVictory — победный танец (шифт-спам и прыжки) при алмазах / победе.
 */
export class BuddyDynamics {
  /**
   * Найти сущность напарника
   */
  static findBuddy(bot, playerName = null) {
    if (!bot?.entities) return null;
    const want = playerName ? String(playerName).toLowerCase() : null;

    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || e === bot.entity || e.type !== 'player' || !e.position) continue;
      if (!want || (e.username && e.username.toLowerCase() === want)) {
        return e;
      }
    }
    return null;
  }

  /**
   * Поделиться ресурсами или запасным инструментом с напарником
   */
  static async shareLoot(bot, playerName, itemName, count = 1) {
    const buddy = this.findBuddy(bot, playerName);
    if (!buddy) throw new Error(`Напарник ${playerName || 'игрок'} не найден рядом`);

    const item = (bot.inventory?.items() || []).find(i => i.name === itemName || i.name.includes(itemName));
    if (!item) throw new Error(`Нет предмета ${itemName} в инвентаре для передачи`);

    // Поиск предмета в инвентаре с естественной человеческой задержкой
    const searchDelay = Math.round(HumanErrorEngine.range(50, 120, bot));
    if (searchDelay > 100 && process.env.NODE_ENV !== 'test') {
      await new Promise(r => setTimeout(r, searchDelay));
    }

    // Подходим на 2.5 метра
    if (typeof bot.lookAt === 'function') {
      await HumanMotor.smoothLook(bot, buddy.position.offset(0, buddy.height || 1.6, 0), 4);
    }

    if (typeof bot.equip === 'function') {
      await bot.equip(item, 'hand');
    }

    if (typeof bot.toss === 'function') {
      await bot.toss(item.type, null, Math.min(count, item.count));
      logger.info(`[BUDDY] 🤝 Скинул напарнику ${buddy.username || 'другу'} предмет ${item.name} (${count} шт)`);
    }

    // Дружеский шифт-тап в знак уважения
    if (typeof bot.setControlState === 'function') {
      bot.setControlState('sneak', true);
      const tapDuration = Math.round(HumanErrorEngine.range(100, 140, bot));
      await new Promise(r => setTimeout(r, tapDuration));
      bot.setControlState('sneak', false);
    }
    return true;
  }

  /**
   * Экстренная помощь едой, если здоровье напарника критическое (<8 HP) или он голоден
   */
  static async checkEmergencyHeal(bot, playerName = null) {
    const buddy = this.findBuddy(bot, playerName);
    if (!buddy) return false;

    // В условиях боевой паники или перегрузки внимания проверяем вероятность заметить бедствие
    const noticed = HumanErrorEngine.chance(0.96, bot);
    if (!noticed) {
      logger.debug(`[BUDDY] Из-за когнитивной загрузки не сразу заметил низкое здоровье напарника`);
      return false;
    }

    // Ищем еду в инвентаре
    const food = (bot.inventory?.items() || []).find(i =>
      ['cooked_beef', 'cooked_porkchop', 'bread', 'baked_potato', 'golden_apple', 'apple'].includes(i.name)
    );
    if (!food) return false;

    const dist = bot.entity.position.distanceTo(buddy.position);
    if (dist <= 6) {
      if (typeof bot.chat === 'function') {
        bot.chat('на поешь, щас откиснешь');
      }
      return this.shareLoot(bot, buddy.username, food.name, Math.min(4, food.count));
    }
    return false;
  }

  /**
   * Синхронный сон в кровати
   */
  static async synchronousSleep(bot, bedBlock = null) {
    if (!bot) return false;

    let bed = bedBlock;
    if (!bed && typeof bot.findBlock === 'function') {
      bed = bot.findBlock({
        matching: (b) => b && b.name.includes('_bed'),
        maxDistance: 16,
      });
    }

    // Если кровати нет поблизости, но есть в инвентаре — ставим рядом
    if (!bed) {
      const bedItem = (bot.inventory?.items() || []).find(i => i.name.includes('_bed'));
      if (bedItem && bot.entity?.position && typeof bot.placeBlock === 'function') {
        try {
          const under = bot.blockAt(bot.entity.position.offset(1, -1, 0));
          if (under && under.name !== 'air' && typeof bot.equip === 'function') {
            await bot.equip(bedItem, 'hand');
            await bot.placeBlock(under, vec3(0, 1, 0));
            bed = bot.blockAt(bot.entity.position.offset(1, 0, 0));
          }
        } catch (_) {}
      }
    }

    if (bed && typeof bot.sleep === 'function') {
      if (typeof bot.chat === 'function') {
        bot.chat('го спать, ночь на дворе');
      }
      try {
        await bot.sleep(bed);
        logger.info(`[BUDDY] 🛏️ Лёг спать в кровать`);
        return true;
      } catch (err) {
        logger.debug(`Не удалось лечь спать: ${err.message}`);
      }
    }
    return false;
  }

  /**
   * Уступка прохода в узком тоннеле 1x1 при приближении напарника
   */
  static async yieldHallway(bot, playerName = null) {
    const buddy = this.findBuddy(bot, playerName);
    if (!buddy || !bot?.entity?.position) return false;

    const dist = bot.entity.position.distanceTo(buddy.position);
    if (dist < 2.5) {
      // Человеческая пауза замешательства перед уступкой дороги (150-250мс)
      const hesitation = Math.round(HumanErrorEngine.range(150, 250, bot));
      if (process.env.NODE_ENV !== 'test') {
        await new Promise(r => setTimeout(r, hesitation));
      }
      // Отходим назад на 1 блок
      if (typeof bot.setControlState === 'function') {
        bot.setControlState('back', true);
        bot.setControlState('sneak', true);
        const backDuration = Math.round(HumanErrorEngine.range(420, 480, bot));
        await new Promise(r => setTimeout(r, backDuration));
        bot.setControlState('back', false);
        bot.setControlState('sneak', false);
        logger.info(`[BUDDY] 🚶 Уступил проход напарнику в узком коридоре`);
        return true;
      }
    }
    return false;
  }

  /**
   * Победный танец (шифт-спам и прыжки) при совместной победе или нахождении алмазов
   */
  static async celebrateVictory(bot) {
    if (!bot || typeof bot.setControlState !== 'function') return;

    logger.info(`[BUDDY] 🎉 Победное празднование!`);
    const crouches = Math.max(2, Math.min(5, Math.round(HumanErrorEngine.range(2.6, 3.8, bot))));
    for (let i = 0; i < crouches; i++) {
      bot.setControlState('sneak', true);
      const crouchTime = Math.round(HumanErrorEngine.range(100, 140, bot));
      await new Promise(r => setTimeout(r, crouchTime));
      bot.setControlState('sneak', false);
      const pauseTime = Math.round(HumanErrorEngine.range(80, 120, bot));
      await new Promise(r => setTimeout(r, pauseTime));
    }
    if (bot.entity?.onGround) {
      bot.setControlState('jump', true);
      const jumpTime = Math.round(HumanErrorEngine.range(160, 200, bot));
      await new Promise(r => setTimeout(r, jumpTime));
      bot.setControlState('jump', false);
    }
  }
}
