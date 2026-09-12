import 'dotenv/config';
import { config } from '../config/default.js';
import { createLogger } from './utils/logger.js';
import { MinecraftBot } from './bot/minecraft-bot.js';
import { EventHandler } from './bot/event-handler.js';
import { WorldState } from './perception/world-state.js';
import { ToolRegistry } from './brain/tool-registry.js';
import { ContextManager } from './brain/context-manager.js';
import { AIBrain } from './brain/ai-brain.js';
import { createAIProvider } from './brain/provider-factory.js';
import { registerAllTools } from './tools/index.js';
import { MemoryManager } from './memory/memory-manager.js';
import { Planner } from './planning/planner.js';
import { DeathHandler } from './safety/death-handler.js';
import { EmergencyController } from './safety/emergency.js';
import { InitiativeController } from './personality/initiative.js';
import { FriendshipSystem } from './personality/friendship.js';
import { AutonomousGoals } from './personality/autonomous-goals.js';
import { CognitiveEngine } from './cognition/cognitive-engine.js';
import { eventBus } from './events/event-bus.js';
import { missionSystem } from './missions/mission-system.js';
import { sessionManager } from './session/session-manager.js';
import { bodyLanguage } from './behavior/body-language.js';
import { skillSystem } from './behavior/player-simulation/skill-system.js';
import { WorldInteractionErrors } from './perception/world-interaction-errors.js';
import { WorldInteractionErrorsExtended } from './perception/world-interaction-errors-extended.js';
import { BotActionWrapper } from './behavior/bot-action-wrapper.js';
import { BotActionWrapperExtended } from './behavior/bot-action-wrapper-extended.js';
import { ErrorMemory } from './perception/error-memory.js';
import { PersonalityHabits } from './perception/personality-habits.js';
import { EnvironmentInfluence } from './perception/environment-influence.js';
import { MovementController } from './control/movement-controller.js';
import { ReflexEngine } from './behavior/reflex-engine.js';
import { LootProtectionManager } from './behavior/loot-protection.js';

const logger = createLogger('MAIN');


/**
 * Главный класс приложения — связывает все модули Minecraft AI Companion.
 */
class MinecraftAICompanion {
  constructor() {
    this.isRunning = false;
    this.mcBot = null;
    this.worldState = null;
    this.toolRegistry = null;
    this.contextManager = null;
    this.memoryManager = null;
    this.aiBrain = null;
    this.eventHandler = null;
    this.planner = null;
    this.deathHandler = null;
    this.lootProtection = null;
    this.emergency = null;
    this.initiative = null;
    this.friendship = null;
    this.autonomousGoals = null;
    this.cognitiveEngine = null;
    this.eventBus = eventBus;
    this.missionSystem = missionSystem;
    this.sessionManager = sessionManager;
    this.bodyLanguage = bodyLanguage;
    this.skillSystem = skillSystem;
    this.worldInteractionErrors = null;
    this.botActionWrapper = null;
    this.errorMemory = null;
    this.personalityHabits = null;
    this.environmentInfluence = null;
    this.movementController = null;
  }

  /**
   * Инициализация и запуск всех систем.
   */
  async start() {
    logger.info('=============================================');
    logger.info('🤖 Minecraft AI Companion — Запуск');
    logger.info(`AI Провайдер: ${config.ai.provider} (Модель: ${config.ai.model})`);
    logger.info(`Сервер: ${config.minecraft.host}:${config.minecraft.port} (${config.minecraft.version || 'auto'})`);
    logger.info(`Имя бота: ${config.minecraft.username}`);
    logger.info(`Владелец: ${config.bot.owner}`);
    logger.info(`Инициатива: ${config.bot.initiative}`);
    logger.info('=============================================');

    try {
      // 1. Память (SQLite)
      logger.info('1/7. Инициализация памяти (SQLite)...');
      this.memoryManager = new MemoryManager();

      // 2. AI Провайдер
      logger.info('2/7. Инициализация AI провайдера...');
      const aiProvider = createAIProvider(config);
      logger.info(`AI провайдер готов: ${aiProvider.name}`);

      // 2.5. Система максимальной человекоподобности
      logger.info('2.5/7. Инициализация системы максимальной человекоподобности...');
      const { createMaximalHumanController } = await import('./behavior/human-like/maximal-human-controller.js');
      this.humanController = createMaximalHumanController({
        agentName: config.minecraft.username,
        profile: config.agentProfile || {},
        provider: aiProvider,
        durableStorage: this.memoryManager,
        socialGraph: null, // Будет подключено после инициализации friendship
        conversationMemory: null,
      });
      logger.info(`✅ Система максимальной человекоподобности активна для ${config.minecraft.username}`);

      // 3. Реестр инструментов и контекст
      logger.info('3/7. Инициализация реестра инструментов и планировщика...');
      this.toolRegistry = new ToolRegistry();
      this.contextManager = new ContextManager(config);
      this.aiBrain = new AIBrain(config, this.toolRegistry, this.contextManager, aiProvider, this.memoryManager);
      this.planner = new Planner(this.memoryManager, this.toolRegistry, this.aiBrain);
      this.cognitiveEngine = new CognitiveEngine({
        config,
        toolRegistry: this.toolRegistry,
        contextManager: this.contextManager,
        provider: aiProvider,
        memoryManager: this.memoryManager,
        aiBrain: this.aiBrain,
      });

      // 4. Дружба и характер
      this.friendship = new FriendshipSystem(this.memoryManager, config.bot.owner);
      this.friendship.load();

      // Подключаем friendship к humanController
      if (this.humanController) {
        this.humanController.socialGraph = this.friendship;
      }

      // 5. Minecraft Бот
      logger.info('4/7. Создание бота и подключение к Minecraft...');
      this.mcBot = new MinecraftBot(config);
      this.worldState = new WorldState();

      // Контроллер безопасности
      this.emergency = new EmergencyController({
        bot: null,
        planner: this.planner,
        aiBrain: this.aiBrain,
      });

      this.deathHandler = new DeathHandler(null, this.memoryManager, config);

      // Подключаемся к серверу
      await this.mcBot.connect();
      this.emergency.bot = this.mcBot.bot;
      this.deathHandler.bot = this.mcBot.bot;

      // Даём мозгу «глаза»: контекст-менеджер теперь видит мир от первого лица.
      this.contextManager.setBot(this.mcBot.bot);

      // 6. Регистрация всех инструментов
      logger.info('5/7. Регистрация инструментов...');
      registerAllTools(this.toolRegistry, {
        bot: this.mcBot.bot,
        worldState: this.worldState,
        mcBot: this.mcBot,
        memoryManager: this.memoryManager,
        planner: this.planner,
        aiProvider,
      });
      logger.info(`Зарегистрировано ${this.toolRegistry.getAll().length} инструментов.`);

      // 6.6. Инициализация системы реалистичных ошибок при взаимодействии с миром
      logger.info('6.6/7. Инициализация системы реалистичных ошибок...');
      this.worldInteractionErrors = new WorldInteractionErrorsExtended({
        agentName: config.minecraft.username,
        emotionalSystem: this.humanController?.emotionalSystem || null,
      });

      // Создаём расширенный wrapper для действий бота
      this.botActionWrapper = new BotActionWrapperExtended(
        this.mcBot.bot,
        this.humanController?.emotionalSystem || null,
        config.minecraft.username
      );

      // 6.7. Инициализация памяти об ошибках (бот УЧИТСЯ!)
      this.errorMemory = new ErrorMemory(config.minecraft.username);
      logger.info('✅ Система памяти об ошибках активирована');

      // 6.8. Инициализация персональных привычек (каждый бот УНИКАЛЕН!)
      this.personalityHabits = new PersonalityHabits(config.minecraft.username);
      logger.info('✅ Персональные привычки активированы:');
      logger.info(this.personalityHabits.getDescription());

      // 6.9. Инициализация влияния окружения (ОЧЕНЬ МНОГО фишек!)
      this.environmentInfluence = new EnvironmentInfluence();
      logger.info('✅ Система влияния окружения активирована (20+ факторов)');

      logger.info('✅ ВСЕ системы реалистичных ошибок активированы!');

      // 7. Запуск подсистем восприятия и когнитивного ядра
      logger.info('6/7. Запуск систем восприятия и когнитивного ядра...');
      this.worldState.startAutoUpdate(this.mcBot.bot);

      // Спинной мозг (Reflex Engine 20 Hz)
      this.reflexEngine = new ReflexEngine(this.mcBot.bot);
      this.reflexEngine.start();
      logger.info('✅ Спинной мозг (Reflex Engine 20 Hz) активирован');

      this.cognitiveEngine.start(() => this.worldState.getSnapshot(), this.mcBot.bot);

      // Контроллер перемещения
      this.movementController = new MovementController({
        agentName: config.minecraft.username,
        bot: this.mcBot.bot,
      });

      // Система автономных целей (бот развивается сам, а не только по командам)
      this.autonomousGoals = new AutonomousGoals({
        bot: this.mcBot.bot,
        memoryManager: this.memoryManager,
        aiBrain: this.aiBrain,
        config,
      });
      logger.info('✅ Система автономных целей активирована (бот развивается самостоятельно)');

      this.initiative = new InitiativeController({
        bot: this.mcBot.bot,
        worldState: this.worldState,
        memoryManager: this.memoryManager,
        aiBrain: this.aiBrain,
        config,
        movementController: this.movementController,
        autonomousGoals: this.autonomousGoals,
      });
      this.initiative.start();

      this.lootProtection = new LootProtectionManager(this.mcBot.bot);

      // Обработчик событий
      this.eventHandler = new EventHandler(this.mcBot, this.aiBrain, this.worldState, config, {
        deathHandler: this.deathHandler,
        emergency: this.emergency,
        friendship: this.friendship,
        planner: this.planner,
        humanController: this.humanController, // Передаём humanController
        movementController: this.movementController,
        bodyLanguage: this.bodyLanguage,
        lootProtection: this.lootProtection,
        toolRegistry: this.toolRegistry,
      });
      this.eventHandler.setup();

      // Первичное дружеское приветствие хозяина (shift-shift + кивок), если он рядом
      setTimeout(async () => {
        try {
          const ownerUsername = config.bot.owner;
          const ownerPlayer = this.mcBot?.bot?.players?.[ownerUsername]
            || Object.entries(this.mcBot?.bot?.players || {}).find(([n]) => n.toLowerCase() === ownerUsername.toLowerCase())?.[1];
          const ownerEntity = ownerPlayer?.entity;
          if (ownerEntity && this.mcBot?.bot) {
            await this.mcBot.bot.lookAt(ownerEntity.position.offset(0, 1.6, 0), true);
            await this.bodyLanguage?.shiftGreeting(this.mcBot.bot);
            await this.bodyLanguage?.nodHead(this.mcBot.bot);
          }
        } catch (_) {}
      }, 2500);

      this.isRunning = true;
      logger.info('=============================================');
      logger.info('✅ Minecraft AI Companion успешно запущен!');
      logger.info(`🎮 Бот "${config.minecraft.username}" готов играть в мире Minecraft.`);
      logger.info(`💬 Общайтесь с компанией обычными фразами в чате Minecraft.`);
      logger.info('=============================================');

    } catch (error) {
      logger.error(`❌ Ошибка запуска: ${error.message}`);
      logger.error(error.stack);
      await this.stop();
      process.exit(1);
    }
  }

  /**
   * Остановка всех систем.
   */
  async stop() {
    logger.info('Остановка всех систем бота...');
    this.isRunning = false;

    // Сохраняем статистику ошибок
    if (this.errorMemory) {
      logger.info('📊 Финальная статистика ошибок:');
      const stats = this.errorMemory.getStats();
      logger.info(`Всего ошибок: ${stats.totalErrors}`);
      logger.info(`Всего успехов: ${stats.totalSuccesses}`);
      logger.info(`% Успеха: ${stats.successRate}%`);
      logger.info(`Множитель обучения: ${stats.learningMultiplier}x`);
    }

    if (this.humanController) {
      this.humanController.stop();
    }

    if (this.eventHandler) {
      this.eventHandler.cleanup?.();
    }

    if (this.cognitiveEngine) {
      this.cognitiveEngine.stop();
    }

    if (this.initiative) {
      this.initiative.stop();
    }

    if (this.autonomousGoals) {
      this.autonomousGoals.clearCurrentGoal();
    }

    if (this.movementController) {
      this.movementController.stop();
    }

    if (this.worldState) {
      this.worldState.stopAutoUpdate();
    }

    if (this.mcBot) {
      this.mcBot.disconnect();
    }

    if (this.memoryManager) {
      this.memoryManager.close();
    }


    logger.info('Minecraft AI Companion остановлен.');
  }
}

import { CompanyOrchestrator } from './agents/company-orchestrator.js';
import { AgentInstance } from './agents/agent-instance.js';

export { MinecraftAICompanion, CompanyOrchestrator, AgentInstance };
