import logger from '../utils/logger.js';

export class PersonalityProfile {
  constructor() {
    this.traits = {
      initiative: 0.7,        // How proactively it acts
      caution: 0.6,           // Safety and risk calculation
      curiosity: 0.75,        // Desire to explore new areas
      exploration_bias: 0.8,  // Preference for exploring
      building_bias: 0.7,     // Preference for building
      mining_bias: 0.85,      // Preference for mining
      combat_bias: 0.65,      // Preference for fighting
      humor: 0.7,             // Jokes and lighthearted banter
      talkativeness: 0.6,     // Verbosity of messages
      autonomy: 0.75,         // Doing background chores independently
      risk_attitude: 0.45,    // Willingness to take gameplay risks
      patience: 0.8,          // Tolerance for waiting on player
    };
  }

  getTraits() {
    return { ...this.traits };
  }

  adjustTrait(traitName, delta) {
    if (this.traits[traitName] !== undefined) {
      this.traits[traitName] = Math.max(0.0, Math.min(1.0, this.traits[traitName] + delta));
      logger.debug(`[PERSONALITY] Trait ${traitName} adjusted by ${delta} -> ${this.traits[traitName].toFixed(2)}`);
    }
  }
}

export const personalityProfile = new PersonalityProfile();
