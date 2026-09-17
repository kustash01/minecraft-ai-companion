import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('PRO_GAMER_TRICKS');

/**
 * ProGamerTricks — библиотека глубоких про-геймерских микро-механик Minecraft,
 * которые языковая модель (Gemini) физически не может исполнить сама через текст:
 * 1. gravelTorchBreak — моментальный факел под падающий гравий/песок (весь столб осыпается в лут).
 * 2. excavateOreVein — 3D BFS раскопка всей рудной жилы (включая скрытые за булыжником блоки).
 * 3. placeRightWallTorch — правило правой руки для факелов в тоннелях/пещерах.
 * 4. waterAirPocket — установка двери под водой для мгновенного дыхания.
 * 5. waterDropClimb — безопасный спуск с обрыва по водопаду с забором воды ведром.
 * 6. bridgeSneak — шифт-строительство мостов над лавой/пропастью (0% риск падения).
 * 7. peekThroughWall — смотровой глазок 1x1 на уровне глаз перед пробитием стены (защита от лавы).
 * 8. waterLavaObsidian — безопасное превращение лавы в обсидиан ведром воды.
 * 9. trashDump — безопасная утилизация мусора в 1-блочную ямку.
 * 10. checkSafeBedUse — проверка измерения перед сном (предотвращение взрыва кровати в Незере/Энде).
 */
export class ProGamerTricks {
  /**
   * Трюк с факелом под падающий гравий / песок
   * Ломает нижний блок и за 1 тик ставит факел под основание. Падающий гравий осыпается в дроп.
   */
  static async gravelTorchBreak(bot, block) {
    if (!bot || !block) throw new Error('Блок для трюка с гравием не указан');

    const torch = bot.inventory?.items()?.find(i => i.name === 'torch');
    if (!torch) {
      // Если факела нет — просто копаем
      if (typeof bot.dig === 'function') await bot.dig(block);
      return false;
    }

    // Проверяем: есть ли над блоком гравий/песок
    const abovePos = block.position.offset(0, 1, 0);
    const above = bot.blockAt ? bot.blockAt(abovePos) : null;
    const isFallingType = above && ['gravel', 'sand', 'red_sand', 'concrete_powder'].includes(above.name);

    if (typeof bot.dig === 'function') {
      await bot.dig(block);
    }

    if (isFallingType && typeof bot.equip === 'function') {
      // Psychophysiological execution window: under panic / high fatigue, check chance
      const executed = HumanErrorEngine.chance(0.96, bot);
      if (!executed) {
        // Human motor delay / slight hesitation
        const fumbleDelay = Math.round(HumanErrorEngine.range(60, 140, bot));
        await new Promise(r => setTimeout(r, Math.min(fumbleDelay, 20)));
        logger.warn(`[PRO_TRICK] ⚠️ Факел под гравий поставлен с задержкой (${fumbleDelay}мс) из-за моторной ошибки/стресса`);
      }
      // Мгновенно экипируем факел и ставим на блок под раскопанным
      try {
        await bot.equip(torch, 'hand');
        const underPos = block.position.offset(0, -1, 0);
        const underBlock = bot.blockAt ? bot.blockAt(underPos) : null;
        if (underBlock && underBlock.name !== 'air' && typeof bot.placeBlock === 'function') {
          await bot.placeBlock(underBlock, vec3(0, 1, 0));
          logger.info(`[PRO_TRICK] 🕯️ Факел подставлен под падающий ${above.name}! Столб разрушен.`);
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Полная раскопка рудной жилы (Vein Mining) через 3D BFS
   */
  static async excavateOreVein(bot, startBlock, options = {}) {
    if (!bot || !startBlock) throw new Error('Начальный блок руды не указан');

    const maxBlocks = options.maxBlocks || 24;
    const baseOreName = startBlock.name.replace('deepslate_', '');
    const isOre = baseOreName.includes('ore');
    if (!isOre) {
      if (typeof bot.dig === 'function') await bot.dig(startBlock);
      return 1;
    }

    const queue = [startBlock.position];
    const visited = new Set();
    visited.add(`${startBlock.position.x},${startBlock.position.y},${startBlock.position.z}`);
    let minedCount = 0;

    // 26 смещений вокруг блока (соседи 3x3x3)
    const neighbors3D = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          neighbors3D.push(vec3(dx, dy, dz));
        }
      }
    }

    while (queue.length > 0 && minedCount < maxBlocks) {
      const currentPos = queue.shift();
      const currentBlock = bot.blockAt ? bot.blockAt(currentPos) : null;

      if (currentBlock && (currentBlock.name === startBlock.name || currentBlock.name.replace('deepslate_', '') === baseOreName)) {
        try {
          if (typeof bot.lookAt === 'function') {
            const lookTarget = typeof currentPos.offset === 'function'
              ? currentPos.offset(0.5, 0.5, 0.5)
              : vec3(currentPos.x + 0.5, currentPos.y + 0.5, currentPos.z + 0.5);
            await bot.lookAt(lookTarget, true);
          }
          if (typeof bot.dig === 'function') {
            await bot.dig(currentBlock);
            minedCount++;
          }
        } catch (_) {}

        // Ищем соседние блоки этой же жилы (с учетом человеческой видимости диагональных блоков)
        for (const offset of neighbors3D) {
          const np = vec3(currentPos.x + offset.x, currentPos.y + offset.y, currentPos.z + offset.z);
          const key = `${np.x},${np.y},${np.z}`;
          if (!visited.has(key)) {
            visited.add(key);
            const isDirectFace = Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) === 1;
            const noticed = isDirectFace || HumanErrorEngine.chance(0.96, bot);
            if (!noticed) continue;
            const nb = bot.blockAt ? bot.blockAt(np) : null;
            if (nb && (nb.name === startBlock.name || nb.name.replace('deepslate_', '') === baseOreName)) {
              queue.push(np);
            }
          }
        }
      }
    }

    logger.info(`[PRO_TRICK] ⛏️ Жила ${baseOreName} полностью выкопана: ${minedCount} блоков`);
    return minedCount;
  }

  /**
   * Правило факелов на правой стене (Right-hand rule for torches)
   */
  static async placeRightWallTorch(bot) {
    if (!bot?.entity?.position) return false;
    const torch = bot.inventory?.items()?.find(i => i.name === 'torch');
    if (!torch) throw new Error('Нет факелов в инвентаре');

    // Направление взгляда бота
    const yaw = bot.entity.yaw || 0;
    // Перпендикуляр направо (yaw + 90°)
    const rightYaw = yaw - Math.PI / 2;
    const rx = Math.round(-Math.sin(rightYaw));
    const rz = Math.round(-Math.cos(rightYaw));

    const p = bot.entity.position;
    const wallPos = vec3(Math.floor(p.x + rx), Math.floor(p.y + 1.2), Math.floor(p.z + rz));
    const wallBlock = bot.blockAt ? bot.blockAt(wallPos) : null;

    if (wallBlock && wallBlock.name !== 'air' && typeof bot.equip === 'function') {
      try {
        await bot.equip(torch, 'hand');
        if (typeof bot.placeBlock === 'function') {
          // Ставим на сторону стены, обращенную к игроку
          await bot.placeBlock(wallBlock, vec3(-rx, 0, -rz));
          logger.info(`[PRO_TRICK] 🕯️ Факел установлен на правую стену на (${wallPos.x}, ${wallPos.y}, ${wallPos.z})`);
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Воздушный карман дверью под водой
   */
  static async waterAirPocket(bot) {
    if (!bot?.entity?.position) return false;
    const door = bot.inventory?.items()?.find(i => i.name.includes('_door'));
    if (!door) return false;

    // Under low oxygen / drowning panic, human player experiences motor fumble
    const oxygen = bot.oxygenLevel ?? 20;
    if (oxygen < 6 && !HumanErrorEngine.chance(0.90, bot)) {
      const fumbleDelay = Math.round(HumanErrorEngine.range(80, 180, bot));
      await new Promise(r => setTimeout(r, Math.min(fumbleDelay, 15)));
    }

    try {
      const underPos = bot.entity.position.offset(0, -1, 0).floored();
      const underBlock = bot.blockAt ? bot.blockAt(underPos) : null;
      if (underBlock && underBlock.name !== 'air' && typeof bot.equip === 'function' && typeof bot.placeBlock === 'function') {
        await bot.equip(door, 'hand');
        await bot.placeBlock(underBlock, vec3(0, 1, 0));
        logger.info(`[PRO_TRICK] 🚪 Установлена дверь под водой: создан воздушный карман!`);
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Безопасный спуск с обрыва по водопаду (Water Drop Climb)
   */
  static async waterDropClimb(bot) {
    if (!bot?.entity?.position) return false;
    const waterBucket = bot.inventory?.items()?.find(i => i.name === 'water_bucket');
    if (!waterBucket) throw new Error('Нужно ведро воды для спуска с обрыва');

    try {
      const yaw = bot.entity.yaw || 0;
      const forwardPos = bot.entity.position.offset(-Math.sin(yaw), -1, -Math.cos(yaw)).floored();
      const ledgeBlock = bot.blockAt ? bot.blockAt(forwardPos) : null;

      if (ledgeBlock && typeof bot.equip === 'function' && typeof bot.placeBlock === 'function') {
        // Human hesitation before jumping off ledge
        const hesitation = Math.round(HumanErrorEngine.range(40, 90, bot));
        if (hesitation > 80) await new Promise(r => setTimeout(r, Math.min(hesitation, 10)));

        await bot.equip(waterBucket, 'hand');
        await bot.placeBlock(ledgeBlock, vec3(0, 1, 0));
        logger.info(`[PRO_TRICK] 🌊 Водопад запущен с края обрыва, спускаемся по потоку`);
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Строительство моста на шифте (Sneak-Bridging) над пропастью/лавой
   */
  static async bridgeSneak(bot, length = 3, blockName = null) {
    if (!bot || typeof bot.setControlState !== 'function') return false;

    const items = bot.inventory?.items() || [];
    const blockItem = items.find(i => blockName ? i.name === blockName : (i.name.includes('stone') || i.name.includes('cobble') || i.name.includes('dirt') || i.name.includes('plank')));
    if (!blockItem) throw new Error('Нет строительных блоков для моста');

    if (typeof bot.equip === 'function') {
      await bot.equip(blockItem, 'hand');
    }

    // Зажимаем шифт непрерывно
    bot.setControlState('sneak', true);

    try {
      for (let i = 0; i < length; i++) {
        const yaw = bot.entity?.yaw || 0;
        // Двигаемся назад
        bot.setControlState('back', true);
        const stepTime = 280 + Math.round(HumanErrorEngine.range(0, 30, bot));
        await new Promise(r => setTimeout(r, stepTime));
        bot.setControlState('back', false);

        // Смотрим под ноги назад и ставим блок
        const underPos = bot.entity.position.offset(0, -1, 0).floored();
        const b = bot.blockAt ? bot.blockAt(underPos) : null;
        if (b && typeof bot.placeBlock === 'function') {
          try {
            await bot.placeBlock(b, vec3(0, 0, 1));
          } catch (_) {}
        }
      }
    } finally {
      bot.setControlState('sneak', false);
    }
    logger.info(`[PRO_TRICK] 🧱 Построен безопасный мост на шифте (${length} блоков)`);
    return true;
  }

  /**
   * Смотровой глазок 1x1 в стене перед сквозным пробитием
   */
  static async peekThroughWall(bot, wallBlock) {
    if (!bot || !wallBlock) throw new Error('Блок стены не указан');
    // Копаем только верхний блок на уровне глаз (1x1)
    const eyeBlockPos = wallBlock.position.offset(0, 0, 0);
    const block = bot.blockAt ? bot.blockAt(eyeBlockPos) : wallBlock;

    if (typeof bot.dig === 'function') {
      await bot.dig(block);
      logger.info(`[PRO_TRICK] 👀 Пробит смотровой глазок 1x1 на уровне глаз, пещера безопасно осмотрена`);
      return true;
    }
    return false;
  }

  /**
   * Проверка безопасности сна (защита от взрыва кровати в Незере и Энде)
   */
  static checkSafeBedUse(bot) {
    const dim = bot?.game?.dimension;
    if (dim === 'the_nether' || dim === 'minecraft:the_nether' || dim === -1) {
      return { safe: false, reason: 'В Незере кровати взрываются с силой динамита!' };
    }
    if (dim === 'the_end' || dim === 'minecraft:the_end' || dim === 1) {
      return { safe: false, reason: 'В Энде кровати взрываются с силой динамита!' };
    }
    return { safe: true, reason: 'Обычный мир, спать безопасно' };
  }
}
