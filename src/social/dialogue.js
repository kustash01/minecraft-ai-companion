import logger from '../utils/logger.js';

export const TalkMode = {
  SILENT: 'silent',       // Actions speak louder than words; only reports critical errors
  BRIEF: 'brief',         // 1-5 word concise confirmations ("Понял", "Иду", "Сделал")
  NORMAL: 'normal',       // Balanced natural companion responses
  CHATTY: 'chatty',       // Frequently comments, shares thoughts, asks questions
  IMMERSIVE: 'immersive', // Roleplay flavor, in-depth descriptive thoughts
};

export class DialogueManager {
  constructor(mode = TalkMode.NORMAL) {
    this.mode = mode;
    this.lastMessageTime = 0;
    this.minCooldownMs = 3000;
  }

  setMode(mode) {
    if (Object.values(TalkMode).includes(mode)) {
      this.mode = mode;
      logger.info(`[DIALOGUE] Talk mode set to ${mode}`);
    }
  }

  /**
   * Resolve spatial and contextual references in user input.
   * e.g. "тот сундук", "эта пещера", "наша база", "сюда", "там".
   */
  resolveReferences(message, worldState, memoryManager = null) {
    let resolved = message;

    if (message.includes('сюда') || message.includes('здесь')) {
      if (worldState?.playerEntity?.position) {
        const p = worldState.playerEntity.position;
        resolved += ` [контекст: координаты игрока X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}]`;
      }
    }

    if (message.includes('наша база') || message.includes('базу') || message.includes('домой')) {
      if (memoryManager) {
        const basePoi = memoryManager.getPOI('base') || memoryManager.getPOI('home');
        if (basePoi) {
          resolved += ` [контекст: координаты базы X:${basePoi.x} Y:${basePoi.y} Z:${basePoi.z}]`;
        }
      }
    }

    return resolved;
  }

  /**
   * Determine if the bot should speak autonomously (cooldown & importance check).
   */
  shouldSpeakAutonomously(importanceScore = 0.5) {
    if (this.mode === TalkMode.SILENT) return false;
    const now = Date.now();
    const cooldown = this.mode === TalkMode.CHATTY ? 3000 : (this.mode === TalkMode.BRIEF ? 10000 : 6000);

    if (now - this.lastMessageTime < cooldown && importanceScore < 0.8) {
      return false; // Silence is a valid action
    }

    this.lastMessageTime = now;
    return true;
  }
}

export const dialogueManager = new DialogueManager();
