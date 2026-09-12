import { createLogger } from '../utils/logger.js';
import { POITypes } from '../memory/poi-manager.js';

const logger = createLogger('ERROR');

export class DeathHandler {
  constructor(bot, memoryManager, config) {
    this.bot = bot;
    this.memoryManager = memoryManager;
    this.owner = config?.bot?.owner || 'kustash01';
    this.botDeathCount = 0;
    this.lastBotDeathTime = 0;
    this.maxDeathsInWindow = 3;
    this.deathWindowMs = 180000; // 3 minutes
  }

  /**
   * Обработка смерти игрока.
   */
  handlePlayerDeath(playerName, position) {
    if (!position) return;

    const coords = {
      x: Math.round(position.x),
      y: Math.round(position.y),
      z: Math.round(position.z),
    };

    logger.warn(`💀 [СМЕРТЬ ИГРОКА] ${playerName} погиб на [${coords.x}, ${coords.y}, ${coords.z}]`);

    // Сохраняем в память как точку интереса
    if (this.memoryManager) {
      this.memoryManager.pois.addPOI(
        `Место гибели ${playerName}`,
        POITypes.DEATH,
        coords,
        `Погиб в ${new Date().toLocaleTimeString()}`
      );

      this.memoryManager.episodic.rememberEpisode({
        mcDay: this.bot?.time ? Math.floor(this.bot.time.time / 24000) + 1 : 1,
        eventType: 'death',
        summary: `${playerName} погиб на координатах [${coords.x}, ${coords.y}, ${coords.z}]`,
        position: coords,
        participants: playerName,
        outcome: 'потеря вещей',
        importance: 8,
      });
    }

    // Событие сохраняется в память; социальную реакцию выбирает ConversationEngine.
  }

  /**
   * Обработка смерти самого бота.
   */
  handleBotDeath() {
    const now = Date.now();
    if (now - this.lastBotDeathTime < this.deathWindowMs) {
      this.botDeathCount++;
    } else {
      this.botDeathCount = 1;
    }
    this.lastBotDeathTime = now;

    let coords = { x: 0, y: 0, z: 0 };
    if (this.bot && this.bot.entity) {
      coords = {
        x: Math.round(this.bot.entity.position.x),
        y: Math.round(this.bot.entity.position.y),
        z: Math.round(this.bot.entity.position.z),
      };
    }

    logger.warn(`💀 [СМЕРТЬ БОТА] Бот погиб на [${coords.x}, ${coords.y}, ${coords.z}] (смерть #${this.botDeathCount})`);

    // Защита от бесконечного цикла смертей
    if (this.botDeathCount >= this.maxDeathsInWindow) {
      logger.error('⚠️ [ДЕЗЛУП ДЕТЕКТЕД] Слишком много смертей подряд! Бот переходит в пассивный режим.');
      // Не отправляем автоматическое сообщение: участник может промолчать.
      return false;
    }

    if (this.memoryManager) {
      this.memoryManager.episodic.rememberEpisode({
        mcDay: this.bot?.time ? Math.floor(this.bot.time.time / 24000) + 1 : 1,
        eventType: 'bot_death',
        summary: `Бот погиб на [${coords.x}, ${coords.y}, ${coords.z}]`,
        position: coords,
        importance: 7,
      });
    }

    return true;
  }
}
