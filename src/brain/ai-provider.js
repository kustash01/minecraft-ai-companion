/**
 * Abstract AI Provider interface.
 * All AI providers (Gemini, OpenAI, etc.) must implement this interface.
 * This ensures Minecraft logic is completely decoupled from AI implementation.
 */
export class AIProvider {
  constructor(config) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Create a new chat session with tool definitions.
   * @param {object} options - { systemPrompt, tools, history, signal }
   * @returns {Promise<any>} Provider-specific chat session
   */
  async createChat(options = {}) { throw new Error('Not implemented'); }

  /**
   * Send a message and get response with possible tool calls.
   * @param {any} session - Chat session
   * @param {string} message - User message
   * @param {{signal?: AbortSignal}} [options] - Optional cancellation signal
   * @returns {Promise<{text: string, toolCalls: Array<{name: string, args: object}>, raw: any}>}
   */
  async sendMessage(session, message, options = {}) { throw new Error('Not implemented'); }

  /**
   * Send tool execution results back to the AI.
   * @param {any} session - Chat session  
   * @param {Array<{name: string, result: any}>} results - Tool execution results
   * @returns {Promise<{text: string, toolCalls: Array<{name: string, args: object}>, raw: any}>}
   */
  async sendToolResults(session, results, options = {}) { throw new Error('Not implemented'); }

  /**
   * Generate one-off text response without multi-turn tools.
   * @param {string|object} promptOrOptions - User prompt string or options object
   * @param {object} [options] - Additional options ({ systemPrompt, temperature, maxTokens, stopSequences, signal })
   * @returns {Promise<string>}
   */
  async generateText(promptOrOptions, options = {}) { throw new Error('Not implemented'); }

  /** Get provider name */
  get name() { throw new Error('Not implemented'); }
}

