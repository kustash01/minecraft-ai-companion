import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AFK_SYSTEM');

/**
 * Система случайных AFK и перерывов.
 * Боты иногда отходят как настоящие люди.
 */
export class AFKSystem {
  constructor(profile, aiBrain = null) {
    this.profile = profile;
    this.aiBrain = aiBrain;

    // Статус AFK
    this.isAFK = false;
    this.afkStartTime = null;
    this.afkReason = null;
    this.plannedReturnTime = null;

    // История AFK для реалистичности
    this.afkHistory = [];

    // Последний раз когда был AFK
    this.lastAFKTime = Date.now();
  }

  /**
   * Проверяет должен ли бот уйти в AFK
   */
  async shouldGoAFK(context = {}) {
    const { tiredness, sessionDuration, boredom, lastAFKMinutesAgo } = context;

    // Не уходим в AFK если только недавно вернулись
    if (lastAFKMinutesAgo < 20) {
      return { shouldAFK: false, reason: 'recently_returned' };
    }

    // Базовая вероятность AFK
    let afkChance = 0.02; // 2% базовый шанс (каждые ~50 проверок)

    // Усталость увеличивает шанс AFK
    if (tiredness > 0.8) {
      afkChance += 0.15;
    } else if (tiredness > 0.6) {
      afkChance += 0.08;
    }

    // Долгая сессия - больше шанс отойти
    const sessionHours = sessionDuration / 60;
    if (sessionHours > 2) {
      afkChance += 0.05 * (sessionHours - 2);
    }

    // Скука увеличивает шанс отойти
    if (boredom > 0.7) {
      afkChance += 0.08;
    }

    const shouldAFK = Math.random() < afkChance;

    if (shouldAFK) {
      const afkDetails = await this._planAFK(tiredness, sessionDuration);
      this._startAFK(afkDetails);
      return {
        shouldAFK: true,
        ...afkDetails
      };
    }

    return { shouldAFK: false };
  }

  /**
   * Планирует детали AFK
   */
  async _planAFK(tiredness, sessionDuration) {
    // Причина AFK
    const reasons = this._getAFKReasons(tiredness, sessionDuration);
    const reason = reasons[Math.floor(Math.random() * reasons.length)];

    // Длительность AFK (минуты)
    let duration = this._getAFKDuration(reason, tiredness);

    // Будет ли объявлять причину
    const announceChance = this._getAnnounceChance(reason);
    const shouldAnnounce = Math.random() < announceChance;

    // Сообщение
    const message = shouldAnnounce ? await this._getAFKMessage(reason) : 'афк';

    return {
      reason,
      duration,
      shouldAnnounce,
      message
    };
  }

  /**
   * Возвращает возможные причины AFK
   */
  _getAFKReasons(tiredness, sessionDuration) {
    const reasons = [
      'bathroom',
      'drink',
      'food',
      'phone',
      'door',
      'distraction',
      'stretch',
      'rest'
    ];
    
    // Если очень устал - больше шанс на отдых
    if (tiredness > 0.8) {
      reasons.push('rest', 'rest', 'rest');
    }
    
    // Если долго играет - больше физиологических причин
    if (sessionDuration > 120) {
      reasons.push('bathroom', 'drink', 'food', 'stretch');
    }
    
    return reasons;
  }

  /**
   * Определяет длительность AFK
   */
  _getAFKDuration(reason, tiredness) {
    const durations = {
      'bathroom': [2, 5],      // 2-5 минут
      'drink': [1, 3],         // 1-3 минуты
      'food': [5, 15],         // 5-15 минут
      'phone': [3, 10],        // 3-10 минут
      'door': [2, 5],          // 2-5 минут
      'distraction': [5, 20],  // 5-20 минут (отвлекся на что-то)
      'stretch': [2, 5],       // 2-5 минут
      'rest': [10, 30]         // 10-30 минут
    };
    
    const [min, max] = durations[reason] || [2, 5];
    let duration = min + Math.random() * (max - min);
    
    // Усталость увеличивает длительность
    if (tiredness > 0.8) {
      duration *= 1.5;
    }
    
    return Math.round(duration);
  }

  /**
   * Вероятность объявить причину AFK
   */
  _getAnnounceChance(reason) {
    // Некоторые причины реже объявляют
    const announceChances = {
      'bathroom': 0.3,      // Редко говорят "в туалет"
      'drink': 0.6,
      'food': 0.7,
      'phone': 0.5,
      'door': 0.8,          // Обычно говорят "дверь"
      'distraction': 0.2,   // Редко признаются что отвлеклись
      'stretch': 0.4,
      'rest': 0.6
    };
    
    return announceChances[reason] || 0.5;
  }

  /**
   * Генерирует сообщение AFK — живыми словами через LLM, без шаблонов.
   */
  async _getAFKMessage(reason) {
    const situations = {
      bathroom: 'тебе нужно отойти в туалет',
      drink: 'ты хочешь отойти попить',
      food: 'ты идёшь поесть',
      phone: 'тебе звонят / отвлекли на телефон',
      door: 'к тебе кто-то пришёл, звонят в дверь',
      distraction: 'тебя отвлекли по жизни',
      stretch: 'ты хочешь размяться',
      rest: 'ты устал и хочешь передохнуть',
    };
    const situation = situations[reason] || 'тебе нужно ненадолго отойти';

    if (this.aiBrain?.generateQuickResponse) {
      try {
        const name = this.profile?.name || 'ты';
        const prompt = `Ты ${name}, играешь в Minecraft с друзьями. Тебе нужно отойти от компьютера: ${situation}. Быстро черкни в чат что отходишь — своими словами, коротко (1-4 слова), строчными, без точки:`;
        const res = await this.aiBrain.generateQuickResponse(prompt, {
          maxTokens: 14,
          temperature: 0.95,
          timeoutMs: 900,
        });
        const text = res.text?.trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
        if (text && text.length >= 1) return text;
      } catch (_) {}
    }

    // «афк» — это реальное слово, которое люди буквально пишут; не шаблон реплики.
    return 'афк';
  }

  /**
   * Начинает AFK
   */
  _startAFK(details) {
    this.isAFK = true;
    this.afkStartTime = Date.now();
    this.afkReason = details.reason;
    this.plannedReturnTime = Date.now() + details.duration * 60 * 1000;
    
    logger.info(`[${this.profile.name}] AFK: ${details.reason} на ${details.duration} минут`);
    
    this.afkHistory.push({
      reason: details.reason,
      startTime: this.afkStartTime,
      plannedDuration: details.duration
    });
  }

  /**
   * Проверяет должен ли вернуться из AFK
   */
  checkReturn() {
    if (!this.isAFK) {
      return { shouldReturn: false };
    }
    
    const now = Date.now();
    
    // Проверяем вернулся ли по плану
    if (now >= this.plannedReturnTime) {
      // Иногда возвращаются позже (20% шанс)
      if (Math.random() < 0.2) {
        // Задерживаются на 2-10 минут
        const extraDelay = (2 + Math.random() * 8) * 60 * 1000;
        this.plannedReturnTime = now + extraDelay;
        logger.debug(`[${this.profile.name}] Задержался AFK еще на ${(extraDelay / 60000).toFixed(1)} минут`);
        return { shouldReturn: false };
      }
      
      // Возвращается
      return this._returnFromAFK();
    }
    
    // Иногда возвращаются раньше (10% шанс)
    const timeInAFK = (now - this.afkStartTime) / (60 * 1000);
    if (timeInAFK > 1 && Math.random() < 0.1) {
      return this._returnFromAFK();
    }
    
    return { shouldReturn: false };
  }

  /**
   * Возвращается из AFK
   */
  _returnFromAFK() {
    const afkDuration = (Date.now() - this.afkStartTime) / (60 * 1000);
    
    this.isAFK = false;
    this.lastAFKTime = Date.now();
    
    // Иногда объявляет возвращение (50% шанс)
    const shouldAnnounce = Math.random() < 0.5;
    const message = shouldAnnounce ? this._getReturnMessage(afkDuration) : null;
    
    logger.info(`[${this.profile.name}] Вернулся из AFK (был ${afkDuration.toFixed(1)} минут)`);
    
    // Обновляем историю
    const lastAFK = this.afkHistory[this.afkHistory.length - 1];
    if (lastAFK) {
      lastAFK.actualDuration = afkDuration;
      lastAFK.endTime = Date.now();
    }
    
    // Очищаем старую историю (более 24 часов)
    this.afkHistory = this.afkHistory.filter(a => 
      Date.now() - a.startTime < 24 * 60 * 60 * 1000
    );
    
    return {
      shouldReturn: true,
      shouldAnnounce,
      message,
      duration: afkDuration
    };
  }

  /**
   * Генерирует сообщение о возвращении
   */
  _getReturnMessage(duration) {
    if (duration > 20) {
      return ['вернулся', 'бэк', 'всем привет снова'][Math.floor(Math.random() * 3)];
    } else if (duration > 10) {
      return ['вернулся', 'бэк', 'я тут'][Math.floor(Math.random() * 3)];
    } else {
      // Короткий AFK - реже объявляют возвращение
      return Math.random() < 0.3 ? 'бэк' : null;
    }
  }

  /**
   * Проверяет может ли выполнять действия (не AFK)
   */
  canAct() {
    return !this.isAFK;
  }

  /**
   * Получить статус
   */
  getStatus() {
    if (!this.isAFK) {
      return {
        isAFK: false,
        minutesSinceLastAFK: (Date.now() - this.lastAFKTime) / (60 * 1000)
      };
    }
    
    return {
      isAFK: true,
      reason: this.afkReason,
      minutesAFK: (Date.now() - this.afkStartTime) / (60 * 1000),
      plannedMinutesRemaining: Math.max(0, (this.plannedReturnTime - Date.now()) / (60 * 1000))
    };
  }

  /**
   * Принудительное возвращение (например, при вызове игроком)
   */
  forceReturn() {
    if (this.isAFK) {
      logger.info(`[${this.profile.name}] Принудительное возвращение из AFK`);
      return this._returnFromAFK();
    }
    return { shouldReturn: false };
  }
}
