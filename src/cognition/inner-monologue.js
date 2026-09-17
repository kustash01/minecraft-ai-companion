import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('INNER_MONOLOGUE');

/**
 * InnerMonologue — внутренний поток сознания.
 * Бот думает постоянно, даже когда никто не пишет.
 * Мысли иногда прорываются в чат, создавая эффект живого человека.
 */
export class InnerMonologue {
  constructor({ provider, agentName, personality }) {
    this.provider = provider;
    this.agentName = agentName;
    this.personality = personality;

    this.currentThoughts = [];
    this.worries = [];
    this.curiosities = [];
    this.pendingMemories = [];

    this.lastThoughtTime = Date.now();
    this.lastSpokeThoughtTime = 0;

    this.thinkingSession = null;
  }

  /**
   * Генерирует внутреннюю мысль через LLM.
   * НЕ tool calling — просто чистое человеческое мышление.
   */
  async generateThought(context) {
    const { situation, emotion, recentEvents, silenceDuration, physState } = context;

    const prompt = `Ты — ${this.agentName}. Подумай одну короткую мысль (2-7 слов), как человек.

Ситуация: ${situation || 'обычный день в майнкрафте'}
Настроение: ${emotion || 'нейтральное'}
${recentEvents && recentEvents.length > 0 ? `Недавно: ${recentEvents.slice(-3).join('; ')}` : ''}
${silenceDuration > 300000 ? `Друг давно не писал (${Math.floor(silenceDuration / 60000)} минут)` : ''}
${physState?.fatigue > 0.6 ? 'Устал' : ''}
${physState?.stress > 0.5 ? 'Напряжён' : ''}

Примеры СТИЛЯ мыслей (НЕ копируй, просто пойми тон):
- "Хм, давно не проверял шахту..."
- "Интересно, где все"
- "Надо бы разгрузить инвентарь"
- "Красивый закат"
- "Устал немного"

Твоя мысль (2-7 слов):`;

    try {
      // Reset session periodically to prevent context bloat
      this._thoughtCount = (this._thoughtCount || 0) + 1;
      if (this._thoughtCount > 15) {
        this.thinkingSession = null;
        this._thoughtCount = 0;
      }

      if (!this.thinkingSession) {
        this.thinkingSession = await this.provider.createChat({
          systemPrompt: `Ты генерируешь внутренние мысли персонажа.
Отвечай ТОЛЬКО мыслью персонажа, без пояснений.
Каждая мысль уникальна, естественна, человечна.
БЕЗ повторов, БЕЗ шаблонов.`,
          tools: [],
        });
      }

      const response = await this.provider.sendMessage(this.thinkingSession, prompt, {
        temperature: 0.9,
        maxTokens: 50,
      });

      const thought = (response.text || '').trim();

      if (thought && thought.length > 5 && thought.length < 150) {
        this.lastThoughtTime = Date.now();
        return thought;
      }

      return null;
    } catch (err) {
      logger.debug(`Ошибка генерации мысли: ${err.message}`);
      return null;
    }
  }

  /**
   * Основной цикл мышления — вызывается периодически.
   */
  async think(worldState, emotionalState, silenceDuration, recentEvents = []) {
    const now = Date.now();

    if (now - this.lastThoughtTime < 15000) return null;

    const physState = {
      fatigue: emotionalState?.fatigue || 0.2,
      stress: emotionalState?.stress || 0.1,
    };

    let situation = 'обычная игра';
    let emotion = 'спокойствие';

    if (worldState?.nearbyMobs?.some(m => ['zombie', 'skeleton', 'creeper'].includes(m.name))) {
      situation = 'рядом враги';
      emotion = 'напряжение';
    } else if (silenceDuration > 300000) {
      situation = 'давно не слышал от друга';
      emotion = 'лёгкая тревога';
    } else if (worldState?.health < 10) {
      situation = 'мало здоровья';
      emotion = 'беспокойство';
    } else if (worldState?.timeOfDay === 'sunset') {
      situation = 'закат';
      emotion = 'спокойствие';
    }

    const thought = await this.generateThought({
      situation,
      emotion,
      recentEvents,
      silenceDuration,
      physState,
    });

    if (thought) {
      this.currentThoughts.push({
        text: thought,
        timestamp: now,
        emotion,
        spoken: false,
      });

      if (this.currentThoughts.length > 20) {
        this.currentThoughts.shift();
      }

      logger.debug(`[${this.agentName}] думает: "${thought}"`);
      return thought;
    }

    return null;
  }

  /**
   * Решает, говорить ли мысль вслух.
   * 10% шанс при наличии мыслей + кулдаун 30 секунд.
   */
  shouldSpeakThought() {
    const now = Date.now();

    if (now - this.lastSpokeThoughtTime < 30000) return false;
    if (this.currentThoughts.length === 0) return false;

    const unspokenThoughts = this.currentThoughts.filter(t => !t.spoken);
    if (unspokenThoughts.length === 0) return false;

    return HumanErrorEngine.chance(0.1);
  }

  /**
   * Произносит случайную невысказанную мысль вслух.
   */
  speakRandomThought() {
    const unspoken = this.currentThoughts.filter(t => !t.spoken);
    if (unspoken.length === 0) return null;

    const thought = HumanErrorEngine.choice(unspoken);
    thought.spoken = true;
    this.lastSpokeThoughtTime = Date.now();

    logger.info(`[${this.agentName}] думает вслух: "${thought.text}"`);
    return thought.text;
  }

  /**
   * Добавляет беспокойство (о чём-то волнуется).
   */
  addWorry(text) {
    this.worries.push({ text, timestamp: Date.now() });
    if (this.worries.length > 5) this.worries.shift();
  }

  /**
   * Добавляет любопытство (что интересует).
   */
  addCuriosity(text) {
    this.curiosities.push({ text, timestamp: Date.now() });
    if (this.curiosities.length > 5) this.curiosities.shift();
  }

  getState() {
    return {
      currentThoughts: this.currentThoughts.slice(-5).map(t => t.text),
      worries: this.worries.map(w => w.text),
      curiosities: this.curiosities.map(c => c.text),
    };
  }

  reset() {
    this.currentThoughts = [];
    this.worries = [];
    this.curiosities = [];
    this.thinkingSession = null;
  }
}
