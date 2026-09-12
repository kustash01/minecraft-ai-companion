import { AIProvider } from './ai-provider.js';
import { createLogger } from '../utils/logger.js';
import { telemetry } from '../utils/telemetry.js';

const logger = createLogger('AI_OPENAI_COMPATIBLE');

/**
 * OpenAI-Compatible AI Provider (Tooken Club / OpenAI / Local LLMs).
 * Полная поддержка Chat Completions, Tool Calling, Multi-turn reasoning,
 * повторных попыток с экспоненциальным backoff и изоляции ошибок.
 */
export class OpenAICompatibleProvider extends AIProvider {
  /**
   * @param {Object} config
   */
  constructor(config) {
    super(config);
    this.apiKey =
      config?.ai?.openaiCompatibleApiKey ||
      config?.ai?.openaiApiKey ||
      process.env.OPENAI_COMPATIBLE_API_KEY ||
      process.env.OPENAI_API_KEY ||
      'ollama';

    const configuredProvider = String(config?.ai?.provider || process.env.AI_PROVIDER || '').toLowerCase();
    this.isOllama = configuredProvider === 'ollama';
    const rawBaseUrl =
      config?.ai?.openaiCompatibleBaseUrl ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      (configuredProvider === 'ollama'
        ? 'http://127.0.0.1:11434/v1'
        : (config?.ai?.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://tooken.club/v1'));

    this.baseUrl = rawBaseUrl.replace(/\/+$/, '').replace('//localhost:11434', '//127.0.0.1:11434');
    this.model = config?.ai?.model || process.env.AI_MODEL || 'gpt-5.6-luna';
    this.maxRetries = config?.ai?.maxRetries ?? 3;
    this.timeoutMs = config?.ai?.timeoutMs ?? 35000;
    this.maxCompletionTokens = config?.ai?.maxCompletionTokens ?? config?.ai?.maxTokens ?? 512;
    this.maxContextMessages = config?.ai?.maxContextMessages ?? 24;
    this.temperature = config?.ai?.temperature ?? 0.75;
    this.fallbackOnTimeout = config?.ai?.fallbackOnTimeout === true;
    this.cooldownUntil = 0;

    const maskedKey = this.apiKey.length > 8
      ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
      : '***';

    logger.info(`OpenAI-Compatible провайдер инициализирован: модель="${this.model}", baseUrl="${this.baseUrl}", key=${maskedKey}`);
  }

  get name() {
    return `OpenAI-Compatible (${this.model} @ ${this.baseUrl})`;
  }

  /**
   * Проверка доступности моделей через GET /models
   * @returns {Promise<{available: boolean, models: string[], error?: string}>}
   */
  async listModels() {
    const url = `${this.baseUrl}/models`;
    logger.debug(`Запрос списка моделей: GET ${url}`);

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return { available: false, models: [], error: `HTTP ${response.status}: ${text}` };
      }

      const data = await response.json();
      const models = Array.isArray(data.data)
        ? data.data.map(m => m.id || m.name).filter(Boolean)
        : Array.isArray(data)
        ? data.map(m => m.id || m.name || String(m))
        : [];

      return {
        available: true,
        models,
        hasCurrentModel: models.includes(this.model),
      };
    } catch (err) {
      logger.warn(`Ошибка при получении списка моделей с ${url}: ${err.message}`);
      return { available: false, models: [], error: err.message };
    }
  }

  /**
   * Создаёт чат-сессию с инструментами.
   * @param {Object} options
   * @param {string} [options.systemPrompt]
   * @param {Array<Object>} [options.tools]
   * @returns {Promise<Object>}
   */
  async createChat({ systemPrompt, tools, personality, emotionalState, socialContext } = {}) {
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

    const shouldEnrich = this.isOllama || personality || emotionalState || socialContext;
    const enrichedPrompt = shouldEnrich
      ? this._enrichRussianPrompt(systemPrompt, { personality, emotionalState, socialContext })
      : (systemPrompt || '');
    const session = {
      model: this.model,
      systemPrompt: enrichedPrompt,
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      messages: [],
      lastPendingToolCalls: [], // Array<{ id: string, name: string }>
    };

    if (enrichedPrompt) {
      session.messages.push({ role: 'system', content: enrichedPrompt });
    }

    logger.debug(`Чат-сессия создана (инструментов: ${formattedTools.length})`);
    return session;
  }

  /**
   * Отправляет сообщение пользователя и возвращает ответ (с возможными вызовами инструментов).
   * @param {Object} session
   * @param {string} message
   * @returns {Promise<{text: string, toolCalls: Array<{name: string, args: Object, id?: string}>, raw: any}>}
   */
  async sendMessage(session, message, options = {}) {
    this._throwIfAborted(options.signal);
    session.messages.push({ role: 'user', content: message });
    try {
      return await this._callCompletionsWithRetry(session, options.signal);
    } catch (error) {
      if ((options.allowFallback || this.fallbackOnTimeout) && (error.name === 'TimeoutError' || /timeout|fetch failed|network|econnrefused|enotfound/i.test(error.message || ''))) {
        logger.warn('Локальная модель недоступна: сохраняем тишину вместо спама ошибками');
        return { text: '', toolCalls: [], raw: null, fallback: true };
      }
      throw error;
    }
  }

  /**
   * Отправляет результаты работы инструментов обратно в модель.
   * @param {Object} session
   * @param {Array<{name: string, result: any}>} results
   * @returns {Promise<{text: string, toolCalls: Array<{name: string, args: Object, id?: string}>, raw: any}>}
   */
  async sendToolResults(session, results, options = {}) {
    this._throwIfAborted(options.signal);
    const pending = session.lastPendingToolCalls || [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      // Сопоставляем результат с соответствующим ID вызова инструмента
      const matched = (res.id && pending.find(p => p.id === res.id)) || pending.find(p => p.name === res.name) || pending[i];
      const toolCallId = matched ? matched.id : `call_${Date.now()}_${i}`;

      const contentStr = typeof res.result === 'object'
        ? JSON.stringify(res.result)
        : String(res.result ?? '');

      session.messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        name: res.name,
        content: contentStr,
      });
    }

    session.lastPendingToolCalls = [];
    return await this._callCompletionsWithRetry(session, options.signal);
  }

  /** A stateless local vision request. Used by the continuous perception loop. */
  async analyzeVision(observation, prompt, options = {}) {
    const content = [{ type: 'text', text: `${prompt}\n\nFIRST-PERSON OBSERVATION:\n${observation}` }];
    if (options.imageDataUrl) {
      content.push({ type: 'image_url', image_url: { url: options.imageDataUrl } });
    }
    const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: options.model || this.model,
        temperature: 0.35,
        max_completion_tokens: options.maxTokens || 180,
        messages: [{ role: 'system', content: 'Return only valid JSON. Never invent unavailable actions.' }, { role: 'user', content }],
      }),
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Local vision HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  /**
   * Генерация однократного текстового ответа (реплики, мысли, диалога).
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

    if (messages.length === 0) {
      return '';
    }

    const payload = {
      model: opts.model || this.model,
      messages,
      temperature: opts.temperature ?? this.temperature ?? 0.8,
      max_completion_tokens: opts.maxTokens || opts.maxCompletionTokens || this.maxCompletionTokens || 120,
    };

    if (opts.stopSequences || opts.stop) {
      payload.stop = opts.stopSequences || opts.stop;
    }

    if (this.isOllama) {
      payload.options = { num_ctx: 4096 };
    }

    try {
      const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
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
        throw new Error(`generateText HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return content.trim();
    } catch (err) {
      logger.error(`generateText ошибка: ${err.message}`);
      throw err;
    }
  }


  /**
   * Вызов Chat Completions API с повторными попытками (exponential backoff)
   * @private
   */
  async _callCompletionsWithRetry(session, signal = null) {
    let lastError = null;

    if (Date.now() < this.cooldownUntil) {
      const error = new Error('API cooldown active');
      error.retryable = false;
      throw error;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const payload = {
          model: session.model,
          messages: this._trimMessages(session.messages),
          max_completion_tokens: this.maxCompletionTokens,
          temperature: this.temperature,
        };
        if (this.isOllama) payload.options = { num_ctx: 16384 };

        if (session.tools && session.tools.length > 0) {
          payload.tools = session.tools;
          payload.tool_choice = 'auto';
        }

        logger.debug(`[API CALL #${attempt + 1}] Отправка в ${this.baseUrl}/chat/completions (сообщений: ${session.messages.length})`);
        const startTime = Date.now();

        const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal,
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
          const status = response.status;
          const errBody = await response.text();
          if (status === 400) telemetry.increment('HTTP400');
          if (status === 429) { telemetry.increment('HTTP429'); telemetry.increment('rateLimit429Count'); }

          if (status === 400) {
            const error = new Error(`API HTTP 400: ${errBody}`);
            error.httpStatus = 400;
            try { error.retryable = JSON.parse(errBody)?.error?.retryable === true; } catch {}
            throw error;
          }

          // Ошибки авторизации не имеют смысла для повтора
          if (status === 401 || status === 403) {
            throw new Error(`Ошибка авторизации API (${status}): ${errBody}`);
          }

          // 429 означает перегрузку: короткая пауза вместо долгого блока
          if (status === 429) {
            this.cooldownUntil = Date.now() + 5000; // 5 секунд вместо 30
            const error = new Error(`API HTTP 429: ${errBody}`);
            error.httpStatus = 429;
            error.retryable = false;
            throw error;
          }

          // 5xx — ограниченно повторяем с задержкой.
          if (status >= 500 && status < 600) {
            const isLast = attempt === this.maxRetries;
            const waitMs = Math.min(10000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
            logger.warn(`API вернул статус ${status} (${elapsed}ms). ${isLast ? 'Попытки исчерпаны.' : `Повтор через ${Math.round(waitMs)}ms...`}`);

            if (!isLast) {
              await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, waitMs);
                signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
              });
              continue;
            }
          }

          throw new Error(`API HTTP ${status}: ${errBody}`);
        }

        const data = await response.json();
        logger.debug(`[API RESPONSE] Получен ответ (${elapsed}ms)`);

        return this._parseChatResponse(session, data);
      } catch (err) {
        lastError = err;
        if (err.httpStatus === 400 || err.retryable === false || signal?.aborted) throw err;
        if (err instanceof TypeError || /fetch failed|network|econnreset|enotfound/i.test(err.message || '')) {
          this.cooldownUntil = Date.now() + 5000; // 5 секунд вместо 30
          err.retryable = false;
          throw err;
        }
        if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.includes('timeout')) {
          logger.warn(`Таймаут запроса к API (${this.timeoutMs}ms) на попытке ${attempt + 1}`);
          // A provider timeout already consumed the full request budget. Retrying
          // immediately would multiply 35s stalls and keep every agent waiting.
          err.retryable = false;
          throw err;
        }
        if (err.message.includes('авторизации')) {
          throw err;
        }
      }
    }

    logger.error(`Все ${this.maxRetries + 1} попыток запроса к API завершились ошибкой: ${lastError?.message}`);
    throw lastError;
  }

  /**
   * Парсинг ответа Chat Completion и обновление истории сообщений
   * @private
   */
  _parseChatResponse(session, data) {
    const choice = data?.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error(`Некорректная структура ответа API: ${JSON.stringify(data).substring(0, 300)}`);
    }

    const assistantMsg = choice.message;
    session.messages.push(assistantMsg);

    const text = assistantMsg.content || '';
    const toolCalls = [];
    session.lastPendingToolCalls = [];

    if (assistantMsg.tool_calls && Array.isArray(assistantMsg.tool_calls)) {
      for (const tc of assistantMsg.tool_calls) {
        let parsedArgs = {};
        if (typeof tc.function?.arguments === 'string') {
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch (e) {
            logger.warn(`Не удалось распарсить JSON аргументы для инструмента ${tc.function.name}: ${tc.function.arguments}`);
          }
        } else if (typeof tc.function?.arguments === 'object' && tc.function.arguments !== null) {
          parsedArgs = tc.function.arguments;
        }

        const toolName = tc.function?.name || 'unknown_tool';
        const toolId = tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        toolCalls.push({
          id: toolId,
          name: toolName,
          args: parsedArgs,
        });

        session.lastPendingToolCalls.push({
          id: toolId,
          name: toolName,
        });
      }
    }

    if (text) {
      logger.debug(`Текстовый ответ (${text.length} симв.): "${text.substring(0, 100).replace(/\n/g, ' ')}"`);
    }
    if (toolCalls.length > 0) {
      logger.info(`Вызов инструментов (${toolCalls.length}): ${toolCalls.map(t => t.name).join(', ')}`);
    }

    return {
      text,
      toolCalls,
      raw: data,
    };
  }

  /**
   * Fetch с таймаутом через AbortController
   * @private
   */
  _trimMessages(messages) {
    if (!Array.isArray(messages) || messages.length <= this.maxContextMessages) return messages;
    const system = messages.find((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m !== system);
    const budget = Math.max(1, this.maxContextMessages - (system ? 1 : 0));
    let start = Math.max(0, nonSystem.length - budget);
    // Keep tool results paired with the preceding assistant tool-call message.
    while (start > 0 && nonSystem[start]?.role === 'tool') start--;
    const tail = nonSystem.slice(start);
    return system ? [system, ...tail] : tail;
  }

  _enrichRussianPrompt(systemPrompt, context = {}) {
    const base = String(systemPrompt || '').trim();
    const lines = [
      'Говори по-русски естественно, как живой товарищ по компании.',
      'Не отвечай автоматически на каждую реплику: иногда уместнее промолчать или ответить коротко.',
      'Не используй служебные метки, списки команд и канцелярит. Не утверждай, что действие выполнено, если нет результата инструмента.',
      'Пиши современно и по-человечески: короткие разговорные фразы, нормальный русский чат, без «выполняю задачу», «принято», «успешно завершено», «готов к работе» и без отчётов NPC.',
    ];
    if (context.personality) lines.push(`Твои черты характера: ${context.personality}`);
    if (context.emotionalState) lines.push(`Твоё текущее настроение (оно может меняться): ${context.emotionalState}`);
    if (context.socialContext) lines.push(`Что происходит между друзьями сейчас: ${context.socialContext}`);
    return [base, lines.join('\n')].filter(Boolean).join('\n\n');
  }

  async _fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const externalSignal = options.signal;
    const abortExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener('abort', abortExternal, { once: true });

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut && !externalSignal?.aborted && error?.name === 'AbortError') {
        error.name = 'TimeoutError';
        error.message = `API request timeout (${this.timeoutMs}ms)`;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortExternal);
    }
  }

  _throwIfAborted(signal) {
    if (signal?.aborted) {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      throw error;
    }
  }
}
