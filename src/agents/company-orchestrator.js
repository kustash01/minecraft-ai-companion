import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';
import { createAIProvider } from '../brain/provider-factory.js';
import { AgentInstance } from './agent-instance.js';
import { APIBudgetManager } from './api-budget-manager.js';
import { SocialGraph } from '../social/social-graph.js';
import { ConversationManager } from '../social/conversation-manager.js';
import { CompanyMemory } from '../memory/company-memory.js';
import { GroupManager } from '../group/group-manager.js';
import { AGENT_PROFILES } from './agent-profiles.js';
import { telemetry } from '../utils/telemetry.js';
import { ChatIngress } from '../social/chat-ingress.js';
import { GroupConversationWindow } from '../social/group-conversation-window.js';
import { MessageBus } from '../events/message-bus.js';
import { SocialRelationshipUpdater } from '../social/social-relationship-updater.js';
import { PersonalSocialState } from '../social/personal-social-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('COMPANY_ORCHESTRATOR');

export const AGENT_NAMES = ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'];

/**
 * CompanyOrchestrator — инфраструктурный координатор компании из 6 игроков.
 * НЕ ПРИНИМАЕТ РЕШЕНИЙ за агентов. Отвечает только за жизненный цикл,
 * распределение глобального бюджета API, общую инфраструктуру и безопасность.
 */
export class CompanyOrchestrator {
  /**
   * @param {Object} config — глобальная конфигурация приложения
   */
  constructor(config) {
    this.config = config;
    this.agentNames = AGENT_NAMES;
    this.capabilities = Object.freeze({ enableAutoEat: false });
    this.agents = new Map(); // Map<name, AgentInstance>
    this.isRunning = false;
    this.tickInterval = null;
    this.activeTicks = new Set();
    this.chatIngress = new ChatIngress();
    this.groupConversationWindow = new GroupConversationWindow();
    this.chatBus = new MessageBus();
    this.startPromise = null;
    this.isStarting = false;
    this.availability = 'starting';

    // 1. Единый провайдер AI
    this.aiProvider = createAIProvider(config);

    // 2. Глобальный бюджетный менеджер API (увеличены лимиты для нормальной работы)
    const maxGlobalRPM = config.ai?.rateLimit?.maxGlobalRPM || 60; // Было 14
    const maxPerAgentRPM = config.ai?.rateLimit?.maxPerAgentRPM || 15; // Было 3
    this.budgetManager = new APIBudgetManager({
      maxGlobalRPM,
      maxPerAgentRPM,
      agents: this.agentNames,
    });

    // 3. Социальный граф отношений (42 направленных ребра между 6 ботами и игроком)
    this.socialGraph = new SocialGraph({
      agents: this.agentNames,
      humanPlayer: config.bot?.owner || 'kustash01',
    });
    this.socialRelationshipUpdater = new SocialRelationshipUpdater({ socialGraph: this.socialGraph, entities: [...this.agentNames, config.bot?.owner || 'kustash01'] });

    // 4. Общая память компании
    const companyDbPath = path.join(__dirname, '..', '..', 'data', 'company_memory.db');
    this.companyMemory = new CompanyMemory({ dbPath: companyDbPath });
    this.companyMemory.init();

    // 5. Менеджер бесед и молчания
    this.conversationManager = new ConversationManager({
      socialGraph: this.socialGraph,
      profiles: AGENT_PROFILES,
    });

    // 6. Динамические группы
    this.groupManager = new GroupManager({
      socialGraph: this.socialGraph,
      profiles: AGENT_PROFILES,
    });

    // Создаём 6 независимых экземпляров агентов
    for (const name of this.agentNames) {
      let agent = null;
      const personalSocialState = new PersonalSocialState({ getActiveGeneration: () => agent?.activeGeneration });
      agent = new AgentInstance({
        name,
        baseConfig: this.config,
        aiProvider: this.aiProvider,
        budgetManager: this.budgetManager,
        socialGraph: this.socialGraph,
        companyMemory: this.companyMemory,
        conversationManager: this.conversationManager,
        chatIngress: this.chatIngress,
        chatBus: this.chatBus,
        groupConversationWindow: this.groupConversationWindow,
        groupParticipants: this.agentNames,
        capabilities: this.capabilities,
        socialRelationshipUpdater: this.socialRelationshipUpdater,
        personalSocialState,
      });
      this.agents.set(name, agent);
      agent.on('availabilityChanged', () => this._refreshAvailability());
    }

    logger.info(`Инициализирован CompanyOrchestrator для 6 игроков: ${this.agentNames.join(', ')}`);
  }


  /**
   * Запуск всех агентов и старт инфраструктурных циклов
   */
  async start() {
    if (this.startPromise) return this.startPromise;
    this.isStarting = true;
    this.startPromise = this._startInternal().finally(() => {
      this.isStarting = false;
    });
    return this.startPromise;
  }

  async _startInternal() {
    if (this.isRunning) return this.getAvailability();
    this.isRunning = true;

    logger.info('=============================================');
    logger.info('👥 Minecraft AI Company — Запуск 6 игроков');
    logger.info(`Игроки: ${this.agentNames.join(', ')}`);
    logger.info(`Сервер: ${this.config.minecraft.host}:${this.config.minecraft.port}`);
    logger.info('=============================================');

    // Последовательное подключение с задержкой 5 секунд (предотвращает duplicate_login ошибки)
    for (const [name, agent] of this.agents.entries()) {
      if (!this.isRunning) break;
      logger.info(`Подключение игрока [${name}]...`);
      try {
        await agent.start();
        logger.info(`[${name}] подключился успешно.`);
      } catch (err) {
        logger.warn(`Не удалось сразу подключить [${name}]: ${err.message}. Будет повторная попытка.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000)); // УВЕЛИЧИЛИ с 2000 на 5000!
    }

    // The aggregate availability owns the loop: no available agents means no ticks.
    const startup = this.getAvailability();

    logger.info('✅ Компания из 6 игроков успешно запущена!');
    return startup;
  }

  _refreshAvailability() {
    const agents = this.getAllAgents();
    const available = agents.filter((agent) => agent.availability === 'available').length;
    this.availability = !this.isRunning ? 'stopped' : available === agents.length ? 'available' : available > 0 ? 'degraded' : 'unavailable';
    if (this.isRunning && available > 0) this._startOrchestrationLoop();
    else this._stopOrchestrationLoop();
  }

  getAvailability() {
    this._refreshAvailability();
    return {
      status: this.availability,
      availableAgents: this.getAllAgents().filter((agent) => agent.availability === 'available').map((agent) => agent.name),
      totalAgents: this.agents.size,
      startupPending: this.isStarting,
    };
  }

  /**
   * Цикл координации тиков агентов
   * @private
   */
  _startOrchestrationLoop() {
    if (this.tickInterval) return;
    // Every connected agent observes continuously. A per-agent lock prevents a
    // slow local-model request from overlapping its next perception cycle.
    this.tickInterval = setInterval(() => {
      if (!this.isRunning) return;
      for (const agent of this.agents.values()) {
        if (this.activeTicks.has(agent.name)) continue;
        this.activeTicks.add(agent.name);
        Promise.resolve(agent.tick())
          .catch(err => logger.error(`Ошибка в цикле агента [${agent.name}]: ${err.message}`))
          .finally(() => this.activeTicks.delete(agent.name));
      }
    }, 500);
  }

  _stopOrchestrationLoop() {
    if (!this.tickInterval) return;
    clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.activeTicks.clear();
  }

  /**
   * Получить агента по имени
   * @param {string} name 
   * @returns {AgentInstance|null}
   */
  getAgent(name) {
    return this.agents.get(name) || null;
  }

  /**
   * Получить всех агентов
   * @returns {AgentInstance[]}
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Снимок состояния всей компании для диагностики и локальных интеграций
   */
  getStateSnapshot() {
    const agentsSnapshots = {};
    for (const [name, agent] of this.agents.entries()) {
      agentsSnapshots[name] = agent.getStateSnapshot();
    }

    return {
      agents: agentsSnapshots,
      socialGraph: this.socialGraph.getState(),
      groups: this.groupManager.getState(),
      apiBudget: this.budgetManager.getStats(),
      conversations: this.conversationManager.getState(),
      telemetry: telemetry.getSnapshot(),
      availability: this.getAvailability(),
    };
  }

  /**
   * Полная остановка всех систем и отключение всех ботов
   */
  async stop() {
    logger.info('Остановка CompanyOrchestrator...');
    this.isRunning = false;
    this._refreshAvailability();
    this._stopOrchestrationLoop();

    // Остановка каждого агента
    for (const [name, agent] of this.agents.entries()) {
      try {
        const result = await agent.stop();
        logger.info(`[${name}] остановлен: ${JSON.stringify(result)}`);
      } catch (err) {
        logger.error(`Ошибка при остановке [${name}]: ${err.message}`);
      }
    }

    // Закрытие памяти компании
    if (this.companyMemory) {
      this.companyMemory.close();
    }
    this.chatIngress.clear();
    this.groupConversationWindow.clear();
    this.budgetManager.dispose();

    logger.info('CompanyOrchestrator успешно остановлен.');
  }
}
