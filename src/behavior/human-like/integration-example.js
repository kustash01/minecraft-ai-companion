/**
 * Пример интеграции HumanBehaviorController с существующей системой агентов
 */

import { HumanBehaviorController } from './index.js';
import { FastPlayerIntentRouter, PlayerIntents } from '../../control/fast-player-intent.js';

/**
 * Расширение существующего класса агента
 */
export class AgentWithHumanBehavior {
  constructor(agentInstance, aiBrain, memoryManager) {
    this.agent = agentInstance;
    this.profile = agentInstance.profile;
    
    // Инициализируем контроллер человеческого поведения
    this.humanBehavior = new HumanBehaviorController(
      this.profile,
      aiBrain,
      memoryManager
    );
    
    // Связываем отправку сообщений
    this._setupMessageSending();
    
    // Подписываемся на события агента
    this._setupEventListeners();
  }

  /**
   * Настраиваем отправку сообщений
   */
  _setupMessageSending() {
    // Переопределяем метод отправки в HumanBehaviorController
    const originalSendMessage = this.humanBehavior._sendMessage.bind(this.humanBehavior);
    
    this.humanBehavior._sendMessage = async (message) => {
      const processed = await this.humanBehavior.typingSimulator.processMessage(message);
      
      if (processed.interrupted || !processed.finalMessage) {
        return;
      }
      
      // Отправляем через InterAgentChat агента
      if (this.agent.interAgentChat) {
        await this.agent.interAgentChat.sendMessage(
          this.profile.name,
          processed.finalMessage,
          {}
        );
      } else if (this.agent.mcBot?.bot) {
        // Прямая отправка через бота
        setTimeout(() => {
          this.agent.mcBot.bot.chat(processed.finalMessage);
        }, processed.delay);
      }
      
      return { message: processed.finalMessage, delay: processed.delay };
    };
  }

  /**
   * Подписываемся на события агента
   */
  _setupEventListeners() {
    const bot = this.agent.mcBot?.bot;
    if (!bot) return;

    // Реакция на получение урона
    bot.on('health', () => {
      const health = bot.health;
      
      if (health < 6 && health > 0) {
        this.humanBehavior.handleGameEvent('low_health', { health });
      }
    });

    // Реакция на смерть
    bot.on('death', () => {
      this.humanBehavior.handleGameEvent('died', { cause: 'unknown' });
    });

    // Реакция на атаку
    bot.on('entityHurt', (entity) => {
      if (entity === bot.entity) {
        // Нас атаковали
        const nearbyMobs = Object.values(bot.entities).filter(e => 
          e.position.distanceTo(bot.entity.position) < 10 &&
          e.type === 'mob'
        );
        
        if (nearbyMobs.length > 0) {
          this.humanBehavior.handleGameEvent('under_attack', { 
            attacker: nearbyMobs[0].name 
          });
        }
      }
    });

    // TODO: Добавить больше событий (находки, крафт, и т.д.)
  }

  /**
   * Обработка команды игрока
   */
  async handlePlayerCommand(message, playerName) {
    // Проверяем AFK
    if (this.humanBehavior.afkSystem.isAFK) {
      // Возвращаемся из AFK если позвали
      const returned = this.humanBehavior.afkSystem.forceReturn();
      if (returned.shouldReturn && returned.message) {
        await this.humanBehavior._sendMessage(returned.message);
      }
    }

    // Классифицируем намерение
    const intent = FastPlayerIntentRouter.classifyIntent(message);
    
    if (intent !== PlayerIntents.NONE) {
      // Получаем контекст
      const context = {
        health: this.agent.mcBot?.bot?.health || 20,
        food: this.agent.mcBot?.bot?.food || 20,
        position: this.agent.mcBot?.bot?.entity?.position,
        busy: this.agent.currentTask !== 'idle',
        currentTask: this.agent.currentTask
      };
      
      // Генерируем ответ через HumanBehaviorController
      const result = await this.humanBehavior.handlePlayerCommand(
        intent,
        message,
        context
      );
      
      // Выполняем действие
      await FastPlayerIntentRouter.executeLocally({
        agentInstance: this.agent,
        intent,
        playerUsername: playerName
      });
      
      return { handled: true, response: result.response };
    }
    
    return { handled: false };
  }

  /**
   * Уведомление о событии
   */
  async notifyEvent(eventType, eventData = {}) {
    await this.humanBehavior.handleGameEvent(eventType, eventData, {
      busy: this.agent.currentTask !== 'idle',
      recentlySpokeAbout: this._getRecentTopics()
    });
  }

  /**
   * Получить недавние темы разговоров
   */
  _getRecentTopics() {
    // TODO: Интеграция с памятью разговоров
    return [];
  }

  /**
   * Запуск
   */
  start() {
    this.humanBehavior.start();
  }

  /**
   * Остановка
   */
  stop() {
    this.humanBehavior.stop();
  }

  /**
   * Получить статус
   */
  getStatus() {
    return this.humanBehavior.getStatus();
  }
}

/**
 * Пример использования в Company Orchestrator
 */
export class CompanyOrchestratorIntegration {
  constructor(companyOrchestrator) {
    this.orchestrator = companyOrchestrator;
    this.humanBehaviors = new Map();
  }

  /**
   * Инициализация для всех агентов
   */
  async initializeHumanBehaviors(aiBrain, memoryManager) {
    for (const [name, agentInstance] of this.orchestrator.agents) {
      const humanBehavior = new AgentWithHumanBehavior(
        agentInstance,
        aiBrain,
        memoryManager
      );
      
      this.humanBehaviors.set(name, humanBehavior);
      humanBehavior.start();
      
      console.log(`[${name}] Инициализирован HumanBehavior`);
    }
  }

  /**
   * Обработка сообщения игрока для конкретного агента
   */
  async handlePlayerMessageToAgent(agentName, message, playerName) {
    const humanBehavior = this.humanBehaviors.get(agentName);
    if (!humanBehavior) return { handled: false };
    
    return await humanBehavior.handlePlayerCommand(message, playerName);
  }

  /**
   * Уведомление о событии для агента
   */
  async notifyAgentEvent(agentName, eventType, eventData) {
    const humanBehavior = this.humanBehaviors.get(agentName);
    if (!humanBehavior) return;
    
    await humanBehavior.notifyEvent(eventType, eventData);
  }

  /**
   * Получить статус всех агентов
   */
  getAllStatuses() {
    const statuses = {};
    
    for (const [name, humanBehavior] of this.humanBehaviors) {
      statuses[name] = humanBehavior.getStatus();
    }
    
    return statuses;
  }

  /**
   * Остановка всех
   */
  stop() {
    for (const humanBehavior of this.humanBehaviors.values()) {
      humanBehavior.stop();
    }
  }
}

/**
 * Пример инициализации в основном index.js
 */
export async function integrateHumanBehaviorIntoMain(app) {
  const { aiBrain, memoryManager, companyOrchestrator } = app;
  
  // Создаём интеграцию
  const integration = new CompanyOrchestratorIntegration(companyOrchestrator);
  
  // Инициализируем для всех агентов
  await integration.initializeHumanBehaviors(aiBrain, memoryManager);
  
  // Сохраняем в приложении
  app.humanBehaviorIntegration = integration;
  
  console.log('✅ HumanBehavior интегрирован для всех агентов');
  
  return integration;
}
