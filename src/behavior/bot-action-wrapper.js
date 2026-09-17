import { WorldInteractionErrors } from '../perception/world-interaction-errors.js';
import vec3 from 'vec3';
import { HumanErrorEngine } from './human-error-engine.js';

/**
 * Wrapper для действий бота - добавляет реалистичные ошибки
 */
export class BotActionWrapper {
  constructor(bot, emotionalSystem, agentName = 'Bot') {
    this.bot = bot;
    this.errorSystem = new WorldInteractionErrors({
      agentName,
      emotionalSystem,
    });
    this.agentName = agentName;
  }

  /**
   * Плейс блока с возможными ошибками
   */
  async placeBlock(referenceBlock, direction) {
    // Проверяем ошибки строительства
    const buildErrors = this.errorSystem.checkBuildingErrors('place', {});

    try {
      if (buildErrors.wrongPlacement) {
        console.log(`❌ ${this.agentName}: ${buildErrors.details.description}`);
        const validFaces = [vec3(0, 1, 0), vec3(0, -1, 0), vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 0, -1)];
        const alternativeFace = HumanErrorEngine.choice(validFaces);
        return await this.bot.placeBlock(referenceBlock, alternativeFace);
      }

      if (buildErrors.clickMissed) {
        console.log(`❌ ${this.agentName}: Клик мимо!`);
        return false;
      }

      // Нормально плейсим
      return await this.bot.placeBlock(referenceBlock, direction);
    } catch (e) {
      return false;
    }
  }

  /**
   * Разрушение блока с возможными ошибками
   */
  async mineBlock(block) {
    // Проверяем ошибки
    const buildErrors = this.errorSystem.checkBuildingErrors('mine', {});

    try {
      if (buildErrors.wrongBlock) {
        console.log(`❌ ${this.agentName}: ${buildErrors.details.description}`);
        // Ломаем соседний блок
        const nearby = this.bot.blockAt(block.position.offset(Math.floor(HumanErrorEngine.range(-1, 2)), 0, Math.floor(HumanErrorEngine.range(-1, 2))));
        if (nearby && typeof this.bot.dig === 'function') return await this.bot.dig(nearby);
      }

      if (buildErrors.clickMissed) {
        console.log(`❌ ${this.agentName}: Клик мимо!`);
        return false;
      }

      // Нормально ломаем
      if (typeof this.bot.dig === 'function') {
        return await this.bot.dig(block);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Атака с возможными ошибками
   */
  async attack(entity) {
    const combatErrors = this.errorSystem.checkCombatErrors('attack', {
      health: this.bot.health,
    });

    if (combatErrors.missed) {
      console.log(`❌ ${this.agentName}: Промахнулся!`);
      return false;
    }

    if (combatErrors.crit) {
      console.log(`❌ ${this.agentName}: КРИТИЧЕСКИЙ ПРОМАХ!`);
      return false;
    }

    // Нормально атакуем
    try {
      if (this.bot.pvp) this.bot.pvp.attack(entity);
      else if (this.bot.attack) this.bot.attack(entity);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Движение с возможными ошибками
   */
  async moveTowards(target) {
    const navErrors = this.errorSystem.checkNavigationErrors('move', {});

    if (navErrors.wrongDirection) {
      console.log(`❌ ${this.agentName}: ${navErrors.details.description}`);
      // Идём в неправильную сторону
      const wrongTarget = {
        x: target.x + (HumanErrorEngine.coinFlip() ? 5 : -5),
        y: target.y,
        z: target.z + (HumanErrorEngine.coinFlip() ? 5 : -5),
      };
      // Пытаемся туда идти
    }

    if (navErrors.stuck) {
      console.log(`❌ ${this.agentName}: ${navErrors.details.description}`);
      return false;
    }

    return true;
  }

  getErrorStats() {
    return this.errorSystem.getErrorStats();
  }
}
