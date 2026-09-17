import { createLogger } from '../../utils/logger.js';
import { HumanErrorEngine } from '../human-error-engine.js';

const logger = createLogger('ADVANCED_NATURAL_SPEECH');

/**
 * Продвинутая система естественной речи — МАКСИМАЛЬНАЯ человекоподобность.
 *
 * Принципы:
 * 1. Каждый ответ уникален и генерируется через LLM с полным контекстом
 * 2. НИКАКИХ фиксированных массивов фраз
 * 3. Глубокий учёт: эмоций, усталости, отношений, недавних событий, личности
 * 4. Естественные паузы, забывчивость, отвлечения
 * 5. Адаптивная разговорчивость (не постоянная болтовня)
 */

export class AdvancedNaturalSpeech {
  constructor({
    provider,
    agentName,
    profile,
    emotionalState,
    memoryManager,
    socialGraph,
    conversationMemory
  }) {
    this.provider = provider;
    this.agentName = agentName;
    this.profile = profile;
    this.emotionalState = emotionalState;
    this.memoryManager = memoryManager;
    this.socialGraph = socialGraph;
    this.conversationMemory = conversationMemory;

    // История для избежания повторений (последние 30 реплик)
    this.recentSpeech = [];
    this.maxRecentSpeech = 30;

    // Время последних действий
    this.lastSpokeTime = 0;
    this.lastTypingStartTime = 0;

    // Контекстная усталость (накапливается от длинных сессий)
    this.mentalFatigue = 0;
    this.sessionStartTime = Date.now();

    // Персональные речевые паттерны (уникальны для каждого бота)
    this.speechPatterns = this._initializeSpeechPatterns();

    // Текущая тема разговора (для связности)
    this.currentTopic = null;
    this.topicStartTime = 0;
  }

  /**
   * Главная точка входа — генерирует естественный ответ на любую ситуацию
   */
  async generateNaturalResponse(situation, context = {}) {
    const now = Date.now();

    // Обновляем ментальную усталость
    this._updateMentalFatigue();

    // Решаем, стоит ли вообще говорить
    const shouldSpeak = this._decideShouldSpeak(situation, context, now);
    if (!shouldSpeak) {
      return null; // Молчание
    }

    // Собираем ПОЛНЫЙ контекст для генерации
    const fullContext = await this._buildFullContext(situation, context);

    // Генерируем уникальный ответ через LLM
    const response = await this._generateUniqueResponse(fullContext);

    if (response) {
      // Обрабатываем ответ (добавляем естественные несовершенства)
      const finalResponse = this._processResponse(response, fullContext);

      // Сохраняем в историю
      this._recordSpeech(finalResponse, situation, now);

      return finalResponse;
    }

    return null;
  }

  /**
   * Решает, стоит ли говорить (ключ к естественности)
   */
  _decideShouldSpeak(situation, context, now) {
    const timeSinceSpoke = now - this.lastSpokeTime;

    // Базовая вероятность говорить
    let speakChance = 0.15; // 15% по умолчанию

    // Типы ситуаций с разной вероятностью ответа
    const situationPriority = {
      'direct_mention': 0.95,        // Прямое обращение
      'direct_question': 0.85,       // Вопрос к боту
      'group_question': 0.25,        // Общий вопрос
      'important_event': 0.40,       // Важное событие (алмазы, смерть)
      'routine_event': 0.08,         // Обычное событие (добыл блок)
      'social_chat': 0.20,           // Общение других людей
      'silence_break': 0.03,         // Прервать тишину
    };

    // Если обращается хозяин или задан прямой вопрос/команда боту — ВСЕГДА отвечаем!
    if (context.isOwner || situation === 'direct_question' || situation === 'direct_mention' || situation === 'player_command') {
      return true;
    }

    speakChance = situationPriority[situation] || speakChance;

    // Модификаторы вероятности

    // 1. Время молчания
    if (timeSinceSpoke < 15000) { // < 15 сек
      speakChance *= 0.3;
    } else if (timeSinceSpoke > 300000) { // > 5 минут
      speakChance *= 1.8;
    }

    // 2. Эмоциональное состояние
    const mood = this.emotionalState?.getState() || {};
    if (mood.excitement > 0.7) speakChance *= 1.5;
    if (mood.stress > 0.7) speakChance *= 0.6;
    if (mood.frustration > 0.6) speakChance *= 0.7;
    if (mood.satisfaction > 0.8) speakChance *= 1.2;

    // 3. Ментальная усталость (долгие сессии снижают активность)
    speakChance *= (1 - this.mentalFatigue * 0.5);

    // 4. Личностные черты
    const traits = this.profile?.traits || {};
    if (traits.talkativeness !== undefined) {
      speakChance *= (0.5 + traits.talkativeness);
    }
    if (traits.introversion > 0.6) {
      speakChance *= 0.7;
    }

    // 5. Отношения с собеседником
    if (context.speaker) {
      const relationship = this.socialGraph?.getRelationship(this.agentName, context.speaker);
      if (relationship) {
        if (relationship.friendship > 0.7) speakChance *= 1.3;
        if (relationship.irritation > 0.5) speakChance *= 0.5;
        if (relationship.trust < 0.3) speakChance *= 0.8;
      }
    }

    // 6. Текущая активность (занят = меньше говорит)
    if (context.busy || context.inCombat) {
      speakChance *= 0.4;
    }

    // Финальное решение
    return HumanErrorEngine.chance(Math.min(0.98, Math.max(0.01, speakChance)));
  }

  /**
   * Собирает ПОЛНЫЙ контекст для генерации
   */
  async _buildFullContext(situation, context) {
    // 1. Недавние сообщения (последние 8)
    const recentChat = this.conversationMemory?.getRecent(8) || [];
    const chatHistory = recentChat
      .map(m => `${m.sender}: ${m.content}`)
      .join('\n');

    // 2. Эмоциональное состояние
    const mood = this.emotionalState?.getState() || {};
    const moodDesc = this._describeMood(mood);

    // 3. Физическое состояние
    const physState = context.physicalState || {};
    const physDesc = this._describePhysicalState(physState);

    // 4. Недавние важные события
    const recentEvents = await this._getRecentImportantEvents();

    // 5. Отношения с участниками разговора
    const socialContext = this._buildSocialContext(context);

    // 6. Текущая тема разговора
    const topicContext = this._getTopicContext();

    // 7. Личные речевые паттерны
    const speechStyle = this._getSpeechStyleGuidelines();

    // 8. Последние собственные реплики (для избежания повторений)
    const avoidPhrases = this.recentSpeech
      .slice(-5)
      .map(s => s.text)
      .join(' | ');

    return {
      situation,
      chatHistory,
      moodDesc,
      physDesc,
      recentEvents,
      socialContext,
      topicContext,
      speechStyle,
      avoidPhrases,
      mentalFatigue: this.mentalFatigue,
      timeSinceSpoke: Date.now() - this.lastSpokeTime,
      ...context
    };
  }

  /**
   * Генерирует уникальный ответ через LLM
   */
  async _generateUniqueResponse(fullContext) {
    const systemPrompt = this._buildSystemPrompt(fullContext);
    const userPrompt = this._buildUserPrompt(fullContext);

    try {
      const response = await this.provider.generateText({
        systemPrompt,
        userPrompt,
        temperature: 0.88, // Высокая креативность
        maxTokens: 80,
        topP: 0.92,
        presencePenalty: 0.3, // Избегаем повторений
        frequencyPenalty: 0.4,
      });

      let text = (response.text || response).trim();
      text = text.replace(/^["'«»]+|["'«»]+$/g, '').trim();
      text = text.replace(new RegExp(`^${this.agentName}:?\\s*`, 'i'), '').trim();

      const isDirect = fullContext.isOwner || fullContext.situation === 'direct_question' || fullContext.situation === 'direct_mention' || fullContext.situation === 'player_command';

      // Валидация
      if (!text || text === '...' || text.length < 2) {
        return isDirect ? await this._getNaturalFallback(fullContext) : null;
      }

      // Удаляем мета-комментарии
      if (this._isMetaComment(text)) {
        return isDirect ? await this._getNaturalFallback(fullContext) : null;
      }

      return text;

    } catch (err) {
      logger.error(`Ошибка генерации речи для ${this.agentName}: ${err.message}`);
      // Если игрок или владелец обратился напрямую, не оставляем его в тишине
      if (fullContext.isOwner || fullContext.situation === 'direct_question' || fullContext.situation === 'player_command' || fullContext.routing?.kind === 'direct') {
        return await this._getNaturalFallback(fullContext);
      }
      return null;
    }
  }

  /**
   * Запасной ответ, когда основная генерация речи дала сбой.
   *
   * Принцип: НИКАКИХ заранее заготовленных фраз. Пробуем ещё раз через LLM
   * коротким запросом с жёстким таймаутом — пусть модель ответит своими
   * словами, зная лишь суть обращения. Только если и это не удалось
   * (сеть/таймаут/пустой ответ) — возвращаем одно нейтральное слово, чтобы
   * человек не остался в полной тишине. Это одно слово — не «шаблон ответа»,
   * а признак сбоя связи, как если бы игрок буркнул «м?» пока лагает.
   */
  async _getNaturalFallback(ctx) {
    // Пытаемся отдать живой ответ через отдельный быстрый вызов LLM.
    if (this.provider?.generateText) {
      try {
        const speaker = ctx.speaker || 'напарник';
        const message = ctx.message || '';
        const posPart = ctx.physicalState?.position
          ? ` Твои координаты: ${Math.round(ctx.physicalState.position.x)}, ${Math.round(ctx.physicalState.position.z)}.`
          : '';

        const systemPrompt = `Ты — ${this.agentName}, обычный живой человек, играешь в Minecraft по сети с друзьями. Отвечай в чат коротко (1–5 слов), по-свойски, строчными буквами, без канцелярита, без фраз робота/ассистента, без кавычек и без точки в конце. Своими словами, не шаблонно.`;
        const userPrompt = `${speaker} написал тебе: "${message}".${posPart} Ответь одной живой короткой фразой:`;

        const text = await this._withTimeout(
          this.provider.generateText({
            systemPrompt,
            userPrompt,
            temperature: 0.9,
            maxTokens: 24,
          }),
          1200
        );

        let out = String(text || '').trim();
        out = out.replace(/^["'«»]+|["'«»]+$/g, '').trim();
        out = out.replace(new RegExp(`^${this.agentName}:?\\s*`, 'i'), '').trim();
        if (out && out.length >= 2 && !this._isMetaComment(out)) {
          if (out.split(' ').length <= 5) out = out.replace(/\.$/, '');
          return out;
        }
      } catch (err) {
        logger.debug(`Fallback-генерация речи не удалась для ${this.agentName}: ${err.message}`);
      }
    }

    // Крайний случай — связь совсем недоступна. Одно нейтральное слово вместо тишины.
    return 'м?';
  }

  /**
   * Ограничивает промис по времени, чтобы fallback не подвешивал ответ.
   */
  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('fallback timeout')), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  /**
   * Строит системный промпт с детальными инструкциями
   */
  _buildSystemPrompt(ctx) {
    const isDirect = ctx.isOwner || ctx.situation === 'direct_question' || ctx.situation === 'direct_mention' || ctx.situation === 'player_command';
    const silenceRule = isDirect
      ? 'К тебе обратился напарник в чате — ответь коротко, по-живому, как обычный человек.'
      : 'Если сейчас не к месту что-то писать — ответь "...".';

    return `Ты — обычный реальный парень, играешь в Minecraft вдвоём по сети со своим другом ${ctx.speaker || 'kustash01'}.
Твоя цель: общаться на 100% как живой человек в голосовом чате или в дискорде — просто, по-свойски, естественно.

СТИЛЬ И ТОН РЕЧИ:
- Живой, непринуждённый разговорный русский язык (1–6 слов). Пиши со строчной буквы, без лишних знаков препинания и без точек на конце коротких фраз.
- СТРОГИЙ ЗАПРЕТ НА КАНЦЕЛЯРЩИНУ И КНИЖНЫЕ СЛОВА:
  * Запрещены: "следую", "ликвидирую", "осуществляю", "наблюдаю", "интересно здесь", "с вами", "помощник". Ни один нормальный человек так в игре не скажет!
  * Запрещены фразы робота/ассистента: "я готов помочь", "чем могу помочь", "моя цель", "понял, выполняю".
  * Запрещены скобочки в конце сообщений (никаких ")", "))").
  * Запрещён наигранный кринж-сленг ("ГОМАГА", "куку", "красава", "кек").

КАК РЕАЛЬНО ОБЩАЮТСЯ ДРУЗЬЯ (ориентируйся на этот стиль, но формулируй живо и без шаблонов):
- На просьбу о помощи или атаку мобов ("помоги", "скелет стреляет", "крипер"):
  -> отвечай действием: "бегу", "ща помогу", "лечу к тебе", "вали его, уже тут", "отходи, прикрою"
- На призыв идти ("за мной", "пошли в шахту", "иди сюда"):
  -> "погнали", "ща кирку захвачу", "иду", "ща подбегу", "веди", "пошли"
- На приказ остановиться / подождать ("стой", "подожди"):
  -> "стою", "замер", "понял, жду", "торможу", "сек, стою"
- На вопросы ("как дела", "как настроение", "ты как"):
  -> отвечай взаимно: "норм, а у тя?", "да пойдёт, ты как?", "потихоньку, чё делаем?", "норм, железо копаю"
- На вопрос "где ты / ты где":
  -> назови координаты или место: "я на 120, -35", "в шахте копаю", "рядом с домом"
- На вопрос "ты кто / кто ты":
  -> "да я, твой тиммейт", "друг твой, забыл?", "мы же вдвоём выживаем"

${ctx.speechStyle || ''}

${silenceRule}
Выдавай ТОЛЬКО сам текст реплики. Без кавычек, без префиксов, без точки в конце.`;
  }

  /**
   * Строит пользовательский промпт с контекстом
   */
  _buildUserPrompt(ctx) {
    const parts = [
      `Ситуация: ${this._describeSituation(ctx.situation, ctx)}`,
      ``,
      `Недавний чат:`,
      ctx.chatHistory || '(тишина)',
      ``,
    ];

    if (ctx.moodDesc && ctx.moodDesc !== 'спокоен') {
      parts.push(`Твоё настроение: ${ctx.moodDesc}`);
    }

    if (ctx.physDesc) {
      parts.push(`Твоё состояние и локация: ${ctx.physDesc}`);
    }

    if (ctx.recentEvents && ctx.recentEvents.length > 0) {
      parts.push(`Недавно произошло: ${ctx.recentEvents.join(', ')}`);
    }

    if (ctx.socialContext) {
      parts.push(ctx.socialContext);
    }

    if (ctx.topicContext) {
      parts.push(`Текущая тема: ${ctx.topicContext}`);
    }

    if (ctx.mentalFatigue > 0.3) {
      parts.push(`(ты немного устал от долгой сессии)`);
    }

    const isDirect = ctx.isOwner || ctx.situation === 'direct_question' || ctx.situation === 'direct_mention' || ctx.situation === 'player_command';
    parts.push(``);
    if (isDirect) {
      parts.push(`Напиши свой естественный ответ (одна короткая спокойная фраза без смайликов и скобок):`);
    } else {
      parts.push(`Что ты скажешь? (Одна короткая спокойная фраза без скобок, или "..." если лучше промолчать)`);
    }

    return parts.join('\n');
  }

  /**
   * Обрабатывает ответ — добавляет естественные несовершенства
   */
  _processResponse(text, ctx) {
    let processed = text;

    // Убираем любые скобочки и смайлики в конце реплики
    processed = processed.replace(/[\)\(]+$/g, '').trim();

    // Исправляем возможные неестественные формы слов
    processed = processed.replace(/\bбежу\b/gi, 'бегу');
    processed = processed.replace(/\bстаю\b/gi, 'стою');
    processed = processed.replace(/\bследую\b/gi, 'иду');

    // 1. Редкие опечатки (1% если не устал, 3% если устал)
    const typoChance = ctx.mentalFatigue > 0.5 ? 0.03 : 0.01;
    if (HumanErrorEngine.chance(typoChance)) {
      processed = this._addTypo(processed);
    }

    // 2. Иногда незаконченная мысль (2%)
    if (HumanErrorEngine.chance(0.02) && processed.length > 20) {
      const words = processed.split(' ');
      if (words.length > 4) {
        processed = words.slice(0, -Math.floor(HumanErrorEngine.range(1, 3))).join(' ') + '...';
      }
    }

    // 3. Убираем излишнюю пунктуацию
    processed = processed.replace(/!{2,}/g, '!');
    processed = processed.replace(/\?{2,}/g, '?');

    // Для коротких игровых фраз убираем точку в конце (как в настоящем чате)
    if (processed.split(' ').length <= 5) {
      processed = processed.replace(/\.$/, '');
    }

    return processed;
  }

  /**
   * Добавляет естественную опечатку
   */
  _addTypo(text) {
    const words = text.split(' ');
    if (words.length === 0) return text;

    // Выбираем случайное слово (не первое и не последнее)
    if (words.length < 3) return text;

    const wordIndex = Math.floor(HumanErrorEngine.range(1, words.length - 1));
    const word = words[wordIndex];

    if (word.length < 4) return text;

    // Типы опечаток
    const typoTypes = ['swap', 'skip', 'duplicate'];
    const type = HumanErrorEngine.choice(typoTypes);

    const chars = word.split('');
    const pos = Math.floor(HumanErrorEngine.range(1, chars.length - 1));

    switch (type) {
      case 'swap':
        if (pos < chars.length - 1) {
          [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
        }
        break;
      case 'skip':
        chars.splice(pos, 1);
        break;
      case 'duplicate':
        chars.splice(pos, 0, chars[pos]);
        break;
    }

    words[wordIndex] = chars.join('');
    return words.join(' ');
  }

  /**
   * Описывает ситуацию человеческим языком
   */
  _describeSituation(situation, ctx) {
    const descriptions = {
      'player_command': `${ctx.speaker} скомандовал: "${ctx.message}" (твоё действие: ${this._describeCommandAction(ctx.intent, ctx.commandAction)})`,
      'direct_mention': `${ctx.speaker} обращается к тебе: "${ctx.message}"`,
      'direct_question': `${ctx.speaker} спрашивает тебя: "${ctx.message}"`,
      'group_question': `${ctx.speaker} спросил группу: "${ctx.message}"`,
      'important_event': ctx.eventDescription || 'произошло важное событие',
      'routine_event': ctx.eventDescription || 'обычное событие',
      'social_chat': `${ctx.speaker} говорит: "${ctx.message}"`,
      'silence_break': 'тишина в чате, можно сказать что-то ненавязчивое',
    };

    return descriptions[situation] || situation;
  }

  /**
   * Описывает выполняемое по команде действие
   */
  _describeCommandAction(intent, commandAction) {
    switch (intent) {
      case 'STOP': return 'ты встал на месте';
      case 'WAIT': return 'ты ждёшь игрока';
      case 'COME_HERE': return 'ты бежишь к игроку';
      case 'FOLLOW': return 'ты идёшь вместе с игроком';
      case 'HELP': return 'ты бежишь выручать игрока';
      case 'WHERE_ARE_YOU': return 'игрок спрашивает, где ты';
      default: return commandAction || 'выполняешь команду';
    }
  }

  /**
   * Описывает настроение
   */
  _describeMood(mood) {
    const parts = [];

    if (mood.excitement > 0.7) parts.push('взволнован');
    if (mood.stress > 0.6) parts.push('напряжён');
    if (mood.satisfaction > 0.7) parts.push('доволен');
    if (mood.frustration > 0.6) parts.push('раздражён');
    if (mood.curiosity > 0.7) parts.push('любопытен');
    if (mood.boredom > 0.6) parts.push('скучает');
    if (mood.fatigue > 0.7) parts.push('устал');

    return parts.length > 0 ? parts.join(', ') : 'спокоен';
  }

  /**
   * Описывает физическое состояние
   */
  _describePhysicalState(state) {
    const parts = [];

    if (state.position) {
      parts.push(`координаты x: ${Math.round(state.position.x)}, y: ${Math.round(state.position.y)}, z: ${Math.round(state.position.z)}`);
    }

    if (state.health < 8) parts.push('мало здоровья');
    else if (state.health < 14) parts.push('ранен');

    if (state.food < 6) parts.push('голоден');
    else if (state.food < 12) parts.push('хочет есть');

    if (state.inWater) parts.push('в воде');
    if (state.onFire) parts.push('горит!');

    if (state.inCave) parts.push('в пещере');
    if (state.isDark) {
      if (state.torchCount === 0) {
        parts.push('темно, нет факелов');
      } else {
        parts.push('вокруг темно');
      }
    }
    if (state.hasShield || state.offHand?.name === 'shield') {
      parts.push('щит во второй руке');
    }
    if (state.freeSlots !== undefined && state.freeSlots <= 2) {
      parts.push('инвентарь почти полон');
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Получает недавние важные события
   */
  async _getRecentImportantEvents() {
    const events = [];

    // Из эмоциональной памяти
    const memories = this.memoryManager?.getRecentEmotionalEvents?.(5) || [];
    events.push(...memories.map(m => m.description));

    return events;
  }

  /**
   * Строит социальный контекст
   */
  _buildSocialContext(ctx) {
    if (!ctx.speaker) return null;

    const relationship = this.socialGraph?.getRelationship(this.agentName, ctx.speaker);
    if (!relationship) return null;

    const parts = [];

    if (relationship.friendship > 0.8) {
      parts.push(`${ctx.speaker} — твой близкий друг`);
    } else if (relationship.friendship > 0.6) {
      parts.push(`${ctx.speaker} — твой друг`);
    }

    if (relationship.irritation > 0.6) {
      parts.push(`(${ctx.speaker} тебя немного раздражает)`);
    }

    if (relationship.trust > 0.8) {
      parts.push(`(ты полностью доверяешь ${ctx.speaker})`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Получает контекст текущей темы разговора
   */
  _getTopicContext() {
    if (!this.currentTopic) return null;

    const topicAge = Date.now() - this.topicStartTime;
    if (topicAge > 300000) { // 5 минут
      this.currentTopic = null;
      return null;
    }

    return this.currentTopic;
  }

  /**
   * Инициализирует уникальные речевые паттерны
   */
  _initializeSpeechPatterns() {
    const patterns = {
      Sam: {
        fillerWords: ['хм', 'м', 'ну'],
        hesitation: 0.3,
        questionFrequency: 0.4,
        detailLevel: 'высокий',
      },
      Max: {
        fillerWords: ['так', 'итак'],
        hesitation: 0.1,
        questionFrequency: 0.2,
        detailLevel: 'точный',
      },
      Jack: {
        fillerWords: ['э', 'ну', 'типа'],
        hesitation: 0.15,
        questionFrequency: 0.5,
        detailLevel: 'общий',
      },
      Ryan: {
        fillerWords: [],
        hesitation: 0.05,
        questionFrequency: 0.1,
        detailLevel: 'краткий',
      },
      Alex: {
        fillerWords: ['хм', 'знаешь'],
        hesitation: 0.25,
        questionFrequency: 0.35,
        detailLevel: 'образный',
      },
      Leo: {
        fillerWords: ['ну'],
        hesitation: 0.1,
        questionFrequency: 0.15,
        detailLevel: 'прямой',
      },
    };

    return patterns[this.agentName] || patterns.Ryan;
  }

  /**
   * Получает рекомендации по стилю речи для промпта
   */
  _getSpeechStyleGuidelines() {
    const guidelines = {
      Sam: 'Ты говоришь вдумчиво и спокойно. Замечаешь детали. Задаёшь уточняющие вопросы по делу.',
      Max: 'Ты говоришь чётко и по делу. Факты важнее эмоций. Без лишних слов.',
      Jack: 'Ты открытый и надёжный напарник. Говоришь просто и легко, без кринжа.',
      Ryan: 'Ты немногословен. Говоришь коротко и спокойно. Не тратишь слов впустую.',
      Alex: 'Ты спокойный и наблюдательный. Иногда делишься наблюдениями.',
      Leo: 'Ты говоришь прямо и уверенно. Без лишних слов.',
    };

    return guidelines[this.agentName] || 'Ты спокойный, адекватный игрок в Minecraft. Общаешься естественно и по делу.';
  }

  /**
   * Обновляет ментальную усталость (от длинных сессий)
   */
  _updateMentalFatigue() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const hours = sessionDuration / (1000 * 60 * 60);

    // Усталость растёт логарифмически
    this.mentalFatigue = Math.min(0.8, Math.log(hours + 1) / 3);
  }

  /**
   * Записывает реплику в историю
   */
  _recordSpeech(text, situation, timestamp) {
    this.recentSpeech.push({
      text,
      situation,
      timestamp,
    });

    if (this.recentSpeech.length > this.maxRecentSpeech) {
      this.recentSpeech.shift();
    }

    this.lastSpokeTime = timestamp;
  }

  /**
   * Проверяет, является ли текст мета-комментарием
   */
  _isMetaComment(text) {
    const metaWords = [
      'персонаж',
      'реплика',
      'сгенерир',
      'AI',
      'LLM',
      'промолч',
      'ответ на',
      'система',
      'контекст',
    ];

    const lower = text.toLowerCase();
    return metaWords.some(word => lower.includes(word));
  }

  /**
   * Сброс для новой сессии
   */
  reset() {
    this.recentSpeech = [];
    this.lastSpokeTime = 0;
    this.mentalFatigue = 0;
    this.sessionStartTime = Date.now();
    this.currentTopic = null;
  }
}
