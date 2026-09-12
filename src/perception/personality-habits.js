import { createLogger } from '../utils/logger.js';

const logger = createLogger('PERSONALITY_HABITS');

/**
 * Система персональных привычек - каждый бот имеет свои слабости и силы!
 */
export class PersonalityHabits {
  constructor(agentName = 'Bot') {
    this.agentName = agentName;

    // Базовые привычки для каждого бота
    this.habits = this._initializeHabitsForBot(agentName);
  }

  _initializeHabitsForBot(name) {
    const baseName = name?.toLowerCase() || '';

    // Каждый бот уникален в своих ошибках!
    if (baseName.includes('sam')) {
      return {
        craftingWeakness: 0.15,      // Sam плохо крафтит (-15% точность)
        combatStrength: 0.10,        // Но хорош в боях (+10% точность)
        navigationWeakness: 0.08,    // Иногда теряется
        buildingStrength: 0.05,      // Хорошо строит
        fishingWeakness: 0.12,       // Плохо рыбачит
      };
    }

    if (baseName.includes('max')) {
      return {
        bowWeakness: 0.18,           // Max плохо стреляет (-18%)
        meleeStrength: 0.12,        // Но хорош в ближнем бою
        navigationStrength: 0.08,    // Хорошо ориентируется
        craftingWeakness: 0.10,      // Среднее крафтинг
        ridingWeakness: 0.14,        // Часто падает с коня
      };
    }

    if (baseName.includes('jack')) {
      return {
        fallDamageWeakness: 0.20,    // Jack часто падает (-20%)
        climbingStrength: 0.10,      // Но хорош в подъёмах
        buildingStrength: 0.12,      // Отличный строитель
        navigationWeakness: 0.05,    // Не теряется
        potionWeakness: 0.15,        // Путает зелья
      };
    }

    if (baseName.includes('ryan')) {
      return {
        redstoneWeakness: 0.16,      // Ryan плохо с редстоуном (-16%)
        mechanicsStrength: 0.13,     // Но понимает механику
        combatStrength: 0.08,        // Хорош в боях
        navigationWeakness: 0.10,    // Иногда теряется
        planningStrength: 0.12,      // Хорошо планирует
      };
    }

    if (baseName.includes('alex')) {
      return {
        multiTaskingWeakness: 0.14,  // Alex плохо с многозадачностью (-14%)
        focusStrength: 0.10,         // Но хороший фокус
        craftingStrength: 0.12,      // Отличный крафтинг
        navigationWeakness: 0.08,    // Средняя навигация
        memoryStrength: 0.15,        // Хорошая память
      };
    }

    if (baseName.includes('leo')) {
      return {
        combatWeakness: 0.12,        // Leo боится врагов (-12%)
        survivalStrength: 0.15,      // Но хорош в выживании
        buildingStrength: 0.10,      // Хорошо строит
        navigationStrength: 0.12,    // Хороший навигатор
        patienceStrength: 0.13,      // Очень терпелив
      };
    }

    // Дефолтные привычки для неизвестного бота
    return {
      craftingWeakness: 0.08,
      combatStrength: 0.05,
      navigationWeakness: 0.06,
      buildingStrength: 0.04,
      allAroundAverage: 0.07,
    };
  }

  /**
   * Получает модификатор ошибки для действия
   */
  getErrorModifier(action) {
    const actionLower = (action || '').toLowerCase();
    let modifier = 1.0;

    // Проверяем слабости (увеличивают ошибки)
    if (actionLower.includes('craft')) {
      modifier *= (1 + (this.habits.craftingWeakness || 0));
    }
    if (actionLower.includes('bow') || actionLower.includes('shoot')) {
      modifier *= (1 + (this.habits.bowWeakness || 0));
    }
    if (actionLower.includes('fall') || actionLower.includes('climb')) {
      modifier *= (1 + (this.habits.fallDamageWeakness || 0));
    }
    if (actionLower.includes('redstone') || actionLower.includes('circuit')) {
      modifier *= (1 + (this.habits.redstoneWeakness || 0));
    }
    if (actionLower.includes('navigate') || actionLower.includes('move')) {
      modifier *= (1 + (this.habits.navigationWeakness || 0));
    }
    if (actionLower.includes('potion')) {
      modifier *= (1 + (this.habits.potionWeakness || 0));
    }
    if (actionLower.includes('ride')) {
      modifier *= (1 + (this.habits.ridingWeakness || 0));
    }
    if (actionLower.includes('multitask')) {
      modifier *= (1 + (this.habits.multiTaskingWeakness || 0));
    }
    if (actionLower.includes('combat')) {
      modifier *= (1 + (this.habits.combatWeakness || 0));
    }

    // Проверяем силы (уменьшают ошибки)
    if (actionLower.includes('craft')) {
      modifier *= (1 - (this.habits.craftingStrength || 0));
    }
    if (actionLower.includes('combat') || actionLower.includes('melee')) {
      modifier *= (1 - (this.habits.combatStrength || 0));
    }
    if (actionLower.includes('build')) {
      modifier *= (1 - (this.habits.buildingStrength || 0));
    }
    if (actionLower.includes('navigate')) {
      modifier *= (1 - (this.habits.navigationStrength || 0));
    }
    if (actionLower.includes('climb') || actionLower.includes('parkour')) {
      modifier *= (1 - (this.habits.climbingStrength || 0));
    }
    if (actionLower.includes('planning') || actionLower.includes('strategy')) {
      modifier *= (1 - (this.habits.planningStrength || 0));
    }
    if (actionLower.includes('memory') || actionLower.includes('recall')) {
      modifier *= (1 - (this.habits.memoryStrength || 0));
    }
    if (actionLower.includes('patience') || actionLower.includes('wait')) {
      modifier *= (1 - (this.habits.patienceStrength || 0));
    }
    if (actionLower.includes('focus') || actionLower.includes('concentrate')) {
      modifier *= (1 - (this.habits.focusStrength || 0));
    }
    if (actionLower.includes('mechanic')) {
      modifier *= (1 - (this.habits.mechanicsStrength || 0));
    }
    if (actionLower.includes('survival')) {
      modifier *= (1 - (this.habits.survivalStrength || 0));
    }

    //限制модификатор чтобы не стал отрицательным или слишком большим
    return Math.max(0.1, Math.min(2.5, modifier));
  }

  /**
   * Получить описание привычек бота
   */
  getDescription() {
    let desc = `🤖 ${this.agentName}\n`;
    desc += '💪 Силы:\n';

    for (const [key, value] of Object.entries(this.habits)) {
      if (key.includes('Strength') && value > 0) {
        const name = key.replace('Strength', '').replace(/([A-Z])/g, ' $1');
        desc += `  • ${name}: +${Math.round(value * 100)}%\n`;
      }
    }

    desc += '⚠️ Слабости:\n';
    for (const [key, value] of Object.entries(this.habits)) {
      if (key.includes('Weakness') && value > 0) {
        const name = key.replace('Weakness', '').replace(/([A-Z])/g, ' $1');
        desc += `  • ${name}: -${Math.round(value * 100)}%\n`;
      }
    }

    return desc;
  }
}
