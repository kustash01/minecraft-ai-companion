import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('EMOTIONAL_MEMORY');

/**
 * EmotionalMemory — хранит воспоминания с эмоциями, не координатами.
 * Человек помнит не "x:-234, y:-58, z:891", а "глубоко под базой".
 * Человек помнит не факт, а ПЕРЕЖИВАНИЕ.
 */
export class EmotionalMemory {
  constructor({ provider, agentName }) {
    this.provider = provider;
    this.agentName = agentName;
    this.memories = [];
    this.lastRecallTime = 0;
  }

  /**
   * Сохраняет воспоминание с эмоциональным контекстом.
   * НЕ структурированные данные — живое описание переживания.
   */
  async remember(event) {
    const {
      what,
      where,
      who,
      emotion,
      importance = 0.5,
      sensoryDetails = null,
    } = event;

    if (!what || !emotion) return null;

    const memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      what,
      where: where || 'где-то в мире',
      when: this.describeTime(),
      who: who || 'один',
      feeling: emotion,
      importance: Math.max(0, Math.min(1, importance)),
      sensory: sensoryDetails,
      timestamp: Date.now(),
      timesRecalled: 0,
    };

    this.memories.push(memory);

    if (this.memories.length > 100) {
      this.memories = this.memories
        .sort((a, b) => {
          const scoreA = a.importance * 0.7 + (a.timesRecalled / 10) * 0.3;
          const scoreB = b.importance * 0.7 + (b.timesRecalled / 10) * 0.3;
          return scoreB - scoreA;
        })
        .slice(0, 80);
    }

    logger.info(`[${this.agentName}] запомнил: "${what}" (${emotion})`);
    return memory;
  }

  describeTime() {
    const now = Date.now();
    const minute = 60000;
    const hour = 3600000;
    const day = 86400000;

    return (timestamp) => {
      const diff = now - timestamp;
      if (diff < minute * 2) return 'только что';
      if (diff < minute * 10) return 'несколько минут назад';
      if (diff < hour) return 'недавно';
      if (diff < hour * 3) return 'пару часов назад';
      if (diff < day) return 'сегодня';
      if (diff < day * 2) return 'вчера';
      if (diff < day * 7) return 'на днях';
      if (diff < day * 30) return 'давно';
      return 'очень давно';
    };
  }

  /**
   * Ассоциативное вспоминание — не поиск по SQL, а живое всплывание.
   * Триггер → ассоциация → воспоминание.
   */
  async recall(trigger, limit = 3) {
    const now = Date.now();

    if (now - this.lastRecallTime < 5000) return [];
    if (this.memories.length === 0) return [];

    this.lastRecallTime = now;

    const prompt = `Ты — ${this.agentName}.
Триггер: "${trigger}"

У тебя есть эти воспоминания:
${this.memories.slice(0, 20).map((m, i) =>
  `${i + 1}. ${m.what} (${m.feeling}, ${this.describeTime()(m.timestamp)})`
).join('\n')}

Какие 1-3 воспоминания ЕСТЕСТВЕННО всплывают в голове при этом триггере?
Ответь ТОЛЬКО номерами через запятую (например: 3,7,12) или "нет" если ничего не всплывает.`;

    try {
      const session = await this.provider.createChat({
        systemPrompt: 'Ты выбираешь ассоциативно связанные воспоминания. Отвечай только номерами или "нет".',
        tools: [],
      });

      const response = await this.provider.sendMessage(session, prompt, {
        temperature: 0.7,
        maxTokens: 20,
      });

      const text = (response.text || '').trim().toLowerCase();

      if (text === 'нет' || text === 'no' || !text) return [];

      const indices = text
        .split(/[,\s]+/)
        .map(s => parseInt(s) - 1)
        .filter(i => i >= 0 && i < this.memories.length);

      const recalled = indices.map(i => this.memories[i]);

      recalled.forEach(m => {
        if (m) m.timesRecalled++;
      });

      logger.debug(`[${this.agentName}] вспомнил ${recalled.length} эпизодов по триггеру "${trigger}"`);

      return recalled;
    } catch (err) {
      logger.debug(`Ошибка ассоциативного вспоминания: ${err.message}`);
      return this.memories
        .filter(m =>
          m.what.toLowerCase().includes(trigger.toLowerCase()) ||
          m.where.toLowerCase().includes(trigger.toLowerCase())
        )
        .slice(0, limit);
    }
  }

  /**
   * Случайное воспоминание (всплывает спонтанно).
   */
  randomMemory() {
    if (this.memories.length === 0) return null;

    const memory = HumanErrorEngine.weightedChoice(
      this.memories,
      m => m.importance * 0.6 + (m.timesRecalled / 20) * 0.4
    ) || this.memories[0];

    memory.timesRecalled++;
    return memory;
  }

  /**
   * Форматирует воспоминание для рассказа (не для SQL-вывода).
   */
  formatMemory(memory) {
    if (!memory) return null;

    let text = `${memory.what}`;

    if (memory.where && memory.where !== 'где-то в мире') {
      text += ` — ${memory.where}`;
    }

    if (memory.who && memory.who !== 'один') {
      text += `, ${memory.who}`;
    }

    text += ` (${memory.feeling})`;

    if (memory.sensory) {
      text += `. ${memory.sensory}`;
    }

    return text;
  }

  /**
   * Получить последние воспоминания для контекста.
   */
  getRecentMemories(limit = 5) {
    return this.memories
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(m => this.formatMemory(m))
      .filter(Boolean);
  }

  /**
   * Очистка старых малозначимых воспоминаний.
   */
  forget(memoryId) {
    this.memories = this.memories.filter(m => m.id !== memoryId);
  }

  getState() {
    return {
      totalMemories: this.memories.length,
      recent: this.getRecentMemories(3),
    };
  }
}
