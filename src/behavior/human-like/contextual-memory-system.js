import { createLogger } from '../../utils/logger.js';
import { HumanErrorEngine } from '../human-error-engine.js';

const logger = createLogger('CONTEXTUAL_MEMORY');

/**
 * Контекстная система памяти — бот помнит прошлое и забывает детали.
 *
 * Ключевые механики:
 * 1. Краткосрочная память (последние 2 часа) — чёткая
 * 2. Среднесрочная память (последние 2 дня) — размытая
 * 3. Долгосрочная память (всё остальное) — только яркие моменты
 * 4. Забывчивость — детали стираются со временем
 * 5. Эмоциональные якоря — яркие события помнятся дольше
 */

export class ContextualMemorySystem {
  constructor({ agentName, durableStorage }) {
    this.agentName = agentName;
    this.storage = durableStorage;

    // Три уровня памяти
    this.shortTerm = []; // Последние 2 часа
    this.mediumTerm = []; // 2 часа - 2 дня
    this.longTerm = []; // > 2 дней

    // Забытые вещи (могут быть вспомнены)
    this.forgotten = [];

    // Искажения памяти
    this.distortedMemories = new Map();

    this.loadFromStorage();
  }

  /**
   * Записывает новое воспоминание
   */
  remember(event, context = {}) {
    const memory = {
      id: this._generateId(),
      timestamp: Date.now(),
      event: event,
      location: context.location,
      participants: context.participants || [],
      emotionalIntensity: context.emotionalIntensity || 0.5,
      importance: context.importance || 0.5,
      details: context.details || {},
      clarity: 1.0, // Изначально чёткое
      accessCount: 0, // Сколько раз вспоминали
    };

    this.shortTerm.push(memory);

    logger.debug(`[${this.agentName}] Запомнил: ${event}`);

    // Если очень важное — сразу закрепляем
    if (memory.importance > 0.8 || memory.emotionalIntensity > 0.8) {
      memory.anchored = true;
    }

    this._trimShortTerm();
  }

  /**
   * Вспоминает событие (с возможной неточностью)
   */
  recall(query, context = {}) {
    const now = Date.now();

    // Ищем во всех уровнях памяти
    const allMemories = [
      ...this.shortTerm,
      ...this.mediumTerm,
      ...this.longTerm,
    ];

    const relevant = allMemories.filter(m =>
      this._isRelevant(m, query, context)
    );

    if (relevant.length === 0) {
      // Может быть забыли?
      return this._tryRecallForgotten(query, context);
    }

    // Сортируем по релевантности и свежести
    relevant.sort((a, b) => {
      const scoreA = this._calculateRecallScore(a, query, now);
      const scoreB = this._calculateRecallScore(b, query, now);
      return scoreB - scoreA;
    });

    const memory = relevant[0];
    memory.accessCount++;

    // Память может быть искажена
    return this._applyMemoryDistortion(memory);
  }

  /**
   * Получает последние N воспоминаний (для контекста)
   */
  getRecentContext(count = 5) {
    return this.shortTerm
      .slice(-count)
      .map(m => ({
        event: m.event,
        timestamp: m.timestamp,
        participants: m.participants,
      }));
  }

  /**
   * Забывает менее важные детали (естественный процесс)
   */
  naturalForget() {
    const now = Date.now();

    // Проверяем каждое воспоминание
    for (const memory of this.shortTerm) {
      const age = now - memory.timestamp;

      // Вероятность забыть увеличивается со временем
      let forgetChance = 0;

      if (age > 7200000) { // > 2 часов
        forgetChance = 0.3;
      }

      // Важные события забываются реже
      forgetChance *= (1 - memory.importance);
      forgetChance *= (1 - memory.emotionalIntensity * 0.5);

      // Якорные воспоминания не забываются
      if (memory.anchored) {
        forgetChance = 0;
      }

      if (HumanErrorEngine.chance(forgetChance)) {
        this._forgetMemory(memory);
      } else {
        // Снижаем чёткость
        memory.clarity *= 0.95;
      }
    }
  }

  /**
   * Иногда спонтанно вспоминает что-то (как у людей)
   */
  spontaneousRecall() {
    if (!HumanErrorEngine.chance(0.02)) return null; // 2% шанс

    // Выбираем случайное воспоминание из среднесрочной памяти
    if (this.mediumTerm.length === 0) return null;

    const memory = HumanErrorEngine.choice(this.mediumTerm);

    // Эмоционально яркие воспоминания всплывают чаще
    if (memory.emotionalIntensity > 0.6 || HumanErrorEngine.chance(0.3)) {
      memory.accessCount++;

      return {
        event: memory.event,
        timestamp: memory.timestamp,
        clarity: memory.clarity,
        spontaneous: true,
      };
    }

    return null;
  }

  /**
   * Обновляет уровни памяти (перемещает из краткосрочной в долгосрочную)
   */
  consolidate() {
    const now = Date.now();
    const shortTermCutoff = now - 7200000; // 2 часа
    const mediumTermCutoff = now - 172800000; // 2 дня

    // Краткосрочная → Среднесрочная
    const toMedium = this.shortTerm.filter(m => m.timestamp < shortTermCutoff);
    this.shortTerm = this.shortTerm.filter(m => m.timestamp >= shortTermCutoff);
    this.mediumTerm.push(...toMedium);

    // Среднесрочная → Долгосрочная (только важные)
    const toLong = this.mediumTerm.filter(m =>
      m.timestamp < mediumTermCutoff &&
      (m.importance > 0.6 || m.emotionalIntensity > 0.7 || m.anchored)
    );
    this.mediumTerm = this.mediumTerm.filter(m =>
      m.timestamp >= mediumTermCutoff || toLong.includes(m)
    );
    this.longTerm.push(...toLong);

    // Забываем неважные из среднесрочной
    const toForget = this.mediumTerm.filter(m =>
      m.timestamp < mediumTermCutoff &&
      m.importance < 0.4 &&
      !m.anchored
    );
    toForget.forEach(m => this._forgetMemory(m));
    this.mediumTerm = this.mediumTerm.filter(m => !toForget.includes(m));

    // Ограничиваем размер долгосрочной памяти
    if (this.longTerm.length > 100) {
      // Удаляем наименее важные
      this.longTerm.sort((a, b) => {
        const scoreA = a.importance + a.emotionalIntensity + (a.anchored ? 2 : 0);
        const scoreB = b.importance + b.emotionalIntensity + (b.anchored ? 2 : 0);
        return scoreB - scoreA;
      });
      this.longTerm = this.longTerm.slice(0, 100);
    }

    this.saveToStorage();
  }

  /**
   * Забывает воспоминание (но может вспомнить позже)
   */
  _forgetMemory(memory) {
    // Не удаляем полностью — перемещаем в "забытые"
    this.forgotten.push({
      ...memory,
      forgotAt: Date.now(),
      recallDifficulty: 0.8, // Сложность вспомнить
    });

    // Удаляем из активной памяти
    this.shortTerm = this.shortTerm.filter(m => m.id !== memory.id);
    this.mediumTerm = this.mediumTerm.filter(m => m.id !== memory.id);

    logger.debug(`[${this.agentName}] Забыл: ${memory.event}`);
  }

  /**
   * Пытается вспомнить забытое (с трудом)
   */
  _tryRecallForgotten(query, context) {
    const relevant = this.forgotten.filter(m =>
      this._isRelevant(m, query, context)
    );

    if (relevant.length === 0) return null;

    // Сортируем по сложности вспоминания
    relevant.sort((a, b) => a.recallDifficulty - b.recallDifficulty);

    const memory = relevant[0];

    // Шанс вспомнить зависит от сложности
    const recallChance = 1 - memory.recallDifficulty;

    if (HumanErrorEngine.chance(recallChance)) {
      // Вспомнили! Но память нечёткая
      memory.clarity = HumanErrorEngine.range(0.3, 0.6); // 30-60% чёткости

      // Возвращаем в краткосрочную память
      this.shortTerm.push(memory);
      this.forgotten = this.forgotten.filter(m => m.id !== memory.id);

      logger.info(`[${this.agentName}] Вспомнил забытое: ${memory.event}`);

      return {
        event: memory.event,
        timestamp: memory.timestamp,
        clarity: memory.clarity,
        reconstructed: true, // Восстановленная память
      };
    }

    return null;
  }

  /**
   * Проверяет релевантность воспоминания запросу
   */
  _isRelevant(memory, query, context) {
    // Простое совпадение по словам
    const memoryText = JSON.stringify(memory).toLowerCase();
    const queryWords = query.toLowerCase().split(' ');

    const matches = queryWords.filter(word => memoryText.includes(word));

    // Релевантно если совпадает хотя бы половина слов
    return matches.length >= Math.ceil(queryWords.length / 2);
  }

  /**
   * Вычисляет оценку для сортировки воспоминаний
   */
  _calculateRecallScore(memory, query, now) {
    let score = 0;

    // Свежесть (недавние события важнее)
    const age = now - memory.timestamp;
    const freshnessScore = 1 / (1 + age / 3600000); // Деление на часы
    score += freshnessScore * 30;

    // Важность
    score += memory.importance * 20;

    // Эмоциональная интенсивность
    score += memory.emotionalIntensity * 15;

    // Чёткость
    score += memory.clarity * 10;

    // Якорные воспоминания
    if (memory.anchored) {
      score += 25;
    }

    // Часто вспоминаемые
    score += Math.min(memory.accessCount, 5) * 2;

    return score;
  }

  /**
   * Применяет искажения памяти (детали размываются)
   */
  _applyMemoryDistortion(memory) {
    const distorted = { ...memory };

    // Чем менее чёткая память, тем больше искажений
    const distortionLevel = 1 - memory.clarity;

    if (distortionLevel > 0.3 && HumanErrorEngine.chance(distortionLevel)) {
      // Искажаем детали
      if (distorted.details) {
        distorted.details = this._distortDetails(distorted.details, distortionLevel);
        distorted.distorted = true;
      }
    }

    return distorted;
  }

  /**
   * Искажает детали воспоминания
   */
  _distortDetails(details, level) {
    const distorted = { ...details };

    // Числа становятся приблизительными
    for (const [key, value] of Object.entries(distorted)) {
      if (typeof value === 'number' && HumanErrorEngine.chance(level)) {
        const variation = value * level * 0.5;
        distorted[key] = Math.round(value + HumanErrorEngine.jitter(variation));
      }
    }

    return distorted;
  }

  /**
   * Генерирует уникальный ID
   */
  _generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ограничивает размер краткосрочной памяти
   */
  _trimShortTerm() {
    const maxSize = 50;
    if (this.shortTerm.length > maxSize) {
      // Удаляем самые старые и наименее важные
      this.shortTerm.sort((a, b) => {
        const scoreA = a.timestamp + a.importance * 3600000;
        const scoreB = b.timestamp + b.importance * 3600000;
        return scoreB - scoreA;
      });
      this.shortTerm = this.shortTerm.slice(0, maxSize);
    }
  }

  /**
   * Сохраняет в постоянное хранилище
   */
  saveToStorage() {
    // Persistence is optional: only use the storage if it actually exposes a
    // key/value save() method. MemoryManager (the storage passed in index.js)
    // has no such method, so we no-op instead of throwing.
    if (!this.storage || typeof this.storage.save !== 'function') return;

    try {
      this.storage.save(`memory_${this.agentName}`, {
        shortTerm: this.shortTerm,
        mediumTerm: this.mediumTerm.slice(-100), // Только последние 100
        longTerm: this.longTerm,
        forgotten: this.forgotten.slice(-50), // Только последние 50 забытых
      });
    } catch (err) {
      logger.error(`Ошибка сохранения памяти: ${err.message}`);
    }
  }

  /**
   * Загружает из постоянного хранилища
   */
  loadFromStorage() {
    // Persistence is optional: only load if the storage exposes a load()
    // method. MemoryManager (passed in index.js) has none, so we no-op
    // instead of throwing "this.storage.load is not a function".
    if (!this.storage || typeof this.storage.load !== 'function') return;

    try {
      const data = this.storage.load(`memory_${this.agentName}`);
      if (data) {
        this.shortTerm = data.shortTerm || [];
        this.mediumTerm = data.mediumTerm || [];
        this.longTerm = data.longTerm || [];
        this.forgotten = data.forgotten || [];

        logger.info(`[${this.agentName}] Загружено воспоминаний: ${this.shortTerm.length + this.mediumTerm.length + this.longTerm.length}`);
      }
    } catch (err) {
      logger.warn(`Не удалось загрузить память: ${err.message}`);
    }
  }

  /**
   * Получает статистику памяти
   */
  getStats() {
    return {
      shortTerm: this.shortTerm.length,
      mediumTerm: this.mediumTerm.length,
      longTerm: this.longTerm.length,
      forgotten: this.forgotten.length,
      averageClarity: this._calculateAverageClarity(),
    };
  }

  /**
   * Вычисляет среднюю чёткость воспоминаний
   */
  _calculateAverageClarity() {
    const all = [...this.shortTerm, ...this.mediumTerm, ...this.longTerm];
    if (all.length === 0) return 1.0;

    const totalClarity = all.reduce((sum, m) => sum + m.clarity, 0);
    return totalClarity / all.length;
  }
}
