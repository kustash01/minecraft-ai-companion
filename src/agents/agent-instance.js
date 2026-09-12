import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';
import { getProfile } from './agent-profiles.js';
import { AdaptiveThinkingController } from './adaptive-thinking.js';
import { ActionCommitmentManager } from './action-commitment.js';
import { DelegationManager } from '../group/delegation.js';
import { RecoveryController } from '../recovery/recovery-controller.js';
import { RealityReconciliation } from '../cognition/reality-reconciliation.js';
import { MinecraftBot } from '../bot/minecraft-bot.js';
import { EventHandler } from '../bot/event-handler.js';
import { WorldState } from '../perception/world-state.js';
import { ToolRegistry } from '../brain/tool-registry.js';
import { ContextManager } from '../brain/context-manager.js';
import { AIBrain } from '../brain/ai-brain.js';
import { registerAllTools } from '../tools/index.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { Planner } from '../planning/planner.js';
import { DeathHandler } from '../safety/death-handler.js';
import { EmergencyController } from '../safety/emergency.js';
import { InitiativeController } from '../personality/initiative.js';
import { FriendshipSystem } from '../personality/friendship.js';
import { CognitiveEngine } from '../cognition/cognitive-engine.js';
import { PersonalityProfile } from '../personality/profile.js';
import { SkillSystem } from '../behavior/player-simulation/skill-system.js';
import { EmotionalStateEngine } from '../personality/emotional-state.js';
import { bodyLanguage } from '../behavior/body-language.js';
import { InnerMonologue } from '../cognition/inner-monologue.js';
import { EmotionalMemory } from '../memory/emotional-memory.js';
import { LivingPersonality } from '../personality/living-personality.js';
import { eventBus } from '../events/event-bus.js';
import { MovementController } from '../control/movement-controller.js';
import { offlineFallback } from '../cognition/offline-fallback.js';
import { AutonomousLifeEngine } from '../behavior/autonomous-life.js';
import { combatAI } from '../combat/combat-ai.js';
import { VisualObserver } from '../perception/visual-observer.js';
import { LocalVisionController } from '../cognition/local-vision-controller.js';
import { AgentRuntime } from './agent-runtime.js';
import { ActuatorGateway } from './actuator-gateway.js';
import { ConversationEngine } from '../social/conversation-engine.js';
import { SocialConversationMemory } from '../social/social-conversation-memory.js';
import { classifySocialMessage } from '../social/social-message-classifier.js';
import { PersonalSocialState } from '../social/personal-social-state.js';
import { WorldEventTrigger } from '../social/world-event-trigger.js';
import { classifyTopic } from '../social/social-message-classifier.js';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AgentInstance — полностью автономный игрок в Minecraft.
 */
export class AgentInstance extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.name — имя агента ('Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo')
   * @param {Object} options.baseConfig — базовая конфигурация
   * @param {Object} options.aiProvider — экземпляр AIProvider
   * @param {Object} [options.budgetManager] — глобальный бюджетный менеджер API
   * @param {Object} [options.socialGraph] — общий социальный граф отношений
   * @param {Object} [options.companyMemory] — общая память компании
   * @param {Object} [options.conversationManager] — менеджер диалогов
     * @param {Object} [options.chatIngress] — canonical chat ingress for this company
   */
  constructor({
    name,
    baseConfig,
    aiProvider,
    budgetManager = null,
    socialGraph = null,
    companyMemory = null,
    conversationManager = null,
    chatIngress = null,
    chatBus = null,
    groupConversationWindow = null,
    groupParticipants = [],
    capabilities = {},
    socialRelationshipUpdater = null,
    personalSocialState = null,
  }) {
    super();
    this.name = name;
    this.logger = createLogger(`AGENT_${name.toUpperCase()}`);
    this.profile = getProfile(name);
    this.budgetManager = budgetManager;
    this.socialGraph = socialGraph;
    this.companyMemory = companyMemory;
    this.conversationManager = conversationManager;
    this.aiProvider = aiProvider;
    this.capabilities = Object.freeze({ ...capabilities });
    this.chatIngress = chatIngress;
    this.chatBus = chatBus;
    this.groupConversationWindow = groupConversationWindow;
    this.groupParticipants = groupParticipants;
    this.socialRelationshipUpdater = socialRelationshipUpdater;
    this.personalSocialState = personalSocialState || new PersonalSocialState({ getActiveGeneration: () => this.activeGeneration });

    // Конфигурация для конкретного бота
    this.config = {
      ...baseConfig,
      minecraft: {
        ...baseConfig.minecraft,
        username: name,
      },
      bot: {
        ...baseConfig.bot,
      },
      agentProfile: this.profile,
    };

    // 1. Изолированная долгосрочная память агента (отдельная SQLite БД)
    const dbPath = path.join(__dirname, '..', '..', 'data', `${name.toLowerCase()}_memory.db`);
    this.memoryManager = new MemoryManager(dbPath);

    // 2. Личность, навыки и эмоции
    this.personality = new PersonalityProfile();
    if (this.profile.traits) {
      for (const [trait, val] of Object.entries(this.profile.traits)) {
        if (this.personality.traits[trait] !== undefined) {
          this.personality.traits[trait] = val;
        }
      }
    }
    this.skills = new SkillSystem(this.profile.skillBiases || {});
    this.emotions = new EmotionalStateEngine();
    this.bodyLanguage = bodyLanguage;

    // === НОВАЯ СИСТЕМА: ЖИВАЯ ЛИЧНОСТЬ ===
    this.innerMonologue = new InnerMonologue({
      provider: this.aiProvider,
      agentName: this.name,
      personality: this.personality,
    });
    this.emotionalMemory = new EmotionalMemory({
      provider: this.aiProvider,
      agentName: this.name,
    });
    this.livingPersonality = null; // инициализируется после подключения

    this.activeGeneration = null;
    this.bindingReady = false;

    // 3. Восприятие, инструменты и AI Brain
    this.worldState = new WorldState();
    this.toolRegistry = new ToolRegistry();
    this.contextManager = new ContextManager(this.config);
    this.aiBrain = new AIBrain(
      this.config,
      this.toolRegistry,
      this.contextManager,
      this.aiProvider,
      this.memoryManager,
      {
        budgetManager: this.budgetManager,
        agentName: this.name,
        actionAdmission: () => this.canStartNormalToolAction(),
      }
    );
    this.planner = new Planner(this.memoryManager, this.toolRegistry, this.aiBrain);

    // 4. Когнитивное ядро
    this.cognitiveEngine = new CognitiveEngine({
      config: this.config,
      toolRegistry: this.toolRegistry,
      contextManager: this.contextManager,
      provider: this.aiProvider,
      memoryManager: this.memoryManager,
      aiBrain: this.aiBrain,
    });

    // 5. Адаптивное мышление (4-слойная гибридная модель)
    this.adaptiveThinking = new AdaptiveThinkingController({
      agentName: this.name,
      cognitiveEngine: this.cognitiveEngine,
      fastPath: this.cognitiveEngine.fastPath,
      eventBus,
    });

    // 6. Action Commitment (защита от NPC-дёргания)
    this.actionCommitment = new ActionCommitmentManager({ agentName: this.name });

    // 7. Делегирование задач (agent-to-agent)
    this.delegation = new DelegationManager({ agentName: this.name });

    // 8. Reality Reconciliation (сравнение ожиданий с реальностью)
    this.reality = new RealityReconciliation({ agentName: this.name });

    // 9. Отношения и социальные связи с владельцем
    this.friendship = new FriendshipSystem(this.memoryManager, this.config.bot.owner);

    // 10. Локальный контроллер движения (на physicsTick)
    this.movementController = new MovementController({ agentName: this.name, bot: null });
    this.runtime = null;

    // 11. Безопасность и восстановление
    this.emergency = new EmergencyController({
      bot: null,
      planner: this.planner,
      aiBrain: this.aiBrain,
    });
    this.deathHandler = new DeathHandler(null, this.memoryManager, this.config);
    this.recovery = new RecoveryController({
      agentName: this.name,
      bot: null,
      aiBrain: this.aiBrain,
      movementController: this.movementController,
    });

    // 12. Автономный движок живой деятельности (Utility AI & Drives)
    this.personality = new PersonalityProfile();
    this.emotions = new EmotionalStateEngine();
    this.emotionalMemory = new EmotionalMemory({ provider: this.aiProvider, agentName: this.name });
    this.innerMonologue = new InnerMonologue({ provider: this.aiProvider, agentName: this.name, personality: this.personality });
    this.autonomousLife = new AutonomousLifeEngine(this);
    this.visualObserver = new VisualObserver(this.config.ai?.localVision);

    // 13. Mineflayer бот
    this.mcBot = new MinecraftBot(this.config, this.capabilities);
    this.actuatorGateway = new ActuatorGateway({ mcBot: this.mcBot, agentId: this.name });
    this.emergency.actuatorGateway = this.actuatorGateway;
    this.initiative = null;
    this.eventHandler = null;
    this.socialConversationMemory = new SocialConversationMemory({
      getActiveGeneration: () => this.activeGeneration,
      isGenerationActive: (generation) => this.bindingReady && generation === this.activeGeneration,
    });
    this.conversationEngine = new ConversationEngine({
      agentName: this.name,
      profile: this.profile,
      provider: this.aiProvider,
      sendChat: (text, context) => this.sendChat(text, context),
      budgetManager: this.budgetManager,
      groupWindow: this.groupConversationWindow,
      groupParticipants: this.groupParticipants,
      conversationMemory: this.socialConversationMemory,
      worldSnapshot: () => this.worldState.getSnapshot(),
      durableMemory: () => this.memoryManager.getMemoryContext(this.worldState.position),
      personalSocialState: this.personalSocialState,
    });
    this.worldEventTrigger = new WorldEventTrigger({
      agentName: this.name,
      profile: this.profile,
      personalState: this.personalSocialState,
      chatBus: this.chatBus,
    });
    this.pendingFastIntentOutcomes = new Map();

    this.isConnected = false;
    this.availability = 'unavailable';
    this.generationBindings = new Map();
    this.lossCleanup = Promise.resolve();
    this.stopping = false;
    this.isAFK = false;
    this.afkTimer = null;
    this.currentTask = 'idle';
    this.lastGazeTime = 0;
    this.spawnPosition = null;
    this.localVision = new LocalVisionController({
      agent: this,
      provider: this.aiProvider,
      observer: this.visualObserver,
      toolRegistry: this.toolRegistry,
      config: this.config,
    });
    this._bindLifecycleListeners();

    this.logger.info(`Инициализирован экземпляр игрока [${this.name}]`);
  }

  /**
   * Подключение к Minecraft-серверу и активация всех систем
   */
  async start() {
    this.logger.info(`Подключение агента ${this.name} к серверу...`);

    try {
      const connection = await this.mcBot.connect();
      await this.generationBindings.get(connection.generation);
      if (this.isConnected && this.activeGeneration === connection.generation) {
        return { status: 'ready', generation: connection.generation };
      }
      throw new Error('Minecraft connected without an agent readiness binding');
    } catch (err) {
      this.logger.error(`❌ Ошибка запуска агента [${this.name}]: ${err.message}`);
      throw err;
    }
  }

  _bindLifecycleListeners() {
    this.mcBot.on('spawn', ({ generation, bot }) => {
      if (this.stopping || !bot || generation !== this.mcBot.connectionToken) return;
      const binding = this._bindGeneration(bot, generation);
      this.generationBindings.set(generation, binding);
      binding.catch((error) => {
        this.logger.error(`Не удалось подготовить поколение [${generation}]: ${error.message}`);
        this.isConnected = false;
        this._setAvailability('unavailable', { generation, reason: error.message, source: 'agent_binding' });
        this.mcBot.handleBindingFailure({ bot, generation, error });
      });
    });
    this.mcBot.on('connectionLost', (loss) => {
      this.conversationEngine.invalidateGeneration(loss.generation);
      this.personalSocialState.invalidate(loss.generation);
      this.worldEventTrigger.resetTransitions();
      this.groupConversationWindow?.invalidateAgentGeneration({ agentId: this.name, generation: loss.generation });
      if (loss.generation !== this.activeGeneration) return;
      this.pendingFastIntentOutcomes.clear();
      this.movementController.stop();
      this.activeGeneration = null;
      this.bindingReady = false;
      const oldRuntime = this.runtime;
      this.runtime = null;
      oldRuntime?.stop({ timeoutMs: 500 }).catch((error) => this.logger.debug(`Старый runtime завершён с предупреждением: ${error.message}`));
      this.worldState.stopAutoUpdate();
      this.isConnected = false;
      this._setAvailability('unavailable', loss);
      this.lossCleanup = this.lossCleanup
        .catch(() => {})
        .then(() => this.actuatorGateway.handleConnectionLost(loss));
    });
    this.mcBot.on('respawn', ({ bot, generation }) => {
      if (this.stopping || generation !== this.activeGeneration || bot !== this.mcBot.bot) return;
      this.worldState.forceUpdate(bot);
      if (bot.entity?.position) this.spawnPosition = bot.entity.position.clone();
      this.worldEventTrigger.noteRespawn();
    });
    this.mcBot.on('death', () => {
      if (this.stopping) return;
      this.personalSocialState.noteOwnDeath();
      this.worldEventTrigger.resetTransitions();
    });
    this.mcBot.on('playerJoined', () => this.worldEventTrigger.resetTransitions());
    this.mcBot.on('playerLeft', () => this.worldEventTrigger.resetTransitions());
    this.mcBot.on('entityDead', ({ generation, entity } = {}) => {
      if (this.stopping || generation !== this.activeGeneration) return;
      if (entity?.type === 'player' && entity.username && entity.username !== this.name) {
        this.worldEventTrigger.noteOtherDeath(entity.username, Date.now());
      }
    });
  }

  async _bindGeneration(bot, generation) {
    if (this.activeGeneration === generation || this.stopping) return;
    if (this.stopping || generation !== this.mcBot.connectionToken || bot !== this.mcBot.bot) return;
    this.bindingReady = false;
    const oldRuntime = this.runtime;
    this.runtime = null;
    this.movementController.stop();
    if (oldRuntime) await oldRuntime.stop({ timeoutMs: 500 });
    this.activeGeneration = generation;
    this.personalSocialState.beginGeneration(generation);
    this.socialConversationMemory.beginGeneration(generation);
    this.conversationEngine.bindGeneration(generation);
    this.pendingFastIntentOutcomes.clear();
    await this.lossCleanup;
    if (this.stopping || generation !== this.mcBot.connectionToken || bot !== this.mcBot.bot || this.activeGeneration !== generation) return;
    this.movementController.stop();
    this.worldState.stopAutoUpdate();
    this.worldState = new WorldState();
    this.emergency.bot = bot;
    this.deathHandler.bot = bot;
    this.recovery.bot = bot;
    // Attach physics/goal listeners as well as the bot reference. Assigning
    // `.bot` directly leaves follow mode inert because no tick can replan.
    this.movementController.attachBot(bot);
    this.actuatorGateway.bind({ bot, generation });
    registerAllTools(this.toolRegistry, {
      bot,
      worldState: this.worldState,
      mcBot: this.mcBot,
      memoryManager: this.memoryManager,
      planner: this.planner,
      aiProvider: this.aiProvider,
    });
    // Даём мозгу «глаза» на текущее поколение бота (зрение от первого лица в контексте).
    this.contextManager.setBot(bot);
    // A ready generation always exposes a fresh world snapshot before its runtime starts.
    this.worldState.forceUpdate(bot);
    this.worldState.startAutoUpdate(bot);
    if (!this.eventHandler) {
      this.eventHandler = new EventHandler(
        this.mcBot,
        this.aiBrain,
        this.worldState,
        this.config,
        {
          agentInstance: this,
          deathHandler: this.deathHandler,
          emergency: this.emergency,
          friendship: this.friendship,
          planner: this.planner,
          conversationManager: this.conversationManager,
          conversationEngine: this.conversationEngine,
          chatBus: this.chatBus,
          allAgentNames: ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'],
          conversationRouter: undefined,
        }
      );
      this.eventHandler.setup();
    } else {
      this.eventHandler.worldState = this.worldState;
    }
    this.eventHandler.bindBot(bot, generation);
    this.runtime = new AgentRuntime({
      agentId: this.name,
      observe: () => this.worldState.getSnapshot(),
      execute: (request, options) => this._executeRuntimeAction(request, { ...options, generation }),
      abortAction: (requestId) => this.actuatorGateway.cancel(requestId),
      capabilities: this.capabilities,
    });
    this.runtime.start();
    this.bindingReady = true;
    this.personalSocialState.markBindingReady(generation);
    this.isConnected = true;
    this._setAvailability('available', { generation });
    this._setupAFKSchedule();
    if (bot.entity?.position) {
      this.spawnPosition = bot.entity.position.clone();
      this.movementController.basePosition = this.spawnPosition;
    }

    // === ЗАПУСК ЖИВОЙ ЛИЧНОСТИ ===
    if (this.livingPersonality) {
      this.livingPersonality.stop();
    }
    this.livingPersonality = new LivingPersonality({
      agentName: this.name,
      bot: bot,
      worldState: this.worldState,
      innerMonologue: this.innerMonologue,
      emotionalMemory: this.emotionalMemory,
      emotionalState: this.emotions,
      personality: this.personality,
      owner: this.config.bot.owner,
    });
    this.livingPersonality.start();

    this.logger.info(`✅ Агент [${this.name}] успешно вошёл в игру!`);
  }

  _setAvailability(availability, detail = {}) {
    if (this.availability === availability) return;
    this.availability = availability;
    this.emit('availabilityChanged', { agentId: this.name, availability, ...detail });
  }

  /**
   * Выполнение одного когнитивного шага (вызывается оркестратором)
   */
  async tick() {
    if (!this.isConnected || !this.bindingReady) return;

    this.runtime?.tick();
    await this._reconcileFastIntentOutcomes();
    await this.conversationEngine.tick(this.activeGeneration);
    const stimulus = this.worldEventTrigger.poll({
      snapshot: this.worldState.getSnapshot(),
      generation: this.activeGeneration,
      bindingReady: this.bindingReady,
    });
    // Body changes are private impulses: they update attention and priorities
    // without becoming automatic chat messages.
    for (const impulse of this.worldEventTrigger.drainInternalImpulses()) {
      this.cognitiveEngine.appraiseEvent({
        eventId: `${this.name}:impulse:${impulse.kind}:${impulse.at}`,
        type: impulse.kind,
        category: 'setback',
        tags: [impulse.kind],
        risk: impulse.kind === 'hurt' ? 0.65 : 0.25,
        urgency: impulse.kind === 'hurt' ? 0.7 : 0.5,
        confidence: 1,
        personalNeed: impulse.kind === 'hungry' ? 0.8 : 0.35,
        publicRelevance: 0,
      }, {
        busy: this.movementController.isMoving() ? 0.6 : 0.1,
        equipmentReadiness: this.worldState.getSnapshot().health > 12 ? 0.7 : 0.3,
      });
    }
    if (stimulus) await this.conversationEngine.initiate(stimulus, { generation: this.activeGeneration });
    this._projectRuntimeTask();
  }

  recordFastIntentResult(result, { sender = null, routing = null, intent = null } = {}) {
    if (!result?.actionId || result.generation !== this.activeGeneration || !this.bindingReady) return false;
    this.pendingFastIntentOutcomes.set(result.actionId, {
      result,
      sender,
      routing,
      intent,
      recordedAt: Date.now(),
      expiresAt: Date.now() + 5000,
    });
    return true;
  }

  async _reconcileFastIntentOutcomes() {
    if (this.pendingFastIntentOutcomes.size === 0) return false;
    const now = Date.now();
    const snapshot = this.worldState.getSnapshot();
    for (const [actionId, record] of this.pendingFastIntentOutcomes) {
      if (record.result.generation !== this.activeGeneration) {
        this.pendingFastIntentOutcomes.delete(actionId);
        continue;
      }
      let result = record.result;
      const terminal = ['failed', 'noop'].includes(result.status)
        || (result.status === 'completed' && !result.expectedObservation);
      const observed = terminal || this._matchesFastIntentObservation(result.expectedObservation, snapshot);
      if (!observed && now < record.expiresAt) continue;
      if (!observed) {
        result = { ...result, status: 'failed', error: 'OBSERVATION_TIMEOUT', responseDisposition: 'deferred' };
      }

      const failed = result.status === 'failed';
      const appraisal = this.cognitiveEngine.appraiseEvent({
        eventId: actionId,
        type: failed ? 'player_command_failed' : 'player_command_observed',
        category: failed ? 'setback' : 'social',
        confidence: 1,
        urgency: failed ? 1 : 0.3,
        obligation: failed ? 1 : 0.55,
        publicRelevance: failed ? 1 : 0.7,
        risk: failed ? 0.35 : 0,
      }, {
        busy: result.status === 'accepted' ? 0.5 : 0.1,
        equipmentReadiness: snapshot.health > 12 ? 0.7 : 0.3,
      });
      this.pendingFastIntentOutcomes.delete(actionId);
      await this.conversationEngine.handleActionOutcome({ ...record, result, appraisal }, { generation: this.activeGeneration });
      return true;
    }
    return false;
  }

  _matchesFastIntentObservation(expected, snapshot) {
    if (!expected) return false;
    if (expected.positionAvailable && !snapshot.position) return false;
    if (expected.movementMode && this.movementController.mode !== expected.movementMode) return false;
    if (expected.targetPlayer && this.movementController.targetPlayer !== expected.targetPlayer) return false;
    if (expected.requireGoalOrProximity && !this.movementController.lastFormationGoal) return false;
    return true;
  }

  get bot() {
    return this.mcBot?.bot || null;
  }

  async _runOfflineContinuation() {
    const action = offlineFallback.getFallbackAction(this.worldState.getSnapshot?.() || {}, this.currentTask);
    this.recovery.recordAction(`offline_recommendation:${action.action}`);
  }

  /**
   * Естественное поведение в режиме ожидания: удержание рядом с игроком/базой,
   * естественные взгляды и жесты. НЕ уходит далеко без явной цели!
   */
  async runAutonomousBehavior() {
    const bot = this.mcBot?.bot;
    if (!bot || !bot.entity) return;

    // Если сейчас занят активным перемещением или следованием — не прерываем
    if (this.movementController.mode === 'following' || this.movementController.mode === 'moving_to') {
      return;
    }

    const now = Date.now();

    // 0. ТАКТИЧЕСКИЙ БОЙ С ВРАГАМИ (Скелеты, Зомби, Криперы, Пауки)
    const hostile = combatAI.findHostileTarget(bot, 14);
    if (hostile) {
      this.emergencyStop('combat_safety');
      await combatAI.executeCombatTick(bot, hostile);
      return;
    } else if (combatAI.inCombat) {
      combatAI.stopCombat(bot);
    }

    // 1. Естественные взгляды и реакция на стоящих рядом игроков
    if (now - this.lastGazeTime > 3500) {
      this.lastGazeTime = now;
      const nearbyPlayers = Object.values(bot.players || {})
        .filter((p) => p.entity && p.username !== this.name && p.entity.position);

      const closest = nearbyPlayers.find((p) => {
        const dist = bot.entity.position.distanceTo(p.entity.position);
        return dist <= 7;
      });

      if (closest && Math.random() < 0.45) {
        try {
          await bot.lookAt(closest.entity.position.offset(0, 1.6, 0), true);
          if (Math.random() < 0.25) {
            await this.bodyLanguage.shiftGreeting(bot);
          }
        } catch (e) {}
      } else if (Math.random() < 0.25) {
        try {
          const randomYaw = bot.entity.yaw + (Math.random() * 0.8 - 0.4);
          const randomPitch = Math.random() * 0.3 - 0.15;
          await bot.look(randomYaw, randomPitch, true);
        } catch (e) {}
      }
    }

  }

  /**
   * Обработка входящего сообщения из игрового чата
   */
  async handleChatMessage(sender, message) {
    if (sender === this.name) return;
    this.logger.info(`[ЧАТ] ${sender} -> ${this.name}: "${message}"`);

    // Обновляем время последнего сообщения (бот перестаёт беспокоиться)
    if (this.livingPersonality && sender === this.config.bot.owner) {
      this.livingPersonality.onPlayerMessage();
    }
  }

  async handleConversationMessage(message, options) {
    if (!this.isConnected || !this.bindingReady || options?.generation !== this.activeGeneration) return false;
    const relation = this.socialGraph?.getRelationship?.(this.name, message.sender);
    const relationshipScore = relation ? Math.max(0, Math.min(1, (relation.friendship + relation.trust) / 2)) : 0.5;
    const senderIrritation = this.personalSocialState.senderIrritation(message.sender, relation?.irritation ?? 0);
    if (this.conversationEngine.requests.size > 0) this.personalSocialState.noteInterrupted();
    return this.conversationEngine.handle(message, { ...options, relationshipScore, senderIrritation });
  }

  observeChat(message, { generation = this.activeGeneration, source = 'event_handler' } = {}) {
    const category = classifySocialMessage(message).speechAct;
    this.worldEventTrigger.noteChatAt(Date.now(), classifyTopic(message.content).topic);
    const accepted = this.socialRelationshipUpdater
      ? this.socialRelationshipUpdater.observeChat({ observerId: this.name, senderId: message.sender, messageId: message.messageId, category: category === 'request' ? 'help_request' : category, generation, observedAt: Date.now() })
      : true;
    if (accepted && this.personalSocialState) this.personalSocialState.observe({ generation, type: 'chat_seen', category: category === 'request' ? 'help_request' : category, participantId: message.sender });
    return accepted;
  }

  async sendChat(text, { generation = this.activeGeneration, recipientScope = null, envelopeId = `send:${generation}:${Date.now()}`, social = false } = {}) {
    const message = typeof text === 'string' ? text.trim() : '';
    if (
      !this.isConnected ||
      !this.mcBot?.bot ||
      generation !== this.activeGeneration ||
      !message ||
      message.length > 240 ||
      message.toUpperCase() === 'SILENCE' ||
      /[\r\n\u0000-\u001f\u007f]/.test(message) ||
      message.startsWith('/')
    ) return false;
    try {
      const result = this.mcBot.bot.chat(message);
      if (result?.then) await result;
       const outboundId = `${this.name}:${generation}:${envelopeId}:${Date.now()}`;
        let socialRecorded = true;
        if (social && recipientScope) socialRecorded = this.socialRelationshipUpdater?.acceptChatSend({ senderId: this.name, outboundId, recipientScope, generation, acceptedAt: Date.now() }) !== false;
       for (const participantId of recipientScope?.recipientIds || []) this.personalSocialState.observe({ generation, type: 'chat_sent', participantId });
        return { sent: true, outboundId, socialRecorded, recipientScope: recipientScope || { kind: 'public', recipientIds: [] }, generation };
    } catch (error) {
      this.logger.warn(`Не удалось отправить чат: ${error.message}`);
       return { sent: false, outboundId: null, recipientScope: recipientScope || { kind: 'public', recipientIds: [] }, generation };
    }
  }

  canStartNormalToolAction() {
    return Boolean(this.isConnected && this.bindingReady && !this.stopping);
  }

  preemptRuntimeForSafety() {
    return this.emergencyStop('chat_stop').preemptRequested;
  }

  emergencyStop(reason = 'emergency') {
    const runtimeActive = this.runtime?.hasActiveAction?.() || false;
    const preemptRequested = this.runtime?.preempt(reason) || false;
    const gatewayCancellationRequested = this.actuatorGateway.cancel();
    const physicalSafetyApplied = this.emergency.emergencyStop(reason, { announce: false }) === true;
    return { preemptRequested, runtimeActive, gatewayCancellationRequested, physicalSafetyApplied };
  }

  preemptRuntimeForLegacy() {
    return this.runtime?.preempt('legacy_command') || false;
  }

  async submitFastIntent({ intent, playerUsername, generation = this.activeGeneration } = {}) {
    if (!this.runtime || !this.bindingReady || generation !== this.activeGeneration) {
      return {
        actionId: `${this.name}:fast:stale:${Date.now()}`,
        generation,
        executed: false,
        status: 'failed',
        responseDisposition: 'none',
        ack: null,
        outcome: null,
        error: 'STALE_GENERATION',
        expectedObservation: null,
      };
    }

    const actions = {
      STOP: { kind: 'stop_moving' },
      WAIT: { kind: 'wait' },
      FOLLOW: { kind: 'follow_player', playerName: playerUsername, distance: 3 },
      COME_HERE: { kind: 'come_here', playerName: playerUsername, distance: 3 },
      HELP: { kind: 'help_player', playerName: playerUsername, distance: 2 },
    };
    const action = actions[intent];
    if (!action) {
      return {
        actionId: `${this.name}:fast:unrecognized:${Date.now()}`,
        generation,
        executed: false,
        status: 'unrecognized',
        responseDisposition: 'none',
        ack: null,
        outcome: null,
        error: null,
        expectedObservation: null,
      };
    }

    let terminal;
    try {
      terminal = await this.runtime.submitAction(action, {
        reason: `player_command:${intent}`,
        preempt: intent === 'STOP' || intent === 'WAIT',
      });
    } catch (error) {
      return {
        actionId: `${this.name}:fast:runtime-error:${Date.now()}`,
        generation,
        executed: false,
        status: 'failed',
        responseDisposition: 'none',
        ack: null,
        outcome: null,
        error: error?.message || 'RUNTIME_SUBMIT_FAILED',
        expectedObservation: null,
      };
    }
    const result = terminal?.result;
    if (!terminal?.accepted || !result) {
      return {
        actionId: terminal?.requestId || `${this.name}:fast:rejected:${Date.now()}`,
        generation,
        executed: false,
        status: 'rejected',
        responseDisposition: 'none',
        ack: null,
        outcome: null,
        error: 'ACTION_BUSY',
        expectedObservation: null,
      };
    }
    const failed = !result.success;
    const movementAction = ['follow_player', 'come_here', 'help_player'].includes(action.kind);
    const expectedObservation = movementAction
      ? { movementMode: 'following', targetPlayer: playerUsername, requireGoalOrProximity: !result.outcome?.nearTarget, followDistance: action.distance }
      : action.kind === 'wait'
        ? { movementMode: 'waiting' }
        : action.kind === 'stop_moving'
          ? { movementMode: 'idle' }
          : null;
    return {
      actionId: result.requestId,
      generation,
      executed: !failed,
      status: failed ? 'failed' : (movementAction ? 'accepted' : 'completed'),
      responseDisposition: failed ? 'none' : 'deferred',
      ack: null,
      outcome: result.outcome || { action: action.kind, target: playerUsername },
      error: result.error || null,
      expectedObservation,
    };
  }

  async _executeRuntimeAction(request, { signal, generation = this.activeGeneration }) {
    const startedAt = Date.now();
    const result = (success, outcome = null, error = null) => ({
      requestId: request.requestId,
      agentId: this.name,
      action: request.action,
      basedOnActionRevision: request.basedOnActionRevision,
      success,
      outcome,
      error,
      startedAt,
      completedAt: Date.now(),
      observationRevision: this.runtime?.getSnapshot().state.observationRevision || 0,
    });
    if (signal.aborted) return result(false, null, 'CANCELLED');
    if (generation !== this.activeGeneration || this.mcBot?.connectionToken !== generation) {
      return result(false, null, 'STALE_GENERATION');
    }
    try {
      const action = request.action || {};
      let outcome;
      if (action.kind === 'eat_food') {
        if (!this.mcBot?.bot?.inventory?.items) return result(false, null, 'UNSUPPORTED_ACTION');
        outcome = await this.actuatorGateway.eatFood({ requestId: request.requestId, signal });
      } else if (action.kind === 'stop_moving') {
        this.movementController.stop();
        outcome = { status: 'completed', action: 'stop' };
      } else if (action.kind === 'wait') {
        this.movementController.wait();
        outcome = { status: 'completed', action: 'wait' };
      } else if (['follow_player', 'come_here', 'help_player'].includes(action.kind)) {
        const playerName = action.playerName;
        const entry = this.mcBot.bot?.players?.[playerName]
          || Object.entries(this.mcBot.bot?.players || {}).find(([name]) => name.toLowerCase() === String(playerName).toLowerCase())?.[1];
        if (!entry?.entity) return result(false, null, 'PLAYER_NOT_VISIBLE');
        const followResult = await this.movementController.followPlayer(playerName, action.distance, {
          signal,
          expectedBot: this.mcBot.bot,
        });
        if (followResult?.status !== 'completed') return result(false, followResult, followResult?.code || 'FOLLOW_FAILED');
        outcome = { status: 'completed', action: action.kind, target: playerName, goalInstalled: Boolean(followResult.goalInstalled), nearTarget: Boolean(followResult.nearTarget) };
      } else {
        return result(false, null, 'UNSUPPORTED_ACTION');
      }
      if (signal.aborted) return result(false, outcome, 'CANCELLED');
      if (generation !== this.activeGeneration || this.mcBot?.connectionToken !== generation) {
        return result(false, outcome, 'STALE_GENERATION');
      }
      return result(outcome.status === 'completed', outcome, outcome.status === 'completed' ? null : (outcome.code || outcome.status));
    } catch (error) {
      return result(false, null, error.message);
    }
  }

  _projectRuntimeTask() {
    const snapshot = this.runtime?.getSnapshot();
    if (!snapshot) return;
    this.currentTask = this.actuatorGateway.getSnapshot().lease ? this.actuatorGateway.getSnapshot().lease.owner : snapshot.state.action?.action?.kind || snapshot.audit.lastDecision?.kind || 'idle';
  }

  /**
   * Настройка расписания AFK
   * @private
   */
  _setupAFKSchedule() {
    if (this.config.bot?.afkEnabled !== true) return;
    const afk = this.profile.afkBehavior;
    if (!afk) return;

    const intervalMinutes = afk.frequency || 45;
    const intervalMs = intervalMinutes * 60 * 1000 * (0.8 + Math.random() * 0.4);

    this.afkTimer = setTimeout(() => {
      this._enterAFK(afk);
    }, intervalMs);
  }

  /**
   * Вход в режим AFK
   * @private
   */
  async _enterAFK(afk) {
    if (!this.isConnected || this.isAFK) return;

    const [minSec, maxSec] = afk.duration || [30, 90];
    const durationSec = minSec + Math.random() * (maxSec - minSec);
    const reason = afk.reasons[Math.floor(Math.random() * afk.reasons.length)] || 'отошёл';

    this.isAFK = true;
    this.logger.info(`[AFK] ${this.name} отошёл на ${Math.round(durationSec)}с (${reason})`);

    setTimeout(() => {
      this.isAFK = false;
      this.logger.info(`[AFK] ${this.name} вернулся`);
      this._setupAFKSchedule();
    }, durationSec * 1000);
  }

  /**
   * Отключение агента
   */
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this._stopInternal();
    return this.stopPromise;
  }

  async _stopInternal() {
    this.logger.info(`Остановка агента ${this.name}...`);
    this.stopping = true;

    // Останавливаем живую личность
    if (this.livingPersonality) {
      this.livingPersonality.stop();
    }

    this.conversationEngine.stop();
    this.personalSocialState.invalidate(this.activeGeneration);
    if (this.afkTimer) clearTimeout(this.afkTimer);
    if (this.initiative) this.initiative.stop();
    const runtimeStop = this.runtime
      ? await this.runtime.stop({ shutdownAction: () => this.actuatorGateway.stop() })
      : null;
    this.recovery.stopMonitoring();
    this.movementController.cleanup();
    this.worldState.stopAutoUpdate();
    if (this.config.ai?.enabled === true) this.cognitiveEngine.stop();
    this.aiBrain.stop();
    this.memoryManager.close();
    this.isConnected = false;
    this._setAvailability('stopped', { generation: this.activeGeneration });
    const outcome = runtimeStop?.shutdownOutcome || await this.actuatorGateway.stop();
    this.logger.info(`Агент [${this.name}] остановлен: ${JSON.stringify(outcome)}`);
    return { runtime: runtimeStop, actuator: outcome };
  }

  /**
   * Текущее состояние для дашборда
   */
  getState() {
    const bot = this.mcBot?.bot;
    return {
      name: this.name,
      connected: this.isConnected,
      availability: this.availability,
      capabilities: this.capabilities,
      isAFK: this.isAFK,
      task: this.currentTask,
      traits: this.profile.traits,
      mood: this.emotions.getMood(),
      thinkingState: this.adaptiveThinking.getState(),
      aiState: this.aiBrain.getState(),
      movementMode: this.movementController.mode,
      emotions: this.emotions.getState(),
      adaptiveThinking: this.adaptiveThinking.getState(),
      actionCommitment: this.actionCommitment.getState(),
      commitment: this.actionCommitment.getState(),
      delegation: this.delegation.getState(),
      recovery: this.recovery.getState(),
      livingPersonality: this.livingPersonality?.getState() || null,
      innerMonologue: this.innerMonologue?.getState() || null,
      emotionalMemory: this.emotionalMemory?.getState() || null,
      health: bot?.health ?? 20,
      food: bot?.food ?? 20,
      position: bot?.entity?.position ? {
        x: Math.round(bot.entity.position.x),
        y: Math.round(bot.entity.position.y),
        z: Math.round(bot.entity.position.z),
      } : null,
      inventorySummary: this.worldState?.inventorySummary || '',
      runtime: this.runtime?.getSnapshot() || null,
      actuatorSafety: {
        capabilities: this.capabilities,
        coordinator: this.actuatorGateway.getSnapshot(),
        disabledSubsystems: ['initiative', 'recovery', 'movement', 'localVision', 'cognitiveActions', 'legacyCommands', 'llmTools'],
      },
    };
  }

  getStateSnapshot() {
    return this.getState();
  }
}
