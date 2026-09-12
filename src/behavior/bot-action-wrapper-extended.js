import { WorldInteractionErrorsExtended } from '../perception/world-interaction-errors-extended.js';
import vec3 from 'vec3';

/**
 * Расширенный wrapper для действий бота - ОЧЕНЬ МНОГО механик ошибок!
 */
export class BotActionWrapperExtended {
  constructor(bot, emotionalSystem, agentName = 'Bot') {
    this.bot = bot;
    this.errorSystem = new WorldInteractionErrorsExtended({
      agentName,
      emotionalSystem,
    });
    this.agentName = agentName;
  }

  /**
   * Универсальная проверка действия на ВСЕ возможные ошибки
   */
  async executeActionWithChecks(actionName, action, context = {}) {
    // Проверяем ВСЕ возможные ошибки
    const errors = this.errorSystem.checkAllPossibleErrors(actionName, context);

    if (errors.occurred) {
      console.log(`❌ ${this.agentName}: ${errors.details.description}`);

      // Если это не критическая ошибка - пробуем выполнить
      if (errors.details.severity !== 'severe') {
        return false; // Действие не выполнено
      }
    }

    // Выполняем действие
    try {
      return await action();
    } catch (e) {
      console.error(`❌ ${this.agentName} ошибка при ${actionName}:`, e.message);
      return false;
    }
  }

  /**
   * Атака с проверкой на ВСЕ боевые ошибки
   */
  async attack(entity) {
    const combatErrors = this.errorSystem?.checkCombatErrors?.('attack', {
      health: this.bot?.health,
      isMoving: this.bot?.entity?.velocity?.length() > 0,
    });

    if (combatErrors) {
      // Человеческий промах: рука дернулась или ударил в воздух
      if (this.bot?.entity && typeof this.bot.look === 'function') {
        const jitterYaw = (Math.random() > 0.5 ? 0.14 : -0.14);
        this.bot.look(this.bot.entity.yaw + jitterYaw, this.bot.entity.pitch, true).catch(() => {});
      }
      if (typeof this.bot?.swingArm === 'function') {
        this.bot.swingArm();
      }
      return false;
    }

    try {
      if (this.bot?.pvp && typeof this.bot.pvp.attack === 'function') {
        this.bot.pvp.attack(entity);
      } else if (typeof this.bot?.attack === 'function') {
        this.bot.attack(entity);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Копание с человеческой реакцией на промах
   */
  async mineBlock(block) {
    const buildErrors = this.errorSystem?.checkBuildingErrors?.('mine', { block });

    try {
      if (buildErrors && block?.position && typeof this.bot?.blockAt === 'function') {
        // Человеческая заминка: ударил по соседнему блоку на долю секунды
        const nearbyPos = block.position.offset(
          Math.floor(Math.random() * 3) - 1,
          0,
          Math.floor(Math.random() * 3) - 1
        );
        const adjacentBlock = this.bot.blockAt(nearbyPos);
        if (adjacentBlock && adjacentBlock !== block && typeof this.bot.lookAt === 'function') {
          await this.bot.lookAt(adjacentBlock.position.offset(0.5, 0.5, 0.5), true);
          if (typeof this.bot.swingArm === 'function') this.bot.swingArm();
          await new Promise(r => setTimeout(r, 160)); // Коррекция прицела
        }
      }

      if (block?.position && typeof this.bot?.lookAt === 'function') {
        await this.bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      }
      if (typeof this.bot?.dig === 'function') {
        return await this.bot.dig(block);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Плейс блока с проверкой
   */
  async placeBlock(referenceBlock, direction) {
    const buildErrors = this.errorSystem?.checkBuildingErrors?.('place', { referenceBlock });

    try {
      if (buildErrors && Math.random() < 0.35) {
        // Установка не на ту грань (легкий промах)
        const validFaces = [vec3(0, 1, 0), vec3(0, -1, 0), vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 0, -1)];
        const alternativeFace = validFaces[Math.floor(Math.random() * validFaces.length)];
        return await this.bot.placeBlock(referenceBlock, alternativeFace);
      }
      return await this.bot.placeBlock(referenceBlock, direction);
    } catch (e) {
      return false;
    }
  }

  /**
   * Крафтинг с проверкой
   */
  async craft(recipe) {
    return this.executeActionWithChecks('craft', async () => {
      // Логика крафтинга
      return true;
    }, { recipe });
  }

  /**
   * Рыбалка с проверкой
   */
  async fish() {
    return this.executeActionWithChecks('fish', async () => {
      // Логика рыбалки
      return true;
    }, {});
  }

  /**
   * Использование зелья с проверкой
   */
  async drinkPotion(potion) {
    return this.executeActionWithChecks('drink_potion', async () => {
      if (this.bot.equip && potion) {
        await this.bot.equip(potion, 'hand');
        await this.bot.consume();
      }
      return true;
    }, { potion });
  }

  /**
   * Верховая езда с проверкой
   */
  async rideEntity(entity) {
    return this.executeActionWithChecks('ride', async () => {
      if (this.bot.mount) await this.bot.mount(entity);
      return true;
    }, { entity });
  }

  /**
   * Движение с проверкой ВСЕ навигационных ошибок
   */
  async moveTowards(target) {
    return this.executeActionWithChecks('navigate', async () => {
      // Логика движения
      return true;
    }, { target });
  }

  /**
   * Стрельба из лука с проверкой прицеливания
   */
  async shootBow(target) {
    return this.executeActionWithChecks('shoot_bow', async () => {
      if (this.bot.activateItem) await this.bot.activateItem(true);
      return true;
    }, { target });
  }

  /**
   * Открыть контейнер с проверкой
   */
  async openContainer(block) {
    return this.executeActionWithChecks('open_container', async () => {
      return this.bot.openContainer(block);
    }, { block });
  }

  /**
   * Взаимодействие с редстоуном с проверкой
   */
  async interactRedstone(block) {
    return this.executeActionWithChecks('redstone_interact', async () => {
      await this.bot.activate(block);
      return true;
    }, { block });
  }

  getStats() {
    return this.errorSystem.getStats();
  }

  getErrorHistory(count = 20) {
    return this.errorSystem.errorHistory.slice(-count);
  }
}
