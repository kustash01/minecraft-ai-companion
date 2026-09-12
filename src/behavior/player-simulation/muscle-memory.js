import logger from '../../utils/logger.js';

export class MuscleMemoryEngine {
  constructor() {
    this.sequences = new Map();
    this.executionHistory = [];
  }

  /**
   * Register a habituated action sequence.
   * @param {string} name - e.g. 'quick_chest_deposit', 'quick_craft_torches'
   * @param {Function} executionFn
   */
  registerSequence(name, executionFn) {
    this.sequences.set(name, executionFn);
  }

  /**
   * Execute habituated muscle memory sequence locally with zero LLM overhead.
   */
  async executeHabit(name, context = {}) {
    const fn = this.sequences.get(name);
    if (!fn) {
      return { success: false, error: `Unknown habit: ${name}` };
    }

    const start = Date.now();
    try {
      logger.debug(`[MUSCLE-MEMORY] Executing habituated sequence: ${name}`);
      const result = await fn(context);
      const durationMs = Date.now() - start;

      this.executionHistory.push({ name, durationMs, success: true, timestamp: start });
      if (this.executionHistory.length > 50) this.executionHistory.shift();

      return { success: true, durationMs, result };
    } catch (err) {
      logger.warn(`[MUSCLE-MEMORY] Failed sequence ${name}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  hasHabit(name) {
    return this.sequences.has(name);
  }
}

export const muscleMemory = new MuscleMemoryEngine();
