import { createLogger } from '../../utils/logger.js';
import { HumanErrorEngine } from '../human-error-engine.js';

const logger = createLogger('PERSONAL_GOALS');

/**
 * Система личных целей и инициативы.
 * Боты сами придумывают себе цели и предлагают идеи.
 */
export class PersonalGoalsSystem {
  constructor(profile, memoryManager) {
    this.profile = profile;
    this.memoryManager = memoryManager;
    
    // Текущие личные цели
    this.currentGoals = [];
    
    // Интересы бота
    this.interests = this._determineInterests(profile);
    
    // Последнее предложение идеи
    this.lastInitiativeTime = 0;
    
    // Минимальный интервал между предложениями (минуты)
    this.initiativeCooldown = 15;
  }

  /**
   * Определяет интересы на основе личности
   */
  _determineInterests(profile) {
    const interests = {
      Sam: ['exploration', 'building', 'farming'],
      Max: ['efficiency', 'automation', 'organization'],
      Jack: ['adventure', 'combat', 'exploration'],
      Ryan: ['building', 'mining', 'crafting'],
      Alex: ['helping', 'community', 'farming'],
      Leo: ['combat', 'adventure', 'challenge']
    };
    
    return interests[profile.name] || ['exploration', 'building'];
  }

  /**
   * Генерирует новые цели на основе контекста
   */
  generateNewGoals(context = {}) {
    const { worldState, achievements, inventory, knownLocations } = context;
    
    const possibleGoals = [];
    
    // Цели на основе интересов
    if (this.interests.includes('exploration')) {
      possibleGoals.push(
        { type: 'explore', target: 'village', description: 'найти деревню', priority: 0.6 },
        { type: 'explore', target: 'stronghold', description: 'найти крепость', priority: 0.8 },
        { type: 'explore', target: 'mansion', description: 'найти особняк', priority: 0.7 },
        { type: 'explore', target: 'monument', description: 'найти подводный храм', priority: 0.75 }
      );
    }
    
    if (this.interests.includes('building')) {
      possibleGoals.push(
        { type: 'build', target: 'tower', description: 'построить высокую башню', priority: 0.5 },
        { type: 'build', target: 'house', description: 'построить крутой дом', priority: 0.6 },
        { type: 'build', target: 'farm', description: 'сделать автоматическую ферму', priority: 0.65 },
        { type: 'build', target: 'bridge', description: 'построить мост через реку', priority: 0.4 }
      );
    }
    
    if (this.interests.includes('farming')) {
      possibleGoals.push(
        { type: 'farm', target: 'crops', description: 'создать большую ферму пшеницы', priority: 0.5 },
        { type: 'farm', target: 'animals', description: 'развести животных', priority: 0.6 },
        { type: 'farm', target: 'villagers', description: 'создать торговую ферму', priority: 0.7 }
      );
    }
    
    if (this.interests.includes('combat')) {
      possibleGoals.push(
        { type: 'combat', target: 'end', description: 'убить дракона края', priority: 0.9 },
        { type: 'combat', target: 'wither', description: 'победить иссушителя', priority: 0.85 },
        { type: 'combat', target: 'raid', description: 'защитить деревню от рейда', priority: 0.7 }
      );
    }
    
    if (this.interests.includes('efficiency')) {
      possibleGoals.push(
        { type: 'efficiency', target: 'storage', description: 'организовать хранилище', priority: 0.5 },
        { type: 'efficiency', target: 'redstone', description: 'создать редстоун механизм', priority: 0.7 },
        { type: 'efficiency', target: 'enchanting', description: 'сделать зачаровательную комнату', priority: 0.8 }
      );
    }
    
    if (this.interests.includes('adventure')) {
      possibleGoals.push(
        { type: 'adventure', target: 'nether', description: 'исследовать незер', priority: 0.65 },
        { type: 'adventure', target: 'end', description: 'сходить в край', priority: 0.8 },
        { type: 'adventure', target: 'cave', description: 'исследовать глубокую пещеру', priority: 0.5 }
      );
    }
    
    // Фильтруем уже существующие цели
    const filteredGoals = possibleGoals.filter(g => 
      !this.currentGoals.some(existing => existing.type === g.type && existing.target === g.target)
    );
    
    // Выбираем 1-2 новые цели
    const numGoals = HumanErrorEngine.chance(0.3, this.profile) ? 2 : 1;
    const selectedGoals = [];
    
    for (let i = 0; i < numGoals && filteredGoals.length > 0; i++) {
      // Выбираем с учетом приоритета
      const goal = HumanErrorEngine.weightedChoice(filteredGoals, g => g.priority);
      if (!goal) break;
      
      selectedGoals.push({
        ...goal,
        startedAt: Date.now(),
        progress: 0
      });
      
      // Удаляем выбранную цель из списка
      const idx = filteredGoals.findIndex(g => g.type === goal.type && g.target === goal.target);
      if (idx !== -1) filteredGoals.splice(idx, 1);
    }
    
    this.currentGoals.push(...selectedGoals);
    
    logger.info(`[${this.profile.name}] Новые личные цели: ${selectedGoals.map(g => g.description).join(', ')}`);
    
    return selectedGoals;
  }

  /**
   * Проверяет должен ли бот проявить инициативу и предложить идею
   */
  shouldTakeInitiative(context = {}) {
    const { moodModifiers, conversationSilence, playerActivity } = context;
    
    // Проверяем кулдаун
    const timeSinceLastInitiative = (Date.now() - this.lastInitiativeTime) / (60 * 1000);
    if (timeSinceLastInitiative < this.initiativeCooldown) {
      return { shouldInitiate: false, reason: 'cooldown' };
    }
    
    // Базовая вероятность
    let probability = 0.1; // 10% базовый шанс
    
    // Модификаторы настроения
    if (moodModifiers) {
      probability *= moodModifiers.initiative;
    }
    
    // Если долго молчали - больше шанс
    if (conversationSilence > 10) { // минут
      probability += 0.15;
    }
    
    // Если скучно - больше инициативы
    if (moodModifiers?.boredom > 0.6) {
      probability += 0.2;
    }
    
    // Если есть личные цели - больше хочется ими делиться
    if (this.currentGoals.length > 0) {
      probability += 0.1;
    }
    
    // Черты характера
    const initiativeTrait = this.profile.traits?.initiative || 0.5;
    probability *= (0.5 + initiativeTrait);
    
    const shouldInitiate = HumanErrorEngine.chance(probability, this.profile);
    
    if (shouldInitiate) {
      this.lastInitiativeTime = Date.now();
    }
    
    return { shouldInitiate, probability };
  }

  /**
   * Генерирует предложение/идею для группы
   */
  generateInitiativeProposal(context = {}) {
    const { worldState, groupGoals, knownLocations, mood } = context;
    
    const proposalTypes = [];
    
    // Предложить свою личную цель как групповую
    if (this.currentGoals.length > 0) {
      const goal = HumanErrorEngine.choice(this.currentGoals);
      proposalTypes.push({
        type: 'personal_goal',
        proposal: `А может ${goal.description}?`,
        details: goal
      });
    }
    
    // Предложить исследование
    proposalTypes.push({
      type: 'exploration',
      proposal: 'Может пошарим в той стороне? Вроде там что-то интересное было',
      details: { direction: HumanErrorEngine.choice(['на север', 'на юг', 'на запад', 'на восток']) }
    });
    
    // Предложить строительство
    if (this.interests.includes('building')) {
      proposalTypes.push({
        type: 'building',
        proposal: 'Кстати, давно хотел построить что-то крутое. Может вместе замутим?',
        details: { what: HumanErrorEngine.choice(['башню', 'дом', 'ферму', 'мост']) }
      });
    }
    
    // Предложить добычу ресурсов
    proposalTypes.push({
      type: 'gathering',
      proposal: 'Слушайте, может пошли алмазы копать? Нужны же',
      details: { resource: 'diamonds' }
    });
    
    // Предложить приключение
    if (this.interests.includes('adventure')) {
      proposalTypes.push({
        type: 'adventure',
        proposal: 'Че сидим? Давайте в незер сходим или куда-то',
        details: { destination: 'nether' }
      });
    }
    
    // Предложить отдых
    if (mood?.tiredness > 0.7) {
      proposalTypes.push({
        type: 'rest',
        proposal: 'Устал я чет. Может афк на минут 10?',
        details: { duration: 10 }
      });
    }
    
    // Предложить сменить деятельность
    if (mood?.boredom > 0.6) {
      proposalTypes.push({
        type: 'change_activity',
        proposal: 'Надоело это. Давайте что-то другое делать',
        details: {}
      });
    }
    
    // Выбираем случайное предложение
    const selected = HumanErrorEngine.choice(proposalTypes);
    
    return selected;
  }

  /**
   * Обновляет прогресс целей
   */
  updateGoalProgress(goalType, progress) {
    const goal = this.currentGoals.find(g => g.type === goalType);
    if (goal) {
      goal.progress = Math.min(1.0, goal.progress + progress);
      
      if (goal.progress >= 1.0) {
        logger.info(`[${this.profile.name}] Цель выполнена: ${goal.description}`);
        this.completeGoal(goal);
      }
    }
  }

  /**
   * Завершает цель
   */
  completeGoal(goal) {
    const index = this.currentGoals.findIndex(g => g === goal);
    if (index !== -1) {
      this.currentGoals.splice(index, 1);
      
      // Может упомянуть о выполнении цели (30% шанс)
      return HumanErrorEngine.chance(0.3, this.profile) ? {
        shouldMention: true,
        message: `Кстати, я ${goal.description} наконец-то`
      } : { shouldMention: false };
    }
    
    return { shouldMention: false };
  }

  /**
   * Отказывается или соглашается с предложением
   */
  evaluateProposal(proposal, context = {}) {
    const { mood, busy, personalPreference } = context;
    
    // Базовая вероятность согласиться
    let agreeChance = 0.7;
    
    // Модификаторы
    if (busy) {
      agreeChance -= 0.3;
    }
    
    if (mood?.tiredness > 0.7) {
      agreeChance -= 0.4;
    }
    
    if (mood?.boredom > 0.6) {
      agreeChance += 0.2;
    }
    
    // Предпочтения
    if (proposal.type === 'exploration' && this.interests.includes('exploration')) {
      agreeChance += 0.2;
    }
    
    if (proposal.type === 'building' && this.interests.includes('building')) {
      agreeChance += 0.2;
    }
    
    if (proposal.type === 'combat' && !this.interests.includes('combat')) {
      agreeChance -= 0.3;
    }
    
    // Решение
    const agrees = HumanErrorEngine.chance(agreeChance, this.profile);
    
    return {
      agrees,
      reason: agrees ? 'interested' : (busy ? 'busy' : (mood?.tiredness > 0.7 ? 'tired' : 'not_interested'))
    };
  }

  /**
   * Возвращает текущие цели
   */
  getCurrentGoals() {
    return this.currentGoals;
  }
}
