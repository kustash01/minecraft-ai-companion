import { createLogger } from '../../utils/logger.js';
import { HumanErrorEngine } from '../human-error-engine.js';

const logger = createLogger('HUMAN_IMPERFECTIONS');

/**
 * Система человеческих ошибок и несовершенств.
 * Боты иногда ошибаются, забывают, тупят - как настоящие люди.
 */
export class HumanImperfections {
  constructor(profile, aiBrain = null) {
    this.profile = profile;
    this.aiBrain = aiBrain;

    // Память о забытых вещах
    this.forgottenThings = [];

    // Последняя ошибка
    this.lastMistakeTime = 0;

    // Отложенные задачи (прокрастинация)
    this.postponedTasks = [];

    // НОВОЕ: Микро-привычки и паттерны поведения
    this.microHabits = {
      jumpsWhileWalking: HumanErrorEngine.chance(0.5), // Прыгает при ходьбе
      spinWhenIdle: HumanErrorEngine.chance(0.4), // Крутится когда стоит
      sneakWhenScared: HumanErrorEngine.chance(0.6), // Крадётся когда страшно
      checkInventoryOften: HumanErrorEngine.chance(0.5), // Часто проверяет инвентарь
      randomCrouches: HumanErrorEngine.chance(0.3), // Случайные присяды
    };

    // Текущее состояние
    this.currentMood = 'neutral'; // bored, excited, tired, anxious, relaxed
    this.attention = 1.0; // Уровень концентрации (1.0 = полная, 0.0 = совсем отвлёкся)
    this.motivation = 0.7; // Мотивация что-то делать
    this.lastInterestingEvent = 0;
    this.boredSince = null;
    this.distractionTarget = null; // На что отвлёкся
  }

  /**
   * Проверяет должен ли бот совершить ошибку
   */
  shouldMakeMistake(action, context = {}) {
    const { tiredness, mood, busy } = context;
    
    // Базовая вероятность ошибки
    let mistakeChance = 0.05; // 5% базовый шанс
    
    // Усталость увеличивает ошибки
    if (tiredness > 0.7) {
      mistakeChance += 0.15;
    } else if (tiredness > 0.4) {
      mistakeChance += 0.05;
    }
    
    // Спешка увеличивает ошибки
    if (busy) {
      mistakeChance += 0.08;
    }
    
    // Некоторые действия более подвержены ошибкам
    const errorProneActions = {
      'navigation': 0.15,      // Потеряться
      'inventory_management': 0.1, // Выбросить не то
      'crafting': 0.08,        // Скрафтить не то
      'combat': 0.12,          // Промахнуться
      'parkour': 0.2,          // Упасть
      'building': 0.07         // Поставить не туда
    };
    
    if (errorProneActions[action]) {
      mistakeChance += errorProneActions[action];
    }
    
    // Некоторые персонажи более неуклюжие
    if (this.profile.name === 'Jack') {
      mistakeChance *= 1.5; // Jack более безбашенный
    } else if (this.profile.name === 'Max') {
      mistakeChance *= 0.7; // Max более аккуратный
    }
    
    const shouldMistake = HumanErrorEngine.chance(mistakeChance, context);
    
    if (shouldMistake) {
      this.lastMistakeTime = Date.now();
    }
    
    return {
      shouldMistake,
      mistakeType: this._chooseMistakeType(action)
    };
  }

  /**
   * Выбирает тип ошибки
   */
  _chooseMistakeType(action) {
    const mistakeTypes = {
      'navigation': ['got_lost', 'wrong_direction', 'fell_into_hole'],
      'inventory_management': ['dropped_wrong_item', 'filled_inventory', 'lost_item'],
      'crafting': ['crafted_wrong', 'forgot_recipe', 'missing_materials'],
      'combat': ['missed_hit', 'friendly_fire', 'ran_wrong_way'],
      'parkour': ['fell_down', 'took_fall_damage', 'missed_jump'],
      'building': ['placed_wrong_block', 'misaligned', 'forgot_material']
    };
    
    const types = mistakeTypes[action] || ['generic_mistake'];
    return HumanErrorEngine.choice(types);
  }

  /**
   * Проверяет забыл ли что-то
   */
  shouldForget(item, context = {}) {
    const { tiredness, importance } = context;
    
    // Базовая вероятность забыть
    let forgetChance = 0.03; // 3%
    
    // Усталость увеличивает забывчивость
    if (tiredness > 0.7) {
      forgetChance += 0.12;
    } else if (tiredness > 0.4) {
      forgetChance += 0.05;
    }
    
    // Важные вещи забывают реже
    if (importance === 'critical') {
      forgetChance *= 0.3;
    } else if (importance === 'high') {
      forgetChance *= 0.5;
    }
    
    const shouldForget = HumanErrorEngine.chance(forgetChance, context);
    
    if (shouldForget) {
      this.forgottenThings.push({
        item,
        forgotAt: Date.now(),
        remembered: false
      });
      
      logger.debug(`[${this.profile.name}] Забыл: ${item}`);
    }
    
    return shouldForget;
  }

  /**
   * Проверяет вспомнил ли забытую вещь
   */
  checkRemembering() {
    const now = Date.now();
    
    for (const forgotten of this.forgottenThings) {
      if (!forgotten.remembered) {
        const timeForgotten = (now - forgotten.forgotAt) / (60 * 1000); // минуты
        
        // Вероятность вспомнить растет со временем
        let rememberChance = Math.min(0.8, timeForgotten / 30); // Максимум 80% через 30 минут
        
        if (HumanErrorEngine.chance(rememberChance)) {
          forgotten.remembered = true;
          logger.debug(`[${this.profile.name}] Вспомнил: ${forgotten.item}`);
          
          return {
            remembered: true,
            item: forgotten.item,
            message: this._generateRememberingMessage(forgotten.item)
          };
        }
      }
    }
    
    // Очищаем старые забытые вещи (более 2 часов)
    this.forgottenThings = this.forgottenThings.filter(f => 
      !f.remembered && (now - f.forgotAt < 2 * 60 * 60 * 1000)
    );
    
    return { remembered: false };
  }

  /**
   * Генерирует сообщение о том что вспомнил
   */
  _generateRememberingMessage(item) {
    const messages = [
      `Блин, я же забыл ${item}`,
      `Стоп, а где ${item}? Я же его куда-то положил`,
      `Ой, ${item} забыл взять`,
      `${item}... где же я его оставил?`
    ];
    
    return HumanErrorEngine.choice(messages);
  }

  /**
   * Проверяет должен ли отложить задачу (прокрастинация)
   */
  shouldPostponeTask(task, context = {}) {
    const { mood, tiredness, taskAppealing } = context;
    
    // Базовая вероятность отложить
    let postponeChance = 0.1; // 10%
    
    // Усталость увеличивает прокрастинацию
    if (tiredness > 0.7) {
      postponeChance += 0.3;
    } else if (tiredness > 0.4) {
      postponeChance += 0.15;
    }
    
    // Скучная задача - больше шанс отложить
    if (taskAppealing === 'boring') {
      postponeChance += 0.25;
    } else if (taskAppealing === 'interesting') {
      postponeChance -= 0.15;
    }
    
    // Настроение
    if (mood === 'bored' || mood === 'tired') {
      postponeChance += 0.2;
    }
    
    const shouldPostpone = HumanErrorEngine.chance(postponeChance, context);
    
    if (shouldPostpone) {
      this.postponedTasks.push({
        task,
        postponedAt: Date.now(),
        reason: tiredness > 0.7 ? 'tired' : (taskAppealing === 'boring' ? 'boring' : 'lazy')
      });
      
      logger.debug(`[${this.profile.name}] Отложил задачу: ${task}`);
    }
    
    return {
      shouldPostpone,
      message: this._generatePostponeMessage(tiredness, taskAppealing)
    };
  }

  /**
   * Генерирует сообщение об откладывании
   */
  _generatePostponeMessage(tiredness, taskAppealing) {
    if (tiredness > 0.7) {
      return HumanErrorEngine.choice(['Устал я, потом сделаю', 'Давай попозже', 'Не могу сейчас, устал']);
    }
    
    if (taskAppealing === 'boring') {
      return HumanErrorEngine.choice(['Лень', 'Не хочу щас', 'Давай потом', 'Скучно это']);
    }
    
    return HumanErrorEngine.choice(['Попозже', 'Потом сделаю', 'Ща не хочу']);
  }

  /**
   * Проверяет должен ли отвлечься на что-то
   */
  shouldGetDistracted(distraction, context = {}) {
    const { currentTask, distractionInterest } = context;
    
    // Базовая вероятность отвлечься
    let distractChance = 0.08; // 8%
    
    // Если отвлекающая штука интересная - больше шанс
    if (distractionInterest === 'very_interesting') {
      distractChance += 0.4;
    } else if (distractionInterest === 'interesting') {
      distractChance += 0.2;
    }
    
    // Если текущая задача скучная - легче отвлечься
    if (currentTask?.boring) {
      distractChance += 0.15;
    }
    
    // Jack легче отвлекается
    if (this.profile.name === 'Jack') {
      distractChance *= 1.5;
    }
    
    const shouldDistract = HumanErrorEngine.chance(distractChance, context);
    
    return {
      shouldDistract,
      message: this._generateDistractionMessage(distraction)
    };
  }

  /**
   * Генерирует сообщение об отвлечении
   */
  _generateDistractionMessage(distraction) {
    const messages = [
      `О, смотрите что я нашел`,
      `Стоп, а это что?`,
      `Ого, а тут ${distraction}`,
      `Минуту, гляньте сюда`
    ];
    
    return HumanErrorEngine.choice(messages);
  }

  /**
   * Проверяет должен ли принять неоптимальное решение
   */
  shouldMakeSuboptimalChoice(choices, context = {}) {
    const { tiredness, hasTime } = context;
    
    // Базовая вероятность тупого решения
    let badChoiceChance = 0.15; // 15%
    
    // Усталость увеличивает
    if (tiredness > 0.7) {
      badChoiceChance += 0.25;
    }
    
    // Если не спешит - думает лучше
    if (hasTime) {
      badChoiceChance *= 0.6;
    }
    
    const shouldMakeBadChoice = HumanErrorEngine.chance(badChoiceChance, context);
    
    if (shouldMakeBadChoice && choices.length > 1) {
      // Выбираем не оптимальный вариант
      const optimalIndex = 0; // Предполагаем что первый - оптимальный
      const suboptimalChoices = choices.filter((_, i) => i !== optimalIndex);
      const chosen = HumanErrorEngine.choice(suboptimalChoices);
      
      return {
        shouldMakeBadChoice: true,
        choice: chosen
      };
    }
    
    return {
      shouldMakeBadChoice: false,
      choice: choices[0]
    };
  }

  /**
   * Генерирует реакцию на собственную ошибку — живыми словами через LLM.
   * Без заготовленных фраз: модель получает ТИП ошибки и формулирует сама.
   */
  async generateMistakeReaction(mistakeType) {
    const shouldReact = HumanErrorEngine.chance(0.7); // 70% шанс прокомментировать ошибку
    if (!shouldReact) return { shouldReact: false };

    // Человеческое описание ситуации ошибки (не готовая реплика, а суть).
    const situations = {
      got_lost: 'ты заблудился, не понимаешь где находишься',
      fell_down: 'ты неудачно упал и ушибся',
      dropped_wrong_item: 'ты случайно выбросил не тот предмет',
      crafted_wrong: 'ты скрафтил не то, что хотел',
      missed_hit: 'ты промахнулся в бою',
      friendly_fire: 'ты случайно задел друга',
      forgot_recipe: 'ты забыл рецепт крафта',
    };
    const situation = situations[mistakeType] || 'ты оговорился/ошибся в мелочи';

    let message = 'блин';
    if (this.aiBrain?.generateQuickResponse) {
      try {
        const name = this.profile?.name || 'ты';
        const prompt = `Ты ${name}, играешь в Minecraft. Сейчас ${situation}. Брось одну короткую живую реакцию своими словами (1-3 слова, строчными, без точки), как вырывается у человека в такой момент:`;
        const res = await this.aiBrain.generateQuickResponse(prompt, {
          maxTokens: 12,
          temperature: 1.0,
          timeoutMs: 900,
        });
        const text = res.text?.trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
        if (text && text.length >= 1) message = text;
      } catch (_) {}
    }

    return { shouldReact: true, message };
  }
}
