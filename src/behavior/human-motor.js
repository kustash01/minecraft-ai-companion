import { createLogger } from '../utils/logger.js';

const logger = createLogger('HUMAN_MOTOR');

/**
 * HumanMotor — эмуляция физики и моторики живого человека:
 * - Плавное человеческое движение мыши (сглаживание углов взгляда)
 * - Jump-sprinting (паркур и спринт с прыжками для ускорения)
 * - Автоматическая сортировка хотбара по слотам 1-9
 * - Смена предметов в левую руку (F-key offhand swap)
 * - MLG Water Clutch (спасение ведром воды при падении с высоты)
 */
export class HumanMotor {
  /**
   * Сортировка хотбара по стандарту реального игрока
   * Слот 0: Меч/Оружие, Слот 1: Кирка, Слот 2: Топор/Лопата, Слот 3: Блоки/Факелы, Слот 8: Еда
   */
  static async organizeHotbar(bot) {
    if (!bot || !bot.inventory) return;

    try {
      const items = bot.inventory.items();
      const hotbarSlots = [36, 37, 38, 39, 40, 41, 42, 43, 44]; // Minecraft 1.20 hotbar inventory slots

      const sword = items.find((i) => i.name.includes('sword'));
      const pickaxe = items.find((i) => i.name.includes('pickaxe'));
      const axeOrShovel = items.find((i) => i.name.includes('axe') || i.name.includes('shovel'));
      const blocksOrTorches = items.find((i) => i.name.includes('planks') || i.name.includes('cobblestone') || i.name.includes('torch'));
      const food = items.find((i) => ['bread', 'cooked_beef', 'cooked_porkchop', 'apple', 'baked_potato', 'carrot'].includes(i.name));

      // Назначаем в быстрые слоты
      if (sword && bot.inventory.slots[hotbarSlots[0]]?.name !== sword.name) {
        await bot.moveSlotItem(sword.slot, hotbarSlots[0]);
      }
      if (pickaxe && bot.inventory.slots[hotbarSlots[1]]?.name !== pickaxe.name) {
        await bot.moveSlotItem(pickaxe.slot, hotbarSlots[1]);
      }
      if (axeOrShovel && bot.inventory.slots[hotbarSlots[2]]?.name !== axeOrShovel.name) {
        await bot.moveSlotItem(axeOrShovel.slot, hotbarSlots[2]);
      }
      if (blocksOrTorches && bot.inventory.slots[hotbarSlots[3]]?.name !== blocksOrTorches.name) {
        await bot.moveSlotItem(blocksOrTorches.slot, hotbarSlots[3]);
      }
      if (food && bot.inventory.slots[hotbarSlots[8]]?.name !== food.name) {
        await bot.moveSlotItem(food.slot, hotbarSlots[8]);
      }
    } catch (err) {
      logger.debug(`Hotbar organize error: ${err.message}`);
    }
  }

  /**
   * Плавное перемещение взгляда к цели (человеческая интерполяция)
   */
  static async smoothLook(bot, targetPos, steps = 5) {
    if (!bot || !bot.entity || !targetPos || typeof bot.look !== 'function') return;

    try {
      const dx = targetPos.x - bot.entity.position.x;
      const dy = targetPos.y - (bot.entity.position.y + 1.6);
      const dz = targetPos.z - bot.entity.position.z;
      const targetYaw = Math.atan2(-dx, -dz);
      const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));

      let currentYaw = bot.entity.yaw;
      let currentPitch = bot.entity.pitch;

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const interpYaw = currentYaw + (targetYaw - currentYaw) * t;
        const interpPitch = currentPitch + (targetPitch - currentPitch) * t;
        await bot.look(interpYaw, interpPitch, true);
        await new Promise((r) => setTimeout(r, 20));
      }
    } catch (e) {}
  }

  /**
   * Jump-Sprinting: ускоренное перемещение прыжками с зажатым спринтом
   */
  static startJumpSprint(bot) {
    if (!bot || typeof bot.setControlState !== 'function') return;
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);
    if (bot.entity?.onGround) {
      bot.setControlState('jump', true);
      setTimeout(() => bot?.setControlState?.('jump', false), 200);
    }
  }

  /**
   * MLG Water Clutch — спасение от падения ведром воды
   */
  static async checkWaterClutch(bot) {
    if (!bot || !bot.entity || !bot.entity.velocity) return false;

    // Падение с высокой вертикальной скоростью
    if (bot.entity.velocity.y < -0.65 && !bot.entity.isInWater) {
      const waterBucket = bot.inventory?.items()?.find((i) => i.name === 'water_bucket');
      if (waterBucket) {
        try {
          await bot.equip(waterBucket, 'hand');
          // Наводим взгляд вниз и ставим воду за 1 блок до земли
          await bot.look(bot.entity.yaw, -Math.PI / 2, true);
          bot.activateItem();
          logger.info(`[${bot.username || 'Bot'}] 💧 MLG Water Clutch активирован!`);

          // Через 500мс подбираем воду обратно
          setTimeout(async () => {
            const bucket = bot.inventory?.items()?.find((i) => i.name === 'bucket');
            if (bucket) {
              await bot.equip(bucket, 'hand');
              bot.activateItem();
            }
          }, 600);
          return true;
        } catch (e) {}
      }
    }
    return false;
  }
}
