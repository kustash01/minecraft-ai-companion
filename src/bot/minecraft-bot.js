import mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
import { loadPlugins } from './plugins.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BOT');

/**
 * MinecraftBot — обёртка над mineflayer для подключения к серверу.
 */
export class MinecraftBot extends EventEmitter {
  constructor(config, capabilities = {}) {
    super();
    this.config = config;
    this.capabilities = Object.freeze({ ...capabilities });
    this.bot = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectWait = 5000;
    this.connected = false;
    this.stopping = false;
    this.connectionToken = 0;
    this.reconnectTimer = null;
    this.attemptListeners = new WeakMap();
    this.lossEmitted = new WeakSet();
  }

  /**
   * Подключение к серверу. Возвращает Promise, который резолвится при spawn.
   */
  connect() {
    this.stopping = false;
    const generation = ++this.connectionToken;
    return new Promise((resolve, reject) => {
      const mc = this.config.minecraft;
      logger.info(`Подключение к ${mc.host}:${mc.port} как ${mc.username} (v${mc.version})...`);

      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve({ status: 'connected', generation, bot });
      };
      const isCurrent = () => generation === this.connectionToken && this.bot === bot;
      let bot;
      const listeners = [];
      const listen = (event, handler, once = false) => {
        listeners.push([event, handler]);
        if (once) bot.once(event, handler); else bot.on(event, handler);
      };
      const timeout = setTimeout(() => {
        if (!settled) {
          const error = new Error('Minecraft connection timed out after 15000ms');
          error.code = 'CONNECT_TIMEOUT';
          finish(error);
          this._failAttempt(bot, generation, error);
        }
      }, 15000);
      try {
        const host = mc.host || 'localhost';
        const botOptions = {
          host,
          port: mc.port || 25565,
          username: mc.username || 'GeminiBot',
          auth: 'offline',
        };

        if (mc.version && mc.version !== 'auto') {
          botOptions.version = mc.version;
        }

        bot = mineflayer.createBot(botOptions);
        this.bot = bot;
        this.attemptListeners.set(bot, listeners);

        let spawned = false;
        listen('spawn', () => {
          if (!isCurrent()) return;
          if (spawned) {
            this.emit('respawn', { generation, bot: this.bot });
            return;
          }
          spawned = true;
          logger.info('✅ Бот заспавнился в мире!');
          const plugins = loadPlugins(this.bot, this.capabilities);
          if (!plugins.ready) {
            const error = new Error(`Minecraft plugin initialization failed: ${plugins.failures.map((failure) => failure.name).join(', ')}`);
            error.code = 'PLUGIN_INITIALIZATION_FAILED';
            error.failures = plugins.failures;
            finish(error);
            this._failAttempt(bot, generation, error, 'plugin_initialization');
            return;
          }
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('spawn', { generation, bot: this.bot });
          finish();
        });

        listen('death', () => {
          if (!isCurrent()) return;
          logger.warn('💀 Бот погиб!');
          this.emit('death', { generation, bot: this.bot });
        });

        listen('kicked', (reason) => {
          if (!isCurrent()) return;
          logger.warn(`Бот кикнут: ${typeof reason === 'object' ? JSON.stringify(reason) : reason}`);
          this.emit('kicked', { generation, reason });
          const error = new Error(`Minecraft bot kicked: ${String(reason)}`);
          finish(error);
          this._failAttempt(bot, generation, error, 'kicked');
        });

        listen('error', (err) => {
          if (!isCurrent()) return;
          const errMsg = err.message || err.code || (err.errors ? err.errors.map(e => e.message).join('; ') : err);
          logger.warn(`[BOT] Сетевая ошибка подключения к Minecraft: ${errMsg}`);
          this.emit('connectionError', err);
          if (!this.connected) {
            finish(err);
            this._failAttempt(bot, generation, err, 'error');
          }
        });

        listen('end', (reason) => {
          if (!isCurrent()) return;
          logger.warn(`Соединение разорвано: ${reason}`);
          this.emit('end', { generation, reason });
          const error = new Error(`Minecraft connection ended: ${String(reason)}`);
          finish(error);
          this._failAttempt(bot, generation, error, 'end');
        });

        listen('chat', (username, message) => {
          if (!isCurrent() || username === bot.username) return;
          this.emit('chat', username, message, generation);
        });

        listen('playerJoined', (player) => {
          if (!isCurrent()) return;
          logger.info(`Игрок зашёл: ${player.username}`);
          this.emit('playerJoined', player);
        });

        listen('playerLeft', (player) => {
          if (!isCurrent()) return;
          logger.info(`Игрок вышел: ${player.username}`);
          this.emit('playerLeft', player);
        });

        listen('entityDead', (entity) => {
          if (!isCurrent()) return;
          this.emit('entityDead', { generation, entity });
        });

      } catch (error) {
        logger.error(`Не удалось создать бота: ${error.message}`);
        finish(error);
        this._failAttempt(bot, generation, error);
      }
    });
  }

  _failAttempt(bot, generation, error, source = 'error') {
    if (generation !== this.connectionToken || this.bot !== bot) return;
    const wasConnected = this.connected;
    this._detachAttempt(bot);
    this.connected = false;
    this.bot = null;
    ++this.connectionToken;
    try { if (typeof bot?.quit === 'function') bot.quit(); } catch (_) {}
    if (!this.stopping) {
      if (wasConnected && !this.lossEmitted.has(bot)) {
        this.lossEmitted.add(bot);
        this.emit('connectionLost', {
          bot,
          generation,
          source,
          reason: error?.message || String(error || 'connection_lost'),
          error: error || null,
        });
      }
      this._handleDisconnect(this.connectionToken);
    }
  }

  handleBindingFailure({ bot, generation, error }) {
    const failure = error instanceof Error ? error : new Error(String(error || 'Agent readiness binding failed'));
    failure.code ||= 'AGENT_BINDING_FAILED';
    this._failAttempt(bot, generation, failure, 'agent_binding');
  }

  _detachAttempt(bot) {
    if (!bot?.removeListener) return;
    for (const [event, handler] of this.attemptListeners.get(bot) || []) {
      bot.removeListener(event, handler);
    }
    this.attemptListeners.delete(bot);
  }

  /**
   * Автоматическое переподключение.
   */
  _handleDisconnect(token = this.connectionToken) {
    if (this.stopping || token !== this.connectionToken || this.reconnectTimer) return;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Переподключение через ${this.reconnectWait / 1000}с (попытка ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.stopping && token === this.connectionToken) this.connect().catch(() => {});
      }, this.reconnectWait);
    } else {
      logger.error('Исчерпаны попытки переподключения.');
    }
  }

  /**
   * Отключение от сервера.
   */
  async forceDisconnect({ reason = 'shutdown', timeoutMs = 2000 } = {}) {
    this.stopping = true;
    ++this.connectionToken;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const bot = this.bot;
    this.connected = false;
    if (!bot || typeof bot.quit !== 'function') {
      this.bot = null;
      return { status: 'disconnected', reason };
    }
    const outcome = await new Promise((resolve) => {
      let settled = false;
      const onEnd = () => done('disconnected');
      const done = (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bot.removeListener?.('end', onEnd);
        resolve({ status, reason });
      };
      const timer = setTimeout(() => done('degraded'), timeoutMs);
      bot.once('end', onEnd);
      try { bot.quit(); } catch (_) { done('degraded'); }
    });
    this._detachAttempt(bot);
    if (this.bot === bot) this.bot = null;
    return outcome;
  }

  disconnect() {
    logger.info('Отключение бота...');
    return this.forceDisconnect({ reason: 'disconnect' });
  }

  isConnected() {
    return this.connected;
  }
}
