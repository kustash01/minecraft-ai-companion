import logger from '../utils/logger.js';

export class EmotionalStateEngine {
  constructor() {
    this.emotions = {
      curiosity: 0.6,
      confidence: 0.7,
      caution: 0.4,
      stress: 0.1,
      satisfaction: 0.5,
      frustration: 0.0,
      excitement: 0.4,
      trust: 0.8,
    };
    this.baseline = { ...this.emotions };
  }

  getMood() {
    return { ...this.emotions };
  }

  getState() {
    return this.getMood();
  }

  /**
   * Adjust emotion after receiving damage or encountering extreme danger.
   */
  onDamageTaken(damageAmount = 2) {
    this.emotions.stress = Math.min(1.0, this.emotions.stress + 0.25 * (damageAmount / 4));
    this.emotions.caution = Math.min(1.0, this.emotions.caution + 0.2);
    this.emotions.confidence = Math.max(0.1, this.emotions.confidence - 0.1);
    logger.debug(`[EMOTION] Damage taken -> stress: ${this.emotions.stress.toFixed(2)}, caution: ${this.emotions.caution.toFixed(2)}`);
  }

  /**
   * Adjust emotion after a successful mission or task completion.
   */
  onSuccess() {
    this.emotions.satisfaction = Math.min(1.0, this.emotions.satisfaction + 0.2);
    this.emotions.confidence = Math.min(1.0, this.emotions.confidence + 0.15);
    this.emotions.stress = Math.max(0.0, this.emotions.stress - 0.2);
    this.emotions.frustration = Math.max(0.0, this.emotions.frustration - 0.25);
    logger.debug(`[EMOTION] Task success -> confidence: ${this.emotions.confidence.toFixed(2)}, satisfaction: ${this.emotions.satisfaction.toFixed(2)}`);
  }

  /**
   * Adjust emotion after finding rare ores or discovering new structures.
   */
  onRareDiscovery() {
    this.emotions.excitement = Math.min(1.0, this.emotions.excitement + 0.35);
    this.emotions.curiosity = Math.min(1.0, this.emotions.curiosity + 0.2);
    this.emotions.satisfaction = Math.min(1.0, this.emotions.satisfaction + 0.2);
    logger.debug(`[EMOTION] Discovery -> excitement: ${this.emotions.excitement.toFixed(2)}`);
  }

  /** Apply a small social signal without abruptly changing the mood. */
  onSocialInteraction(kind = 'neutral', intensity = 0.2) {
    const amount = Math.max(0, Math.min(1, Number(intensity) || 0));
    if (kind === 'support' || kind === 'kindness') {
      this.emotions.trust = Math.min(1, this.emotions.trust + amount * 0.25);
      this.emotions.satisfaction = Math.min(1, this.emotions.satisfaction + amount * 0.2);
      this.emotions.stress = Math.max(0, this.emotions.stress - amount * 0.15);
    } else if (kind === 'conflict' || kind === 'insult') {
      this.emotions.trust = Math.max(0, this.emotions.trust - amount * 0.3);
      this.emotions.frustration = Math.min(1, this.emotions.frustration + amount * 0.3);
      this.emotions.stress = Math.min(1, this.emotions.stress + amount * 0.2);
    } else if (kind === 'surprise') {
      this.emotions.curiosity = Math.min(1, this.emotions.curiosity + amount * 0.2);
      this.emotions.excitement = Math.min(1, this.emotions.excitement + amount * 0.15);
    }
  }

  /**
   * Gradual decay back toward baseline mood equilibrium over time.
   */
  tickDecay() {
    for (const key of Object.keys(this.emotions)) {
      const current = this.emotions[key];
      const target = this.baseline[key] ?? 0.5;
      this.emotions[key] = current + (target - current) * 0.04;
    }
  }
}

export const emotionalState = new EmotionalStateEngine();
