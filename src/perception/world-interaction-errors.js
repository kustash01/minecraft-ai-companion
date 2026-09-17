import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('WORLD_INTERACTION_ERRORS');

/**
 * Система реалистичных ошибок при взаимодействии с миром.
 *
 * Бот НЕ идеален — иногда промахивается, ломает не тот блок, пропускает удары.
 * Как настоящий человек, который ошибается.
 */

export class WorldInteractionErrors {
  constructor({ agentName, emotionalSystem }) {
    this.agentName = agentName;
    this.emotions = emotionalSystem;

    // БОЕВЫЕ ОШИБКИ
    this.combatErrors = {
      missAttack: 0.05,        // 5% - промах мечом
      wrongBlockPlacement: 0.02, // 2% - неправильное расположение
      shieldFail: 0.03,        // 3% - щит не спасает
      critFail: 0.01,          // 1% - критический промах
      toolBreak: 0.01,         // 1% - поломка инструмента не вовремя
    };

    // СТРОИТЕЛЬНЫЕ ОШИБКИ
    this.buildingErrors = {
      wrongBlock: 0.03,        // 3% - ломает не тот блок
      wrongPlacement: 0.04,    // 4% - ставит блок не туда
      offByOne: 0.02,          // 2% - промах на один блок
      dropBlock: 0.01,         // 1% - выронить блок
      clickMiss: 0.02,         // 2% - клик мимо
    };

    // ОШИБКИ С ПРЕДМЕТАМИ
    this.itemErrors = {
      wrongItem: 0.03,         // 3% - использовал неправильный предмет
      itemDrop: 0.003,         // 0.3% - выронил предмет из инвентаря (очень редко!)
      wrongSlot: 0.02,         // 2% - взял из неправильного слота
      itemSwap: 0.01,          // 1% - поменялись предметы случайно
    };

    // ОШИБКИ НАВИГАЦИИ
    this.navigationErrors = {
      wrongDirection: 0.04,    // 4% - пошёл в неправильную сторону
      fallDamage: 0.02,        // 2% - упал и получил урон
      stickyWeb: 0.01,         // 1% - запутался в паутине
      wrongJump: 0.02,         // 2% - неудачный прыжок
      wrongPath: 0.03,         // 3% - выбрал неоптимальный путь
    };

    // ОШИБКИ ВЗАИМОДЕЙСТВИЯ
    this.interactionErrors = {
      wrongNPC: 0.02,          // 2% - кликнул на неправильного NPC
      wrongContainer: 0.02,    // 2% - открыл неправильный сундук
      wrongButton: 0.01,       // 1% - нажал на неправильную кнопку
      timing: 0.03,            // 3% - неправильное время действия
    };

    // История ошибок (для обучения)
    this.errorHistory = [];
    this.maxHistoryLength = 50;
  }

  /**
   * БОЕВЫЕ ОШИБКИ - промах, неудачный щит, критический промах
   */
  checkCombatErrors(action, context = {}) {
    const errors = {
      missed: false,
      shieldFailed: false,
      crit: false,
      details: null,
    };

    let missChance = this.combatErrors.missAttack;
    let shieldChance = this.combatErrors.shieldFail;

    // Модификаторы на основе эмоций
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.stress > 0.7) missChance += 0.1;      // Стресс → промахи
      if (mood.fatigue > 0.6) missChance += 0.08;    // Усталость → промахи
      if (mood.confidence < 0.3) missChance += 0.15; // Неуверенность → промахи
      if (mood.excitement > 0.8) missChance -= 0.05; // Возбуждение → точнее
    }

    // Модификаторы контекста
    if (context.health && context.health < 8) {
      missChance += 0.2;    // Раненый человек хуже метит
    }
    if (context.isMoving) {
      missChance += 0.08;   // Движение усложняет
    }

    // Проверяем промах
    if (HumanErrorEngine.chance(missChance, this.emotions)) {
      errors.missed = true;
      errors.details = {
        type: 'miss',
        description: this._generateMissDescription(),
        severity: 'moderate',
      };
    }

    // Проверяем отказ щита
    if (action === 'block' && HumanErrorEngine.chance(shieldChance, this.emotions)) {
      errors.shieldFailed = true;
      errors.details = {
        type: 'shieldFail',
        description: 'Щит не спас',
        severity: 'moderate',
        damage: Math.round(HumanErrorEngine.range(1, 3, this.emotions)), // 1-3 урона
      };
    }

    // Критический промах (очень редко)
    if (HumanErrorEngine.chance(this.combatErrors.critFail, this.emotions)) {
      errors.crit = true;
      errors.details = {
        type: 'critFail',
        description: 'Полный промах!',
        severity: 'severe',
        effect: 'stamina_loss', // Потеря выносливости
      };
    }

    if (errors.missed || errors.shieldFailed || errors.crit) {
      this._recordError(errors.details);
    }

    return errors;
  }

  /**
   * СТРОИТЕЛЬНЫЕ ОШИБКИ - ломает не тот блок, ставит не туда
   */
  checkBuildingErrors(action, context = {}) {
    const errors = {
      wrongBlock: false,
      wrongPlacement: false,
      clickMissed: false,
      details: null,
    };

    let wrongBlockChance = this.buildingErrors.wrongBlock;
    let placementChance = this.buildingErrors.wrongPlacement;
    let clickChance = this.buildingErrors.clickMiss;

    // Модификаторы эмоций
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.fatigue > 0.6) wrongBlockChance += 0.1;
      if (mood.boredom > 0.6) wrongBlockChance += 0.08;
      if (mood.concentration < 0.4) clickChance += 0.15;
    }

    // Проверяем - ломит не тот блок
    if (action === 'mine' && HumanErrorEngine.chance(wrongBlockChance, this.emotions)) {
      errors.wrongBlock = true;
      const blocks = ['stone', 'dirt', 'gravel', 'sand', 'oak_log'];
      const wrongBlock = HumanErrorEngine.choice(blocks);

      errors.details = {
        type: 'wrongBlock',
        description: `Ломает ${wrongBlock} вместо нужного блока`,
        severity: 'mild',
        affectedBlock: wrongBlock,
      };
    }

    // Проверяем - ставит блок не туда
    if (action === 'place' && HumanErrorEngine.chance(placementChance, this.emotions)) {
      errors.wrongPlacement = true;
      const directions = ['left', 'right', 'forward', 'backward', 'up', 'down'];
      const wrong = HumanErrorEngine.choice(directions);

      errors.details = {
        type: 'wrongPlacement',
        description: `Ставит блок в сторону от цели (${wrong})`,
        severity: 'mild',
        offset: wrong,
      };
    }

    // Проверяем - клик мимо
    if (HumanErrorEngine.chance(clickChance, this.emotions)) {
      errors.clickMissed = true;
      errors.details = {
        type: 'clickMiss',
        description: 'Клик мимо цели',
        severity: 'mild',
      };
    }

    if (errors.wrongBlock || errors.wrongPlacement || errors.clickMissed) {
      this._recordError(errors.details);
    }

    return errors;
  }

  /**
   * ОШИБКИ С ПРЕДМЕТАМИ - выронил, неправильный предмет, неправильный слот
   */
  checkItemErrors(action, context = {}) {
    const errors = {
      wrongItem: false,
      dropped: false,
      wrongSlot: false,
      details: null,
    };

    let wrongItemChance = this.itemErrors.wrongItem;
    let dropChance = this.itemErrors.itemDrop;
    let wrongSlotChance = this.itemErrors.wrongSlot;

    // Модификаторы
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.stress > 0.7) dropChance += 0.15; // Напряжение → выронить
      if (mood.fatigue > 0.6) wrongItemChance += 0.1;
      if (mood.confusion > 0.5) wrongSlotChance += 0.12;
    }

    // Выронить предмет
    if (HumanErrorEngine.chance(dropChance, this.emotions)) {
      errors.dropped = true;
      const items = ['diamond', 'iron_ingot', 'stick', 'apple', 'gold_nugget'];
      const dropped = HumanErrorEngine.choice(items);

      errors.details = {
        type: 'itemDrop',
        description: `Выронил ${dropped}`,
        severity: 'moderate',
        item: dropped,
      };
    }

    // Неправильный предмет
    if (action === 'use_item' && HumanErrorEngine.chance(wrongItemChance, this.emotions)) {
      errors.wrongItem = true;
      errors.details = {
        type: 'wrongItem',
        description: 'Использовал неправильный предмет',
        severity: 'moderate',
      };
    }

    // Неправильный слот
    if (HumanErrorEngine.chance(wrongSlotChance, this.emotions)) {
      errors.wrongSlot = true;
      errors.details = {
        type: 'wrongSlot',
        description: 'Взял из неправильного слота',
        severity: 'mild',
      };
    }

    if (errors.dropped || errors.wrongItem || errors.wrongSlot) {
      this._recordError(errors.details);
    }

    return errors;
  }

  /**
   * ОШИБКИ НАВИГАЦИИ - пошёл в неправильную сторону, упал, запутался
   */
  checkNavigationErrors(action, context = {}) {
    const errors = {
      wrongDirection: false,
      fell: false,
      stuck: false,
      details: null,
    };

    let directionChance = this.navigationErrors.wrongDirection;
    let fallChance = this.navigationErrors.fallDamage;
    let stuckChance = this.navigationErrors.stickyWeb;

    // Модификаторы
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.confusion > 0.6) directionChance += 0.15;
      if (mood.excitement > 0.8) fallChance += 0.1; // Спешка → падения
      if (mood.fear > 0.6) stuckChance += 0.08;
    }

    // Пошёл в неправильную сторону
    if (HumanErrorEngine.chance(directionChance, this.emotions)) {
      errors.wrongDirection = true;
      const directions = ['левую', 'правую', 'противоположную'];
      const wrong = HumanErrorEngine.choice(directions);

      errors.details = {
        type: 'wrongDirection',
        description: `Пошёл в ${wrong} сторону`,
        severity: 'mild',
      };
    }

    // Упал и получил урон
    if (context.hasHeight && HumanErrorEngine.chance(fallChance, this.emotions)) {
      errors.fell = true;
      errors.details = {
        type: 'fallDamage',
        description: 'Упал и получил урон',
        severity: 'moderate',
        damage: Math.round(HumanErrorEngine.range(1, 4, this.emotions)), // 1-4 урона
      };
    }

    // Запутался в паутине
    if (context.hasWeb && HumanErrorEngine.chance(stuckChance, this.emotions)) {
      errors.stuck = true;
      errors.details = {
        type: 'stickyWeb',
        description: 'Запутался в паутине',
        severity: 'moderate',
        slowness: 2000, // 2 секунды замедления
      };
    }

    if (errors.wrongDirection || errors.fell || errors.stuck) {
      this._recordError(errors.details);
    }

    return errors;
  }

  /**
   * ОШИБКИ ВЗАИМОДЕЙСТВИЯ - открыл не тот сундук, нажал на неправильную кнопку
   */
  checkInteractionErrors(action, context = {}) {
    const errors = {
      wrongTarget: false,
      wrongTiming: false,
      details: null,
    };

    let targetChance = this.interactionErrors.wrongNPC;
    let timingChance = this.interactionErrors.timing;

    // Модификаторы
    if (this.emotions) {
      const mood = this.emotions.getMood();
      if (mood.fatigue > 0.6) targetChance += 0.12;
      if (mood.stress > 0.7) timingChance += 0.15;
    }

    // Открыл не тот сундук/NPC
    if (HumanErrorEngine.chance(targetChance, this.emotions)) {
      errors.wrongTarget = true;
      errors.details = {
        type: 'wrongTarget',
        description: 'Взаимодействовал с неправильной целью',
        severity: 'mild',
      };
    }

    // Неправильное время (слишком рано/поздно)
    if (HumanErrorEngine.chance(timingChance, this.emotions)) {
      errors.wrongTiming = true;
      errors.details = {
        type: 'wrongTiming',
        description: 'Действие выполнено в неправильный момент',
        severity: 'moderate',
      };
    }

    if (errors.wrongTarget || errors.wrongTiming) {
      this._recordError(errors.details);
    }

    return errors;
  }

  /**
   * Генерирует описание промаха
   */
  _generateMissDescription() {
    const descriptions = [
      'Промахнулся!',
      'Мимо прошёл удар',
      'Не попал',
      'Клинок прошёл мимо',
      'Совсем не туда ударил',
      'Уклонился враг',
    ];
    return HumanErrorEngine.choice(descriptions);
  }

  /**
   * Записывает ошибку в историю
   */
  _recordError(error) {
    this.errorHistory.push({
      ...error,
      timestamp: Date.now(),
    });

    if (this.errorHistory.length > this.maxHistoryLength) {
      this.errorHistory.shift();
    }

    logger.debug(`[${this.agentName}] Ошибка: ${error.type} - ${error.description}`);
  }

  /**
   * Получает статистику ошибок
   */
  getErrorStats() {
    const stats = {
      total: this.errorHistory.length,
      byType: {},
      bySeverity: {},
    };

    for (const error of this.errorHistory) {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Получает последние ошибки
   */
  getRecentErrors(count = 10) {
    return this.errorHistory.slice(-count);
  }
}
