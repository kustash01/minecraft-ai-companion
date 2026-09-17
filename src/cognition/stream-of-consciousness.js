import { createLogger } from '../utils/logger.js';
import { sceneObserver } from '../perception/scene-observer.js';

const logger = createLogger('CONSCIOUSNESS');

/**
 * StreamOfConsciousness — непрерывный поток сознания и свободная воля бота.
 *
 * Вместо шаблонных триггеров и ограниченных if/else сценариев, эта система
 * периодически или при заметных событиях мира (смерть тиммейта, закат, праздность)
 * формирует целостный срез органов чувств и воспоминаний, и задаёт Gemini
 * открытый вопрос:
 * "Что происходит? О чём ты думаешь? Чего ты хочешь прямо сейчас?"
 *
 * Бот свободен: он может сказать что-то в чат, написать любой код через run_code,
 * зафиксировать мысль в памяти или просто продолжить заниматься своими делами.
 */
export class StreamOfConsciousness {
  constructor({
    bot = null,
    aiBrain = null,
    memoryManager = null,
    worldState = null,
    config = {},
  } = {}) {
    this.bot = bot;
    this.aiBrain = aiBrain;
    this.memoryManager = memoryManager;
    this.worldState = worldState;
    this.config = config;

    this.checkIntervalMs = config.consciousnessCheckIntervalMs ?? 5000;
    this.minThoughtIntervalMs = config.minThoughtIntervalMs ?? 30000; // не чаще раза в 30с
    this.lastThoughtTime = 0;
    this.lastActivityTime = Date.now();
    this.lastSeenSunsetTime = 0;

    this.timer = null;
    this.isRunning = false;
    this._listeners = [];
  }

  setBot(bot) {
    this.bot = bot;
    if (this.isRunning) {
      this._attachBotEvents();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._attachBotEvents();

    this.timer = setInterval(() => {
      this._pulse();
    }, this.checkIntervalMs);

    logger.info('[CONSCIOUSNESS] Поток сознания запущен');
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._detachBotEvents();
    logger.info('[CONSCIOUSNESS] Поток сознания остановлен');
  }

  markActivity() {
    this.lastActivityTime = Date.now();
  }

  _attachBotEvents() {
    this._detachBotEvents();
    if (!this.bot?.on) return;

    // Смерть игрока рядом
    const onEntityDead = (entity) => {
      if (entity?.type === 'player' && entity.username && entity.username !== this.bot?.username) {
        const pos = entity.position ? `[${Math.round(entity.position.x)}, ${Math.round(entity.position.y)}, ${Math.round(entity.position.z)}]` : 'неизвестно';
        this.triggerImpulse({
          type: 'teammate_death',
          eventDesc: `Твой напарник ${entity.username} погиб на координатах ${pos}! Его вещи пропадут через 5 минут.`,
          priority: 'high',
        });
      }
    };

    this.bot.on('entityDead', onEntityDead);
    this._listeners.push({ event: 'entityDead', fn: onEntityDead });
  }

  _detachBotEvents() {
    if (this.bot?.removeListener) {
      for (const { event, fn } of this._listeners) {
        try {
          this.bot.removeListener(event, fn);
        } catch (_) {}
      }
    }
    this._listeners = [];
  }

  async _pulse() {
    if (!this.isRunning || !this.bot?.entity || !this.aiBrain) return;
    if (this.aiBrain.isProcessing) return;

    const now = Date.now();

    // 1. Проверка заката / наступления ночи
    const timeOfDay = this.bot.time?.timeOfDay;
    if (typeof timeOfDay === 'number' && timeOfDay >= 12000 && timeOfDay <= 13500) {
      if (now - this.lastSeenSunsetTime > 600000) { // раз в игровой день
        this.lastSeenSunsetTime = now;
        await this.triggerImpulse({
          type: 'sunset',
          eventDesc: 'Солнце заходит за горизонт, наступает ночь. Скоро в темноте начнут спавниться мобы.',
        });
        return;
      }
    }

    // 2. Проверка праздности / свободного времени (Idle)
    const idleDuration = now - this.lastActivityTime;
    const isMoving = this.bot.pathfinder?.isMoving?.();
    if (!isMoving && idleDuration >= 45000 && (now - this.lastThoughtTime >= this.minThoughtIntervalMs)) {
      await this.triggerImpulse({
        type: 'idle_curiosity',
        eventDesc: `Ты стоишь без дела уже ${Math.round(idleDuration / 1000)}с.`,
      });
    }
  }

  async triggerImpulse({ type, eventDesc, priority = 'normal' } = {}) {
    if (!this.aiBrain || typeof this.aiBrain.processMessage !== 'function') return null;

    const now = Date.now();
    if (priority !== 'high' && now - this.lastThoughtTime < this.minThoughtIntervalMs) {
      return null;
    }

    this.lastThoughtTime = now;
    this.lastActivityTime = now;

    // Собираем полное сенсорное восприятие
    let sensory = '';
    try {
      const scene = sceneObserver.observe(this.bot);
      if (scene) sensory = sceneObserver.describe(scene);
    } catch (_) {}

    // Собираем актуальные воспоминания и заметки
    let memories = '';
    try {
      if (this.memoryManager?.getMemoryContext) {
        memories = this.memoryManager.getMemoryContext(this.bot?.entity?.position);
      }
    } catch (_) {}

    const prompt = [
      `[ВНУТРЕННИЙ ПОТОК СОЗНАНИЯ]`,
      eventDesc ? `Что произошло: ${eventDesc}` : null,
      sensory ? `Окружение: ${sensory}` : null,
      memories ? `Твоя память и мысли:\n${memories}` : null,
      `Чего ты хочешь прямо сейчас? Ты обладаешь полной свободой воли: можешь написать код через run_code (пойти исследовать, строить, собирать ресурсы, защищаться), ответить тиммейту в чат, зафиксировать мысль в memory.remember(...), или просто отдохнуть. Решать тебе.`
    ].filter(Boolean).join('\n\n');

    try {
      logger.info(`[CONSCIOUSNESS] Импульс мысли (${type}): "${eventDesc || type}"`);
      const reply = await this.aiBrain.processMessage(prompt, this.worldState);
      if (reply && this.bot?.chat && typeof this.bot.chat === 'function') {
        this.bot.chat(reply);
      }
      return reply;
    } catch (err) {
      logger.debug(`[CONSCIOUSNESS] Ошибка обработки потока сознания: ${err.message}`);
      return null;
    }
  }
}
