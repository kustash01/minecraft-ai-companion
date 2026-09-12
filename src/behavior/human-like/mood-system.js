import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MOOD_SYSTEM');

/**
 * Система настроений для ботов.
 * Настроение влияет на все аспекты поведения: общение, реакции, решения.
 */
export class MoodSystem {
  constructor(profile) {
    this.profile = profile;
    
    // Текущее настроение
    this.currentMood = 'neutral';
    
    // Интенсивность настроения (0.0 - 1.0)
    this.intensity = 0.5;
    
    // Энергия (0.0 - 1.0)
    this.energy = 0.8;
    
    // Усталость (0.0 - 1.0)
    this.tiredness = 0.0;
    
    // Скука (0.0 - 1.0)
    this.boredom = 0.0;
    
    // Азарт/интерес (0.0 - 1.0)
    this.excitement = 0.3;
    
    // Страх/тревога (0.0 - 1.0)
    this.fear = 0.0;
    
    // История настроений для естественных переходов
    this.moodHistory = [];
    
    // Время начала игровой сессии
    this.sessionStartTime = Date.now();
    
    // Последняя интересная активность
    this.lastInterestingEvent = Date.now();
  }

  /**
   * Обновляет настроение на основе событий и времени
   */
  update(context = {}) {
    const { 
      recentEvents = [], 
      currentActivity = 'idle',
      health = 20,
      achievements = [],
      timeSinceLastDeath = Infinity
    } = context;
    
    // Усталость растет со временем
    this._updateTiredness();
    
    // Скука растет если нет интересных событий
    this._updateBoredom(recentEvents);
    
    // Обрабатываем события
    this._processEvents(recentEvents);
    
    // Страх от низкого здоровья
    if (health < 6) {
      this.fear = Math.min(1.0, this.fear + 0.3);
    } else {
      this.fear = Math.max(0.0, this.fear - 0.05);
    }
    
    // Определяем текущее настроение
    this._determineMood();
    
    // Логируем изменения настроения
    if (this.moodHistory.length > 0) {
      const lastMood = this.moodHistory[this.moodHistory.length - 1];
      if (lastMood.mood !== this.currentMood) {
        logger.info(`[${this.profile.name}] Настроение изменилось: ${lastMood.mood} -> ${this.currentMood} (интенсивность: ${this.intensity.toFixed(2)})`);
      }
    }
    
    // Сохраняем в историю
    this.moodHistory.push({
      mood: this.currentMood,
      intensity: this.intensity,
      timestamp: Date.now()
    });
    
    if (this.moodHistory.length > 50) this.moodHistory.shift();
  }

  /**
   * Обновляет усталость
   */
  _updateTiredness() {
    const sessionDuration = (Date.now() - this.sessionStartTime) / (60 * 60 * 1000); // в часах
    
    // Усталость растет со временем
    this.tiredness = Math.min(1.0, sessionDuration / 4); // Полностью устает за 4 часа
    
    // Энергия падает
    this.energy = Math.max(0.2, 1.0 - this.tiredness);
  }

  /**
   * Обновляет скуку
   */
  _updateBoredom(recentEvents) {
    const timeSinceInteresting = (Date.now() - this.lastInterestingEvent) / (60 * 1000); // в минутах
    
    // Если долго ничего интересного - скука растет
    if (timeSinceInteresting > 15) {
      this.boredom = Math.min(1.0, timeSinceInteresting / 60); // Максимум через час
    } else {
      this.boredom = Math.max(0.0, this.boredom - 0.1);
    }
  }

  /**
   * Обрабатывает события и обновляет эмоциональное состояние
   */
  _processEvents(events) {
    for (const event of events) {
      switch (event.type) {
        case 'found_diamonds':
        case 'found_ancient_debris':
        case 'found_stronghold':
          this.excitement = Math.min(1.0, this.excitement + 0.4);
          this.boredom = Math.max(0.0, this.boredom - 0.5);
          this.lastInterestingEvent = Date.now();
          break;
        
        case 'found_village':
        case 'found_dungeon':
        case 'crafted_important':
          this.excitement = Math.min(1.0, this.excitement + 0.2);
          this.boredom = Math.max(0.0, this.boredom - 0.3);
          this.lastInterestingEvent = Date.now();
          break;
        
        case 'under_attack':
        case 'nearly_died':
          this.fear = Math.min(1.0, this.fear + 0.5);
          this.excitement = Math.min(1.0, this.excitement + 0.3);
          this.lastInterestingEvent = Date.now();
          break;
        
        case 'died':
          this.fear = Math.max(0.0, this.fear - 0.3); // После смерти страх падает
          this.excitement = Math.max(0.0, this.excitement - 0.4);
          break;
        
        case 'mining_routine':
        case 'gathering_routine':
          // Рутина увеличивает скуку
          this.boredom = Math.min(1.0, this.boredom + 0.05);
          break;
        
        case 'pvp':
        case 'boss_fight':
          this.excitement = Math.min(1.0, this.excitement + 0.6);
          this.boredom = 0.0;
          this.lastInterestingEvent = Date.now();
          break;
      }
    }
    
    // Естественный спад эмоций со временем
    this.excitement = Math.max(0.1, this.excitement - 0.02);
  }

  /**
   * Определяет текущее настроение на основе эмоциональных параметров
   */
  _determineMood() {
    const moods = [];
    
    // Усталость
    if (this.tiredness > 0.7) {
      moods.push({ mood: 'exhausted', score: this.tiredness });
    } else if (this.tiredness > 0.4) {
      moods.push({ mood: 'tired', score: this.tiredness * 0.7 });
    }
    
    // Скука
    if (this.boredom > 0.6) {
      moods.push({ mood: 'bored', score: this.boredom });
    }
    
    // Азарт
    if (this.excitement > 0.7) {
      moods.push({ mood: 'excited', score: this.excitement });
    } else if (this.excitement > 0.4) {
      moods.push({ mood: 'interested', score: this.excitement * 0.6 });
    }
    
    // Страх
    if (this.fear > 0.6) {
      moods.push({ mood: 'scared', score: this.fear });
    } else if (this.fear > 0.3) {
      moods.push({ mood: 'nervous', score: this.fear * 0.7 });
    }
    
    // Если нет доминирующих эмоций
    if (moods.length === 0) {
      if (this.energy > 0.6) {
        moods.push({ mood: 'content', score: 0.5 });
      } else {
        moods.push({ mood: 'neutral', score: 0.5 });
      }
    }
    
    // Выбираем самое сильное настроение
    moods.sort((a, b) => b.score - a.score);
    this.currentMood = moods[0].mood;
    this.intensity = moods[0].score;
  }

  /**
   * Возвращает текущее настроение
   */
  getMood() {
    return {
      mood: this.currentMood,
      intensity: this.intensity,
      energy: this.energy,
      tiredness: this.tiredness,
      boredom: this.boredom,
      excitement: this.excitement,
      fear: this.fear
    };
  }

  /**
   * Возвращает модификаторы поведения на основе настроения
   */
  getBehaviorModifiers() {
    const mood = this.currentMood;
    
    // Базовые модификаторы
    const modifiers = {
      talkativeness: 1.0,      // Множитель болтливости
      reactivity: 1.0,         // Вероятность реакции на события
      initiative: 1.0,         // Вероятность проявить инициативу
      caution: 1.0,            // Осторожность
      efficiency: 1.0,         // Эффективность действий
      patience: 1.0,           // Терпеливость
      riskTaking: 1.0          // Готовность рисковать
    };
    
    switch (mood) {
      case 'excited':
        modifiers.talkativeness = 1.5;
        modifiers.reactivity = 1.4;
        modifiers.initiative = 1.6;
        modifiers.caution = 0.6;
        modifiers.patience = 0.7;
        modifiers.riskTaking = 1.4;
        break;
      
      case 'tired':
        modifiers.talkativeness = 0.6;
        modifiers.reactivity = 0.7;
        modifiers.initiative = 0.5;
        modifiers.efficiency = 0.8;
        modifiers.patience = 0.6;
        break;
      
      case 'exhausted':
        modifiers.talkativeness = 0.3;
        modifiers.reactivity = 0.4;
        modifiers.initiative = 0.2;
        modifiers.efficiency = 0.5;
        modifiers.patience = 0.3;
        break;
      
      case 'bored':
        modifiers.talkativeness = 0.8;
        modifiers.initiative = 1.3; // Ищут что-то интересное
        modifiers.efficiency = 0.7;
        modifiers.patience = 0.4;
        modifiers.riskTaking = 1.2; // Готовы на авантюры
        break;
      
      case 'scared':
        modifiers.talkativeness = 1.2;
        modifiers.reactivity = 1.5;
        modifiers.caution = 2.0;
        modifiers.riskTaking = 0.3;
        break;
      
      case 'nervous':
        modifiers.talkativeness = 0.9;
        modifiers.caution = 1.4;
        modifiers.riskTaking = 0.6;
        break;
      
      case 'content':
        modifiers.talkativeness = 1.1;
        modifiers.efficiency = 1.1;
        modifiers.patience = 1.2;
        break;
      
      case 'interested':
        modifiers.talkativeness = 1.2;
        modifiers.initiative = 1.3;
        modifiers.efficiency = 1.1;
        break;
    }
    
    return modifiers;
  }

  /**
   * Возвращает описание настроения для промпта
   */
  getMoodDescription() {
    const mood = this.currentMood;
    const intensity = this.intensity;
    
    const descriptions = {
      excited: intensity > 0.8 ? 'Очень взволнован и полон энергии' : 'В приподнятом настроении',
      tired: intensity > 0.8 ? 'Сильно устал, хочется отдохнуть' : 'Немного устал',
      exhausted: 'Полностью измотан, едва держусь',
      bored: intensity > 0.8 ? 'Очень скучно, хочется чем-то заняться' : 'Немного скучновато',
      scared: intensity > 0.8 ? 'Сильно напуган, нервничаю' : 'Немного волнуюсь',
      nervous: 'Чувствую тревогу',
      content: 'В хорошем спокойном настроении',
      interested: 'Заинтересован, хочу узнать больше',
      neutral: 'Обычное нейтральное настроение'
    };
    
    return descriptions[mood] || 'Нормальное настроение';
  }

  /**
   * Отдых восстанавливает энергию и снижает усталость
   */
  rest(minutes = 10) {
    this.tiredness = Math.max(0.0, this.tiredness - (minutes / 60));
    this.energy = Math.min(1.0, this.energy + (minutes / 30));
    logger.debug(`[${this.profile.name}] Отдохнул ${minutes} минут. Усталость: ${this.tiredness.toFixed(2)}, Энергия: ${this.energy.toFixed(2)}`);
  }
}
