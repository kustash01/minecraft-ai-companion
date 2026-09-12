import { createLogger } from '../utils/logger.js';
import { MessageBus, MessageOrigin } from '../events/message-bus.js';
import { telemetry } from '../utils/telemetry.js';
import { ConversationRouter } from '../social/conversation-router.js';
import { FastPlayerIntentRouter, PlayerIntents } from '../control/fast-player-intent.js';
import { adaptiveCamera } from '../behavior/adaptive-camera.js';
import { LootProtectionManager } from '../behavior/loot-protection.js';

const logger = createLogger('EVENT');

/**
 * EventHandler — обработка событий Minecraft, маршрутизация быстрых команд игрока (Fast Path)
 * и фильтрация сообщений с дедупликацией.
 */
export class EventHandler {
  constructor(mcBot, aiBrain, worldState, config, options = {}) {
    this.mcBot = mcBot;
    this.aiBrain = aiBrain;
    this.worldState = worldState;
    this.config = config;
    this.owner = config?.bot?.owner || 'kustash01';
    this.botUsername = config?.minecraft?.username || 'GeminiBot';
    this.toolRegistry = options.toolRegistry || this.aiBrain?.toolRegistry || null;
    this.agentInstance = options.agentInstance || null;
    this.deathHandler = options.deathHandler || null;
    this.emergency = options.emergency || null;
    this.friendship = options.friendship || null;
    this.planner = options.planner || null;
    this.conversationManager = options.conversationManager || null;
    this.conversationEngine = options.conversationEngine || null;
    this.chatBus = options.chatBus || new MessageBus();
    this.humanController = options.humanController || null; // Добавляем humanController
    this.movementController = options.movementController || null;
    this.bodyLanguage = options.bodyLanguage || null;
    this.allAgentNames = options.allAgentNames || ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'];
    this.conversationRouter = options.conversationRouter || new ConversationRouter({
      agentNames: this.allAgentNames,
      maxPublicResponders: config?.ai?.social?.maxPublicResponders || config?.social?.maxPublicResponders || 2,
    });
    this.lootProtection = options.lootProtection || (this.mcBot?.bot ? new LootProtectionManager(this.mcBot.bot) : null);
    this._lootCheckInterval = null;
    this.boundBot = null;
    this.boundGeneration = null;
    this._entityDeadListener = null;
  }

  _getPhysicalState() {
    if (this.worldState && typeof this.worldState.getSnapshot === 'function') {
      return this.worldState.getSnapshot();
    }
    return {
      health: this.mcBot?.bot?.health || 20,
      food: this.mcBot?.bot?.food || 20,
      position: this.mcBot?.bot?.entity?.position || { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Установка всех обработчиков событий.
   */
  setup() {
    if (this._isSetup) return;
    this._isSetup = true;
    // 1. Чат — основной канал общения
    this.mcBot.on('chat', async (username, rawMessage, generation) => {
      if (this.agentInstance && (generation !== this.agentInstance?.activeGeneration || this.agentInstance?.bindingReady !== true)) return;
      // Игнорируем собственные сообщения бота
      if (username === this.botUsername) return;

      const message = rawMessage.trim();
      const lower = message.toLowerCase();

      // Генерация/получение ID сообщения и дедупликация
      const timestamp = Date.now();
      const msgId = this.agentInstance?.chatIngress?.getEnvelopeId(username, message, timestamp)
        || this.chatBus.generateMessageId(username, message, timestamp);
      const isOwner = username === this.owner;
      const isBot = this.allAgentNames.includes(username);
      const origin = isBot ? MessageOrigin.BOT_REAL_CHAT : (isOwner ? MessageOrigin.PLAYER : MessageOrigin.SYSTEM);

      const envelope = { sender: username, content: message, origin, timestamp, messageId: msgId };

      // Transport noise never counts as social observation or silence reset.
      if (
        lower.startsWith('[ui]') ||
        lower.startsWith('[web-ui]') ||
        lower.includes('подожди, я ещё думаю') ||
        lower.includes('произошла ошибка:')
      ) {
        return;
      }

      // Observe every valid social line before addressing/filter decisions; observation is not an action.
      const observed = this.agentInstance?.observeChat(envelope, { generation });
      if (observed === false) return;
      if (!this.chatBus.markProcessed(this.botUsername, msgId)) {
        telemetry.increment('duplicateMessageCount');
        return;
      }

      const routing = this.conversationRouter.route(envelope, { agentName: this.botUsername });
      const isDirectMessage = routing.kind === 'direct' || !this.agentInstance;
      const isSelectedPublic = routing.recipientIds.includes(this.botUsername) || !this.agentInstance;

      // Плавно поворачиваемся лицом к говорящему игроку
      if (this.mcBot?.bot?.players?.[username]?.entity) {
        try {
          const pEntity = this.mcBot.bot.players[username].entity;
          adaptiveCamera.calmLookAt(this.mcBot.bot, pEntity.position.offset(0, 1.6, 0)).catch(() => {});
        } catch (_) {}
      }

      // Если команда явно адресована другому конкретному боту, не обрабатываем её
      if (this.agentInstance && (routing.kind === 'named' || (!isDirectMessage && !isSelectedPublic))) {
        logger.debug(`[${this.botUsername}] Реплика маршрутизирована другим участникам.`);
        return;
      }

      // Главный путь: если подключен AI Brain — полная агентная обработка без шаблонов и регулярок
      if (this.aiBrain && !isBot && isDirectMessage) {
        const lower = message.toLowerCase().trim();

        // 1. Остановка — действие мгновенное (отзывчивость важнее всего),
        // но реплику НЕ хардкодим: её сгенерит LLM живыми словами ниже.
        if (isOwner && /(^|\s)(стоп|стой|stop|хватит|остановись|замри)(?=$|[\s,!?.])/i.test(lower)) {
          if (this.agentInstance) this.agentInstance.emergencyStop('Owner stop command');
          else this.emergency?.emergencyStop('Owner stop command');
          if (this.mcBot?.bot?.pathfinder) this.mcBot.bot.pathfinder.stop();
          this.mcBot?.bot?.clearControlStates?.();
          // Живой короткий отклик через humanController, если доступен; иначе молча встаём.
          if (this.humanController) {
            try {
              const ack = await this.humanController.generateResponse('player_command', {
                speaker: username,
                message,
                isOwner: true,
                intent: 'STOP',
                physicalState: this._getPhysicalState(),
              });
              if (ack && this.mcBot?.bot?.chat) this.mcBot.bot.chat(ack);
            } catch (_) {}
          }
          return;
        }

        // 2. «Где ты / координаты» — НЕ отвечаем шаблонной строкой.
        // Пропускаем вопрос в AIBrain: он видит реальные координаты в контексте
        // [ЧТО Я ВИЖУ] и отвечает своими словами, как живой игрок.
        try {
          const reply = await this.aiBrain.processMessage(`[${username}]: ${message}`, this.worldState);
          if (reply && this.mcBot?.bot?.chat) {
            const typingDelayMs = Math.min(1800, Math.max(300, reply.length * 28 + Math.floor(Math.random() * 120)));
            await new Promise((r) => setTimeout(r, typingDelayMs));
            this.mcBot.bot.chat(reply);
            if (this.humanController) {
              this.humanController.processEvent('executed_player_command', {
                speaker: username,
                message: message,
                memorable: true,
                importance: 0.6,
              });
            }
            return;
          }
        } catch (err) {
          logger.warn(`Ошибка обработки AI Brain: ${err.message}`);
        }
      }

      // Резервный путь для изолированных тестов без AI (Fast Path)
      if (!isBot) {
        const intent = FastPlayerIntentRouter.classifyIntent(message);
        if (FastPlayerIntentRouter.isGameplayMutation(intent)) {
          if (!isOwner) {
            logger.debug(`[${this.botUsername}] Команда ${intent} отклонена: отправитель не является владельцем.`);
          } else {

            const result = await FastPlayerIntentRouter.executeLocally({
              agentInstance: this.agentInstance,
              movementController: this.movementController,
              bot: this.mcBot?.bot,
              intent,
              playerUsername: username,
              generation,
            });
            this.agentInstance?.recordFastIntentResult?.(result, {
              sender: username,
              routing,
              intent,
            });
            if (result.status !== 'unrecognized') {
              // Мгновенная реакция телом: кивок головы подтверждает получение команды
              try {
                if (this.bodyLanguage && this.mcBot?.bot) {
                  this.bodyLanguage.nodHead?.(this.mcBot.bot);
                }
              } catch (_) {}

              // Если есть человеческий контроллер — генерируем живой естественный ответ через LLM без шаблонов
              if (this.humanController) {
                const physicalState = this._getPhysicalState();

                const response = await this.humanController.generateResponse('player_command', {
                  speaker: username,
                  message: message,
                  intent: intent,
                  commandAction: result.outcome?.action,
                  physicalState: physicalState,
                  routing: routing,
                  isOwner: isOwner,
                });

                if (response) {
                  // Человеческая задержка набора текста (печатает со скоростью обычного игрока)
                  const typingDelayMs = Math.min(1800, Math.max(300, response.length * 28 + Math.floor(Math.random() * 120)));
                  await new Promise((r) => setTimeout(r, typingDelayMs));

                  if (this.agentInstance) {
                    await this.agentInstance.sendChat(response, {
                      generation,
                      recipientScope: routing,
                      social: true,
                    });
                  } else if (this.mcBot?.bot?.chat) {
                    this.mcBot.bot.chat(response);
                  }

                  this.humanController.processEvent('executed_player_command', {
                    speaker: username,
                    message: message,
                    intent: intent,
                    memorable: true,
                    importance: 0.6,
                  });
                }
              } else if (result.responseDisposition === 'immediate' && typeof result.ack === 'string' && result.ack.trim()) {
                await this.agentInstance?.sendChat(result.ack, {
                  generation,
                  recipientScope: routing,
                  social: false,
                });
              } else if (!this.agentInstance && this.mcBot?.bot?.chat) {
                // Минимальный резерв для изолированных тестов без AI
                const quickAcks = {
                  [PlayerIntents.STOP]: 'стою',
                  [PlayerIntents.WAIT]: 'жду',
                  [PlayerIntents.COME_HERE]: 'иду',
                  [PlayerIntents.FOLLOW]: 'пошли',
                  [PlayerIntents.HELP]: 'ща помогу',
                };
                const reply = quickAcks[intent] || 'ок';
                this.mcBot.bot.chat(reply);
              }
              return;
            }
          }
        }
      }

      // STOP is the only gameplay-adjacent route. It is owner-only and direct.
      if (isOwner && isDirectMessage && /(^|\s)(стоп|стой|stop)(?=$|[\s,!?.])/i.test(message)) {
        if (this.agentInstance) {
          this.agentInstance.emergencyStop('Owner stop command');
        } else {
          this.emergency?.emergencyStop('Owner stop command');
        }

        if (this.humanController) {
          const physicalState = this._getPhysicalState();
          const response = await this.humanController.generateResponse('player_command', {
            speaker: username,
            message: message,
            intent: 'STOP',
            commandAction: 'stop',
            physicalState: physicalState,
            routing: routing,
            isOwner: isOwner,
          });
          if (response) {
            const typingDelayMs = Math.min(1800, Math.max(300, response.length * 28 + Math.floor(Math.random() * 120)));
            await new Promise((r) => setTimeout(r, typingDelayMs));
            if (this.agentInstance) {
              await this.agentInstance.sendChat(response, { generation, recipientScope: routing, social: true });
            } else if (this.mcBot?.bot?.chat) {
              this.mcBot.bot.chat(response);
            }
          }
        } else {
          if (this.agentInstance) {
            await this.agentInstance.sendChat('стою', { generation, recipientScope: routing, social: true });
          } else if (this.mcBot?.bot?.chat) {
            this.mcBot.bot.chat('стою');
          }
        }
        return;
      }

      // Conversation is opt-in: only direct or explicit group messages enter it.
      const routedEnvelope = this.chatBus.emitChatReceived(envelope);

      // ИНТЕГРАЦИЯ: Используем систему максимальной человекоподобности или AI Brain
      if (this.humanController) {
        // Определяем тип ситуации
        const situationType = isDirectMessage ? 'direct_question' :
                             isSelectedPublic ? 'group_question' : 'social_chat';

        // Собираем физическое состояние бота
        const physicalState = this._getPhysicalState();

        // Генерируем естественный ответ через систему человекоподобности
        const response = await this.humanController.generateResponse(situationType, {
          speaker: username,
          message: message,
          physicalState: physicalState,
          routing: routing,
          isOwner: isOwner,
        });

        if (response) {
          // Реалистичная задержка чтения и набора текста человеком
          if (!this.agentInstance) {
            const typingDelayMs = Math.min(2200, Math.max(500, response.length * 35 + Math.floor(Math.random() * 250)));
            await new Promise((r) => setTimeout(r, typingDelayMs));
          }

          if (this.agentInstance) {
            await this.agentInstance.sendChat(response, {
              generation,
              recipientScope: routing,
              social: true,
            });
          } else if (this.mcBot.bot?.chat) {
            this.mcBot.bot.chat(response);
          }

          // Записываем событие в память и эмоции
          this.humanController.processEvent('received_message', {
            speaker: username,
            message: message,
            memorable: isDirectMessage,
            importance: isDirectMessage ? 0.7 : 0.4,
          });
        }
      } else if (this.agentInstance) {
        await this.agentInstance.handleConversationMessage(routedEnvelope, {
          kind: isDirectMessage ? 'direct' : 'group',
          generation,
          routing
        });
      } else if (this.aiBrain) {
        const reply = await this.aiBrain.processMessage(`[${username}]: ${message}`, this.worldState);
        if (reply && this.mcBot.bot?.chat) {
          this.mcBot.bot.chat(reply);
        }
      }
    });

    // 2. Смерть бота
    this.mcBot.on('death', () => {
      logger.warn(`[${this.botUsername}] Бот погиб — запуск обработчика смерти`);

      // Записываем событие в систему человекоподобности
      if (this.humanController) {
        this.humanController.processEvent('died', {
          location: this.mcBot.bot?.entity?.position,
          memorable: true,
          importance: 1.0,
        });
      }

      if (this.deathHandler) {
        this.deathHandler.handleBotDeath();
      }
      if (this.worldState && this.mcBot.bot) {
        this.worldState.forceUpdate(this.mcBot.bot);
      }
    });

    // 3. Спавн бота
    this.mcBot.on('spawn', ({ generation, bot } = {}) => {
      if (bot) this.bindBot(bot, generation);
      logger.info(`[${this.botUsername}] Заспавнился в мире`);

      // Записываем событие в систему человекоподобности
      if (this.humanController) {
        this.humanController.processEvent('spawned', {
          location: bot?.entity?.position,
          memorable: true,
          importance: 0.6,
        });
      }

      setTimeout(() => {
        if (this.worldState && this.mcBot.bot) {
          this.worldState.forceUpdate(this.mcBot.bot);
        }
      }, 1000);
    });

    // 4. Респавн бота после гибели
    this.mcBot.on('respawn', ({ generation, bot } = {}) => {
      const activeBot = bot || this.mcBot.bot;
      if (activeBot) {
        this.bindBot(activeBot, generation);
        try {
          activeBot.clearControlStates?.();
        } catch (_) {}
      }

      this.movementController?.stop?.();

      logger.info(`[${this.botUsername}] Возродился (respawn) после гибели`);

      if (this.humanController) {
        this.humanController.processEvent('respawned', {
          location: activeBot?.entity?.position,
          memorable: true,
          importance: 0.8,
        });
      }

      setTimeout(() => {
        if (this.worldState && activeBot) {
          this.worldState.forceUpdate(activeBot);
        }
      }, 1000);
    });

    logger.info(`Обработчики событий установлены для [${this.botUsername}]`);
  }

  bindBot(bot, generation) {
    this.cleanup();
    this.boundBot = bot || null;
    this.boundGeneration = generation;
    if (bot) {
      if (!this.lootProtection) {
        this.lootProtection = new LootProtectionManager(bot);
      } else {
        this.lootProtection.bot = bot;
      }

      if (this.movementController?.attachBot) {
        this.movementController.attachBot(bot);
      }
      if (this.deathHandler) {
        this.deathHandler.bot = bot;
      }
      if (this.emergency) {
        this.emergency.bot = bot;
      }
      this._entityDeadListener = (entity) => {
        if (this.boundBot !== bot || this.boundGeneration !== generation) return;
        if (entity.type === 'player' && entity.username && entity.username !== this.botUsername) {
          logger.info(`[${this.botUsername}] Зафиксировал смерть игрока: ${entity.username}`);
          if (this.deathHandler) {
            this.deathHandler.handlePlayerDeath(entity.username, entity.position);
          }
          if (this.lootProtection) {
            this.lootProtection.recordTeammateDeath(entity.username, entity.position);
          }
        }
      };
      bot.on('entityDead', this._entityDeadListener);

      // Фоновый мониторинг защиты лута и возврата вещей напарнику
      this._lootCheckInterval = setInterval(async () => {
        if (!this.boundBot || this.boundGeneration !== generation) return;
        if (!this.lootProtection || !this.lootProtection.deathRecord) return;

        try {
          await this.lootProtection.gatherTeammateLoot();
          const returned = await this.lootProtection.checkTeammateReturn();
          if (returned && returned.tossedCount > 0) {
            if (this.aiBrain && typeof this.aiBrain.processMessage === 'function') {
              try {
                const prompt = `[SYSTEM_EVENT] Ты только что сохранил и сбросил обратно выпавшие вещи погибшего напарника ${returned.recipient} (${returned.tossedCount} шт/стаков). Напиши короткую дружескую реплику в чат (без шаблонов, естественным стилем живого игрока).`;
                const reply = await this.aiBrain.processMessage(prompt, this.worldState);
                if (reply && this.boundBot?.chat) {
                  this.boundBot.chat(reply);
                }
              } catch (_) {}
            } else if (this.humanController && typeof this.humanController.generateResponse === 'function') {
              try {
                const reply = await this.humanController.generateResponse('returned_loot', {
                  recipient: returned.recipient,
                  count: returned.tossedCount,
                });
                if (reply && this.boundBot?.chat) {
                  this.boundBot.chat(reply);
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }, 1500);
    }
  }

  cleanup() {
    if (this._lootCheckInterval) {
      clearInterval(this._lootCheckInterval);
      this._lootCheckInterval = null;
    }
    if (this.boundBot?.removeListener && this._entityDeadListener) {
      this.boundBot.removeListener('entityDead', this._entityDeadListener);
      this._entityDeadListener = null;
    }
  }
}
