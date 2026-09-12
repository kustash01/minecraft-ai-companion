import { createLogger } from '../utils/logger.js';
import { validateToolCall } from '../brain/tool-validator.js';

const logger = createLogger('LOCAL_VISION');

export class LocalVisionController {
  static requestQueue = Promise.resolve();

  constructor({ agent, provider, observer, toolRegistry, config }) {
    this.agent = agent;
    this.provider = provider;
    this.observer = observer;
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.busy = false;
    this.lastDecision = null;
    this.lastRun = 0;
  }

  get enabled() {
    // Unit/integration tests use synthetic bots and must never call a user's local service.
    return !process.env.VITEST && process.env.NODE_ENV !== 'test' && this.config?.ai?.localVision?.enabled !== false;
  }

  async tick() {
    const bot = this.agent.bot;
    if (!this.enabled || !bot?.entity || this.busy) return;
    const interval = this.config?.ai?.localVision?.intervalMs ?? 2500;
    if (Date.now() - this.lastRun < interval) return;
    this.lastRun = Date.now();
    this.busy = true;
    try {
      const frame = this.observer.observe(bot);
      const observation = this.observer.describe(frame);
      const raw = await this._askLocalModel(observation, [
        'Ты непрерывный локальный мозг игрока Minecraft.',
        'Оцени полный вид от первого лица, состояние игрока и ближайшие сущности.',
        'Выбери ровно одно безопасное действие. Если текущая задача уже выполняется, продолжай ее.',
        'Ответ только JSON: {"tool":"название инструмента или null","args":{},"reason":"кратко"}.',
        'Не выбирай неизвестные инструменты, не стой без причины и не делай действие, если есть опасность.',
      ].join('\n'));
      const decision = this._parse(raw);
      this.lastDecision = decision;
      if (decision?.tool) await this._execute(decision);
    } catch (error) {
      logger.warn(`[${this.agent.name}] локальный vision-контур: ${error.message}`);
    } finally {
      this.busy = false;
    }
  }

  async _askLocalModel(observation, prompt) {
    const vision = this.config?.ai?.localVision || {};
    const endpoint = (vision.endpoint || 'http://127.0.0.1:11434/api/chat').replace(/\/$/, '');
    const request = async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: vision.model || 'qwen2.5:3b',
          stream: false,
          format: 'json',
          options: { temperature: 0.35, num_predict: 180 },
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: observation }],
        }),
        signal: AbortSignal.timeout(vision.timeoutMs || 12000),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      return data?.message?.content || data?.response || '';
    };

    // A single local model generally cannot serve six useful decisions in parallel.
    const queued = LocalVisionController.requestQueue.then(request, request);
    LocalVisionController.requestQueue = queued.catch(() => {});
    return queued;
  }

  _parse(raw) {
    const text = String(raw || '').replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    try { return JSON.parse(text); } catch { return null; }
  }

  async _execute(decision) {
    if (this.agent?.canStartNormalToolAction?.() !== true) return;
    if (!this._isAllowedTool(decision.tool)) return;
    const definition = this.toolRegistry.get(decision.tool);
    const validation = validateToolCall(definition, decision.args || {});
    if (!validation.valid) return;
    logger.info(`[${this.agent.name}] local vision action: ${decision.tool}`);
    await this.toolRegistry.execute(decision.tool, decision.args || {});
    this.agent.currentTask = decision.tool;
    this.agent.recovery.recordAction(`local-vision:${decision.tool}`);
  }

  _isAllowedTool(name) {
    const allowed = this.config?.ai?.localVision?.allowedTools;
    return !Array.isArray(allowed) || allowed.includes(name);
  }
}
