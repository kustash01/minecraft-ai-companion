import { createLogger } from '../utils/logger.js';
import { validateToolCall } from './tool-validator.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { LoopDetector } from '../safety/loop-detector.js';
import { getSystemPrompt } from '../../config/personality.js';
import { telemetry } from '../utils/telemetry.js';

const logger = createLogger('AI');

export const AgentAIState = {
  IDLE: 'IDLE',
  THINKING: 'THINKING',
  WAITING_API: 'WAITING_API',
  EXECUTING: 'EXECUTING',
  LOCAL_MODE: 'LOCAL_MODE',
  RECOVERING: 'RECOVERING',
};

/**
 * AI Brain — главный оркестратор AI-мозга с контролем жизненного цикла,
 * отменой запросов (AbortController) и строгим инвариантом activeRequests <= 1.
 */
export class AIBrain {
  constructor(config, toolRegistry, contextManager, provider, memoryManager = null, options = {}) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.contextManager = contextManager;
    this.provider = provider;
    this.memoryManager = memoryManager;
    this.budgetManager = options.budgetManager || null;
    this.agentName = options.agentName || 'unknown';
    this.actionAdmission = options.actionAdmission || null;
    this.session = null;
    this.maxIterations = 10;
    this.processTimeout = 25000; // 25 секунд макс таймаут
    this.isProcessing = false;
    this.activeRequests = 0;
    this.state = AgentAIState.IDLE;
    this.currentAbortController = null;
    this.telemetryRequestController = null;
    this.localModeUntil = 0;
    this.localModeCooldownMs = config?.ai?.localModeCooldownMs ?? 30000;
    this.loopDetector = new LoopDetector(4);

    const maxRequests = config?.ai?.rateLimit?.maxRequests ?? 10;
    const windowMs = config?.ai?.rateLimit?.windowMs ?? 60000;
    this.rateLimiter = new RateLimiter(maxRequests, windowMs);

    logger.info('AI Brain инициализирован (State: IDLE, activeRequests: 0)');
  }

  getState() {
    return this.state;
  }

  /**
   * Принудительная отмена текущего AI-запроса (например, при поступлении экстренной команды игрока)
   */
  cancelActiveRequest(reason = 'Cancelled by system') {
    const hadActive = this.activeRequests > 0 || this.isProcessing;
    if (this.currentAbortController) {
      logger.warn(`[AI CANCEL] Отмена активного запроса: ${reason}`);
      this.currentAbortController.abort();
      if (hadActive) telemetry.increment('cancelledRequests');
    }
    if (hadActive || /unresponsive/i.test(reason)) {
      this.state = AgentAIState.LOCAL_MODE;
      this.localModeUntil = Date.now() + this.localModeCooldownMs;
      telemetry.enterLocalMode(this.agentName);
      if (hadActive) {
        this.activeRequests = 0;
        this.isProcessing = false;
        if (this.telemetryRequestController === this.currentAbortController) {
          telemetry.decrement('activeLLMRequests');
          telemetry.decrement('activeRequests');
          this.telemetryRequestController = null;
        }
        this.currentAbortController = null;
      }
    }
  }

  /**
   * Главная точка входа — обработка сообщения пользователя.
   * @param {string} message — сообщение от игрока
   * @param {object} worldState — текущее состояние мира
   * @param {string} [currentTask] — текущая задача (опционально)
   * @returns {Promise<string>} — ответ AI
   */
  async processMessage(message, worldState, currentTask = null) {
    // Прямое обращение игрока всегда прерывает тишину и выводит из local mode
    this.state = AgentAIState.IDLE;
    this.localModeUntil = 0;
    telemetry.leaveLocalMode(this.agentName);
    // ЖЁСТКИЙ ИНВАРИАНТ: activeRequests <= 1
    if (this.activeRequests >= 1) {
      logger.warn(`[AI REJECT] Запрос отклонён: активен другой запрос (State: ${this.state}, activeRequests: ${this.activeRequests})`);
      return 'Подожди, я ещё думаю над предыдущим запросом...';
    }

    this.activeRequests = 1;
    this.isProcessing = true;
    this.state = AgentAIState.THINKING;
    this.currentAbortController = new AbortController();
    const requestController = this.currentAbortController;

    telemetry.increment('totalLLMCalls');

    let budgetGranted = false;
    if (this.budgetManager) {
      budgetGranted = await this.budgetManager.requestSlot(this.agentName, 'event_driven', 'message', {
        signal: requestController.signal,
      });
      if (!budgetGranted) {
        this.state = AgentAIState.LOCAL_MODE;
        this.localModeUntil = Date.now() + this.localModeCooldownMs;
        telemetry.enterLocalMode(this.agentName);
        this.activeRequests = 0;
        this.isProcessing = false;
        return null;
      }
    }

    telemetry.increment('activeLLMRequests');
    telemetry.increment('activeRequests');
    this.telemetryRequestController = requestController;

    const startTime = Date.now();
    logger.info(`[ЗАПРОС] "${message}"`);

    try {
      const response = await this._processWithTimeout(
        this._processInternal(message, worldState, currentTask, requestController.signal),
        this.processTimeout,
        requestController.signal,
        requestController
      );

      this.state = AgentAIState.IDLE;
      this.localModeUntil = 0;
      telemetry.leaveLocalMode(this.agentName);
      telemetry.increment('successfulLLMCalls');
      telemetry.increment('completedRequests');
      telemetry.recordChatLatency(Date.now() - startTime);

      return response;
    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('отменён') || error.message.includes('Cancelled')) {
        logger.warn(`Запрос к AI был успешно отменён: ${error.message}`);
        this.session = null;
        this.state = AgentAIState.LOCAL_MODE;
        this.localModeUntil = Date.now() + this.localModeCooldownMs;
        return null;
      }

      if (error.name === 'TimeoutError' || error.message.includes('таймаут') || error.message.includes('timeout')) {
        telemetry.increment('timedOutRequests');
        telemetry.increment('timeouts');
        this.state = AgentAIState.LOCAL_MODE;
        this.session = null;
        this.localModeUntil = Date.now() + this.localModeCooldownMs;
        telemetry.enterLocalMode(this.agentName);
        logger.warn(`[AI TIMEOUT] Истёк таймаут ответа (${this.processTimeout}ms), переключаюсь в LOCAL_MODE`);
        return null;
      }

      logger.error(`Ошибка обработки сообщения: ${error.message}`);
      this.session = null;
      this.state = AgentAIState.LOCAL_MODE;
      this.localModeUntil = Date.now() + this.localModeCooldownMs;
      telemetry.enterLocalMode(this.agentName);
      return null;
    } finally {
      if (this.budgetManager && budgetGranted) this.budgetManager.releaseSlot(this.agentName);
      // Only the owning request may clear the in-flight state (prevents stale requests
      // completing after cancellation from corrupting a newer request's counters).
      if (this.currentAbortController === requestController) {
        this.activeRequests = 0;
        this.isProcessing = false;
        this.currentAbortController = null;
        if (this.telemetryRequestController === requestController) {
          telemetry.decrement('activeLLMRequests');
          telemetry.decrement('activeRequests');
          this.telemetryRequestController = null;
        }
      }
    }
  }

  /**
   * Обёртка таймаута с поддержкой AbortSignal
   * @private
   */
  _processWithTimeout(promise, timeoutMs, abortSignal, requestController = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        fn(value);
      };

      const timer = setTimeout(() => {
        requestController?.abort();
        const error = new Error(`Время обработки AI истекло (${timeoutMs / 1000} секунд)`);
        error.name = 'TimeoutError';
        settle(reject, error);
      }, timeoutMs);

      const onAbort = () => {
        const error = new Error('Запрос к AI был отменён');
        error.name = 'AbortError';
        settle(reject, error);
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener('abort', onAbort);
      }

      promise
        .then((res) => settle(resolve, res))
        .catch((err) => settle(reject, err));
    });
  }

  _maybeLeaveLocalMode() {
    if (
      this.state === AgentAIState.LOCAL_MODE &&
      !this.isProcessing &&
      this.localModeUntil > 0 &&
      Date.now() >= this.localModeUntil
    ) {
      this.state = AgentAIState.IDLE;
      this.localModeUntil = 0;
      telemetry.leaveLocalMode(this.agentName);
    }
  }

  /**
   * Внутренняя обработка с function calling loop.
   */
  async _processInternal(message, worldState, currentTask, abortSignal = null) {
    // Ждём слот rate limiter
    await this.rateLimiter.waitForSlot(abortSignal);

    // Строим контекст с учётом состояния мира и памяти
    const context = this.contextManager.buildContext(
      worldState,
      currentTask,
      [],
      this.memoryManager
    );
    const fullMessage = context ? `${context}\n\n${message}` : message;

    // Создаём/переиспользуем сессию
    if (!this.session) {
      const tools = this.toolRegistry.getFunctionDeclarations();
      const systemPrompt = getSystemPrompt(this.config);

      this.session = await this.provider.createChat({
        systemPrompt,
        tools,
      });
      logger.info('Новая AI-сессия создана');
    }

    this.state = AgentAIState.WAITING_API;
    // Отправляем сообщение
    let response = await this.provider.sendMessage(this.session, fullMessage, { signal: abortSignal });
    let iteration = 0;

    // Function calling loop
    while (response.toolCalls && response.toolCalls.length > 0 && iteration < this.maxIterations) {
      iteration++;
      this.state = AgentAIState.EXECUTING;
      logger.info(`[TOOL LOOP] Итерация ${iteration}/${this.maxIterations}: вызовы [${response.toolCalls.map(tc => tc.name).join(', ')}]`);

      const toolResults = [];

      for (const tc of response.toolCalls) {
        if (this.actionAdmission && !this.actionAdmission()) {
          toolResults.push({
            id: tc.id,
            name: tc.name,
            result: {
              success: false,
              code: 'ACTION_UNAVAILABLE_PHASE1',
              error: 'Gameplay tools are temporarily unavailable during the actuator-safety rollout.',
            },
          });
          continue;
        }
        if (this.loopDetector.recordAndCheck(tc.name, tc.args || {})) {
          telemetry.increment('repeatedActionCount');
          toolResults.push({
            id: tc.id,
            name: tc.name,
            result: {
              success: false,
              error: `Вызов ${tc.name} повторяется без изменений. Измени параметры или выбери другой подход.`,
            },
          });
          continue;
        }

        const toolDef = this.toolRegistry.get(tc.name);
        const validation = validateToolCall(toolDef, tc.args || {});
        if (!validation.valid) {
          logger.warn(`Валидация не прошла для ${tc.name}: ${validation.errors.join(', ')}`);
          toolResults.push({
            id: tc.id,
            name: tc.name,
            result: { success: false, error: `Ошибка валидации: ${validation.errors.join(', ')}` },
          });
          continue;
        }

        try {
          logger.info(`[ACTION] Выполняю: ${tc.name}(${JSON.stringify(tc.args)})`);
          const result = await this.toolRegistry.execute(tc.name, tc.args || {});
          toolResults.push({ id: tc.id, name: tc.name, result });
        } catch (error) {
          logger.error(`[ACTION] Ошибка ${tc.name}: ${error.message}`);
          toolResults.push({
            id: tc.id,
            name: tc.name,
            result: { success: false, error: error.message },
          });
        }
      }

      // Отправляем результаты обратно AI
      await this.rateLimiter.waitForSlot(abortSignal);
      this.state = AgentAIState.WAITING_API;
      response = await this.provider.sendToolResults(this.session, toolResults, { signal: abortSignal });
    }

    if (iteration >= this.maxIterations) {
      logger.warn('Достигнут лимит итераций function calling');
      return 'Я выполнил слишком много действий подряд и решил остановиться. Скажи, что делать дальше.';
    }

    let reply = (response.text || '').trim();

    // Не навязываем заглавную букву и не затыкаем тишину шаблонным «Понял!».
    // Если модель уже отработала действиями и молчит — молчание естественнее
    // фальшивого подтверждения. Пустой ответ вернём как пустую строку, чтобы
    // вызывающий код сам решил (обычно — промолчать).
    logger.info(`[ОТВЕТ] "${reply.substring(0, 200)}"`);

    this.contextManager.addToHistory('user', message);
    if (reply.length > 0) this.contextManager.addToHistory('bot', reply);

    return reply;
  }

  /**
   * Быстрый одиночный запрос к LLM для короткой живой реплики — без function
   * calling, без сессии, с низким таймаутом. Используется генераторами речи
   * (ResponseGenerator и др.), чтобы НЕ падать в шаблонные фразы.
   *
   * @param {string} prompt — готовый промпт
   * @param {object} options — { maxTokens, temperature, stopSequences, systemPrompt, timeoutMs }
   * @returns {Promise<{text: string}>}
   */
  async generateQuickResponse(prompt, options = {}) {
    if (!this.provider?.generateText) {
      return { text: '' };
    }

    const timeoutMs = options.timeoutMs ?? 1500;
    const call = this.provider.generateText({
      systemPrompt: options.systemPrompt || '',
      userPrompt: prompt,
      temperature: options.temperature ?? 0.9,
      maxTokens: options.maxTokens ?? 30,
      stopSequences: options.stopSequences,
    });

    try {
      const text = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('quick response timeout')), timeoutMs);
        call.then(
          (v) => { clearTimeout(t); resolve(v); },
          (e) => { clearTimeout(t); reject(e); }
        );
      });
      return { text: String(text || '').trim() };
    } catch (err) {
      logger.debug(`generateQuickResponse не удался: ${err.message}`);
      return { text: '' };
    }
  }

  /**
   * Сброс AI-сессии (например, при смене контекста).
   */
  resetSession() {
    this.session = null;
    this.loopDetector.reset();
    logger.info('AI-сессия сброшена');
  }

  /**
   * Остановка текущей обработки.
   */
  stop() {
    this.cancelActiveRequest('AIBrain stop called');
    this.loopDetector.reset();
    logger.info('AI Brain остановлен');
  }
}
