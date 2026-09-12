import { createLogger } from '../utils/logger.js';

const logger = createLogger('AUTONOMOUS_GOALS');

/**
 * AutonomousGoals — система самостоятельных целей и развития бота.
 *
 * Бот НЕ просто реагирует на команды, а сам ХОЧЕТ что-то делать:
 * - Найти алмазы
 * - Построить свой дом
 * - Зачаровать снарягу
 * - Исследовать новые земли
 * - Найти деревню
 *
 * Это делает его живым игроком, а не прислугой.
 */
export class AutonomousGoals {
  constructor({ bot, memoryManager, aiBrain, config }) {
    this.bot = bot;
    this.memoryManager = memoryManager;
    this.aiBrain = aiBrain;
    this.config = config;
    this.agentName = config?.minecraft?.username || 'Bot';

    // Текущая автономная цель
    this.currentGoal = null;
    this.goalStartTime = 0;

    // Прогресс по долгосрочным целям
    this.progress = {
      diamondsFound: 0,
      houseBuilt: false,
      fullDiamondArmor: false,
      enchantedGear: false,
      villageFound: false,
      netherVisited: false,
    };

    // Возможные автономные цели.
    // Цель хранит только НАМЕРЕНИЕ (intent) — суть того, чем бот собрался
    // заняться. Текст в чат НЕ захардкожен: его живыми словами сгенерит LLM
    // в announceGoal(). Так нет шаблонных фраз.
    this.availableGoals = [
      {
        id: 'find_diamonds',
        name: 'Найти алмазы',
        priority: 0.8,
        minLevel: 'any',
        check: () => !this.progress.diamondsFound || this.progress.diamondsFound < 3,
        intent: 'пойти в шахту искать алмазы',
      },
      {
        id: 'build_house',
        name: 'Построить дом',
        priority: 0.6,
        minLevel: 'any',
        check: () => !this.progress.houseBuilt,
        intent: 'построить себе дом / базу',
      },
      {
        id: 'find_village',
        name: 'Найти деревню',
        priority: 0.5,
        minLevel: 'any',
        check: () => !this.progress.villageFound,
        intent: 'разведать окрестности и найти деревню',
      },
      {
        id: 'gather_resources',
        name: 'Собрать ресурсы',
        priority: 0.7,
        minLevel: 'any',
        check: () => this._needsResources(),
        intent: 'нафармить базовые ресурсы (дерево, камень, еда)',
      },
      {
        id: 'explore',
        name: 'Исследовать',
        priority: 0.4,
        minLevel: 'any',
        check: () => true, // Всегда можно исследовать
        intent: 'пойти погулять и посмотреть что вокруг',
      },
      {
        id: 'rest',
        name: 'Отдохнуть',
        priority: 0.3,
        minLevel: 'any',
        check: () => true,
        intent: 'отдохнуть — порыбачить или просто посидеть',
      },
    ];

    this.lastGoalCheck = Date.now();
    this.goalCheckInterval = 60000; // Проверяем раз в минуту
  }

  /**
   * Проверяет нужно ли боту выбрать новую цель
   */
  shouldConsiderNewGoal() {
    const now = Date.now();

    // Не слишком часто
    if (now - this.lastGoalCheck < this.goalCheckInterval) {
      return false;
    }

    this.lastGoalCheck = now;

    // Если уже есть активная цель — продолжаем её
    if (this.currentGoal && (now - this.goalStartTime) < 300000) { // 5 минут
      return false;
    }

    // Если бот сейчас занят (следует за кем-то, в бою) — не отвлекаемся
    if (this._isBusy()) {
      return false;
    }

    // Случайность — не каждую проверку выбираем цель
    if (Math.random() > 0.3) { // 30% шанс
      return false;
    }

    return true;
  }

  /**
   * Выбирает новую автономную цель
   */
  selectNewGoal() {
    // Фильтруем доступные цели
    const possible = this.availableGoals.filter(g => g.check());

    if (possible.length === 0) {
      logger.debug(`[${this.agentName}] Нет доступных автономных целей`);
      return null;
    }

    // Взвешенный случайный выбор по приоритету
    const totalPriority = possible.reduce((sum, g) => sum + g.priority, 0);
    let random = Math.random() * totalPriority;

    for (const goal of possible) {
      random -= goal.priority;
      if (random <= 0) {
        this.currentGoal = goal;
        this.goalStartTime = Date.now();
        logger.info(`[${this.agentName}] Выбрал автономную цель: ${goal.name}`);
        return goal;
      }
    }

    return possible[0];
  }

  /**
   * Объявляет цель в чат (через AI для естественности).
   * Текст НЕ захардкожен — LLM формулирует живыми словами из намерения.
   */
  async announceGoal(goal) {
    if (!goal || !this.aiBrain) return;

    try {
      const prompt = `[INTERNAL] Ты сам, без чьей-либо команды, решил заняться своим делом: ${goal.intent}. Брось напарникам короткую живую реплику (своими словами, 1 фраза), что ты пошёл это делать. Без формальностей, как в голосовом чате.`;

      const worldSnapshot = this.bot?.entity ? {
        health: this.bot.health || 20,
        food: this.bot.food || 20,
        position: this.bot.entity.position || { x: 0, y: 0, z: 0 },
      } : null;

      const response = await this.aiBrain.processMessage(prompt, worldSnapshot);

      if (response && this.bot?.chat) {
        this.bot.chat(response);
      }
    } catch (err) {
      logger.debug(`Не удалось объявить цель: ${err.message}`);
    }
  }

  /**
   * Проверяет занят ли бот
   */
  _isBusy() {
    // Проверяем движение
    if (this.bot?.pathfinder?.isMoving?.()) {
      return true;
    }

    // Проверяем здоровье
    if (this.bot?.health < 10) {
      return true;
    }

    // Проверяем бой (если есть враги рядом)
    const hostile = Object.values(this.bot?.entities || {}).find(e =>
      e && e.position &&
      ['zombie', 'skeleton', 'spider', 'creeper', 'enderman'].includes(e.name) &&
      this.bot.entity.position.distanceTo(e.position) < 16
    );

    if (hostile) {
      return true;
    }

    return false;
  }

  /**
   * Проверяет нужны ли боту базовые ресурсы
   */
  _needsResources() {
    if (!this.bot?.inventory) return true;

    const items = this.bot.inventory.items();
    const hasWood = items.some(i => i.name.includes('log') || i.name.includes('planks'));
    const hasStone = items.some(i => i.name.includes('cobblestone') || i.name.includes('stone'));
    const hasFood = items.some(i =>
      i.name.includes('bread') ||
      i.name.includes('cooked') ||
      i.name.includes('beef') ||
      i.name.includes('porkchop')
    );

    return !hasWood || !hasStone || !hasFood;
  }

  /**
   * Обновляет прогресс по целям
   */
  updateProgress(progressData) {
    Object.assign(this.progress, progressData);
    logger.debug(`[${this.agentName}] Обновлён прогресс:`, this.progress);
  }

  /**
   * Сбрасывает текущую цель
   */
  clearCurrentGoal() {
    this.currentGoal = null;
    this.goalStartTime = 0;
  }
}
