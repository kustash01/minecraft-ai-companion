import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';
import { adaptiveCamera } from '../behavior/adaptive-camera.js';

const logger = createLogger('FARMING_TOOLS');

export function registerFarmingTools(registry, { bot }) {
  /**
   * Вспашка земли и посадка семян
   */
  registry.register({
    name: 'till_and_plant',
    description: 'Tills dirt/grass with a hoe and plants seeds (wheat, carrot, potato, beetroot).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        seedName: { type: 'string', description: 'Name of seed or vegetable (e.g. wheat_seeds, carrot, potato, beetroot_seeds)' }
      },
      required: ['x', 'y', 'z', 'seedName']
    },
    handler: async (args) => {
      try {
        const targetPos = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(targetPos);
        if (!block) return { success: false, error: 'Блок не найден.' };

        // 1. Ищем мотыгу
        const items = bot.inventory.items();
        const hoe = items.find((i) => i.name.includes('hoe'));
        if (!hoe) return { success: false, error: 'В инвентаре нет мотыги для вспашки.' };

        // 2. Ищем семена
        const seed = items.find((i) => i.name === args.seedName || i.name.includes(args.seedName));
        if (!seed) return { success: false, error: `В инвентаре нет семян: ${args.seedName}` };

        // Плавный взгляд
        await adaptiveCamera.calmLookAt(bot, targetPos);

        // Вспахиваем мотыгой
        await bot.equip(hoe, 'hand');
        if (typeof bot.activateBlock === 'function') {
          await bot.activateBlock(block);
        }

        // Ждем 150 мс и сажаем семена
        await new Promise((r) => setTimeout(r, 150));
        await bot.equip(seed, 'hand');
        const farmlandBlock = bot.blockAt(targetPos);
        if (farmlandBlock && typeof bot.placeBlock === 'function') {
          await bot.placeBlock(farmlandBlock, vec3(0, 1, 0));
        }

        return { success: true, data: `Вспахана земля и посажены ${args.seedName} на [${args.x}, ${args.y}, ${args.z}]` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  /**
   * Сбор урожая и повторный посев
   */
  registry.register({
    name: 'harvest_crops',
    description: 'Harvests fully grown crops nearby and replants them automatically.',
    parameters: {
      type: 'object',
      properties: {
        radius: { type: 'number', default: 4 }
      }
    },
    handler: async (args) => {
      try {
        const radius = args.radius || 4;
        const myPos = bot.entity.position;
        const cropNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
        let harvestedCount = 0;

        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dy = -1; dy <= 2; dy++) {
              const pos = myPos.offset(dx, dy, dz);
              const block = bot.blockAt(pos);
              if (block && cropNames.includes(block.name)) {
                // В Minecraft 1.20 у зрелых растений metadata или stateage максимальный (7 для пшеницы/моркови/картошки)
                const isMature = block.metadata >= 7 || block._properties?.age >= 7;
                if (isMature) {
                  await adaptiveCamera.calmLookAt(bot, pos);
                  await bot.dig(block);
                  harvestedCount++;
                  await new Promise((r) => setTimeout(r, 200));

                  // Перепосадка
                  const seedMap = {
                    wheat: 'wheat_seeds',
                    carrots: 'carrot',
                    potatoes: 'potato',
                    beetroots: 'beetroot_seeds',
                  };
                  const requiredSeed = seedMap[block.name];
                  const seedItem = bot.inventory.items().find((i) => i.name === requiredSeed);
                  if (seedItem) {
                    const soil = bot.blockAt(pos.offset(0, -1, 0));
                    if (soil && typeof bot.placeBlock === 'function') {
                      await bot.equip(seedItem, 'hand');
                      await bot.placeBlock(soil, vec3(0, 1, 0));
                    }
                  }
                }
              }
            }
          }
        }

        return { success: true, data: `Собрано и перепосажено ${harvestedCount} урожая.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  /**
   * Взаимодействие с животными (разведение, стрижка, дойка)
   */
  registry.register({
    name: 'interact_with_animal',
    description: 'Interacts with nearby animals: breed, shear sheep, milk cows.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['breed', 'shear', 'milk', 'lead'] },
        animalType: { type: 'string', description: 'cow, sheep, pig, chicken' }
      },
      required: ['action']
    },
    handler: async (args) => {
      try {
        const myPos = bot.entity.position;
        const animals = Object.values(bot.entities || {}).filter((e) => {
          if (!e.position || myPos.distanceTo(e.position) > 4.5) return false;
          if (args.animalType) return e.name?.toLowerCase().includes(args.animalType.toLowerCase());
          return ['cow', 'sheep', 'pig', 'chicken'].includes(e.name);
        });

        if (animals.length === 0) {
          return { success: false, error: 'Поблизости нет подходящих животных.' };
        }

        const target = animals[0];
        await adaptiveCamera.calmLookAt(bot, target.position.offset(0, 0.6, 0));

        if (args.action === 'shear') {
          const shears = bot.inventory.items().find((i) => i.name === 'shears');
          if (!shears) return { success: false, error: 'В инвентаре нет ножниц.' };
          await bot.equip(shears, 'hand');
          await bot.useOn(target);
          return { success: true, data: `Постригли ${target.name}` };
        }

        if (args.action === 'milk') {
          const bucket = bot.inventory.items().find((i) => i.name === 'bucket');
          if (!bucket) return { success: false, error: 'В инвентаре нет пустого ведра.' };
          await bot.equip(bucket, 'hand');
          await bot.useOn(target);
          return { success: true, data: `Подоили ${target.name}` };
        }

        if (args.action === 'breed') {
          const foodMap = {
            cow: 'wheat',
            sheep: 'wheat',
            pig: 'carrot',
            chicken: 'wheat_seeds',
          };
          const foodName = foodMap[target.name] || 'wheat';
          const foodItem = bot.inventory.items().find((i) => i.name.includes(foodName));
          if (!foodItem) return { success: false, error: `Для разведения ${target.name} требуется ${foodName}` };
          await bot.equip(foodItem, 'hand');
          await bot.useOn(target);
          return { success: true, data: `Покормили ${target.name} для разведения` };
        }

        return { success: false, error: `Неизвестное действие: ${args.action}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
