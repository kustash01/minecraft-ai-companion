import { createLogger } from '../../utils/logger.js';
import { ResponseGenerator } from './response-generator.js';
import { ProbabilisticReactions } from './probabilistic-reactions.js';
import { TypingSimulator } from './typing-simulator.js';
import { MoodSystem } from './mood-system.js';
import { PersonalGoalsSystem } from './personal-goals.js';
import { HumanImperfections } from './human-imperfections.js';
import { AFKSystem } from './afk-system.js';
import { HumanErrorEngine } from '../human-error-engine.js';

const logger = createLogger('HUMAN_BEHAVIOR');

/**
 * Главный контроллер человеческого поведения.
 * Координирует все системы для создания реалистичного поведения.
 */
export class HumanBehaviorController {
  constructor(profile, aiBrain, memoryManager) {
    this.profile = profile;
    this.aiBrain = aiBrain;
    this.memoryManager = memoryManager;
    
    // Инициализация подсистем
    this.responseGenerator = new ResponseGenerator(aiBrain, profile);
    this.probabilisticReactions = new ProbabilisticReactions(profile);
    this.typingSimulator = new TypingSimulator(profile);
    this.moodSystem = new MoodSystem(profile);
    this.personalGoals = new PersonalGoalsSystem(profile, memoryManager);
    this.imperfections = new HumanImperfections(profile, aiBrain);
    this.afkSystem = new AFKSystem(profile, aiBrain);
    
    // Таймер обновления
    this.updateInterval = null;
    this.updateFrequency = 30000; // 30 секунд
    
    logger.info(`[${profile.name}] Инициализирован контроллер человеческого поведения`);
  }

  /**
   * Запуск периодического обновления
   */
  start() {
    if (this.updateInterval) return;
    
    this.updateInterval = setInterval(() => {
      this._periodicUpdate();
    }, this.updateFrequency);
    
    logger.info(`[${this.profile.name}] Запущен контроллер поведения`);
  }

  /**
   * Остановка
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Периодическое обновление всех систем
   */
  async _periodicUpdate() {
    try {
      // Обновляем настроение
      const recentEvents = this._getRecentEvents();
      this.moodSystem.update({
        recentEvents,
        currentActivity: this._getCurrentActivity(),
        health: this._getHealth(),
        achievements: this._getAchievements()
      });
      
      // Проверяем возвращение из AFK
      const afkStatus = this.afkSystem.checkReturn();
      if (afkStatus.shouldReturn && afkStatus.shouldAnnounce && afkStatus.message) {
        await this._sendMessage(afkStatus.message);
      }
      
      // Если в AFK - не делаем ничего больше
      if (this.afkSystem.isAFK) {
        return;
      }
      
      // Проверяем отложенные упоминания
      const pendingMention = this.probabilisticReactions.checkPendingMentions();
      if (pendingMention) {
        await this._handleDelayedMention(pendingMention);
      }
      
      // Проверяем вспомнил ли что-то забытое
      const remembered = this.imperfections.checkRemembering();
      if (remembered.remembered) {
        // 60% шанс сказать что вспомнил
        if (HumanErrorEngine.chance(0.6)) {
          await this._sendMessage(remembered.message);
        }
      }
      
      // Проверяем AFK
      const mood = this.moodSystem.getMood();
      const sessionDuration = (Date.now() - this.moodSystem.sessionStartTime) / (60 * 1000);
      const afkCheck = await this.afkSystem.shouldGoAFK({
        tiredness: mood.tiredness,
        sessionDuration,
        boredom: mood.boredom,
        lastAFKMinutesAgo: this.afkSystem.getStatus().minutesSinceLastAFK
      });
      
      if (afkCheck.shouldAFK) {
        if (afkCheck.shouldAnnounce) {
          await this._sendMessage(afkCheck.message);
        }
        return;
      }
      
      // Проверяем инициативу
      await this._checkInitiative();
      
    } catch (err) {
      logger.error(`[${this.profile.name}] Ошибка в периодическом обновлении: ${err.message}`);
    }
  }

  /**
   * Проверяет и проявляет инициативу
   */
  async _checkInitiative() {
    const mood = this.moodSystem.getMood();
    const modifiers = this.moodSystem.getBehaviorModifiers();
    
    const shouldInitiate = this.personalGoals.shouldTakeInitiative({
      moodModifiers: modifiers,
      conversationSilence: this._getConversationSilence(),
      playerActivity: this._getPlayerActivity()
    });
    
    if (shouldInitiate.shouldInitiate) {
      // Генерируем предложение
      const proposal = this.personalGoals.generateInitiativeProposal({
        worldState: this._getWorldState(),
        mood
      });
      
      // Отправляем через систему печати
      await this._sendMessage(proposal.proposal);
      
      logger.info(`[${this.profile.name}] Проявил инициативу: ${proposal.type}`);
    }
  }

  /**
   * Обрабатывает команду от игрока
   */
  async handlePlayerCommand(intent, playerMessage, context = {}) {
    // Если AFK - возвращаемся
    if (this.afkSystem.isAFK) {
      const returned = this.afkSystem.forceReturn();
      if (returned.shouldReturn && returned.message) {
        await this._sendMessage(returned.message);
      }
    }
    
    const mood = this.moodSystem.getMood();
    
    // Генерируем ответ
    const response = await this.responseGenerator.generateResponse(intent, playerMessage, {
      mood: mood.mood,
      health: context.health,
      food: context.food,
      position: context.position,
      busy: context.busy,
      currentTask: context.currentTask
    });
    
    // Проверяем ошибки в исполнении
    const mistakeCheck = this.imperfections.shouldMakeMistake('navigation', {
      tiredness: mood.tiredness,
      mood: mood.mood,
      busy: context.busy
    });
    
    if (mistakeCheck.shouldMistake) {
      logger.debug(`[${this.profile.name}] Совершит ошибку: ${mistakeCheck.mistakeType}`);
      // Запоминаем что будет ошибка (обработается в процессе выполнения)
      context.plannedMistake = mistakeCheck.mistakeType;
    }
    
    // Отправляем ответ через систему печати
    await this._sendMessage(response);
    
    return {
      response,
      plannedMistake: context.plannedMistake
    };
  }

  /**
   * Обрабатывает игровое событие
   */
  async handleGameEvent(eventType, eventData, context = {}) {
    // Если AFK - игнорируем большинство событий
    if (this.afkSystem.isAFK) {
      // Только критические события прерывают AFK
      const criticalEvents = ['nearly_died', 'under_attack', 'died'];
      if (criticalEvents.includes(eventType)) {
        const returned = this.afkSystem.forceReturn();
        if (returned.shouldReturn) {
          // Реагируем на критическое событие
          const mood = this.moodSystem.getMood();
          const reactionDecision = this.probabilisticReactions.shouldReactToEvent(
            eventType,
            eventData,
            { mood: mood.mood, talkativeness: this.profile.traits?.talkativeness }
          );
          
          if (reactionDecision.shouldReact) {
            await this._sendEventReaction(eventType, eventData);
          }
        }
      }
      return;
    }
    
    const mood = this.moodSystem.getMood();
    const modifiers = this.moodSystem.getBehaviorModifiers();
    
    // Решаем реагировать ли
    const reactionDecision = this.probabilisticReactions.shouldReactToEvent(
      eventType,
      eventData,
      {
        mood: mood.mood,
        talkativeness: this.profile.traits?.talkativeness * modifiers.talkativeness,
        busy: context.busy,
        recentlySpokeAbout: context.recentlySpokeAbout
      }
    );
    
    if (reactionDecision.shouldReact && reactionDecision.reactionType === 'immediate') {
      // Немедленная реакция
      await this._sendEventReaction(eventType, eventData);
    } else if (reactionDecision.reactionType === 'delayed') {
      // Отложенная реакция - уже запланирована в probabilisticReactions
      logger.debug(`[${this.profile.name}] Отложил упоминание ${eventType} на ${reactionDecision.delayMinutes?.toFixed(1)} минут`);
    }
    // else silent - молчит
    
    // Обновляем настроение на основе события
    this.moodSystem._processEvents([{ type: eventType, data: eventData }]);
  }

  /**
   * Отправляет реакцию на событие
   */
  async _sendEventReaction(eventType, eventData) {
    const prompt = this._buildEventReactionPrompt(eventType, eventData);
    
    try {
      const response = await this.aiBrain.generateQuickResponse(prompt, {
        maxTokens: 30,
        temperature: 0.9
      });
      
      const message = response.text?.trim();
      if (message) {
        await this._sendMessage(message);
      }
    } catch (err) {
      logger.error(`[${this.profile.name}] Ошибка генерации реакции: ${err.message}`);
    }
  }

  /**
   * Обрабатывает отложенное упоминание
   */
  async _handleDelayedMention(mention) {
    const prompt = this.probabilisticReactions.generateDelayedMentionPrompt(mention);
    
    try {
      const response = await this.aiBrain.generateQuickResponse(prompt, {
        maxTokens: 50,
        temperature: 0.9
      });
      
      const message = response.text?.trim();
      if (message) {
        await this._sendMessage(message);
      }
    } catch (err) {
      logger.error(`[${this.profile.name}] Ошибка генерации отложенного упоминания: ${err.message}`);
    }
  }

  /**
   * Отправляет сообщение через систему печати
   */
  async _sendMessage(message) {
    // Обрабатываем через симулятор печати
    const processed = await this.typingSimulator.processMessage(message);
    
    if (processed.interrupted) {
      // Отвлекся - не отправляет
      logger.debug(`[${this.profile.name}] Отвлекся, сообщение не отправлено: "${message}"`);
      return;
    }
    
    if (!processed.finalMessage) {
      return;
    }
    
    // Отправляем через бота (нужно интегрировать с InterAgentChat)
    // TODO: Интеграция с системой отправки сообщений
    logger.info(`[${this.profile.name}] Отправка: "${processed.finalMessage}" (задержка: ${processed.delay}мс)`);
    
    return {
      message: processed.finalMessage,
      delay: processed.delay
    };
  }

  /**
   * Вспомогательные методы для получения контекста
   */
  _getRecentEvents() {
    // TODO: Интеграция с системой событий
    return [];
  }

  _getCurrentActivity() {
    // TODO: Интеграция с системой активности
    return 'idle';
  }

  _getHealth() {
    // TODO: Интеграция с состоянием бота
    return 20;
  }

  _getAchievements() {
    // TODO: Интеграция с системой достижений
    return [];
  }

  _getConversationSilence() {
    // TODO: Интеграция с системой разговоров
    return 5; // минут
  }

  _getPlayerActivity() {
    // TODO: Интеграция с отслеживанием игрока
    return 'active';
  }

  _getWorldState() {
    // TODO: Интеграция с WorldState
    return {};
  }

  _buildEventReactionPrompt(eventType, eventData) {
    const mood = this.moodSystem.getMoodDescription();
    
    const eventDescriptions = {
      'found_diamonds': `Ты только что нашел ${eventData.count || 3} алмазов!`,
      'nearly_died': `Ты чуть не умер от ${eventData.cause || 'моба'}`,
      'under_attack': `На тебя напал ${eventData.attacker || 'моб'}`,
      'tool_broke': `У тебя сломался ${eventData.tool || 'инструмент'}`
    };
    
    const eventDesc = eventDescriptions[eventType] || `Произошло событие: ${eventType}`;
    
    return `Ты ${this.profile.name}. ${mood}.
${eventDesc}
Отреагируй естественно одной короткой фразой (3-7 слов):`;
  }

  /**
   * Получить текущее состояние всех систем
   */
  getStatus() {
    return {
      mood: this.moodSystem.getMood(),
      afk: this.afkSystem.getStatus(),
      goals: this.personalGoals.getCurrentGoals(),
      behaviorModifiers: this.moodSystem.getBehaviorModifiers()
    };
  }
}
