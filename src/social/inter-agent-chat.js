import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('INTER_AGENT_CHAT');

export class InterAgentChat {
  /**
   * @param {Object} options
   * @param {Map<string, Object>} options.agents - Map of agentName -> { bot, personality }
   * @param {Object} options.conversationManager - ConversationManager instance
   */
  constructor({ agents, conversationManager }) {
    this.agents = agents;
    this.conversationManager = conversationManager;
    
    // Map of agentName -> timeout object for their current typing
    this.typingTasks = new Map();
    
    // History of all messages
    this.history = [];
    
    // Listeners for message events
    this.listeners = [];
  }

  /**
   * Sends a message with human-like typing delay.
   * @param {string} agentName 
   * @param {string} message 
   * @param {Object} [options]
   * @param {string} [options.target] - null, 'whisper:Name', 'nearby'
   * @returns {Promise<boolean>} - True if sent, false if interrupted/failed
   */
  async sendMessage(agentName, message, options = {}) {
    const agent = this.agents.get(agentName);
    const bot = agent?.bot || agent?.mcBot?.bot;
    if (!agent || !bot) {
      logger.error(`Агент ${agentName} не найден или бот не инициализирован.`);
      return false;
    }

    if (this.isTyping(agentName)) {
      this.interruptTyping(agentName);
    }

    const { personality } = agent;
    const { target } = options;
    
    // Calculate typing delay
    // talkativeness: 0.0-1.0. Higher talkativeness = faster typing
    const talkativeness = personality?.talkativeness ?? 0.5;
    const baseCharDelay = 80 - (talkativeness * 40); // 40ms to 80ms per char
    
    let delay = message.length * baseCharDelay;
    
    // Add jitter (±20%)
    const jitter = delay * 0.2;
    delay = delay + HumanErrorEngine.jitter(jitter);
    
    // Clamp between 500ms and 8000ms
    delay = Math.max(500, Math.min(8000, delay));

    logger.debug(`Агент ${agentName} начал печатать: "${message}" (задержка: ${Math.round(delay)}мс)`);

    return new Promise((resolve) => {
      // Set agent state to 'typing'
      if (bot.state) {
        bot.state = 'typing';
      }

      const timeout = setTimeout(() => {
        this.typingTasks.delete(agentName);
        if (bot.state === 'typing') {
          bot.state = 'idle';
        }
        
        this._executeSend(bot, agentName, message, target);
        resolve(true);
      }, delay);

      this.typingTasks.set(agentName, {
        timeout,
        resolve
      });
    });
  }

  /**
   * Send a message immediately without typing delay (for emergencies).
   * @param {string} agentName 
   * @param {string} message 
   * @param {Object} [options]
   * @param {string} [options.target] - null, 'whisper:Name', 'nearby'
   */
  sendImmediate(agentName, message, options = {}) {
    const agent = this.agents.get(agentName);
    const bot = agent?.bot || agent?.mcBot?.bot;
    if (!agent || !bot) return;

    if (this.isTyping(agentName)) {
      this.interruptTyping(agentName);
    }

    logger.warn(`Агент ${agentName} отправляет ЭКСТРЕННОЕ сообщение: "${message}"`);
    this._executeSend(bot, agentName, message, options.target || null);
  }

  /**
   * Internal method to actually execute the chat command
   */
  _executeSend(bot, agentName, message, target) {
    const timestamp = Date.now();
    let actualMessage = message;

    if (target) {
      if (target.startsWith('whisper:')) {
        const targetName = target.split(':')[1];
        actualMessage = `/msg ${targetName} ${message}`;
      } else if (target === 'nearby') {
        actualMessage = `[Рядом] ${message}`;
      }
    }

    try {
      bot.chat(actualMessage);
      
      const msgObj = {
        sender: agentName,
        message,
        target,
        timestamp
      };
      
      this.history.push(msgObj);
      if (this.history.length > 500) this.history.shift();
      
      // Notify conversation manager
      if (this.conversationManager) {
        this.conversationManager.registerMessage(agentName, message, timestamp);
      }

      // Notify listeners
      for (const listener of this.listeners) {
        listener(msgObj);
      }

    } catch (err) {
      logger.error(`Ошибка при отправке сообщения агентом ${agentName}: ${err.message}`);
    }
  }

  /**
   * Cancel pending typing for an agent
   * @param {string} agentName 
   */
  interruptTyping(agentName) {
    const task = this.typingTasks.get(agentName);
    if (task) {
      clearTimeout(task.timeout);
      task.resolve(false);
      this.typingTasks.delete(agentName);
      
      const agent = this.agents.get(agentName);
      const bot = agent?.bot || agent?.mcBot?.bot;
      if (bot && bot.state === 'typing') {
        bot.state = 'idle';
      }
      
      logger.debug(`Набор текста агентом ${agentName} был прерван.`);
    }
  }

  /**
   * Check if an agent is currently typing
   * @param {string} agentName 
   * @returns {boolean}
   */
  isTyping(agentName) {
    return this.typingTasks.has(agentName);
  }

  /**
   * Get the name of the currently typing agent (if any).
   * If multiple are typing, returns the first one found.
   * @returns {string|null}
   */
  getTypingAgent() {
    if (this.typingTasks.size === 0) return null;
    return this.typingTasks.keys().next().value;
  }

  /**
   * Register a listener for sent messages
   * @param {Function} callback 
   */
  onMessage(callback) {
    this.listeners.push(callback);
  }

  /**
   * Get the last N messages
   * @param {number} count 
   * @returns {Array}
   */
  getRecentMessages(count) {
    return this.history.slice(-count);
  }
}
