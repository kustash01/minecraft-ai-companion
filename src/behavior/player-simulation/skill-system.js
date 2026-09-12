import logger from '../../utils/logger.js';

export const SkillNames = {
  MINING: 'mining',
  NAVIGATION: 'navigation',
  COMBAT: 'combat',
  ARCHERY: 'archery',
  SHIELD: 'shield',
  MLG_WATER: 'mlg_water',
  PARKOUR: 'parkour',
  BUILDING: 'building',
  CRAFTING: 'crafting',
  FARMING: 'farming',
  REDSTONE: 'redstone',
  SPEED_BRIDGING: 'speed_bridging',
  RESOURCE_MANAGEMENT: 'resource_management',
  EXPLORATION: 'exploration',
};

export class SkillSystem {
  constructor(initialBiases = {}) {
    this.skills = {
      [SkillNames.MINING]: { base: 0.90, level: 5, practice: 120, successes: 114, recentStreak: 4, recentForm: 1.05 },
      [SkillNames.NAVIGATION]: { base: 0.85, level: 4, practice: 80, successes: 74, recentStreak: 3, recentForm: 1.02 },
      [SkillNames.COMBAT]: { base: 0.75, level: 3, practice: 40, successes: 32, recentStreak: 2, recentForm: 1.0 },
      [SkillNames.ARCHERY]: { base: 0.70, level: 3, practice: 30, successes: 23, recentStreak: 1, recentForm: 0.98 },
      [SkillNames.SHIELD]: { base: 0.80, level: 4, practice: 35, successes: 29, recentStreak: 2, recentForm: 1.0 },
      [SkillNames.MLG_WATER]: { base: 0.65, level: 3, practice: 20, successes: 14, recentStreak: 1, recentForm: 1.0 },
      [SkillNames.PARKOUR]: { base: 0.65, level: 2, practice: 25, successes: 18, recentStreak: 0, recentForm: 0.95 },
      [SkillNames.BUILDING]: { base: 0.80, level: 4, practice: 60, successes: 54, recentStreak: 3, recentForm: 1.03 },
      [SkillNames.CRAFTING]: { base: 0.92, level: 5, practice: 90, successes: 88, recentStreak: 5, recentForm: 1.05 },
      [SkillNames.FARMING]: { base: 0.85, level: 4, practice: 50, successes: 46, recentStreak: 2, recentForm: 1.0 },
      [SkillNames.REDSTONE]: { base: 0.70, level: 3, practice: 25, successes: 20, recentStreak: 1, recentForm: 0.98 },
      [SkillNames.SPEED_BRIDGING]: { base: 0.55, level: 2, practice: 15, successes: 9, recentStreak: -1, recentForm: 0.92 },
      [SkillNames.RESOURCE_MANAGEMENT]: { base: 0.88, level: 4, practice: 70, successes: 66, recentStreak: 4, recentForm: 1.04 },
      [SkillNames.EXPLORATION]: { base: 0.86, level: 4, practice: 85, successes: 78, recentStreak: 3, recentForm: 1.02 },
    };

    if (initialBiases && typeof initialBiases === 'object') {
      for (const [skill, bias] of Object.entries(initialBiases)) {
        if (this.skills[skill] && typeof bias === 'number') {
          this.skills[skill].base = bias;
          this.skills[skill].level = Math.floor(bias * 5) + 1;
        }
      }
    }
  }

  getAllSkills() {
    return { ...this.skills };
  }

  /**
   * Perform a multi-factor contextual skill check:
   * Success = base_skill * height_mod * reaction_mod * stress_mod * visibility_mod * equipment_mod * experience_mod * health_mod * hunger_mod * recent_form * bounded_randomness
   */
  checkSkill(skillName, {
    heightMod = 1.0,      // e.g. 0.7 for high 30-block drop in MLG, 1.0 for standard
    reactionMod = 1.0,    // 0.8 if caught off-guard, 1.1 if fully prepared
    stressMod = 1.0,      // 0.6 in panic, 1.0 if calm
    visibilityMod = 1.0,  // 0.8 in dark unlit caves, 1.0 in day
    equipmentMod = 1.0,   // 0.8 for wood tool, 1.2 for netherite/enchanted
    healthMod = 1.0,      // 0.7 if < 6 HP, 1.0 if full HP
    hungerMod = 1.0,      // 0.8 if starvation < 6 food, 1.0 if full
  } = {}) {
    const skill = this.skills[skillName] || { base: 0.5, practice: 0, successes: 0, recentStreak: 0, recentForm: 1.0, level: 1 };

    // Experience modifier grows logarithmically with practice (1.0 to 1.35)
    const experienceMod = Math.min(1.35, 1.0 + Math.log10(skill.practice + 1) * 0.1);

    // Multi-factor probability
    const rawProb = skill.base *
      heightMod *
      reactionMod *
      stressMod *
      visibilityMod *
      equipmentMod *
      experienceMod *
      healthMod *
      hungerMod *
      (skill.recentForm || 1.0);

    const finalProb = Math.max(0.04, Math.min(0.98, rawProb));

    // Bounded roll
    const roll = Math.random();
    const isSuccess = roll <= finalProb;

    // Update practice & lifetime counters
    skill.practice++;
    if (isSuccess) {
      skill.successes++;
      skill.recentStreak = Math.max(1, (skill.recentStreak || 0) + 1);
      skill.recentForm = Math.min(1.15, (skill.recentForm || 1.0) + 0.02);
    } else {
      skill.recentStreak = Math.min(-1, (skill.recentStreak || 0) - 1);
      skill.recentForm = Math.max(0.85, (skill.recentForm || 1.0) - 0.03);
    }

    // Dynamic permanent leveling from practice
    if (skill.practice % 15 === 0 && skill.base < 0.95) {
      skill.base = Math.min(0.95, skill.base + 0.01);
      skill.level = Math.floor(skill.base * 5) + 1;
    }

    logger.debug(`[SKILL CHECK] ${skillName}: prob=${(finalProb * 100).toFixed(1)}%, form=${skill.recentForm.toFixed(2)}, roll=${(roll * 100).toFixed(1)}% -> ${isSuccess ? 'SUCCESS' : 'FAIL'}`);

    return {
      success: isSuccess,
      probability: finalProb,
      skillName,
      level: skill.level,
      practice: skill.practice,
      recentForm: skill.recentForm,
    };
  }

  getSkill(skillName) {
    return this.skills[skillName] || null;
  }

  getSkillSummary() {
    const out = {};
    for (const [name, s] of Object.entries(this.skills)) {
      out[name] = {
        level: s.level,
        baseRate: `${Math.round(s.base * 100)}%`,
        practice: s.practice,
        recentForm: `${Math.round((s.recentForm || 1.0) * 100)}%`,
        successRate: s.practice > 0 ? `${Math.round((s.successes / s.practice) * 100)}%` : '0%',
      };
    }
    return out;
  }
}

export const skillSystem = new SkillSystem();
