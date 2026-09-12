import { createLogger } from '../utils/logger.js';
import { humanChatBehavior } from './human-chat-behavior.js';

const logger = createLogger('SPONTANEOUS_EXPRESSION');

/**
 * SpontaneousExpression — замена BanterEngine.
 * Вместо заученных фраз — живая генерация через LLM с человеческими особенностями.
 * Каждая реплика уникальна, потому что контекст всегда новый.
 *
 * ОБНОВЛЕНО: интегрирована система естественного поведения
 */
export class SpontaneousExpression {
  constructor({ provider, agentName, personality, emotionalState, recentMessages = [] }) {
    this.provider = provider;
    this.agentName = agentName;
    this.personality = personality;
    this.emotionalState = emotionalState;
    this.recentMessages = recentMessages; // Общая история сообщений

    this.lastExpressionTime = 0;
    this.globalCooldown = 6000; // Увеличено до 6 сек (люди молчат чаще)
    this.perAgentCooldown = 18000; // Увеличено до 18 сек
    this.lastAgentExpressionTime = new Map();

    this.expressionSession = null;

    // Вероятность вообще что-то сказать (большинство событий = молчание)
    this.baseSpeakChance = 0.12; // 12% событий вызывают реакцию
  }

  /**
   * Генерирует спонтанную реплику на игровое событие.
   * БЕЗ шаблонов — каждый раз новая.
   * НОВОЕ: большинство событий НЕ вызывают реплику (как у реальных людей)
   */
  async generateExpression(trigger, context = {}) {
    const now = Date.now();

    // Rate limiting
    if (now - this.lastExpressionTime < this.globalCooldown) return null;

    const lastAgentTime = this.lastAgentExpressionTime.get(this.agentName) || 0;
    if (now - lastAgentTime < this.perAgentCooldown) return null;

    // НОВОЕ: Реальные люди молчат в 85-90% случаев
    const timeSinceSpoke = now - lastAgentTime;
    let speakChance = this.baseSpeakChance;

    // Если долго молчал — шанс выше
    if (timeSinceSpoke > 300000) { // 5 минут
      speakChance = 0.35;
    } else if (timeSinceSpoke < 20000) { // 20 секунд назад говорил
      speakChance = 0.03;
    }

    // Эмоции влияют на разговорчивость
    const emotion = this.emotionalState?.getState() || {};
    if (emotion.excitement > 0.7) speakChance += 0.25;
    if (emotion.stress > 0.7) speakChance -= 0.15;
    if (emotion.satisfaction > 0.8) speakChance += 0.1;

    // Личность влияет
    const traits = this.personality?.traits || {};
    if (traits.talkativeness) {
      speakChance *= (0.5 + traits.talkativeness);
    }

    // Случайность — основа естественности
    if (Math.random() > speakChance) {
      return null; // Молчание
    }

    const {
      eventDescription,
      emotionalReaction,
      recentContext,
      physState,
      targetPlayer
    } = context;

    // НОВОЕ: Получаем последние сообщения для контекста
    const recentChat = this.recentMessages
      .slice(-5)
      .map(m => `${m.sender}: ${m.text}`)
      .join('\n');

    const personalityDesc = this._getPersonalityDescription();
    const moodDesc = this._describeMood(emotion);

    const prompt = `Ты ${this.agentName} в Minecraft. ${personalityDesc}

Настроение: ${moodDesc}

Что произошло: ${this.describeTrigger(trigger, eventDescription)}
${emotionalReaction ? `Твоя эмоциональная реакция: ${emotionalReaction}` : ''}

Последние сообщения в чате:
${recentChat || '(тишина)'}

${targetPlayer ? `Обращаешься к ${targetPlayer}` : ''}

Напиши ОДНУ короткую естественную реплику (или промолчи).

ВАЖНО:
- Говори как обычный человек, не как "персонаж"
- Никаких "ахах", "лол", "ща залутаю" — это неестественно
- Можно: "хм", "не знаю", паузы, незавершённые мысли
- Не комментируй очевидное
- Говори только если есть что сказать
- Опечатки редки, но бывают
- Иногда можно не закончить мысль

Ответь ТОЛЬКО текстом реплики, без пояснений. Или напиши "..." если лучше промолчать.`;

    try {
      if (!this.expressionSession) {
        this.expressionSession = await this.provider.createChat({
          systemPrompt: `Ты генерируешь короткие естественные реплики игрока в Minecraft.
Отвечай ТОЛЬКО репликой, без пояснений.
Каждая реплика уникальна и человечна.
Люди говорят просто и естественно, без форсированного сленга.`,
          tools: [],
        });
      }

      const response = await this.provider.sendMessage(this.expressionSession, prompt, {
        temperature: 0.9, // Высокая креативность
        maxTokens: 50,
      });

      let expression = (response.text || '').trim();

      // Если AI решил промолчать
      if (!expression || expression === '...' || expression.length < 2) {
        return null;
      }

      // Валидация длины
      if (expression.length > 200) {
        return null;
      }

      // Не допускаем мета-комментариев
      if (
        expression.includes('персонаж') ||
        expression.includes('реплика') ||
        expression.includes('сгенерир') ||
        expression.includes('LLM') ||
        expression.includes('AI') ||
        expression.includes('промолч')
      ) {
        return null;
      }

      // НОВОЕ: Обработка через систему естественного поведения
      expression = humanChatBehavior.makeNatural(expression, traits);

      this.lastExpressionTime = now;
      this.lastAgentExpressionTime.set(this.agentName, now);

      logger.info(`[${this.agentName}] спонтанно: "${expression}" (триггер: ${trigger})`);
      return expression;

    } catch (err) {
      logger.debug(`Ошибка генерации спонтанной реплики: ${err.message}`);
      return null;
    }
  }

  /**
   * Описание личности агента
   */
  _getPersonalityDescription() {
    const personalities = {
      Sam: 'Ты спокойный и наблюдательный. Замечаешь детали, но не спешишь делиться каждой мыслью.',
      Max: 'Ты методичный и собранный. Предпочитаешь факты эмоциям. Говоришь по делу.',
      Jack: 'Ты легко увлекаешься и спонтанен. Живёшь моментом, но не кричишь постоянно.',
      Ryan: 'Ты трудолюбивый и терпеливый. Немногословен, но тепло относишься к друзьям.',
      Alex: 'Ты креативный и внимателен к деталям. Видишь красоту в мелочах.',
      Leo: 'Ты надёжный и готов защищать. Не агрессивный — просто уверенный.',
    };
    return personalities[this.agentName] || 'Ты обычный человек.';
  }

  /**
   * Описание настроения
   */
  _describeMood(mood) {
    const parts = [];
    if (mood.stress > 0.6) parts.push('напряжён');
    if (mood.excitement > 0.6) parts.push('взволнован');
    if (mood.satisfaction > 0.7) parts.push('доволен');
    if (mood.frustration > 0.6) parts.push('раздражён');
    if (mood.curiosity > 0.7) parts.push('любопытен');
    if (parts.length === 0) return 'спокойный';
    return parts.join(', ');
  }

  /**
   * Описывает триггер человеческим языком.
   */
  describeTrigger(trigger, customDescription) {
    if (customDescription) return customDescription;

    const descriptions = {
      FIND_ORE: 'нашёл руду',
      CRAFT_MILESTONE: 'скрафтил важный предмет',
      NIGHT_APPROACH: 'темнеет, скоро ночь',
      SUNRISE: 'рассвет',
      COMBAT_KILL: 'убил моба',
      HUNGER: 'голоден',
      SHARE_ITEM: 'делится предметом',
      SCOUT_DISCOVERY: 'обнаружил что-то интересное',
      BUILD_PROGRESS: 'постройка продвигается',
      JOKE: 'хочет пошутить',
      DAMAGE_TAKEN: 'получил урон',
      LOW_HEALTH: 'мало здоровья',
      FOUND_DIAMONDS: 'нашёл алмазы',
      CREEPER_NEAR: 'крипер рядом',
    };

    return descriptions[trigger] || 'произошло событие';
  }

  /**
   * Очистка сессии (для сброса).
   */
  reset() {
    this.expressionSession = null;
    this.lastExpressionTime = 0;
    this.lastAgentExpressionTime.clear();
  }
}
