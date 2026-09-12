import { AIProvider } from './ai-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AI');

/**
 * OpenAI / GPT-5.6 (Luna) AI Provider.
 * Реализация AIProvider для OpenAI API и совместимых эндпоинтов.
 */
export class OpenAIProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.ai.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key не указан.\n' +
        'Добавьте OPENAI_API_KEY=ваш_ключ в файл .env и установите AI_PROVIDER=openai'
      );
    }

    this.baseUrl = (config.ai.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config.ai.model || 'gpt-5.6';

    logger.info(`OpenAI провайдер инициализирован (модель: ${this.model}, эндпоинт: ${this.baseUrl})`);
  }

  get name() {
    return `OpenAI (${this.model})`;
  }

  /**
   * Создаёт сессию для диалога с инструментами.
   */
  async createChat({ systemPrompt, tools } = {}) {
    const formattedTools = tools && tools.length > 0
      ? tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description || '',
            parameters: t.parameters || { type: 'object', properties: {} },
          },
        }))
      : [];

    const session = {
      model: this.model,
      systemPrompt: systemPrompt || '',
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      messages: [],
      pendingToolCalls: new Map(), // name -> id
    };

    if (systemPrompt) {
      session.messages.push({ role: 'system', content: systemPrompt });
    }

    logger.debug('Чат-сессия OpenAI создана');
    return session;
  }

  /**
   * Отправляет сообщение в OpenAI и возвращает структурированный ответ.
   */
  async sendMessage(session, message, options = {}) {
    try {
      session.messages.push({ role: 'user', content: message });
      return await this._callCompletions(session, options);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Отправляет результаты работы инструментов обратно в модель.
   */
  async sendToolResults(session, results, options = {}) {
    try {
      for (const res of results) {
        const toolCallId = session.pendingToolCalls.get(res.name) || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        session.messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: res.name,
          content: typeof res.result === 'object' ? JSON.stringify(res.result) : String(res.result),
        });
      }

      session.pendingToolCalls.clear();
      return await this._callCompletions(session, options);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Вызов OpenAI Chat Completions API
   * @private
   */
  async _callCompletions(session, options = {}) {
    const payload = {
      model: session.model,
      messages: session.messages,
    };

    if (session.tools && session.tools.length > 0) {
      payload.tools = session.tools;
      payload.tool_choice = 'auto';
    }

    logger.debug(`Запрос к OpenAI Completions (${session.messages.length} сообщений в контексте)...`);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) {
      throw new Error('Некорректный ответ от OpenAI API (нет choices[0].message)');
    }

    const assistantMsg = choice.message;
    session.messages.push(assistantMsg);

    const text = assistantMsg.content || '';
    const toolCalls = [];

    if (assistantMsg.tool_calls && Array.isArray(assistantMsg.tool_calls)) {
      for (const tc of assistantMsg.tool_calls) {
        let parsedArgs = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          logger.warn(`Ошибка парсинга JSON аргументов для ${tc.function.name}: ${tc.function.arguments}`);
        }

        toolCalls.push({
          name: tc.function.name,
          args: parsedArgs,
          id: tc.id,
        });

        // Сохраняем ID для последующей отправки результатов
        session.pendingToolCalls.set(tc.function.name, tc.id);
      }
    }

    if (text) {
      logger.debug(`OpenAI ответил текстом (${text.length} символов)`);
    }
    if (toolCalls.length > 0) {
      logger.debug(`OpenAI вызвал инструменты: ${toolCalls.map(tc => tc.name).join(', ')}`);
    }

    return {
      text,
      toolCalls,
      raw: data,
    };
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

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    if (userPrompt) {
      messages.push({ role: 'user', content: userPrompt });
    }

    if (messages.length === 0) return '';

    const payload = {
      model: opts.model || this.model,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens || 120,
    };

    if (opts.stopSequences || opts.stop) {
      payload.stop = opts.stopSequences || opts.stop;
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: opts.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI generateText HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return (data.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Обработка ошибок API
   * @private
   */

  _handleError(error) {
    logger.error(`Ошибка OpenAI API: ${error.message}`);
    throw error;
  }
}
