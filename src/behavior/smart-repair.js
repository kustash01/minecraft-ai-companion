import { createLogger } from '../utils/logger.js';
import vec3 from 'vec3';
import { adaptiveCamera } from './adaptive-camera.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('SMART_REPAIR');

/**
 * SmartCraterRepair — интеллектуальное восстановление кратеров и повреждений мира:
 * Вместо того чтобы заваливать всё одним булыжником, бот определяет окружающие материалы
 * (трава, земля, доски конкретного дерева, камень, песчаник) и восстанавливает
 * разрушение аутентичными материалами снизу вверх.
 */
export class SmartCraterRepair {
  /**
   * Анализ окружения воронки и определение доминирующих материалов
   * @param {Object} bot
   * @param {Object} centerPos - Центр взрыва/разрушения
   * @param {number} [radius=4]
   */
  static analyzeCraterEnvironment(bot, centerPos, radius = 4) {
    if (!bot?.blockAt) {
      return { dominantSurface: 'dirt', dominantSubsurface: 'dirt', surroundingBlocks: [] };
    }

    const c = vec3(centerPos.x, centerPos.y, centerPos.z);
    const borderBlockCounts = {};
    let highestY = -Infinity;
    let lowestY = Infinity;

    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      for (let dz = -radius - 1; dz <= radius + 1; dz++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const pos = c.offset(dx, dy, dz);
          const block = bot.blockAt(pos);
          if (!block || block.name === 'air' || block.name === 'cave_air' || block.name === 'water') {
            continue;
          }

          // Фиксируем высоты
          if (pos.y > highestY) highestY = pos.y;
          if (pos.y < lowestY) lowestY = pos.y;

          // Игнорируем растительность, факелы и т.д.
          if (['short_grass', 'tall_grass', 'dandelion', 'poppy', 'torch', 'wall_torch'].includes(block.name)) {
            continue;
          }

          borderBlockCounts[block.name] = (borderBlockCounts[block.name] || 0) + 1;
        }
      }
    }

    // Находим доминирующие блоки
    const sorted = Object.entries(borderBlockCounts).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0]?.[0] || 'dirt';

    // Разделение на поверхностный и внутренний материал
    let dominantSurface = dominant;
    let dominantSubsurface = dominant;

    if (dominant.includes('grass_block') || dominant.includes('dirt')) {
      dominantSurface = 'grass_block';
      dominantSubsurface = 'dirt';
    } else if (dominant.includes('planks')) {
      dominantSurface = dominant;
      dominantSubsurface = dominant;
    } else if (dominant.includes('stone') || dominant.includes('cobblestone') || dominant.includes('deepslate')) {
      dominantSurface = dominant;
      dominantSubsurface = dominant;
    } else if (dominant.includes('sand')) {
      dominantSurface = 'sand';
      dominantSubsurface = 'sandstone';
    }

    return {
      dominantSurface,
      dominantSubsurface,
      highestY: isFinite(highestY) ? highestY : centerPos.y,
      lowestY: isFinite(lowestY) ? lowestY : centerPos.y - 2,
      borderBlockCounts,
    };
  }

  /**
   * Находит подходящий предмет в инвентаре для замены разрушенного блока
   */
  static findBestBlockInInventory(bot, targetBlockName) {
    if (!bot?.inventory?.items) return null;
    const items = bot.inventory.items();

    // 1. Точное совпадение
    const exact = items.find((i) => i.name === targetBlockName);
    if (exact) return exact;

    // 2. Близкие альтернативы по категориям
    const fallbackCategories = {
      grass_block: ['dirt', 'coarse_dirt', 'mud', 'moss_block', 'cobblestone'],
      dirt: ['coarse_dirt', 'grass_block', 'mud', 'cobblestone'],
      oak_planks: ['spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'planks'],
      stone: ['cobblestone', 'stone_bricks', 'smooth_stone', 'andesite', 'diorite'],
      cobblestone: ['stone', 'stone_bricks', 'andesite', 'deepslate_cobblestone'],
      sand: ['sandstone', 'dirt', 'cobblestone'],
    };

    const candidates = fallbackCategories[targetBlockName] || [];
    for (const cand of candidates) {
      const match = items.find((i) => i.name.includes(cand));
      if (match) return match;
    }

    // 3. Любой строительный твердый блок в крайнем случае
    const generic = items.find((i) =>
      ['cobblestone', 'dirt', 'stone', 'planks'].some((type) => i.name.includes(type))
    );
    return generic || null;
  }

  /**
   * Восстанавливает кратер от взрыва с учетом слоев и типов блоков
   * @param {Object} bot
   * @param {Object} centerPos
   * @param {Object} [options]
   * @returns {Promise<{ repaired: number, blocksPlaced: string[] }>}
   */
  static async repairCrater(bot, centerPos, options = {}) {
    const radius = options.radius || 3;
    const maxBlocks = options.maxBlocks || 16;
    const analysis = this.analyzeCraterEnvironment(bot, centerPos, radius);

    logger.info(`[SMART_REPAIR] Анализ воронки: поверхность=[${analysis.dominantSurface}], недра=[${analysis.dominantSubsurface}]`);

    const c = vec3(centerPos.x, centerPos.y, centerPos.z);
    const holesToFill = [];

    // Ищем воздушные ямы, под которыми или рядом с которыми есть твердая опора
    for (let dy = -radius; dy <= 0; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dz * dz + dy * dy > (radius + 0.5) * (radius + 0.5)) continue;

          const p = c.offset(dx, dy, dz);
          const block = bot.blockAt ? bot.blockAt(p) : null;

          if (block && (block.name === 'air' || block.name === 'cave_air')) {
            // Проверяем наличие твердого соседа, чтобы можно было прикрепить блок
            const neighbors = [
              vec3(0, -1, 0),
              vec3(1, 0, 0),
              vec3(-1, 0, 0),
              vec3(0, 0, 1),
              vec3(0, 0, -1),
              vec3(0, 1, 0),
            ];

            let hasSolidNeighbor = false;
            let refBlock = null;
            let placeFace = null;

            for (const n of neighbors) {
              const nPos = p.plus(n);
              const nBlock = bot.blockAt ? bot.blockAt(nPos) : null;
              if (nBlock && nBlock.name !== 'air' && nBlock.name !== 'cave_air' && nBlock.name !== 'water' && nBlock.name !== 'lava') {
                hasSolidNeighbor = true;
                refBlock = nBlock;
                placeFace = vec3(-n.x, -n.y, -n.z);
                break;
              }
            }

            if (hasSolidNeighbor) {
              const isSurface = p.y >= analysis.highestY - 1;
              const targetBlockName = isSurface ? analysis.dominantSurface : analysis.dominantSubsurface;
              holesToFill.push({
                pos: p,
                refBlock,
                placeFace,
                targetBlockName,
                isSurface,
              });
            }
          }
        }
      }
    }

    // Сортируем снизу вверх (по возрастанию Y), чтобы строить на твердом основании
    holesToFill.sort((a, b) => a.pos.y - b.pos.y);

    let repaired = 0;
    const blocksPlaced = [];

    for (const hole of holesToFill) {
      if (repaired >= maxBlocks) break;

      const itemToPlace = this.findBestBlockInInventory(bot, hole.targetBlockName);
      if (!itemToPlace) {
        logger.debug(`[SMART_REPAIR] В инвентаре нет подходящих блоков для ${hole.targetBlockName}`);
        continue;
      }

      try {
        // Плавный человеческий взгляд на целевой блок
        await adaptiveCamera.calmLookAt(bot, hole.pos);

        // Экипируем блок в руку
        if (typeof bot.equip === 'function') {
          await bot.equip(itemToPlace, 'hand');
        }

        // Ставим блок к соседней опоре
        if (typeof bot.placeBlock === 'function' && hole.refBlock) {
          await bot.placeBlock(hole.refBlock, hole.placeFace);
          repaired++;
          blocksPlaced.push(itemToPlace.name);
          // Человеческая пауза между установками блоков
          const pauseMs = Math.round(HumanErrorEngine.range(160, 240, bot));
          await new Promise((r) => setTimeout(r, pauseMs));
        }
      } catch (err) {
        logger.debug(`[SMART_REPAIR] Ошибка установки блока: ${err.message}`);
      }
    }

    logger.info(`[SMART_REPAIR] Восстановлено ${repaired} блоков воронки [${blocksPlaced.join(', ')}]`);
    return { repaired, blocksPlaced };
  }
}
