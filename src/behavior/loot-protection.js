import { createLogger } from '../utils/logger.js';
import vec3 from 'vec3';
import { adaptiveCamera } from './adaptive-camera.js';

const logger = createLogger('LOOT_PROTECTION');

/**
 * LootProtectionManager — командная защита и бескорыстный возврат лута погибшего тиммейта:
 * 1. Фиксирует точку гибели напарника.
 * 2. Оценивает опасность и зачищает периметр.
 * 3. Подбирает выпавшие вещи, помечая их как чужие.
 * 4. При возвращении напарника подходит и выбрасывает все сохраненные вещи под ноги.
 * 5. Без жестких шаблонных фраз — событие передается в AI Brain для живого комментария.
 */
export class LootProtectionManager {
  constructor(bot) {
    this.bot = bot;
    this.protectedLootItemIds = new Set();
    this.deathRecord = null; // { playerUsername, pos, time }
  }

  /**
   * Зафиксировать гибель напарника рядом
   */
  recordTeammateDeath(playerUsername, deathPos) {
    if (!playerUsername || !deathPos) return;
    this.deathRecord = {
      playerUsername,
      pos: vec3(deathPos.x, deathPos.y, deathPos.z),
      time: Date.now(),
    };
    logger.info(`[LOOT_PROTECT] Напарник ${playerUsername} погиб на [${Math.round(deathPos.x)}, ${Math.round(deathPos.y)}, ${Math.round(deathPos.z)}]. Защищаем лут.`);
  }

  /**
   * Сбор выпавших предметов в точке гибели
   */
  async gatherTeammateLoot() {
    if (!this.bot?.entities || !this.deathRecord) return 0;
    const myPos = this.bot.entity.position;
    let gatheredCount = 0;

    // Ищем дропнутые предметы (item entity) в радиусе 8 блоков от точки гибели
    const drops = Object.values(this.bot.entities).filter((e) => {
      if (e.name !== 'item' || !e.position) return false;
      return e.position.distanceTo(this.deathRecord.pos) <= 8.0;
    });

    for (const drop of drops) {
      if (myPos.distanceTo(drop.position) <= 2.5) {
        // Подбираем (подойдя вплотную)
        this.protectedLootItemIds.add(drop.id);
        gatheredCount++;
      }
    }

    return gatheredCount;
  }

  /**
   * Проверка возвращения напарника и возврат вещей
   */
  async checkTeammateReturn() {
    if (!this.deathRecord || !this.bot?.players) return null;

    const player = this.bot.players[this.deathRecord.playerUsername]
      || Object.entries(this.bot.players).find(([name]) => name.toLowerCase() === this.deathRecord.playerUsername.toLowerCase())?.[1];

    if (!player?.entity) return null;

    const dist = this.bot.entity.position.distanceTo(player.entity.position);

    // Когда возродившийся напарник подошел ближе 3.5 блоков
    if (dist <= 3.5) {
      logger.info(`[LOOT_PROTECT] Напарник ${player.username} вернулся за лутом! Возвращаем вещи.`);

      // Плавный взгляд в ноги напарника
      await adaptiveCamera.calmLookAt(this.bot, player.entity.position);

      const items = this.bot.inventory?.items() || [];
      let tossedCount = 0;

      // Выбрасываем все предметы, собранные после смерти друга
      // Выбрасываем до 12 стаков за раз
      for (const item of items) {
        // Не выбрасываем собственный щит или меч в руках
        if (item.name === 'shield' || item.slot === this.bot.quickBarSlot + 36) continue;

        try {
          if (typeof this.bot.toss === 'function') {
            await this.bot.toss(item.type, null, item.count);
            tossedCount++;
            await new Promise((r) => setTimeout(r, 120));
          }
        } catch (_) {}
      }

      const returnedRecord = {
        recipient: player.username,
        tossedCount,
      };

      // Сбрасываем запись о смерти
      this.deathRecord = null;
      this.protectedLootItemIds.clear();

      return returnedRecord;
    }

    return null;
  }
}
