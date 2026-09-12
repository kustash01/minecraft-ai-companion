import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PROBABILISTIC_REACTIONS');

/**
 * Система вероятностных реакций на игровые события.
 * Боты не всегда реагируют на события - как настоящие люди.
 */
export class ProbabilisticReactions {
  constructor(profile) {
    this.profile = profile;
    this.pendingMentions = []; // Отложенные упоминания
  }

  /**
   * Определяет должен ли бот отреагировать на событие
   * @param {string} eventType - тип события
   * @param {Object} eventData - данные события
   * @param {Object} context - контекст (настроение, усталость, etc)
   * @returns {Object} { shouldReact: boolean, reactionType: 'immediate'|'delayed'|'silent', delayMinutes?: number }
   */
  shouldReactToEvent(eventType, eventData, context = {}) {
    const { mood, talkativeness, busy, recentlySpokeAbout } = context;
    
    // Базовые вероятности для разных событий
    const baseProbabilities = {
      // Находки
      'found_diamonds': { immediate: 0.3, delayed: 0.4, silent: 0.3 },
      'found_iron': { immediate: 0.1, delayed: 0.2, silent: 0.7 },
      'found_gold': { immediate: 0.15, delayed: 0.3, silent: 0.55 },
      'found_ancient_debris': { immediate: 0.6, delayed: 0.3, silent: 0.1 },
      'found_village': { immediate: 0.5, delayed: 0.3, silent: 0.2 },
      'found_stronghold': { immediate: 0.7, delayed: 0.2, silent: 0.1 },
      'found_dungeon': { immediate: 0.4, delayed: 0.3, silent: 0.3 },
      
      // Опасности
      'under_attack': { immediate: 0.7, delayed: 0.2, silent: 0.1 },
      'low_health': { immediate: 0.5, delayed: 0.3, silent: 0.2 },
      'nearly_died': { immediate: 0.8, delayed: 0.15, silent: 0.05 },
      'killed_mob': { immediate: 0.1, delayed: 0.1, silent: 0.8 },
      
      // Достижения
      'crafted_important': { immediate: 0.2, delayed: 0.3, silent: 0.5 },
      'built_something': { immediate: 0.3, delayed: 0.4, silent: 0.3 },
      'leveled_up': { immediate: 0.15, delayed: 0.25, silent: 0.6 },
      
      // Окружение
      'nightfall': { immediate: 0.1, delayed: 0.1, silent: 0.8 },
      'weather_change': { immediate: 0.05, delayed: 0.1, silent: 0.85 },
      
      // Разное
      'inventory_full': { immediate: 0.4, delayed: 0.2, silent: 0.4 },
      'tool_broke': { immediate: 0.6, delayed: 0.2, silent: 0.2 },
      'got_lost': { immediate: 0.5, delayed: 0.3, silent: 0.2 },
    };

    const probs = baseProbabilities[eventType] || { immediate: 0.3, delayed: 0.3, silent: 0.4 };
    
    // Модификаторы вероятности
    let immediateProb = probs.immediate;
    let delayedProb = probs.delayed;
    let silentProb = probs.silent;
    
    // Болтливость увеличивает шанс реакции
    const talkMod = (talkativeness || 0.5) - 0.5; // -0.5 до +0.5
    immediateProb += talkMod * 0.2;
    delayedProb += talkMod * 0.1;
    silentProb -= talkMod * 0.3;
    
    // Настроение влияет
    if (mood === 'excited' || mood === 'happy') {
      immediateProb += 0.15;
      silentProb -= 0.15;
    } else if (mood === 'tired' || mood === 'bored') {
      immediateProb -= 0.2;
      silentProb += 0.2;
    } else if (mood === 'scared' || mood === 'stressed') {
      immediateProb += 0.1; // Больше эмоций
    }
    
    // Если занят - меньше реакций
    if (busy) {
      immediateProb -= 0.2;
      silentProb += 0.2;
    }
    
    // Если недавно говорили об этом - молчим
    if (recentlySpokeAbout?.includes(eventType)) {
      silentProb += 0.3;
      immediateProb -= 0.2;
      delayedProb -= 0.1;
    }
    
    // Нормализуем вероятности
    const total = immediateProb + delayedProb + silentProb;
    immediateProb /= total;
    delayedProb /= total;
    silentProb /= total;
    
    // Выбираем реакцию
    const rand = Math.random();
    
    if (rand < immediateProb) {
      return { shouldReact: true, reactionType: 'immediate' };
    } else if (rand < immediateProb + delayedProb) {
      // Отложенная реакция - через случайное время
      const delayMinutes = this._getDelayTime(eventType);
      this._scheduleDelayedMention(eventType, eventData, delayMinutes);
      return { shouldReact: false, reactionType: 'delayed', delayMinutes };
    } else {
      return { shouldReact: false, reactionType: 'silent' };
    }
  }

  /**
   * Определяет время задержки для отложенного упоминания
   */
  _getDelayTime(eventType) {
    // Важные события - быстрее упоминаем
    const urgentEvents = ['found_diamonds', 'found_ancient_debris', 'nearly_died', 'found_stronghold'];
    
    if (urgentEvents.includes(eventType)) {
      return 5 + Math.random() * 15; // 5-20 минут
    } else {
      return 15 + Math.random() * 45; // 15-60 минут
    }
  }

  /**
   * Планирует отложенное упоминание
   */
  _scheduleDelayedMention(eventType, eventData, delayMinutes) {
    const mention = {
      eventType,
      eventData,
      scheduledFor: Date.now() + delayMinutes * 60 * 1000,
      mentioned: false
    };
    
    this.pendingMentions.push(mention);
    
    logger.debug(`[${this.profile.name}] Запланировано отложенное упоминание ${eventType} через ${delayMinutes.toFixed(1)} минут`);
  }

  /**
   * Проверяет есть ли готовые к упоминанию события
   * @returns {Object|null} событие готовое к упоминанию
   */
  checkPendingMentions() {
    const now = Date.now();
    
    // Находим готовое к упоминанию событие
    for (let i = 0; i < this.pendingMentions.length; i++) {
      const mention = this.pendingMentions[i];
      
      if (!mention.mentioned && mention.scheduledFor <= now) {
        // Вероятность упомянуть прямо сейчас или отложить еще
        if (Math.random() < 0.7) { // 70% что упомянет
          mention.mentioned = true;
          return mention;
        } else {
          // Откладываем еще на 5-15 минут
          mention.scheduledFor = now + (5 + Math.random() * 10) * 60 * 1000;
        }
      }
    }
    
    // Очищаем старые упоминания (более 2 часов)
    this.pendingMentions = this.pendingMentions.filter(m => 
      !m.mentioned && (now - m.scheduledFor < 2 * 60 * 60 * 1000)
    );
    
    return null;
  }

  /**
   * Генерирует текст для отложенного упоминания
   * @param {Object} mention - объект упоминания
   * @returns {string} промпт для генерации сообщения
   */
  generateDelayedMentionPrompt(mention) {
    const { eventType, eventData } = mention;
    const timePassed = ((Date.now() - mention.scheduledFor) / (60 * 1000)).toFixed(0);
    
    let eventDescription = '';
    
    switch (eventType) {
      case 'found_diamonds':
        eventDescription = `нашел ${eventData.count || 3} алмазов`;
        break;
      case 'found_iron':
        eventDescription = `нашел немного железа`;
        break;
      case 'found_village':
        eventDescription = `нашел деревню`;
        break;
      case 'nearly_died':
        eventDescription = `чуть не умер от ${eventData.cause || 'моба'}`;
        break;
      case 'built_something':
        eventDescription = `построил ${eventData.what || 'что-то'}`;
        break;
      default:
        eventDescription = `что-то произошло`;
    }
    
    return `Случайно вспомнил что ${eventDescription} некоторое время назад. Упомяни это небрежно, как будто только вспомнил. 1-2 фразы, естественно:`;
  }
}
