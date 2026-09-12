import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RESPONSE_GENERATOR');

/**
 * Генератор естественных человеческих ответов вместо шаблонов.
 * Использует LLM для создания уникальных реакций.
 */
export class ResponseGenerator {
  constructor(aiBrain, profile) {
    this.aiBrain = aiBrain;
    this.profile = profile;
    this.recentResponses = []; // Последние 20 ответов для избежания повторов
  }

  /**
   * Генерирует естественный ответ на команду игрока
   * @param {string} intent - тип команды (STOP, FOLLOW, etc)
   * @param {string} playerMessage - оригинальное сообщение игрока
   * @param {Object} context - контекст (позиция, здоровье, настроение, etc)
   * @returns {Promise<string>}
   */
  async generateResponse(intent, playerMessage, context = {}) {
    const { mood, health, food, position, busy, currentTask } = context;
    
    // Формируем промпт для LLM
    const prompt = this._buildPrompt(intent, playerMessage, {
      mood,
      health,
      food,
      position,
      busy,
      currentTask,
      personality: this.profile,
      recentResponses: this.recentResponses.slice(-5) // последние 5 для контекста
    });

    try {
      // Быстрый короткий запрос к LLM
      const response = await this.aiBrain.generateQuickResponse(prompt, {
        maxTokens: 30,
        temperature: 0.9, // высокая вариативность
        stopSequences: ['\n', '.', '!', '?']
      });

      const text = response.text?.trim() || await this._getFallback(intent, playerMessage, context);

      // Сохраняем в историю
      this.recentResponses.push({ intent, text, timestamp: Date.now() });
      if (this.recentResponses.length > 20) this.recentResponses.shift();

      return text;
    } catch (err) {
      logger.error(`Ошибка генерации ответа: ${err.message}`);
      return await this._getFallback(intent, playerMessage, context);
    }
  }

  /**
   * Строит промпт для LLM
   */
  _buildPrompt(intent, playerMessage, context) {
    const { personality, mood, health, busy, currentTask, recentResponses } = context;
    
    const moodStr = mood ? `Настроение: ${mood}. ` : '';
    const healthStr = health < 10 ? 'Здоровье низкое. ' : '';
    const busyStr = busy ? `Занят: ${currentTask}. ` : '';
    
    let intentDesc = '';
    switch (intent) {
      case 'STOP':
        intentDesc = 'Игрок приказал остановиться';
        break;
      case 'FOLLOW':
        intentDesc = 'Игрок просит следовать за ним';
        break;
      case 'COME_HERE':
        intentDesc = 'Игрок зовет к себе';
        break;
      case 'WAIT':
        intentDesc = 'Игрок просит подождать';
        break;
      case 'HELP':
        intentDesc = 'Игрок просит о помощи';
        break;
      case 'WHERE_ARE_YOU':
        intentDesc = 'Игрок спрашивает где ты';
        break;
      case 'CALL_NAME':
        intentDesc = 'Игрок просто зовет по имени';
        break;
    }

    const charDesc = this._getCharacterDescription(personality);
    
    // Избегаем повторения последних фраз
    const avoidPhrases = recentResponses.map(r => r.text).join(', ');

    return `Ты ${personality.name}, играешь в Minecraft. ${charDesc}
${moodStr}${healthStr}${busyStr}
Игрок написал: "${playerMessage}"
${intentDesc}.

Ответь ОДНОЙ короткой фразой (максимум 5-7 слов), естественно и без шаблонов. 
НЕ используй эти фразы: ${avoidPhrases}
Пиши как живой человек в чате игры:`;
  }

  /**
   * Описание характера для промпта
   */
  _getCharacterDescription(personality) {
    const traits = personality.traits || {};
    
    if (personality.name === 'Sam') {
      return 'Ты спокойный, осторожный, думаешь прежде чем действовать.';
    } else if (personality.name === 'Max') {
      return 'Ты формальный, деловой, немного занудный.';
    } else if (personality.name === 'Jack') {
      return 'Ты энергичный, веселый, иногда безбашенный.';
    } else if (personality.name === 'Ryan') {
      return 'Ты спокойный, надежный, не болтливый.';
    } else if (personality.name === 'Alex') {
      return 'Ты дружелюбный, помогаешь всем.';
    } else if (personality.name === 'Leo') {
      return 'Ты смелый, авантюрный, любишь экшен.';
    }
    
    return 'Ты обычный игрок.';
  }

  /**
   * Запасной вариант если основной запрос к LLM дал пустоту/сбой.
   * НИКАКИХ заготовленных фраз: пробуем ещё один максимально короткий
   * запрос к LLM, зная только суть обращения. Если и он недоступен —
   * возвращаем одно нейтральное слово (признак лага связи, не шаблон ответа).
   */
  async _getFallback(intent, playerMessage = '', context = {}) {
    if (this.aiBrain?.generateQuickResponse) {
      try {
        const name = this.profile?.name || 'ты';
        const prompt = `Ты ${name}, играешь в Minecraft с друзьями. Тебе написали: "${playerMessage}". Ответь ОДНОЙ живой короткой фразой (1-4 слова) своими словами, строчными буквами, без точки:`;
        const res = await this.aiBrain.generateQuickResponse(prompt, {
          maxTokens: 16,
          temperature: 0.95,
          timeoutMs: 1000,
        });
        const text = res.text?.trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
        if (text && text.length >= 1) return text;
      } catch (_) {}
    }
    return 'м?';
  }
}
