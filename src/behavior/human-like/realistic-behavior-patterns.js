import { createLogger } from '../../utils/logger.js';

const logger = createLogger('REALISTIC_BEHAVIOR_PATTERNS');

/**
 * Система реалистичных поведенческих паттернов.
 *
 * Эта система делает бота МАКСИМАЛЬНО человекоподобным через:
 * 1. Естественные ритмы активности (не постоянная гиперактивность)
 * 2. Отвлечения и переключения внимания
 * 3. Неоптимальные решения и ошибки
 * 4. Прокрастинацию и откладывание дел
 * 5. Забывчивость и восстановление памяти
 * 6. Естественные паузы и "моменты раздумья"
 * 7. Смену фокуса внимания
 * 8. Адаптивную скорость реакции
 */

export class RealisticBehaviorPatterns {
  constructor({ agentName, personality, emotionalSystem, memorySystem }) {
    this.agentName = agentName;
    this.personality = personality;
    this.emotions = emotionalSystem;
    this.memory = memorySystem;

    // Текущий фокус внимания
    this.attentionFocus = null;
    this.focusStartTime = 0;
    this.focusStrength = 1.0;

    // Отвлечения
    this.distractionChance = 0.05;
    this.currentDistraction = null;

    // Ритмы активности
    this.activityRhythm = this._initializeActivityRhythm();
    this.currentActivity = 'idle';

    // Неоптимальные решения
    this.suboptimalDecisionChance = 0.15;

    // Прокрастинация
    this.postponedTasks = [];
    this.procrastinationFactor = 0.1;

    // Время реакции (миллисекунды)
    this.baseReactionTime = 800;
    this.reactionTimeVariation = 0.4;

    // "Моменты раздумья"
    this.thinkingPauses = {
      beforeAction: 0.3,      // 30% действий начинаются с паузы
      beforeSpeech: 0.2,      // 20% фраз начинаются с паузы
      minPauseMs: 500,
      maxPauseMs: 3000,
    };

    // Переключение контекста (человек не может сразу переключиться)
    this.contextSwitchCost = 1500; // Время на переключение (мс)
    this.lastContextSwitch = 0;

    // Ошибки внимания
    this.attentionSlips = {
      missDetail: 0.08,        // Пропустить деталь
      wrongTarget: 0.03,       // Ошибиться в цели
      forgetStep: 0.05,        // Забыть шаг
    };
  }

  /**
   * Решает, будет ли выполнено действие сейчас или отложено
   */
  shouldExecuteAction(action, context = {}) {
    const now = Date.now();

    // 1. Проверяем переключение контекста
    const timeSinceSwitch = now - this.lastContextSwitch;
    if (timeSinceSwitch < this.contextSwitchCost && context.requiresFocus) {
      return {
        execute: false,
        reason: 'context_switch',
        delay: this.contextSwitchCost - timeSinceSwitch,
      };
    }

    // 2. Проверяем отвлечения
    if (this._isDistracted(action)) {
      return {
        execute: false,
        reason: 'distracted',
        distraction: this.currentDistraction,
      };
    }

    // 3. Проверяем прокрастинацию
    if (this._shouldProcrastinate(action, context)) {
      this._postponeTask(action, context);
      return {
        execute: false,
        reason: 'procrastinated',
        postponed: true,
      };
    }

    // 4. Проверяем фокус внимания
    const focusCheck = this._checkFocus(action, context);
    if (!focusCheck.canExecute) {
      return {
        execute: false,
        reason: 'low_focus',
        focusStrength: this.focusStrength,
      };
    }

    // 5. Добавляем паузу перед действием (иногда)
    if (Math.random() < this.thinkingPauses.beforeAction) {
      const pauseDuration = this._calculateThinkingPause();
      return {
        execute: true,
        pauseBefore: pauseDuration,
        reason: 'thinking',
      };
    }

    return { execute: true };
  }

  /**
   * Получает время реакции для действия
   */
  getReactionTime(action, context = {}) {
    let reactionTime = this.baseReactionTime;

    // 1. Эмоции влияют
    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.stress > 0.7) reactionTime *= 1.3; // Стресс замедляет
      if (mood.excitement > 0.7) reactionTime *= 0.8; // Возбуждение ускоряет
      if (mood.fatigue > 0.6) reactionTime *= 1.5; // Усталость замедляет
    }

    // 2. Фокус внимания
    reactionTime *= (2 - this.focusStrength);

    // 3. Сложность действия
    if (context.complexity === 'high') {
      reactionTime *= 1.5;
    } else if (context.complexity === 'low') {
      reactionTime *= 0.7;
    }

    // 4. Предсказуемость (знакомые действия быстрее)
    if (context.familiar) {
      reactionTime *= 0.6;
    }

    // 5. Случайная вариация (люди непостоянны)
    const variation = 1 + (Math.random() - 0.5) * 2 * this.reactionTimeVariation;
    reactionTime *= variation;

    return Math.max(300, Math.round(reactionTime));
  }

  /**
   * Решает, сделает ли бот неоптимальный выбор
   */
  shouldMakeSuboptimalChoice(choices, context = {}) {
    let chance = this.suboptimalDecisionChance;

    // Модификаторы
    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.fatigue > 0.6) chance += 0.2;
      if (mood.stress > 0.7) chance += 0.15;
      if (mood.boredom > 0.5) chance += 0.1;
    }

    // Сложность решения
    if (choices.length > 4) chance += 0.1;

    // Нехватка времени
    if (context.timePress) chance += 0.15;

    if (Math.random() < chance) {
      // Выбираем не оптимальный вариант
      const nonOptimal = choices.slice(1); // Предполагаем первый оптимальный
      if (nonOptimal.length > 0) {
        return {
          suboptimal: true,
          choice: nonOptimal[Math.floor(Math.random() * nonOptimal.length)],
          reason: this._getSuboptimalReason(mood),
        };
      }
    }

    return {
      suboptimal: false,
      choice: choices[0],
    };
  }

  /**
   * Проверяет, произойдёт ли ошибка внимания
   */
  checkAttentionSlip(action) {
    const slipType = Object.keys(this.attentionSlips);

    for (const type of slipType) {
      const baseChance = this.attentionSlips[type];
      let chance = baseChance;

      // Модификаторы
      chance *= (2 - this.focusStrength);

      const mood = this.emotions?.getMood();
      if (mood) {
        if (mood.fatigue > 0.6) chance *= 2;
        if (mood.stress > 0.7) chance *= 1.5;
      }

      if (Math.random() < chance) {
        return {
          slipped: true,
          type,
          description: this._describeAttentionSlip(type, action),
        };
      }
    }

    return { slipped: false };
  }

  /**
   * Проверяет отвлечения
   */
  _isDistracted(action) {
    // Если уже отвлечён
    if (this.currentDistraction) {
      const distractionAge = Date.now() - this.currentDistraction.startTime;

      // Отвлечения длятся 5-20 секунд
      if (distractionAge < this.currentDistraction.duration) {
        return true;
      } else {
        // Отвлечение закончилось
        this.currentDistraction = null;
      }
    }

    // Проверяем новое отвлечение
    let distractionChance = this.distractionChance;

    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.boredom > 0.6) distractionChance += 0.1;
      if (mood.curiosity > 0.7) distractionChance += 0.08;
      if (mood.focus > 0.8) distractionChance *= 0.3; // Сфокусирован = меньше отвлекается
    }

    if (Math.random() < distractionChance) {
      this.currentDistraction = {
        startTime: Date.now(),
        duration: 5000 + Math.random() * 15000,
        type: this._chooseDistractionType(),
      };

      logger.debug(`[${this.agentName}] Отвлёкся: ${this.currentDistraction.type}`);
      return true;
    }

    return false;
  }

  /**
   * Выбирает тип отвлечения
   */
  _chooseDistractionType() {
    const types = [
      'noticed_something',    // Заметил что-то
      'random_thought',       // Случайная мысль
      'checked_inventory',    // Проверил инвентарь
      'looked_around',        // Осмотрелся
      'brief_daydream',       // Задумался
    ];

    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Проверяет прокрастинацию
   */
  _shouldProcrastinate(action, context) {
    // Срочные задачи не откладываются
    if (context.urgent || context.priority === 'high') {
      return false;
    }

    let procrastinateChance = this.procrastinationFactor;

    // Модификаторы
    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.fatigue > 0.6) procrastinateChance += 0.2;
      if (mood.boredom > 0.5) procrastinateChance += 0.15;
      if (mood.motivation < 0.3) procrastinateChance += 0.2;
    }

    // Скучные задачи откладываются чаще
    if (context.boring || context.repetitive) {
      procrastinateChance += 0.25;
    }

    return Math.random() < procrastinateChance;
  }

  /**
   * Откладывает задачу
   */
  _postponeTask(action, context) {
    this.postponedTasks.push({
      action,
      context,
      postponedAt: Date.now(),
      reason: this._getProcrastinationReason(),
    });

    logger.debug(`[${this.agentName}] Отложил: ${action}`);
  }

  /**
   * Проверяет отложенные задачи
   */
  checkPostponedTasks() {
    const now = Date.now();
    const ready = [];

    for (const task of this.postponedTasks) {
      const timePassed = now - task.postponedAt;

      // Через 2-10 минут возвращаемся к отложенному
      const minWait = 120000;
      const maxWait = 600000;

      if (timePassed > minWait) {
        // Вероятность вернуться растёт со временем
        const returnChance = Math.min(0.8, (timePassed - minWait) / (maxWait - minWait));

        if (Math.random() < returnChance) {
          ready.push(task);
        }
      }
    }

    // Удаляем готовые из списка
    this.postponedTasks = this.postponedTasks.filter(t => !ready.includes(t));

    return ready;
  }

  /**
   * Проверяет фокус внимания
   */
  _checkFocus(action, context) {
    const now = Date.now();

    // Если нет фокуса — устанавливаем
    if (!this.attentionFocus) {
      this._setFocus(action, context);
      return { canExecute: true };
    }

    // Проверяем релевантность текущему фокусу
    if (this._isRelatedToFocus(action)) {
      // В рамках фокуса — продолжаем
      return { canExecute: true };
    }

    // Нужно переключить фокус
    const focusAge = now - this.focusStartTime;

    // Если долго фокусировались — легче переключиться
    if (focusAge > 60000) { // 1 минута
      this._setFocus(action, context);
      this.lastContextSwitch = now;
      return { canExecute: true };
    }

    // Сложно переключиться в середине задачи
    if (this.focusStrength > 0.7) {
      return {
        canExecute: false,
        needsContextSwitch: true,
      };
    }

    return { canExecute: true };
  }

  /**
   * Устанавливает фокус внимания
   */
  _setFocus(action, context) {
    this.attentionFocus = action;
    this.focusStartTime = Date.now();
    this.focusStrength = 1.0;
  }

  /**
   * Проверяет связь действия с текущим фокусом
   */
  _isRelatedToFocus(action) {
    if (!this.attentionFocus) return false;

    // Простая проверка по типу действия
    const focusType = typeof this.attentionFocus === 'string'
      ? this.attentionFocus
      : this.attentionFocus.type;

    const actionType = typeof action === 'string'
      ? action
      : action.type;

    // Связанные типы действий
    const relatedActions = {
      'mining': ['mining', 'move_to_ore', 'place_torch'],
      'building': ['building', 'place_block', 'break_block'],
      'combat': ['combat', 'attack', 'defend', 'flee'],
      'exploring': ['exploring', 'move', 'scout'],
    };

    for (const [category, actions] of Object.entries(relatedActions)) {
      if (actions.includes(focusType) && actions.includes(actionType)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Обновляет фокус внимания (со временем слабеет)
   */
  updateFocus(deltaTime = 1000) {
    if (!this.attentionFocus) return;

    const focusAge = Date.now() - this.focusStartTime;

    // Фокус слабеет со временем
    const decayRate = 0.0001; // Медленно
    this.focusStrength = Math.max(
      0.3,
      this.focusStrength - decayRate * deltaTime
    );

    // Через 10 минут фокус сбрасывается
    if (focusAge > 600000) {
      this.attentionFocus = null;
      this.focusStrength = 1.0;
    }
  }

  /**
   * Вычисляет паузу на раздумье
   */
  _calculateThinkingPause() {
    const { minPauseMs, maxPauseMs } = this.thinkingPauses;

    let pause = minPauseMs + Math.random() * (maxPauseMs - minPauseMs);

    // Модификаторы
    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.fatigue > 0.6) pause *= 1.5;
      if (mood.stress > 0.7) pause *= 1.3;
      if (mood.excitement > 0.7) pause *= 0.6;
    }

    return Math.round(pause);
  }

  /**
   * Инициализирует ритм активности
   */
  _initializeActivityRhythm() {
    return {
      peakHours: [14, 15, 16, 17, 18, 19], // Часы пиковой активности
      lowHours: [1, 2, 3, 4, 5, 6],        // Часы низкой активности
      currentEnergy: 0.8,
      maxEnergy: 1.0,
      minEnergy: 0.3,
    };
  }

  /**
   * Получает текущий уровень энергии
   */
  getEnergyLevel() {
    const hour = new Date().getHours();
    let baseEnergy = 0.7;

    if (this.activityRhythm.peakHours.includes(hour)) {
      baseEnergy = 0.9;
    } else if (this.activityRhythm.lowHours.includes(hour)) {
      baseEnergy = 0.4;
    }

    // Применяем усталость
    const mood = this.emotions?.getMood();
    if (mood && mood.fatigue > 0.5) {
      baseEnergy *= (1 - mood.fatigue * 0.5);
    }

    return Math.max(this.activityRhythm.minEnergy, baseEnergy);
  }

  /**
   * Описывает причину неоптимального выбора
   */
  _getSuboptimalReason(mood) {
    if (mood?.fatigue > 0.6) return 'tired';
    if (mood?.stress > 0.7) return 'stressed';
    if (mood?.boredom > 0.5) return 'bored';
    return 'distracted';
  }

  /**
   * Причина прокрастинации
   */
  _getProcrastinationReason() {
    const reasons = [
      'not_motivated',
      'boring_task',
      'will_do_later',
      'distracted',
    ];

    return reasons[Math.floor(Math.random() * reasons.length)];
  }

  /**
   * Описывает ошибку внимания
   */
  _describeAttentionSlip(type, action) {
    const descriptions = {
      missDetail: 'Пропустил важную деталь',
      wrongTarget: 'Ошибся в выборе цели',
      forgetStep: 'Забыл один из шагов',
    };

    return descriptions[type] || 'Ошибка внимания';
  }

  /**
   * Получает текущее состояние
   */
  getState() {
    return {
      attentionFocus: this.attentionFocus,
      focusStrength: this.focusStrength,
      currentDistraction: this.currentDistraction,
      postponedTasks: this.postponedTasks.length,
      energyLevel: this.getEnergyLevel(),
    };
  }
}
