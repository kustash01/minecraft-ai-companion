import { createLogger } from '../utils/logger.js';

const logger = createLogger('NATURAL_DIALOGUE');

/**
 * Система естественных диалогов — никаких шаблонов, только контекстные реакции
 *
 * Принципы человечности:
 * 1. Молчание естественно — не комментируй каждое действие
 * 2. Контекст важнее шаблонов — помни что говорили недавно
 * 3. Неуверенность нормальна — "хз", "может", "не уверен"
 * 4. Опечатки случаются — иногда
 * 5. Эмоции через паузы и интонацию, не через "ахах лол"
 */

export class NaturalDialogue {
  constructor({ aiProvider, memoryManager, socialGraph, emotionalState }) {
    this.aiProvider = aiProvider;
    this.memory = memoryManager;
    this.socialGraph = socialGraph;
    this.emotions = emotionalState;

    // История последних реплик (для контекста)
    this.recentMessages = [];
    this.lastSpokeTime = new Map(); // agentName -> timestamp

    // Вероятность говорить вообще (большинство событий = молчание)
    this.baseSpeakChance = 0.15; // 15% событий вызывают реакцию
  }

  /**
   * Генерирует естественную реакцию на игровое событие
   * Большинство событий НЕ вызывают реплику (как у реальных людей)
   */
  async generateResponse(agentName, event, context = {}) {
    const now = Date.now();
    const lastSpoke = this.lastSpokeTime.get(agentName) || 0;

    // Молчали недавно? Увеличиваем шанс заговорить
    const timeSinceSpoke = now - lastSpoke;
    let speakChance = this.baseSpeakChance;

    if (timeSinceSpoke > 300000) { // 5 минут молчания
      speakChance = 0.4;
    } else if (timeSinceSpoke < 20000) { // 20 секунд назад говорили
      speakChance = 0.05;
    }

    // Эмоциональное состояние влияет на разговорчивость
    const mood = this.emotions?.getMood() || {};
    if (mood.excitement > 0.7) speakChance += 0.2;
    if (mood.stress > 0.7) speakChance -= 0.1;

    // Случайность — основа естественности
    if (Math.random() > speakChance) {
      return null; // Молчание
    }

    // Генерируем контекстную реплику через AI
    const response = await this._generateContextualResponse(agentName, event, context);

    if (response) {
      this.lastSpokeTime.set(agentName, now);
      this.recentMessages.push({
        agent: agentName,
        message: response,
        event,
        timestamp: now
      });

      // Храним только последние 20 сообщений
      if (this.recentMessages.length > 20) {
        this.recentMessages.shift();
      }
    }

    return response;
  }

  /**
   * Генерирует реплику с учётом контекста, личности и истории
   */
  async _generateContextualResponse(agentName, event, context) {
    // Получаем контекст последних сообщений
    const recentContext = this.recentMessages
      .slice(-5)
      .map(m => `${m.agent}: ${m.message}`)
      .join('\n');

    // Получаем личность агента
    const personality = this._getPersonalityDescription(agentName);

    // Получаем эмоциональное состояние
    const mood = this.emotions?.getMood() || {};
    const moodDesc = this._describeMood(mood);

    const prompt = `Ты ${agentName} в Minecraft. ${personality}

Текущее настроение: ${moodDesc}

Что только что произошло: ${this._describeEvent(event, context)}

Последние сообщения в чате:
${recentContext || '(тишина)'}

Напиши ОДНУ короткую естественную фразу-реакцию (или вообще промолчи, если нечего сказать).

ВАЖНО:
- Говори как обычный человек, не как персонаж
- Никаких "ахах", "лол", "ща" — это неестественно
- Можно: "хм", "не знаю", паузы, незавершённые мысли
- Не комментируй очевидное ("нашёл дерево" когда рубишь дерево)
- Говори только если есть что сказать или хочешь пообщаться
- Опечатки редки, но бывают (1-2%)
- Иногда можно не закончить мысль или отвлечься

Ответь ТОЛЬКО текстом реплики, без пояснений. Или напиши "..." если лучше промолчать.`;

    try {
      const response = await this.aiProvider.generateText(prompt, {
        maxTokens: 60,
        temperature: 0.85, // Высокая креативность для естественности
        stopSequences: ['\n', 'Ты:', agentName + ':']
      });

      const text = response.trim();

      // Если AI решил промолчать
      if (!text || text === '...' || text.length < 3) {
        return null;
      }

      // Добавляем редкие естественные опечатки (2% шанс)
      return this._addNaturalImperfections(text);

    } catch (error) {
      logger.error(`Ошибка генерации реплики для ${agentName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Описание события для промпта
   */
  _describeEvent(event, context) {
    const descriptions = {
      'find_ore': `Нашёл ${context.oreName || 'руду'}`,
      'craft_item': `Скрафтил ${context.itemName || 'предмет'}`,
      'night_approaching': 'Темнеет, скоро ночь',
      'sunrise': 'Рассвет',
      'kill_mob': `Убил ${context.mobType || 'моба'}`,
      'take_damage': `Получил урон (${context.damage || '?'} HP)`,
      'low_health': 'Мало здоровья',
      'low_food': 'Голодный',
      'player_nearby': `${context.playerName || 'Игрок'} рядом`,
      'discovery': `Обнаружил ${context.what || 'что-то интересное'}`,
      'build_progress': 'Работает над постройкой',
      'idle_moment': 'Просто момент тишины',
      'someone_spoke': `${context.speaker} сказал: "${context.message}"`,
    };

    return descriptions[event] || event;
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
    if (mood.trust > 0.8) parts.push('доверяет окружающим');

    if (parts.length === 0) return 'спокойный';
    return parts.join(', ');
  }

  /**
   * Личность агента (НЕ стереотипы, а реальные черты)
   */
  _getPersonalityDescription(name) {
    const personalities = {
      Sam: 'Ты спокойный и наблюдательный. Замечаешь детали, но не спешишь делиться каждой мыслью. Иногда задумчив.',
      Max: 'Ты методичный и собранный. Предпочитаешь факты эмоциям. Говоришь по делу, но не сухо.',
      Jack: 'Ты легко увлекаешься и спонтанен. Но это не значит что постоянно кричишь. Просто живёшь моментом.',
      Ryan: 'Ты трудолюбивый и терпеливый. Находишь удовлетворение в процессе. Немногословен, но тепло относишься к друзьям.',
      Alex: 'Ты креативный и внимателен к деталям. Видишь красоту в мелочах. Говоришь когда вдохновлён или хочешь поделиться идеей.',
      Leo: 'Ты надёжный и готов защищать. Но не агрессивный — просто уверенный. Ценишь прямоту.',
    };

    return personalities[name] || 'Ты обычный человек, играющий в Minecraft.';
  }

  /**
   * Добавляет естественные несовершенства
   */
  _addNaturalImperfections(text) {
    // 2% шанс на опечатку
    if (Math.random() < 0.02) {
      const typos = {
        'что': 'чт',
        'это': 'эт',
        'может': 'може',
        'здесь': 'здес',
        'сейчас': 'щас',
        'хорошо': 'хорошь',
      };

      for (const [correct, typo] of Object.entries(typos)) {
        if (text.includes(correct) && Math.random() < 0.5) {
          text = text.replace(correct, typo);
          break; // Только одна опечатка
        }
      }
    }

    // 5% шанс на незаконченную мысль
    if (Math.random() < 0.05 && text.length > 15) {
      const words = text.split(' ');
      if (words.length > 3) {
        text = words.slice(0, -1).join(' ') + '...';
      }
    }

    return text;
  }

  /**
   * Реакция на сообщение другого игрока/агента
   */
  async respondToMessage(agentName, speaker, message, context = {}) {
    const now = Date.now();
    const lastSpoke = this.lastSpokeTime.get(agentName) || 0;

    // Прямое упоминание имени?
    const mentioned = message.toLowerCase().includes(agentName.toLowerCase());

    // Вопрос?
    const isQuestion = message.includes('?') ||
                      message.match(/как|что|где|когда|почему|куда|кто|зачем/i);

    // Обращение к группе?
    const toGroup = isQuestion && !mentioned;

    let respondChance = 0;

    if (mentioned) {
      respondChance = 0.95; // Почти всегда отвечаем на прямое обращение
    } else if (isQuestion) {
      respondChance = 0.25; // Иногда отвечаем на групповые вопросы
    } else if (now - lastSpoke > 120000) { // 2 минуты молчания
      respondChance = 0.15; // Можем поддержать беседу
    } else {
      respondChance = 0.05; // Редко вмешиваемся в чужой разговор
    }

    // Отношения с говорящим
    const relationship = this.socialGraph?.getRelationship(agentName, speaker);
    if (relationship) {
      if (relationship.friendship > 0.7) respondChance += 0.15;
      if (relationship.irritation > 0.5) respondChance -= 0.2;
    }

    if (Math.random() > respondChance) {
      return null;
    }

    // Генерируем ответ
    const response = await this._generateContextualResponse(
      agentName,
      'someone_spoke',
      { speaker, message, mentioned, isQuestion }
    );

    return response;
  }

  /**
   * Инициатива — начать разговор самому
   */
  shouldInitiateConversation(agentName) {
    const now = Date.now();
    const lastSpoke = this.lastSpokeTime.get(agentName) || 0;
    const silenceDuration = now - lastSpoke;

    // Меньше 2 минут молчания — не начинаем
    if (silenceDuration < 120000) return false;

    // 2-10 минут — очень низкий шанс (0.5%)
    if (silenceDuration < 600000) return Math.random() < 0.005;

    // Больше 10 минут — низкий шанс (2%)
    return Math.random() < 0.02;
  }

  /**
   * Генерирует начало разговора
   */
  async initiateConversation(agentName, context = {}) {
    const recentContext = this.recentMessages
      .slice(-3)
      .map(m => `${m.agent}: ${m.message}`)
      .join('\n');

    const personality = this._getPersonalityDescription(agentName);
    const mood = this.emotions?.getMood() || {};
    const moodDesc = this._describeMood(mood);

    const prompt = `Ты ${agentName} в Minecraft. ${personality}

Настроение: ${moodDesc}

Вы давно молчали. Что ты сейчас делаешь: ${context.currentActivity || 'отдыхаешь'}

Последнее в чате:
${recentContext || '(давно никто не говорил)'}

Ты можешь начать разговор — задать вопрос, поделиться мыслью, предложить что-то.
Или просто промолчать, если нечего сказать.

Напиши ОДНУ естественную фразу. Или "..." если лучше помолчать.`;

    try {
      const response = await this.aiProvider.generateText(prompt, {
        maxTokens: 60,
        temperature: 0.9,
      });

      const text = response.trim();
      if (!text || text === '...' || text.length < 3) return null;

      this.lastSpokeTime.set(agentName, Date.now());
      return this._addNaturalImperfections(text);

    } catch (error) {
      logger.error(`Ошибка инициативы ${agentName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Очистка старой истории
   */
  cleanup() {
    const cutoff = Date.now() - 600000; // 10 минут
    this.recentMessages = this.recentMessages.filter(m => m.timestamp > cutoff);
  }
}
