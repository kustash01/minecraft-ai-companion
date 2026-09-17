import logger from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

export class BehavioralVarianceEngine {
  constructor() {
    this.recentActions = []; // Array of recent action names with timestamps
    this.actionFrequencies = new Map();
  }

  /**
   * Evaluate a set of valid alternative candidate actions and pick the best logical choice with natural human-like variance.
   * Utility = base_value + preference_bias + habit_bias + novelty_bonus - recent_action_penalty - stress_cost + random_jitter
   * @param {Array} candidates - [{ name, baseValue, preferenceBias, habitBias }]
   * @param {object} context - { stress: 0-1, isSafe: boolean }
   * @returns {object} Selected candidate
   */
  selectActionWithVariance(candidates, context = {}) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const now = Date.now();
    const stress = context.stress || 0.1;

    const scored = candidates.map(cand => {
      const base = cand.baseValue || 1.0;
      const pref = cand.preferenceBias || 0.0;
      const habit = cand.habitBias || 0.0;

      // Penalty for repeating the exact same action in the last 60 seconds
      const repeatCount = this.recentActions.filter(a => a.name === cand.name && (now - a.timestamp < 60000)).length;
      const recentPenalty = repeatCount * 0.35;

      // Novelty bonus if this action hasn't been executed recently
      const noveltyBonus = repeatCount === 0 ? 0.2 : 0.0;

      // Small bounded human jitter (+- 0.15) to avoid robotic determinism
      const humanJitter = HumanErrorEngine.jitter(0.15, context);

      const totalScore = base + pref + habit + noveltyBonus - recentPenalty - (stress * 0.2) + humanJitter;

      return {
        ...cand,
        finalScore: Math.max(0.01, totalScore),
      };
    });

    // Softmax-like probabilistic selection among top scored candidates
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Pick among top choices weighted by finalScore
    const totalWeight = scored.reduce((sum, c) => sum + c.finalScore, 0);
    let randomThreshold = HumanErrorEngine.range(0, totalWeight, context);

    let selected = scored[0];
    for (const cand of scored) {
      randomThreshold -= cand.finalScore;
      if (randomThreshold <= 0) {
        selected = cand;
        break;
      }
    }

    // Record action execution
    this.recentActions.push({ name: selected.name, timestamp: now });
    if (this.recentActions.length > 50) this.recentActions.shift();
    this.actionFrequencies.set(selected.name, (this.actionFrequencies.get(selected.name) || 0) + 1);

    logger.debug(`[VARIANCE] Selected "${selected.name}" from ${candidates.length} options (Score: ${selected.finalScore.toFixed(2)})`);
    return selected;
  }
}

export const behavioralVariance = new BehavioralVarianceEngine();
