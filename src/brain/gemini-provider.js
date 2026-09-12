import { GoogleGenAI } from '@google/genai';
import { AIProvider } from './ai-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AI');

/**
 * Google Gemini AI Provider.
 * Реализация AIProvider для Google Gemini API (бесплатный тариф).
 */
export class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);
    const apiKey = config.ai.geminiApiKey;
    if (!apiKey) {
      throw new Error(
        'Gemini API key не указан. Получите бесплатный ключ на https://aistudio.google.com/apikey\n' +
        'Затем добавьте GEMINI_API_KEY=ваш_ключ в файл .env'
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = config.ai.model || 'gemini-2.5-flash';
    logger.info(`Gemini провайдер инициализирован (модель: ${this.model})`);
  }

  get name() {
    return `Gemini (${this.model})`;
  }

  /**
   * Создаёт чат-сессию с Gemini.
   */
  async createChat({ systemPrompt, tools } = {}) {
    try {
      const chatConfig = {};
      if (systemPrompt) {
        chatConfig.systemInstruction = systemPrompt;
      }
      if (tools && tools.length > 0) {
        chatConfig.tools = [{ functionDeclarations: tools }];
      }
      chatConfig.temperature = this.config?.ai?.temperature ?? 0.85;

      // ai.chats.create возвращает объект синхронно (не Promise)
      const chat = this.ai.chats.create({
        model: this.model,
        config: chatConfig,
      });

      logger.debug('Чат-сессия Gemini создана');
      return chat;
    } catch (error) {
      logger.error(`Ошибка создания чат-сессии Gemini: ${error.message}`);
      throw error;
    }
  }

  async _sendWithRetry(session, payload, options = {}) {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return await session.sendMessage(payload);
      } catch (error) {
        const isTransient = error.status === 503 || error.status === 429 || /high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(error.message || '');
        if (isTransient && attempt < maxRetries) {
          const delay = 1500 * (attempt + 1);
          logger.warn(`Временная перегрузка Gemini API (${error.status || '503'}). Повтор через ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Отправляет сообщение в чат и получает ответ.
   */
  async sendMessage(session, message, options = {}) {
    try {
      logger.debug(`Отправка сообщения в Gemini (${message.length} символов)`);
      const response = await this._sendWithRetry(session, { message }, options);
      return this._parseResponse(response);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Отправляет результаты выполнения инструментов обратно в AI.
   */
  async sendToolResults(session, results, options = {}) {
    try {
      const functionResponses = results.map(r => ({
        functionResponse: {
          name: r.name,
          response: { result: r.result },
        },
      }));
      logger.debug(`Отправка ${results.length} результатов инструментов в Gemini`);
      const response = await this._sendWithRetry(session, { message: functionResponses }, options);
      return this._parseResponse(response);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Парсит ответ Gemini в унифицированный формат.
   */
  _parseResponse(response) {
    const text = response.text || '';
    const toolCalls = response.functionCalls
      ? response.functionCalls.map(fc => ({ name: fc.name, args: fc.args || {} }))
      : [];

    if (text) {
      logger.debug(`Gemini ответил текстом (${text.length} символов)`);
    }
    if (toolCalls.length > 0) {
      logger.debug(`Gemini вызвал инструменты: ${toolCalls.map(tc => tc.name).join(', ')}`);
    }

    return { text, toolCalls, raw: response };
  }

  /**
   * Генерация однократного текстового ответа (реплики, диалога).
   * @param {string|Object} promptOrOptions
   * @param {Object} [options]
   * @returns {Promise<string>}
   */
  async generateText(promptOrOptions, options = {}) {
    let userPrompt = '';
    let systemPrompt = '';
    let opts = {};

    if (typeof promptOrOptions === 'string') {
      userPrompt = promptOrOptions;
      opts = options || {};
      systemPrompt = opts.systemPrompt || opts.systemInstruction || '';
    } else if (promptOrOptions && typeof promptOrOptions === 'object') {
      opts = promptOrOptions;
      userPrompt = opts.userPrompt || opts.prompt || '';
      systemPrompt = opts.systemPrompt || opts.systemInstruction || '';
    }

    try {
      const config = {};
      if (systemPrompt) {
        config.systemInstruction = systemPrompt;
      }
      if (opts.temperature !== undefined) {
        config.temperature = opts.temperature;
      }
      if (opts.maxTokens) {
        config.maxOutputTokens = opts.maxTokens;
      }

      const response = await this.ai.models.generateContent({
        model: opts.model || this.model,
        contents: userPrompt,
        config,
      });

      return (response.text || '').trim();
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Описывает изображение (скриншот игры) через мультимодальную модель Gemini.
   * @param {Buffer|Uint8Array} imageBuffer - PNG/JPEG байты кадра
   * @param {string} prompt - что спросить про изображение
   * @param {Object} [opts]
   * @returns {Promise<string>}
   */
  async describeImage(imageBuffer, prompt, opts = {}) {
    try {
      const base64 = Buffer.from(imageBuffer).toString('base64');
      const mimeType = opts.mimeType || 'image/png';
      const config = { temperature: opts.temperature ?? 0.4 };
      if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;

      const response = await this.ai.models.generateContent({
        model: opts.model || this.model,
        contents: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt || 'Опиши что видно на этом кадре Minecraft: рельеф, постройки, деревни, мобов.' },
        ],
        config,
      });
      return (response.text || '').trim();
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Обработка ошибок API.
   */

  _handleError(error) {
    if (error.status === 429) {
      logger.error('Превышен лимит запросов Gemini API. Подождите немного.');
    } else if (error.status === 403) {
      logger.error('Доступ запрещён. Проверьте API ключ.');
    } else {
      logger.error(`Ошибка Gemini API: ${error.message}`);
    }
    throw error;
  }
}
