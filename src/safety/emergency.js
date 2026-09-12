import { createLogger } from '../utils/logger.js';

const logger = createLogger('ERROR');

export class EmergencyController {
  constructor({ bot, planner, aiBrain }) {
    this.bot = bot;
    this.planner = planner;
    this.aiBrain = aiBrain;
    this.isPaused = false;
  }

  /**
   * Экстренная остановка всех действий бота.
   */
  emergencyStop(reason = 'Экстренная остановка', { announce = false } = {}) {
    logger.warn(`🚨 [EMERGENCY STOP] ${reason}`);

    try {
      // 1. Останавливаем навигацию и сбрасываем кнопки управления
      if (this.bot && this.bot.pathfinder) {
        this.bot.pathfinder.stop();
      }
      if (this.bot?.clearControlStates) {
        this.bot.clearControlStates();
      }

      // 2. Останавливаем атаку / pvp
      if (this.bot && this.bot.pvp) {
        this.bot.pvp.stop();
      }

      // 3. Отменяем активный план
      if (this.planner) {
        this.planner.cancelPlan('Emergency stop');
      }

      // 4. Сбрасываем текущую сессию AI
      if (this.aiBrain) {
        this.aiBrain.stop();
      }

      if (announce && this.bot?.chat) this.bot.chat('стоп');
      return true;
    } catch (err) {
      logger.error(`Ошибка при экстренной остановке: ${err.message}`);
      return false;
    }
  }

  /**
   * Приостанавливает выполнение действий.
   */
  pause() {
    this.isPaused = true;
    if (this.bot && this.bot.pathfinder) {
      this.bot.pathfinder.stop();
    }
    logger.info('⏸️ Бот поставлен на паузу');
    return true;
  }

  /**
   * Возобновляет работу.
   */
  resume() {
    this.isPaused = false;
    logger.info('▶️ Работа бота возобновлена');
    return true;
  }
}
