import { createLogger } from '../../utils/logger.js';

const logger = createLogger('DYNAMIC_EMOTIONS');

/**
 * Динамическая система эмоций — СЛОЖНАЯ модель человеческих эмоций.
 *
 * Принципы:
 * 1. Эмоции — не простые числа, а сложные состояния
 * 2. Эмоции взаимодействуют друг с другом
 * 3. Эмоции имеют инерцию (не меняются моментально)
 * 4. Личность влияет на эмоциональную динамику
 * 5. Физическое состояние влияет на эмоции
 * 6. Эмоциональная память — события оставляют след
 */

export class DynamicEmotionalSystem {
  constructor({ agentName, personality }) {
    this.agentName = agentName;
    this.personality = personality;

    // Базовые эмоции (0-1)
    this.emotions = {
      joy: 0.5,          // Радость
      excitement: 0.4,   // Волнение
      satisfaction: 0.5, // Удовлетворение
      calmness: 0.6,     // Спокойствие

      stress: 0.2,       // Стресс
      frustration: 0.1,  // Фрустрация
      fear: 0.0,         // Страх
      anger: 0.0,        // Злость

      curiosity: 0.4,    // Любопытство
      boredom: 0.2,      // Скука
      fatigue: 0.1,      // Усталость
      loneliness: 0.1,   // Одиночество

      confidence: 0.6,   // Уверенность
      pride: 0.4,        // Гордость
      shame: 0.0,        // Стыд
      guilt: 0.0,        // Вина
    };

    // Целевые значения (эмоции стремятся к ним)
    this.targetEmotions = { ...this.emotions };

    // Инерция каждой эмоции (как быстро меняется)
    this.emotionalInertia = this._calculateInertia();

    // Эмоциональные связи (одна эмоция влияет на другую)
    this.emotionalLinks = this._buildEmotionalLinks();

    // Эмоциональная история
    this.emotionalHistory = [];
    this.maxHistoryLength = 50;

    // Базовый эмоциональный профиль (личность)
    this.baselineEmotions = this._calculateBaseline();

    // Текущее настроение (агрегат эмоций)
    this.currentMood = 'neutral';

    // Эмоциональная стабильность (0-1)
    this.stability = 0.7;
  }

  /**
   * Обрабатывает событие и обновляет эмоции
   */
  processEvent(event, context = {}) {
    // Определяем эмоциональный импакт события
    const impact = this._calculateEmotionalImpact(event, context);

    // Обновляем целевые эмоции
    for (const [emotion, change] of Object.entries(impact)) {
      this.targetEmotions[emotion] = this._clamp(
        this.targetEmotions[emotion] + change,
        0,
        1
      );
    }

    // Записываем в историю
    this._recordEmotionalEvent(event, impact);

    logger.debug(`[${this.agentName}] Эмоции после "${event}": ${this._getTopEmotions(3).join(', ')}`);
  }

  /**
   * Обновляет эмоциональное состояние (каждый тик)
   */
  update(deltaTime = 1000) {
    // 1. Эмоции движутся к целевым значениям (с инерцией)
    for (const emotion in this.emotions) {
      const current = this.emotions[emotion];
      const target = this.targetEmotions[emotion];
      const inertia = this.emotionalInertia[emotion];

      // Скорость изменения зависит от инерции
      const speed = (1 - inertia) * (deltaTime / 5000);
      const delta = (target - current) * speed;

      this.emotions[emotion] = this._clamp(current + delta, 0, 1);
    }

    // 2. Эмоциональные связи (одна эмоция влияет на другую)
    this._applyEmotionalLinks();

    // 3. Возврат к базовому уровню (со временем)
    this._applyBaselineGravity(deltaTime);

    // 4. Обновляем текущее настроение
    this._updateMood();

    // 5. Эмоциональная стабильность влияет на волатильность
    this._applyStability();
  }

  /**
   * Получает текущее эмоциональное состояние
   */
  getState() {
    return {
      emotions: { ...this.emotions },
      mood: this.currentMood,
      dominantEmotions: this._getTopEmotions(3),
      stability: this.stability,
      arousal: this._calculateArousal(),
      valence: this._calculateValence(),
    };
  }

  /**
   * Получает текущее настроение (агрегат эмоций)
   */
  getMood() {
    return {
      mood: this.currentMood,
      arousal: this._calculateArousal(), // Уровень возбуждения (0-1)
      valence: this._calculateValence(), // Положительность (-1 до 1)
      ...this.emotions,
    };
  }

  /**
   * Вычисляет эмоциональный импакт события
   */
  _calculateEmotionalImpact(event, context) {
    const impact = {};

    // Определяем тип события и его эффект
    const eventTypes = {
      'found_diamonds': {
        joy: 0.4,
        excitement: 0.5,
        satisfaction: 0.3,
        boredom: -0.3,
      },
      'took_damage': {
        fear: 0.3,
        stress: 0.2,
        calmness: -0.3,
      },
      'killed_mob': {
        satisfaction: 0.2,
        confidence: 0.15,
        stress: -0.1,
      },
      'died': {
        frustration: 0.6,
        stress: 0.4,
        confidence: -0.3,
        shame: 0.2,
      },
      'player_joined': {
        excitement: 0.2,
        loneliness: -0.3,
        curiosity: 0.3,
      },
      'player_left': {
        loneliness: 0.2,
        calmness: 0.1,
      },
      'completed_goal': {
        satisfaction: 0.5,
        pride: 0.3,
        confidence: 0.2,
      },
      'failed_task': {
        frustration: 0.3,
        confidence: -0.2,
        stress: 0.2,
      },
      'long_mining': {
        boredom: 0.2,
        fatigue: 0.3,
        satisfaction: 0.1,
      },
      'exploration': {
        curiosity: 0.3,
        excitement: 0.2,
        calmness: -0.1,
      },
      'building': {
        satisfaction: 0.3,
        pride: 0.2,
        calmness: 0.1,
      },
      'social_positive': {
        joy: 0.3,
        satisfaction: 0.2,
        loneliness: -0.4,
      },
      'social_negative': {
        frustration: 0.2,
        anger: 0.1,
        stress: 0.2,
      },
    };

    // Базовый импакт
    const baseImpact = eventTypes[event] || {};

    // Применяем модификаторы контекста
    for (const [emotion, change] of Object.entries(baseImpact)) {
      let modifiedChange = change;

      // Личность влияет на силу эмоций
      modifiedChange *= this._getPersonalityModifier(emotion);

      // Текущие эмоции влияют (накопительный эффект)
      if (change > 0) {
        // Положительные эмоции усиливаются если настроение хорошее
        const valence = this._calculateValence();
        if (valence > 0.3) modifiedChange *= 1.2;
        if (valence < -0.3) modifiedChange *= 0.7;
      }

      // Физическое состояние
      if (context.health && context.health < 8) {
        if (emotion === 'stress' || emotion === 'fear') {
          modifiedChange *= 1.5;
        }
      }

      impact[emotion] = modifiedChange;
    }

    return impact;
  }

  /**
   * Модификатор личности для эмоций
   */
  _getPersonalityModifier(emotion) {
    const traits = this.personality?.traits || {};

    // Sam — более чувствительный к деталям
    if (this.agentName === 'Sam') {
      if (emotion === 'curiosity' || emotion === 'calmness') return 1.3;
    }

    // Max — эмоционально сдержанный
    if (this.agentName === 'Max') {
      if (emotion === 'excitement' || emotion === 'fear') return 0.7;
      if (emotion === 'confidence') return 1.2;
    }

    // Jack — более эмоциональный
    if (this.agentName === 'Jack') {
      if (emotion === 'excitement' || emotion === 'joy') return 1.4;
      if (emotion === 'calmness') return 0.6;
    }

    // Ryan — спокойный и стабильный
    if (this.agentName === 'Ryan') {
      if (emotion === 'calmness' || emotion === 'satisfaction') return 1.3;
      if (emotion === 'excitement' || emotion === 'frustration') return 0.7;
    }

    // Alex — чувствительный к красоте
    if (this.agentName === 'Alex') {
      if (emotion === 'joy' || emotion === 'pride') return 1.2;
    }

    // Leo — уверенный
    if (this.agentName === 'Leo') {
      if (emotion === 'confidence' || emotion === 'pride') return 1.3;
      if (emotion === 'fear' || emotion === 'shame') return 0.6;
    }

    return 1.0;
  }

  /**
   * Вычисляет инерцию эмоций (как быстро меняются)
   */
  _calculateInertia() {
    return {
      joy: 0.6,          // Средняя инерция
      excitement: 0.4,   // Быстро меняется
      satisfaction: 0.7, // Медленно
      calmness: 0.8,     // Очень медленно

      stress: 0.5,
      frustration: 0.6,
      fear: 0.3,         // Быстро
      anger: 0.5,

      curiosity: 0.5,
      boredom: 0.7,
      fatigue: 0.8,      // Медленно накапливается
      loneliness: 0.8,

      confidence: 0.7,
      pride: 0.6,
      shame: 0.5,
      guilt: 0.6,
    };
  }

  /**
   * Создаёт связи между эмоциями
   */
  _buildEmotionalLinks() {
    return [
      // Положительные эмоции усиливают друг друга
      { from: 'joy', to: 'satisfaction', strength: 0.2 },
      { from: 'satisfaction', to: 'confidence', strength: 0.15 },
      { from: 'confidence', to: 'pride', strength: 0.1 },

      // Отрицательные эмоции усиливают друг друга
      { from: 'stress', to: 'frustration', strength: 0.2 },
      { from: 'frustration', to: 'anger', strength: 0.15 },
      { from: 'fear', to: 'stress', strength: 0.3 },

      // Противоположности подавляют друг друга
      { from: 'joy', to: 'frustration', strength: -0.2 },
      { from: 'calmness', to: 'stress', strength: -0.3 },
      { from: 'confidence', to: 'fear', strength: -0.25 },
      { from: 'satisfaction', to: 'boredom', strength: -0.2 },

      // Усталость влияет на всё
      { from: 'fatigue', to: 'frustration', strength: 0.15 },
      { from: 'fatigue', to: 'excitement', strength: -0.2 },

      // Одиночество влияет на настроение
      { from: 'loneliness', to: 'boredom', strength: 0.2 },
      { from: 'loneliness', to: 'joy', strength: -0.15 },
    ];
  }

  /**
   * Применяет эмоциональные связи
   */
  _applyEmotionalLinks() {
    for (const link of this.emotionalLinks) {
      const fromValue = this.emotions[link.from];
      const influence = fromValue * link.strength * 0.01;

      this.emotions[link.to] = this._clamp(
        this.emotions[link.to] + influence,
        0,
        1
      );
    }
  }

  /**
   * Вычисляет базовый уровень эмоций (личность)
   */
  _calculateBaseline() {
    const baseline = {
      joy: 0.5,
      excitement: 0.4,
      satisfaction: 0.5,
      calmness: 0.6,
      stress: 0.2,
      frustration: 0.1,
      fear: 0.0,
      anger: 0.0,
      curiosity: 0.4,
      boredom: 0.2,
      fatigue: 0.1,
      loneliness: 0.1,
      confidence: 0.6,
      pride: 0.4,
      shame: 0.0,
      guilt: 0.0,
    };

    // Модифицируем базовый уровень по личности
    if (this.agentName === 'Jack') {
      baseline.excitement = 0.6;
      baseline.calmness = 0.4;
    } else if (this.agentName === 'Ryan') {
      baseline.calmness = 0.7;
      baseline.satisfaction = 0.6;
    } else if (this.agentName === 'Max') {
      baseline.confidence = 0.7;
      baseline.calmness = 0.6;
    }

    return baseline;
  }

  /**
   * Притяжение к базовому уровню (со временем)
   */
  _applyBaselineGravity(deltaTime) {
    const gravityStrength = 0.0001 * deltaTime; // Очень медленно

    for (const emotion in this.emotions) {
      const current = this.emotions[emotion];
      const baseline = this.baselineEmotions[emotion];

      const delta = (baseline - current) * gravityStrength;
      this.emotions[emotion] = this._clamp(current + delta, 0, 1);
    }
  }

  /**
   * Применяет эмоциональную стабильность
   */
  _applyStability() {
    // Более стабильные личности имеют меньшие колебания
    const volatility = 1 - this.stability;

    for (const emotion in this.emotions) {
      const baseline = this.baselineEmotions[emotion];
      const current = this.emotions[emotion];

      // Ограничиваем отклонение от базового уровня
      const maxDeviation = 0.5 * (1 + volatility);
      const deviation = current - baseline;

      if (Math.abs(deviation) > maxDeviation) {
        this.emotions[emotion] = baseline + Math.sign(deviation) * maxDeviation;
      }
    }
  }

  /**
   * Обновляет текущее настроение
   */
  _updateMood() {
    const arousal = this._calculateArousal();
    const valence = this._calculateValence();

    // Определяем настроение по arousal-valence модели
    if (valence > 0.3) {
      if (arousal > 0.6) {
        this.currentMood = 'excited'; // Возбуждённый
      } else if (arousal > 0.3) {
        this.currentMood = 'happy'; // Счастливый
      } else {
        this.currentMood = 'content'; // Довольный
      }
    } else if (valence < -0.3) {
      if (arousal > 0.6) {
        this.currentMood = 'stressed'; // В стрессе
      } else if (arousal > 0.3) {
        this.currentMood = 'frustrated'; // Расстроенный
      } else {
        this.currentMood = 'sad'; // Грустный
      }
    } else {
      if (arousal > 0.5) {
        this.currentMood = 'tense'; // Напряжённый
      } else if (arousal < 0.3) {
        this.currentMood = 'calm'; // Спокойный
      } else {
        this.currentMood = 'neutral'; // Нейтральный
      }
    }
  }

  /**
   * Вычисляет уровень возбуждения (arousal)
   */
  _calculateArousal() {
    const activatingEmotions = [
      'excitement',
      'fear',
      'anger',
      'stress',
      'curiosity',
    ];

    const deactivatingEmotions = [
      'calmness',
      'fatigue',
      'boredom',
      'satisfaction',
    ];

    let arousal = 0.5;

    for (const emotion of activatingEmotions) {
      arousal += this.emotions[emotion] * 0.2;
    }

    for (const emotion of deactivatingEmotions) {
      arousal -= this.emotions[emotion] * 0.15;
    }

    return this._clamp(arousal, 0, 1);
  }

  /**
   * Вычисляет валентность (положительность)
   */
  _calculateValence() {
    const positiveEmotions = [
      'joy',
      'satisfaction',
      'pride',
      'confidence',
    ];

    const negativeEmotions = [
      'frustration',
      'fear',
      'anger',
      'stress',
      'shame',
      'guilt',
      'loneliness',
    ];

    let valence = 0;

    for (const emotion of positiveEmotions) {
      valence += this.emotions[emotion] * 0.25;
    }

    for (const emotion of negativeEmotions) {
      valence -= this.emotions[emotion] * 0.2;
    }

    return this._clamp(valence, -1, 1);
  }

  /**
   * Получает топ-N эмоций
   */
  _getTopEmotions(n = 3) {
    const sorted = Object.entries(this.emotions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

    return sorted
      .filter(([_, value]) => value > 0.4) // Только значимые
      .map(([emotion, value]) => `${emotion}(${(value * 100).toFixed(0)}%)`);
  }

  /**
   * Записывает эмоциональное событие в историю
   */
  _recordEmotionalEvent(event, impact) {
    this.emotionalHistory.push({
      timestamp: Date.now(),
      event,
      impact,
      emotions: { ...this.emotions },
      mood: this.currentMood,
    });

    if (this.emotionalHistory.length > this.maxHistoryLength) {
      this.emotionalHistory.shift();
    }
  }

  /**
   * Ограничивает значение
   */
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Получает историю эмоций
   */
  getHistory(count = 10) {
    return this.emotionalHistory.slice(-count);
  }
}
