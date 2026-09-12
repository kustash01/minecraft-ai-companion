import { createLogger } from '../utils/logger.js';
import { ErrorMemory } from './error-memory.js';
import { PersonalityHabits } from './personality-habits.js';
import { EnvironmentInfluence } from './environment-influence.js';

const logger = createLogger('WORLD_INTERACTION_ERRORS_EXTENDED');

/**
 * РАСШИРЕННАЯ система реалистичных ошибок при взаимодействии с миром.
 *
 * ОЧЕНЬ МНОГО механик как у настоящего человека!
 * - Боевые ошибки (7 типов)
 * - Строительные ошибки (8 типов)
 * - Крафтинг и готовка (6 типов)
 * - Рыбалка (4 типа)
 * - Зелья (5 типов)
 * - Верховая езда (5 типов)
 * - Прицеливание (5 типов)
 * - Интерпретация команд (4 типа)
 * - Оценка расстояния (4 типа)
 * - Навигация продвинутая (6 типов)
 * - И ещё МНОГО!
 */

export class WorldInteractionErrorsExtended {
  constructor({ agentName, emotionalSystem }) {
    this.agentName = agentName;
    this.emotions = emotionalSystem;

    // ⚔️ БОЕВЫЕ ОШИБКИ
    this.combatErrors = {
      missAttack: 0.05,           // 5% - промах мечом
      shieldFail: 0.03,           // 3% - щит не спасает
      wrongBlockPlacement: 0.02,  // 2% - неправильное расположение
      critFail: 0.01,             // 1% - критический промах
      shieldUpTooLate: 0.04,      // 4% - поднял щит слишком поздно
      bowMiss: 0.08,              // 8% - промах из лука
      crossbowFail: 0.06,         // 6% - ошибка с арбалетом
    };

    // 🏗️ СТРОИТЕЛЬНЫЕ ОШИБКИ
    this.buildingErrors = {
      wrongBlock: 0.03,           // 3% - ломает не тот блок
      wrongPlacement: 0.04,       // 4% - ставит блок не туда
      offByOne: 0.02,             // 2% - промах на один блок
      dropBlock: 0.01,            // 1% - выронить блок
      clickMiss: 0.02,            // 2% - клик мимо
      placeTooHigh: 0.02,         // 2% - поставил блок слишком высоко
      placeTooLow: 0.02,          // 2% - поставил блок слишком низко
      placeRotationWrong: 0.03,   // 3% - неправильная ориентация
    };

    // 🔨 КРАФТИНГ И ГОТОВКА
    this.craftingErrors = {
      wrongRecipe: 0.04,          // 4% - выбрал неправильный рецепт
      wrongMaterial: 0.03,        // 3% - положил неправильный материал
      burnFood: 0.05,             // 5% - пережарил еду
      undercookFood: 0.04,        // 4% - недожарил еду
      forgotToPrepare: 0.02,      // 2% - забыл подготовить ингредиенты
      takeOutTooEarly: 0.03,      // 3% - достал из печи раньше времени
    };

    // 🎣 РЫБАЛКА
    this.fishingErrors = {
      castWrong: 0.06,            // 6% - неправильно забросил удочку
      pullTooEarly: 0.05,         // 5% - вытащил удочку слишком рано
      pullTooLate: 0.04,          // 4% - вытащил удочку слишком поздно
      loseRfish: 0.03,            // 3% - потеря рыбы при вытягивании
    };

    // 🧪 ЗЕЛЬЯ
    this.potionErrors = {
      drinkWrong: 0.04,           // 4% - выпил неправильное зелье
      drinkAtWrongTime: 0.05,     // 5% - выпил в неправильный момент
      spillPotion: 0.02,          // 2% - пролил зелье
      wrongIngredient: 0.03,      // 3% - положил неправильный ингредиент
      fermentTooLong: 0.02,       // 2% - ферментировал слишком долго
    };

    // 🏇 ВЕРХОВАЯ ЕЗДА
    this.ridingErrors = {
      saddleLose: 0.02,           // 2% - потерял седло при падении
      fallFromRide: 0.04,         // 4% - упал со скакуна
      rideTooFast: 0.03,          // 3% - едет слишком быстро и падает
      wrongRideDirection: 0.03,   // 3% - ведёт коня в неправильную сторону
      forgetToSaddle: 0.01,       // 1% - забыл оседлать скакуна
    };

    // 🏹 ПРИЦЕЛИВАНИЕ
    this.aimingErrors = {
      aimTooHigh: 0.04,           // 4% - целит слишком высоко
      aimTooLow: 0.04,            // 4% - целит слишком низко
      aimLeft: 0.03,              // 3% - целит влево
      aimRight: 0.03,             // 3% - целит вправо
      forgotToLoad: 0.02,         // 2% - забыл зарядить оружие
    };

    // 🚪 ДВЕРИ И КОНТЕЙНЕРЫ
    this.interactionErrors = {
      openWrongDoor: 0.03,        // 3% - открыл не ту дверь
      openWrongChest: 0.03,       // 3% - открыл не тот сундук
      closeTooEarly: 0.02,        // 2% - закрыл слишком рано
      forgetToClose: 0.02,        // 2% - забыл закрыть
      wrongButton: 0.01,          // 1% - нажал на неправильную кнопку
    };

    // 📏 ОЦЕНКА РАССТОЯНИЯ
    this.distanceErrors = {
      tooClose: 0.04,             // 4% - подошёл слишком близко
      tooFar: 0.04,               // 4% - стоит слишком далеко
      wrongJump: 0.05,            // 5% - неправильно рассчитал прыжок
      misjudgeHeight: 0.03,       // 3% - неправильно оценил высоту
    };

    // 🗺️ НАВИГАЦИЯ ПРОДВИНУТАЯ
    this.navigationErrors = {
      wrongDirection: 0.04,       // 4% - пошёл в неправильную сторону
      fallDamage: 0.02,           // 2% - упал и получил урон
      stickyWeb: 0.01,            // 1% - запутался в паутине
      trapTrigger: 0.02,          // 2% - попался в ловушку
      lavaContact: 0.02,          // 2% - коснулся лавы
      waterDisorientation: 0.02,  // 2% - потерялся в воде
    };

    // ⚡ РЕДСТОУН И ЭЛЕКТРИЧЕСТВО
    this.redstoneErrors = {
      touchRedstone: 0.02,        // 2% - коснулся редстоуна и получил урон
      wrongCircuit: 0.03,         // 3% - замкнул неправильную цепь
      triggerTrap: 0.02,          // 2% - случайно активировал ловушку
      wrongTiming: 0.03,          // 3% - неправильное время активации
    };

    // 🎯 СТРАТЕГИЯ И ПЛАНИРОВАНИЕ
    this.strategyErrors = {
      wrongStrategy: 0.04,        // 4% - выбрал неправильную стратегию
      panicked: 0.05,             // 5% - паника вместо плана
      overconfident: 0.03,        // 3% - переоценил свои силы
      notPrepared: 0.03,          // 3% - не был готов к бою
    };

    // 🧠 ИНТЕРПРЕТАЦИЯ КОМАНД
    this.commandErrors = {
      misunderstood: 0.03,        // 3% - неправильно понял команду
      delayedReaction: 0.04,      // 4% - задержка в реакции
      forgetCommand: 0.02,        // 2% - забыл команду
      wrongOrder: 0.02,           // 2% - выполнил команды в неправильном порядке
    };

    // 💔 СОЦИАЛЬНЫЕ И ЭМОЦИОНАЛЬНЫЕ
    this.emotionalErrors = {
      angryMistake: 0.05,         // 5% - ошибка от гнева
      sadMistake: 0.03,           // 3% - ошибка от печали
      scaredMistake: 0.04,        // 4% - ошибка от страха
      excitedMistake: 0.04,       // 4% - ошибка от возбуждения
      boredomMistake: 0.03,       // 3% - ошибка от скуки
    };

    // История ошибок
    this.errorHistory = [];
    this.maxHistoryLength = 100;
  }

  /**
   * Проверяет ВСЕ типы ошибок в зависимости от ситуации
   */
  checkAllPossibleErrors(action, context = {}) {
    const errors = {
      occurred: false,
      list: [],
      details: null,
    };

    let errorMethods = [];

    // Определяем какие ошибки проверять в зависимости от действия
    const actionLower = (action || '').toLowerCase();

    if (actionLower.includes('attack') || actionLower.includes('combat')) {
      errorMethods.push(...[
        () => this.checkCombatErrors(action, context),
        () => this.checkAimingErrors(action, context),
      ]);
    }

    if (actionLower.includes('build') || actionLower.includes('place') || actionLower.includes('mine')) {
      errorMethods.push(...[
        () => this.checkBuildingErrors(action, context),
        () => this.checkDistanceErrors(action, context),
      ]);
    }

    if (actionLower.includes('craft') || actionLower.includes('cook')) {
      errorMethods.push(() => this.checkCraftingErrors(action, context));
    }

    if (actionLower.includes('fish')) {
      errorMethods.push(() => this.checkFishingErrors(action, context));
    }

    if (actionLower.includes('potion') || actionLower.includes('drink')) {
      errorMethods.push(() => this.checkPotionErrors(action, context));
    }

    if (actionLower.includes('ride') || actionLower.includes('horse')) {
      errorMethods.push(() => this.checkRidingErrors(action, context));
    }

    if (actionLower.includes('interact') || actionLower.includes('door') || actionLower.includes('chest')) {
      errorMethods.push(() => this.checkInteractionErrors(action, context));
    }

    if (actionLower.includes('navigate') || actionLower.includes('move')) {
      errorMethods.push(() => this.checkNavigationErrors(action, context));
    }

    if (actionLower.includes('redstone') || actionLower.includes('circuit')) {
      errorMethods.push(() => this.checkRedstoneErrors(action, context));
    }

    // Проверяем эмоциональные ошибки всегда
    errorMethods.push(() => this.checkEmotionalErrors(action, context));

    // Выполняем все проверки
    for (const method of errorMethods) {
      const result = method();
      if (result) {
        errors.occurred = true;
        errors.list.push(result);
        if (!errors.details) {
          errors.details = result; // Первая ошибка - основная
        }
      }
    }

    if (errors.occurred) {
      this._recordError(errors.details);
    }

    return errors;
  }

  checkCombatErrors(action, context = {}) {
    let chance = this.combatErrors.missAttack;
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.stress > 0.7) chance += 0.1;
      if (mood.fatigue > 0.6) chance += 0.08;
    }

    if (Math.random() < chance) {
      const error = {
        type: 'combat_miss',
        description: 'Промахнулся в боевом действии',
        severity: 'moderate',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkBuildingErrors(action, context = {}) {
    let chance = this.buildingErrors.wrongBlock;
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.fatigue > 0.6) chance += 0.1;
    }

    if (Math.random() < chance) {
      const error = {
        type: 'building_wrong_block',
        description: 'Ломает не тот блок',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkCraftingErrors(action, context = {}) {
    let chance = this.craftingErrors.wrongRecipe;
    if (this.emotions && this.emotions.getMood().confusion > 0.5) {
      chance += 0.1;
    }

    if (Math.random() < chance) {
      const error = {
        type: 'crafting_wrong_recipe',
        description: 'Выбрал неправильный рецепт',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkFishingErrors(action, context = {}) {
    if (Math.random() < this.fishingErrors.castWrong) {
      const error = {
        type: 'fishing_cast_wrong',
        description: 'Неправильно забросил удочку',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkPotionErrors(action, context = {}) {
    if (Math.random() < this.potionErrors.drinkWrong) {
      const error = {
        type: 'potion_wrong',
        description: 'Выпил неправильное зелье',
        severity: 'moderate',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkRidingErrors(action, context = {}) {
    if (Math.random() < this.ridingErrors.fallFromRide) {
      const error = {
        type: 'riding_fall',
        description: 'Упал со скакуна',
        severity: 'moderate',
        damage: Math.floor(Math.random() * 4) + 1,
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkAimingErrors(action, context = {}) {
    if (Math.random() < this.aimingErrors.aimTooHigh) {
      const error = {
        type: 'aiming_too_high',
        description: 'Целит слишком высоко',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkInteractionErrors(action, context = {}) {
    if (Math.random() < this.interactionErrors.openWrongDoor) {
      const error = {
        type: 'interaction_wrong_target',
        description: 'Открыл не тот контейнер',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkDistanceErrors(action, context = {}) {
    if (Math.random() < this.distanceErrors.wrongJump) {
      const error = {
        type: 'distance_wrong_jump',
        description: 'Неправильно рассчитал прыжок',
        severity: 'moderate',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkNavigationErrors(action, context = {}) {
    if (Math.random() < this.navigationErrors.wrongDirection) {
      const error = {
        type: 'navigation_wrong_direction',
        description: 'Пошёл в неправильную сторону',
        severity: 'mild',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkRedstoneErrors(action, context = {}) {
    if (Math.random() < this.redstoneErrors.touchRedstone) {
      const error = {
        type: 'redstone_touch',
        description: 'Коснулся редстоуна',
        severity: 'moderate',
        damage: 1,
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  checkEmotionalErrors(action, context = {}) {
    if (!this.emotions) return null;

    const mood = this.emotions.getMood();
    let chance = 0;

    if (mood.stress > 0.7) chance = this.emotionalErrors.angryMistake;
    if (mood.excitement > 0.8) chance = this.emotionalErrors.excitedMistake;
    if (mood.fear > 0.6) chance = this.emotionalErrors.scaredMistake;

    if (Math.random() < chance) {
      const error = {
        type: 'emotional_error',
        description: `Ошибка из-за ${mood.stress > 0.7 ? 'стресса' : mood.excitement > 0.8 ? 'возбуждения' : 'страха'}`,
        severity: 'moderate',
      };
      this._recordError(error);
      return error;
    }
    return null;
  }

  _recordError(error) {
    this.errorHistory.push({
      ...error,
      timestamp: Date.now(),
    });

    if (this.errorHistory.length > this.maxHistoryLength) {
      this.errorHistory.shift();
    }

    logger.debug(`[${this.agentName}] ${error.type}: ${error.description}`);
  }

  getStats() {
    return {
      total: this.errorHistory.length,
      recent: this.errorHistory.slice(-10),
    };
  }
}
