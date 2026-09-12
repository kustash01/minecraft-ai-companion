import { createLogger } from '../../utils/logger.js';

const logger = createLogger('NATURAL_MISTAKES');

/**
 * Система естественных ошибок — люди ошибаются, и это нормально.
 *
 * Типы ошибок:
 * 1. Моторные ошибки — промахи, неточности движений
 * 2. Когнитивные ошибки — забыл, перепутал, не заметил
 * 3. Социальные ошибки — неуместная реплика, неправильный тон
 * 4. Планирование — неоптимальный маршрут, забыл взять предмет
 * 5. Эмоциональные — импульсивные решения, перереагировал
 */

export class NaturalMistakeSystem {
  constructor({ agentName, personality, emotionalSystem, memorySystem, provider = null }) {
    this.agentName = agentName;
    this.personality = personality;
    this.emotions = emotionalSystem;
    this.memory = memorySystem;
    this.provider = provider;

    // История ошибок (для обучения и реакций)
    this.mistakeHistory = [];
    this.maxHistoryLength = 20;

    // Базовые вероятности ошибок (модифицируются контекстом)
    this.baseMistakeChances = {
      motor: 0.04,           // Моторные ошибки (4%)
      cognitive: 0.06,       // Когнитивные ошибки (6%)
      social: 0.03,          // Социальные ошибки (3%)
      planning: 0.08,        // Ошибки планирования (8%)
      emotional: 0.05,       // Эмоциональные ошибки (5%)
    };

    // Обучение на ошибках (шанс не повторить)
    this.learnFromMistakes = true;
    this.learningRate = 0.7; // 70% шанс запомнить ошибку
  }

  /**
   * Проверяет, произойдёт ли ошибка при выполнении действия
   */
  checkForMistake(action, context = {}) {
    // Определяем тип действия и соответствующую категорию ошибки
    const mistakeType = this._classifyActionType(action);
    let mistakeChance = this.baseMistakeChances[mistakeType];

    // Применяем модификаторы
    mistakeChance = this._applyMistakeModifiers(mistakeChance, action, context);

    // Проверяем обучение (меньше шанс повторить ошибку)
    if (this._hasLearnedFromSimilar(action)) {
      mistakeChance *= 0.3; // 70% снижение
    }

    // Делаем ошибку?
    if (Math.random() < mistakeChance) {
      const mistake = this._generateMistake(action, mistakeType, context);
      this._recordMistake(mistake);

      logger.info(`[${this.agentName}] Ошибка: ${mistake.description}`);
      return mistake;
    }

    return null;
  }

  /**
   * Генерирует реакцию на собственную ошибку — живыми словами через LLM.
   * Без заготовленных фраз: модель получает суть ошибки и формулирует сама.
   */
  async generateMistakeReaction(mistake) {
    if (!mistake) return null;

    // Не всегда комментируем ошибку (60% шанс)
    if (Math.random() > 0.6) {
      return null;
    }

    const severity = mistake.severity || 'mild';
    const what = mistake.description || 'мелкая оплошность';

    // Пробуем живую реакцию через LLM.
    if (this.provider?.generateText) {
      try {
        const severityHint = {
          mild: 'лёгкая досада',
          moderate: 'заметная досада',
          severe: 'сильная досада или удивление',
        }[severity] || 'лёгкая досада';

        const systemPrompt = `Ты — ${this.agentName}, живой человек, играешь в Minecraft. Реагируй на свою ошибку СВОИМИ словами, коротко (1-3 слова), строчными буквами, без точки, без кавычек. Никаких заученных фраз.`;
        const userPrompt = `Ты только что ошибся: ${what}. Реакция — ${severityHint}. Что у тебя вырывается?`;

        const text = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 900);
          this.provider.generateText({ systemPrompt, userPrompt, temperature: 1.0, maxTokens: 12 })
            .then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
        });

        let out = String(text || '').trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
        out = out.replace(new RegExp(`^${this.agentName}:?\\s*`, 'i'), '').trim();
        if (out && out.length >= 1) return out;
      } catch (_) {}
    }

    // Связь недоступна — короткое нейтральное «м» вместо тишины/шаблона.
    return 'м';
  }

  /**
   * Моторная ошибка (неточное движение)
   */
  generateMotorMistake(action, context) {
    const motorMistakeTypes = [
      {
        type: 'missed_target',
        description: 'промахнулся',
        severity: 'mild',
        correction: { offsetX: 0.5, offsetZ: 0.5 },
      },
      {
        type: 'wrong_direction',
        description: 'пошёл не в ту сторону',
        severity: 'mild',
        correction: { turnAngle: 45 },
      },
      {
        type: 'dropped_item',
        description: 'случайно выбросил предмет',
        severity: 'moderate',
        correction: { pickupItem: true },
      },
      {
        type: 'misclicked',
        description: 'нажал не то',
        severity: 'mild',
        correction: null,
      },
    ];

    return motorMistakeTypes[Math.floor(Math.random() * motorMistakeTypes.length)];
  }

  /**
   * Когнитивная ошибка (забыл, перепутал)
   */
  generateCognitiveMistake(action, context) {
    const cognitiveMistakeTypes = [
      {
        type: 'forgot_item',
        description: 'забыл взять предмет',
        severity: 'moderate',
        correction: { goBack: true },
      },
      {
        type: 'wrong_recipe',
        description: 'перепутал рецепт',
        severity: 'mild',
        correction: { checkRecipe: true },
      },
      {
        type: 'missed_detail',
        description: 'не заметил важную деталь',
        severity: 'mild',
        correction: { lookAround: true },
      },
      {
        type: 'confused_location',
        description: 'перепутал место',
        severity: 'moderate',
        correction: { checkCoordinates: true },
      },
      {
        type: 'forgot_goal',
        description: 'забыл зачем шёл',
        severity: 'moderate',
        correction: { tryToRemember: true },
      },
    ];

    return cognitiveMistakeTypes[Math.floor(Math.random() * cognitiveMistakeTypes.length)];
  }

  /**
   * Социальная ошибка (неуместное высказывание)
   */
  generateSocialMistake(message, context) {
    const socialMistakeTypes = [
      {
        type: 'wrong_tone',
        description: 'не тот тон',
        severity: 'mild',
        effect: 'slightly_awkward',
      },
      {
        type: 'interrupted',
        description: 'перебил',
        severity: 'mild',
        effect: 'minor_annoyance',
      },
      {
        type: 'misunderstood',
        description: 'неправильно понял',
        severity: 'moderate',
        effect: 'confusion',
      },
      {
        type: 'overshared',
        description: 'слишком много рассказал',
        severity: 'mild',
        effect: 'slightly_awkward',
      },
    ];

    return socialMistakeTypes[Math.floor(Math.random() * socialMistakeTypes.length)];
  }

  /**
   * Ошибка планирования (неоптимальный путь)
   */
  generatePlanningMistake(plan, context) {
    const planningMistakeTypes = [
      {
        type: 'inefficient_route',
        description: 'выбрал длинный путь',
        severity: 'mild',
        timeWasted: 30,
      },
      {
        type: 'forgot_preparation',
        description: 'не подготовился',
        severity: 'moderate',
        needsRework: true,
      },
      {
        type: 'wrong_order',
        description: 'неправильный порядок действий',
        severity: 'moderate',
        needsRework: true,
      },
      {
        type: 'overlooked_obstacle',
        description: 'не учёл препятствие',
        severity: 'moderate',
        needsAdaptation: true,
      },
    ];

    return planningMistakeTypes[Math.floor(Math.random() * planningMistakeTypes.length)];
  }

  /**
   * Эмоциональная ошибка (импульсивное решение)
   */
  generateEmotionalMistake(decision, context) {
    const mood = this.emotions?.getMood();

    const emotionalMistakeTypes = [
      {
        type: 'impulsive',
        description: 'поспешил',
        severity: 'moderate',
        trigger: mood?.excitement > 0.7,
      },
      {
        type: 'overcautious',
        description: 'перестраховался',
        severity: 'mild',
        trigger: mood?.fear > 0.6,
      },
      {
        type: 'rage_decision',
        description: 'решил на эмоциях',
        severity: 'moderate',
        trigger: mood?.anger > 0.6,
      },
      {
        type: 'gave_up_early',
        description: 'сдался слишком быстро',
        severity: 'moderate',
        trigger: mood?.frustration > 0.7,
      },
    ];

    // Выбираем только триггернутые ошибки
    const triggered = emotionalMistakeTypes.filter(m => m.trigger);
    if (triggered.length > 0) {
      return triggered[Math.floor(Math.random() * triggered.length)];
    }

    return emotionalMistakeTypes[0]; // Fallback
  }

  /**
   * Применяет модификаторы к вероятности ошибки
   */
  _applyMistakeModifiers(baseChance, action, context) {
    let chance = baseChance;

    // 1. Эмоциональное состояние
    const mood = this.emotions?.getMood();
    if (mood) {
      if (mood.fatigue > 0.6) chance *= 2.0;      // Усталость удваивает ошибки
      if (mood.stress > 0.7) chance *= 1.8;       // Стресс увеличивает
      if (mood.excitement > 0.8) chance *= 1.3;   // Перевозбуждение тоже
      if (mood.confidence < 0.3) chance *= 1.5;   // Неуверенность
      if (mood.boredom > 0.6) chance *= 1.4;      // Скука
    }

    // 2. Сложность действия
    if (context.complexity === 'high') {
      chance *= 1.5;
    } else if (context.complexity === 'low') {
      chance *= 0.6;
    }

    // 3. Знакомство с действием
    if (context.familiar) {
      chance *= 0.5; // Знакомые действия реже ошибочны
    } else if (context.firstTime) {
      chance *= 2.0; // Первый раз — больше ошибок
    }

    // 4. Временное давление
    if (context.rushed || context.timePress) {
      chance *= 1.6;
    }

    // 5. Отвлечения
    if (context.distracted) {
      chance *= 1.8;
    }

    // 6. Физическое состояние
    if (context.health && context.health < 8) {
      chance *= 1.4; // Ранен — больше ошибок
    }

    // 7. Личность
    chance *= this._getPersonalityMistakeModifier();

    return Math.min(0.9, chance); // Макс 90% шанс ошибки
  }

  /**
   * Модификатор личности для ошибок
   */
  _getPersonalityMistakeModifier() {
    const modifiers = {
      Sam: 0.8,    // Осторожный — меньше ошибок
      Max: 0.7,    // Методичный — ещё меньше
      Jack: 1.4,   // Импульсивный — больше ошибок
      Ryan: 0.9,   // Стабильный
      Alex: 1.0,   // Средне
      Leo: 0.85,   // Уверенный — меньше ошибок
    };

    return modifiers[this.agentName] || 1.0;
  }

  /**
   * Классифицирует тип действия
   */
  _classifyActionType(action) {
    const actionStr = typeof action === 'string' ? action : action.type || '';

    if (actionStr.includes('move') || actionStr.includes('attack') || actionStr.includes('place')) {
      return 'motor';
    }

    if (actionStr.includes('chat') || actionStr.includes('speak') || actionStr.includes('say')) {
      return 'social';
    }

    if (actionStr.includes('plan') || actionStr.includes('route') || actionStr.includes('decide')) {
      return 'planning';
    }

    if (actionStr.includes('craft') || actionStr.includes('remember') || actionStr.includes('check')) {
      return 'cognitive';
    }

    return 'motor'; // Дефолт
  }

  /**
   * Генерирует ошибку
   */
  _generateMistake(action, type, context) {
    let mistakeDetails;

    switch (type) {
      case 'motor':
        mistakeDetails = this.generateMotorMistake(action, context);
        break;
      case 'cognitive':
        mistakeDetails = this.generateCognitiveMistake(action, context);
        break;
      case 'social':
        mistakeDetails = this.generateSocialMistake(action, context);
        break;
      case 'planning':
        mistakeDetails = this.generatePlanningMistake(action, context);
        break;
      case 'emotional':
        mistakeDetails = this.generateEmotionalMistake(action, context);
        break;
      default:
        mistakeDetails = {
          type: 'generic',
          description: 'ошибка',
          severity: 'mild',
        };
    }

    return {
      ...mistakeDetails,
      action,
      category: type,
      timestamp: Date.now(),
      context,
    };
  }

  /**
   * Записывает ошибку в историю
   */
  _recordMistake(mistake) {
    this.mistakeHistory.push(mistake);

    if (this.mistakeHistory.length > this.maxHistoryLength) {
      this.mistakeHistory.shift();
    }

    // Обучение на ошибке
    if (this.learnFromMistakes && Math.random() < this.learningRate) {
      this._learnFromMistake(mistake);
    }

    // Эмоциональная реакция на ошибку
    this._emotionalReactionToMistake(mistake);
  }

  /**
   * Обучение на ошибке
   */
  _learnFromMistake(mistake) {
    // Запоминаем в памяти
    this.memory?.remember(`Ошибка: ${mistake.description}`, {
      importance: 0.6,
      emotionalIntensity: mistake.severity === 'severe' ? 0.7 : 0.4,
      details: mistake,
    });

    logger.debug(`[${this.agentName}] Запомнил ошибку: ${mistake.description}`);
  }

  /**
   * Эмоциональная реакция на ошибку
   */
  _emotionalReactionToMistake(mistake) {
    if (!this.emotions) return;

    const emotionalImpact = {
      mild: {
        frustration: 0.1,
        confidence: -0.05,
      },
      moderate: {
        frustration: 0.2,
        confidence: -0.15,
        stress: 0.1,
      },
      severe: {
        frustration: 0.4,
        confidence: -0.3,
        stress: 0.2,
        shame: 0.2,
      },
    };

    const impact = emotionalImpact[mistake.severity] || emotionalImpact.mild;

    // Применяем эмоциональный эффект
    for (const [emotion, change] of Object.entries(impact)) {
      this.emotions.processEvent('mistake_made', {
        [emotion]: change,
      });
    }
  }

  /**
   * Проверяет, учился ли бот на похожей ошибке
   */
  _hasLearnedFromSimilar(action) {
    // Проверяем последние 5 ошибок
    const recentMistakes = this.mistakeHistory.slice(-5);

    const actionStr = typeof action === 'string' ? action : JSON.stringify(action);

    for (const mistake of recentMistakes) {
      const mistakeActionStr = typeof mistake.action === 'string'
        ? mistake.action
        : JSON.stringify(mistake.action);

      // Похожие действия
      if (mistakeActionStr.includes(actionStr) || actionStr.includes(mistakeActionStr)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Получает статистику ошибок
   */
  getStats() {
    const stats = {
      total: this.mistakeHistory.length,
      byCategory: {},
      bySeverity: {},
      recentCount: this.mistakeHistory.filter(m => Date.now() - m.timestamp < 300000).length, // За 5 минут
    };

    for (const mistake of this.mistakeHistory) {
      // По категории
      stats.byCategory[mistake.category] = (stats.byCategory[mistake.category] || 0) + 1;

      // По серьёзности
      stats.bySeverity[mistake.severity] = (stats.bySeverity[mistake.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Получает недавние ошибки
   */
  getRecentMistakes(count = 5) {
    return this.mistakeHistory.slice(-count);
  }
}
