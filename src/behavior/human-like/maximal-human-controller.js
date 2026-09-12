import { createLogger } from '../../utils/logger.js';
import { AdvancedNaturalSpeech } from './advanced-natural-speech.js';
import { ContextualMemorySystem } from './contextual-memory-system.js';
import { DynamicEmotionalSystem } from './dynamic-emotional-system.js';
import { RealisticBehaviorPatterns } from './realistic-behavior-patterns.js';
import { NaturalMistakeSystem } from './natural-mistake-system.js';

const logger = createLogger('HUMAN_CONTROLLER');

/**
 * Главный контроллер человекоподобного поведения.
 *
 * Интегрирует ВСЕ системы человекоподобности:
 * - Естественная речь (без шаблонов)
 * - Контекстная память (забывчивость)
 * - Динамические эмоции (сложная модель)
 * - Реалистичное поведение (отвлечения, прокрастинация)
 * - Естественные ошибки (моторные, когнитивные)
 *
 * Это МАКСИМАЛЬНАЯ человекоподобность.
 */

export class MaximalHumanController {
  constructor({
    agentName,
    profile,
    provider,
    durableStorage = null,
    socialGraph = null,
    conversationMemory = null,
  }) {
    this.agentName = agentName;
    this.profile = profile;
    this.provider = provider;

    logger.info(`[${agentName}] Инициализация максимальной человекоподобности...`);

    // 1. Динамическая эмоциональная система
    this.emotionalSystem = new DynamicEmotionalSystem({
      agentName,
      personality: profile,
    });

    // 2. Контекстная система памяти
    this.memorySystem = new ContextualMemorySystem({
      agentName,
      durableStorage,
    });

    // 3. Реалистичные поведенческие паттерны
    this.behaviorPatterns = new RealisticBehaviorPatterns({
      agentName,
      personality: profile,
      emotionalSystem: this.emotionalSystem,
      memorySystem: this.memorySystem,
    });

    // 4. Система естественных ошибок
    this.mistakeSystem = new NaturalMistakeSystem({
      agentName,
      personality: profile,
      emotionalSystem: this.emotionalSystem,
      memorySystem: this.memorySystem,
      provider,
    });

    // 5. Продвинутая система естественной речи
    this.speechSystem = new AdvancedNaturalSpeech({
      provider,
      agentName,
      profile,
      emotionalState: this.emotionalSystem,
      memoryManager: this.memorySystem,
      socialGraph,
      conversationMemory,
    });

    // Последнее обновление
    this.lastUpdate = Date.now();

    // Интервал обновления систем
    this.updateInterval = 5000; // 5 секунд
    this.updateTimer = null;

    logger.info(`[${agentName}] Максимальная человекоподобность готова!`);
  }

  /**
   * Запускает все системы
   */
  start() {
    logger.info(`[${this.agentName}] Запуск систем человекоподобности...`);

    // Запускаем регулярное обновление
    this._startUpdateLoop();
  }

  /**
   * Останавливает все системы
   */
  stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    logger.info(`[${this.agentName}] Системы человекоподобности остановлены`);
  }

  /**
   * Главная точка входа — генерирует ответ на ситуацию
   */
  async generateResponse(situation, context = {}) {
    // Добавляем полный контекст из всех систем
    const enrichedContext = this._buildEnrichedContext(context);

    // Генерируем естественный ответ
    const response = await this.speechSystem.generateNaturalResponse(
      situation,
      enrichedContext
    );

    return response;
  }

  /**
   * Обрабатывает действие (проверяет ошибки, отвлечения, etc)
   */
  async processAction(action, context = {}) {
    const result = {
      action,
      allowed: true,
      modifications: [],
      reactions: [],
    };

    // 1. Проверяем поведенческие паттерны (отвлечения, прокрастинация)
    const behaviorCheck = this.behaviorPatterns.shouldExecuteAction(action, context);

    if (!behaviorCheck.execute) {
      result.allowed = false;
      result.reason = behaviorCheck.reason;
      result.delay = behaviorCheck.delay;
      result.distraction = behaviorCheck.distraction;

      // Генерируем реакцию если нужно
      if (behaviorCheck.reason === 'distracted') {
        result.reactions.push(await this._generateDistractionReaction());
      }

      return result;
    }

    // Добавляем паузу если нужно
    if (behaviorCheck.pauseBefore) {
      result.pauseBefore = behaviorCheck.pauseBefore;
    }

    // 2. Время реакции (естественная задержка)
    result.reactionTime = this.behaviorPatterns.getReactionTime(action, context);

    // 3. Проверяем на ошибки
    const mistake = this.mistakeSystem.checkForMistake(action, {
      ...context,
      complexity: this._estimateComplexity(action),
    });

    if (mistake) {
      result.mistake = mistake;
      result.modifications.push({
        type: 'mistake',
        details: mistake,
      });

      // Генерируем реакцию на ошибку (живыми словами через LLM)
      const mistakeReaction = await this.mistakeSystem.generateMistakeReaction(mistake);
      if (mistakeReaction) {
        result.reactions.push(mistakeReaction);
      }

      // Обновляем эмоции
      this.emotionalSystem.processEvent('made_mistake', {
        severity: mistake.severity,
      });
    }

    // 4. Проверяем ошибки внимания
    const attentionSlip = this.behaviorPatterns.checkAttentionSlip(action);
    if (attentionSlip.slipped) {
      result.modifications.push({
        type: 'attention_slip',
        details: attentionSlip,
      });
    }

    // 5. Проверяем неоптимальные решения
    if (context.choices && context.choices.length > 1) {
      const decisionCheck = this.behaviorPatterns.shouldMakeSuboptimalChoice(
        context.choices,
        context
      );

      if (decisionCheck.suboptimal) {
        result.suboptimalChoice = decisionCheck.choice;
        result.modifications.push({
          type: 'suboptimal_decision',
          reason: decisionCheck.reason,
        });
      }
    }

    return result;
  }

  /**
   * Обрабатывает событие
   */
  processEvent(event, context = {}) {
    logger.debug(`[${this.agentName}] Событие: ${event}`);

    // 1. Обновляем эмоции
    this.emotionalSystem.processEvent(event, context);

    // 2. Записываем в память
    if (context.memorable !== false) {
      this.memorySystem.remember(event, {
        location: context.location,
        participants: context.participants,
        emotionalIntensity: this._estimateEmotionalIntensity(event),
        importance: context.importance || 0.5,
        details: context,
      });
    }
  }

  /**
   * Вспоминает информацию
   */
  recall(query, context = {}) {
    return this.memorySystem.recall(query, context);
  }

  /**
   * Получает текущее состояние всех систем
   */
  getState() {
    return {
      agentName: this.agentName,
      emotions: this.emotionalSystem.getState(),
      memory: this.memorySystem.getStats(),
      behavior: this.behaviorPatterns.getState(),
      mistakes: this.mistakeSystem.getStats(),
      timestamp: Date.now(),
    };
  }

  /**
   * Строит обогащённый контекст из всех систем
   */
  _buildEnrichedContext(baseContext) {
    return {
      ...baseContext,

      // Эмоциональное состояние
      emotionalState: this.emotionalSystem.getState(),
      mood: this.emotionalSystem.getMood(),

      // Память
      recentMemories: this.memorySystem.getRecentContext(5),
      memoryClarity: this.memorySystem.getStats().averageClarity,

      // Поведенческие паттерны
      energyLevel: this.behaviorPatterns.getEnergyLevel(),
      focusStrength: this.behaviorPatterns.focusStrength,
      currentDistraction: this.behaviorPatterns.currentDistraction,

      // Недавние ошибки
      recentMistakes: this.mistakeSystem.getRecentMistakes(3),

      // Физическое состояние (если есть)
      physicalState: baseContext.physicalState || {},
    };
  }

  /**
   * Оценивает сложность действия
   */
  _estimateComplexity(action) {
    const actionStr = typeof action === 'string' ? action : action.type || '';

    // Простые действия
    if (actionStr.match(/walk|turn|look/i)) {
      return 'low';
    }

    // Сложные действия
    if (actionStr.match(/craft|build|plan|navigate/i)) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Оценивает эмоциональную интенсивность события
   */
  _estimateEmotionalIntensity(event) {
    const highIntensityEvents = [
      'died',
      'found_diamonds',
      'completed_big_project',
      'saved_friend',
      'major_loss',
    ];

    const lowIntensityEvents = [
      'walked',
      'placed_block',
      'broke_block',
      'picked_up_item',
    ];

    if (highIntensityEvents.some(e => event.includes(e))) {
      return 0.8;
    }

    if (lowIntensityEvents.some(e => event.includes(e))) {
      return 0.2;
    }

    return 0.5;
  }

  /**
   * Генерирует реакцию на отвлечение
   */
  async _generateDistractionReaction() {
    const distractions = {
      noticed_something: null, // Молча заметил
      random_thought: 'хм',
      checked_inventory: null,
      looked_around: null,
      brief_daydream: null,
    };

    const distraction = this.behaviorPatterns.currentDistraction;
    if (!distraction) return null;

    return distractions[distraction.type] || null;
  }

  /**
   * Цикл обновления систем
   */
  _startUpdateLoop() {
    this.updateTimer = setInterval(() => {
      this._update();
    }, this.updateInterval);
  }

  /**
   * Обновляет все системы
   */
  _update() {
    const now = Date.now();
    const deltaTime = now - this.lastUpdate;

    try {
      // 1. Обновляем эмоции (инерция, связи, базовая линия)
      this.emotionalSystem.update(deltaTime);

      // 2. Обновляем память (забывчивость, консолидация)
      this.memorySystem.naturalForget();

      // Раз в минуту — консолидация памяти
      if (Math.random() < 0.02) {
        this.memorySystem.consolidate();
      }

      // 3. Обновляем поведенческие паттерны (фокус, отвлечения)
      this.behaviorPatterns.updateFocus(deltaTime);

      // Проверяем отложенные задачи
      const readyTasks = this.behaviorPatterns.checkPostponedTasks();
      if (readyTasks.length > 0) {
        logger.debug(`[${this.agentName}] Вернулся к ${readyTasks.length} отложенным задачам`);
      }

      // 4. Спонтанные воспоминания (редко)
      const spontaneousMemory = this.memorySystem.spontaneousRecall();
      if (spontaneousMemory) {
        logger.info(`[${this.agentName}] Спонтанно вспомнил: ${spontaneousMemory.event}`);

        // Это может вызвать эмоции
        this.emotionalSystem.processEvent('recalled_memory', {
          emotionalIntensity: spontaneousMemory.clarity * 0.3,
        });
      }

    } catch (err) {
      logger.error(`Ошибка обновления систем: ${err.message}`);
    }

    this.lastUpdate = now;
  }

  /**
   * Сброс для новой сессии
   */
  reset() {
    this.speechSystem.reset();
    this.memorySystem.consolidate();
    logger.info(`[${this.agentName}] Системы сброшены для новой сессии`);
  }

  /**
   * Получает диагностику систем
   */
  getDiagnostics() {
    return {
      agentName: this.agentName,
      systemStatus: {
        emotional: this.emotionalSystem.getState(),
        memory: this.memorySystem.getStats(),
        behavior: this.behaviorPatterns.getState(),
        mistakes: this.mistakeSystem.getStats(),
      },
      lastUpdate: this.lastUpdate,
      timeSinceUpdate: Date.now() - this.lastUpdate,
    };
  }
}

/**
 * Фабрика для создания контроллера
 */
export function createMaximalHumanController(config) {
  return new MaximalHumanController(config);
}
