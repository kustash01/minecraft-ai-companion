import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';

const logger = createLogger('LIVING_PERSONALITY');

/**
 * LivingPersonality — бот живёт постоянно, а не ждёт сообщений.
 * Думает, наблюдает, вспоминает, чувствует — даже когда ты молчишь.
 */
export class LivingPersonality {
  constructor({
    agentName,
    bot,
    worldState,
    innerMonologue,
    emotionalMemory,
    emotionalState,
    personality,
    owner,
  }) {
    this.agentName = agentName;
    this.bot = bot;
    this.worldState = worldState;
    this.innerMonologue = innerMonologue;
    this.emotionalMemory = emotionalMemory;
    this.emotionalState = emotionalState;
    this.personality = personality;
    this.owner = owner;

    this.alive = false;
    this.lifeLoopInterval = null;
    this.lastPlayerMessageTime = Date.now();
    this.lastObservationTime = 0;
    this.lastSpontaneousMessageTime = 0;
  }

  /**
   * Запускает жизненный цикл бота.
   */
  start() {
    if (this.alive) return;

    this.alive = true;
    logger.info(`[${this.agentName}] начинает жить своей жизнью`);

    this.liveLoop();
  }

  /**
   * Останавливает жизненный цикл.
   */
  stop() {
    this.alive = false;
    if (this.lifeLoopInterval) {
      clearTimeout(this.lifeLoopInterval);
      this.lifeLoopInterval = null;
    }
    logger.info(`[${this.agentName}] остановил жизненный цикл`);
  }

  /**
   * Главный цикл жизни — работает постоянно.
   */
  async liveLoop() {
    if (!this.alive) return;

    try {
      await this.think();
      await this.observe();
      await this.feel();
      await this.maybeSpeak();
      await this.maybeRemember();
    } catch (err) {
      logger.debug(`[${this.agentName}] ошибка в цикле жизни: ${err.message}`);
    }

    const nextInterval = 8000 + Math.random() * 12000;
    this.lifeLoopInterval = setTimeout(() => this.liveLoop(), nextInterval);
  }

  /**
   * Думает (внутренний монолог).
   */
  async think() {
    const silenceDuration = Date.now() - this.lastPlayerMessageTime;
    const worldSnapshot = this.worldState?.getSnapshot?.() || {};
    const emotionalSnapshot = this.emotionalState?.getState?.() || {};

    const recentEvents = this.getRecentEvents();

    await this.innerMonologue.think(
      worldSnapshot,
      emotionalSnapshot,
      silenceDuration,
      recentEvents
    );
  }

  /**
   * Наблюдает за миром (замечает детали).
   */
  async observe() {
    const now = Date.now();

    if (now - this.lastObservationTime < 30000) return;
    this.lastObservationTime = now;

    const world = this.worldState?.getSnapshot?.();
    if (!world) return;

    if (world.timeOfDay === 'sunset' && Math.random() < 0.15) {
      this.innerMonologue.currentThoughts.push({
        text: 'Красивый закат',
        timestamp: now,
        emotion: 'умиротворение',
        spoken: false,
      });
    }

    const newPlayers = world.nearbyPlayers?.filter(
      p => p !== this.agentName && p !== this.owner
    );

    if (newPlayers && newPlayers.length > 0 && Math.random() < 0.3) {
      this.innerMonologue.addCuriosity(`Кто-то новый: ${newPlayers[0]}`);
    }

    if (world.health < 10 && Math.random() < 0.4) {
      this.innerMonologue.addWorry('Мало здоровья');
    }
  }

  /**
   * Обрабатывает эмоции.
   */
  async feel() {
    if (!this.emotionalState) return;

    this.emotionalState.tickDecay?.();
  }

  /**
   * Решает, говорить ли что-то спонтанно.
   */
  async maybeSpeak() {
    const now = Date.now();

    if (now - this.lastSpontaneousMessageTime < 45000) return;

    const silenceDuration = now - this.lastPlayerMessageTime;

    if (this.innerMonologue.shouldSpeakThought()) {
      const thought = this.innerMonologue.speakRandomThought();
      if (thought && this.bot?.chat) {
        this.bot.chat(thought);
        this.lastSpontaneousMessageTime = now;
        logger.info(`[${this.agentName}] сказал мысль вслух: "${thought}"`);
      }
      return;
    }

    if (silenceDuration > 600000 && Math.random() < 0.05) {
      const messages = [
        'ты тут?',
        'как успехи?',
        'всё в порядке?',
        'куда пропал?',
      ];

      const msg = messages[Math.floor(Math.random() * messages.length)];

      if (this.bot?.chat) {
        this.bot.chat(msg);
        this.lastSpontaneousMessageTime = now;
        this.lastPlayerMessageTime = now - 300000;
        logger.info(`[${this.agentName}] беспокоится и пишет первым: "${msg}"`);
      }
    }
  }

  /**
   * Спонтанно вспоминает прошлое.
   */
  async maybeRemember() {
    if (Math.random() > 0.02) return;

    const memory = this.emotionalMemory.randomMemory();

    if (memory) {
      const thought = `Вспомнил, как ${memory.what}... ${memory.feeling}`;
      this.innerMonologue.currentThoughts.push({
        text: thought,
        timestamp: Date.now(),
        emotion: memory.feeling,
        spoken: false,
      });

      logger.debug(`[${this.agentName}] спонтанно вспомнил: "${memory.what}"`);
    }
  }

  /**
   * Обновляет время последнего сообщения от игрока.
   */
  onPlayerMessage() {
    this.lastPlayerMessageTime = Date.now();
  }

  /**
   * Собирает недавние события для контекста.
   */
  getRecentEvents() {
    const events = [];

    if (this.emotionalMemory.memories.length > 0) {
      const recent = this.emotionalMemory.memories
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3);

      events.push(...recent.map(m => m.what));
    }

    return events;
  }

  getState() {
    return {
      agentName: this.agentName,
      alive: this.alive,
      silenceDuration: Date.now() - this.lastPlayerMessageTime,
      innerMonologue: this.innerMonologue?.getState?.(),
      emotionalMemory: this.emotionalMemory?.getState?.(),
    };
  }
}
