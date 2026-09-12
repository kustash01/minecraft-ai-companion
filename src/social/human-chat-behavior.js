import { createLogger } from '../utils/logger.js';

const logger = createLogger('HUMAN_CHAT');

/**
 * Модель естественного поведения в чате
 *
 * Принципы:
 * - Реальные люди молчат 90% времени
 * - Опечатки и недопечатки случаются
 * - Паузы на обдумывание перед ответом
 * - Реакция на контекст, не на триггеры
 * - Нет "персонажности" - только естественные черты
 */

export class HumanChatBehavior {
  constructor() {
    // Каждый человек иногда делает опечатки
    this.typoPatterns = {
      // Пропуск последней буквы
      endings: 0.03, // 3%

      // Случайные опечатки на клавиатуре (рядом стоящие клавиши на русской раскладке)
      keyboard: {
        'а': 'ф', 'о': 'р', 'е': 'у', 'и': 'ш', 'т': 'г',
        'н': 'р', 'с': 'в', 'в': 'а', 'к': 'у', 'м': 'и'
      },

      // Забывают пробелы
      spaceMissing: 0.02,

      // Повторяют букву
      doubleChar: 0.015,
    };

    // Паттерны естественной речи
    this.speechPatterns = {
      // Слова-паразиты (но умеренно!)
      fillers: ['хм', 'эм', 'ну', 'вот', 'типа', 'короче', 'блин'],
      fillerChance: 0.1, // 10% фраз

      // Недосказанность
      trailingOff: ['...', '..', '.', ''],
      trailingChance: 0.08,

      // Переспросы и неуверенность
      uncertainty: ['наверное', 'может', 'не уверен', 'хз', 'думаю'],
      uncertaintyChance: 0.12,

      // Сокращения (естественные, не "ахах лол")
      contractions: {
        'сейчас': 'щас',
        'ничего': 'ничо',
        'что-то': 'чёт',
        'нормально': 'норм',
        'хорошо': 'ок',
        'смотри': 'смотр',
      },
      contractionChance: 0.15,
    };

    // Тайминги (в миллисекундах)
    this.timings = {
      // Задержка перед ответом на вопрос (думают!)
      thinkBeforeAnswer: { min: 1500, max: 4000 },

      // Задержка на "печатание" (зависит от длины)
      typingSpeed: { min: 50, max: 120 }, // мс на символ

      // Случайные паузы в длинных сообщениях
      pauseInTyping: 0.1, // 10% шанс
      pauseDuration: { min: 300, max: 1200 },
    };
  }

  /**
   * Обработать текст, сделав его более естественным
   */
  makeNatural(text, agentPersonality = {}) {
    if (!text || text.length < 3) return text;

    let result = text;

    // 1. Убираем излишнюю экспрессивность
    result = this._toneDown(result);

    // 2. Добавляем естественные особенности речи
    result = this._addSpeechPatterns(result, agentPersonality);

    // 3. Редкие опечатки
    result = this._addTypos(result);

    // 4. Сокращения
    result = this._addContractions(result);

    return result;
  }

  /**
   * Убирает карикатурность ("ахах", множественные знаки препинания)
   */
  _toneDown(text) {
    // Убираем повторы знаков препинания
    text = text.replace(/!+/g, '');
    text = text.replace(/\?+/g, '?');
    text = text.replace(/\.{4,}/g, '...');

    // Убираем "молодёжный" сленг, который звучит неестественно
    const cringeWords = {
      'ахах': '', 'ахаха': '', 'хаха': '', 'лол': '',
      'кек': '', 'жиза': '', 'имба': '',
      'ахаххаа': '', 'азаза': ''
    };

    for (const [cringe, replacement] of Object.entries(cringeWords)) {
      const regex = new RegExp('\\b' + cringe + '\\b', 'gi');
      text = text.replace(regex, replacement);
    }

    // Очищаем лишние пробелы
    text = text.replace(/\s{2,}/g, ' ').trim();

    return text;
  }

  /**
   * Добавляет естественные речевые паттерны
   */
  _addSpeechPatterns(text, personality) {
    const words = text.split(' ');

    // Слова-паразиты в начале (редко!)
    if (Math.random() < this.speechPatterns.fillerChance && words.length > 3) {
      const filler = this.speechPatterns.fillers[
        Math.floor(Math.random() * this.speechPatterns.fillers.length)
      ];
      text = filler + ', ' + text;
    }

    // Неуверенность
    if (Math.random() < this.speechPatterns.uncertaintyChance) {
      const uncertain = this.speechPatterns.uncertainty[
        Math.floor(Math.random() * this.speechPatterns.uncertainty.length)
      ];

      // Добавляем в начало или конец
      if (Math.random() < 0.5) {
        text = uncertain + ' ' + text;
      } else {
        text = text + ' ' + uncertain;
      }
    }

    // Недосказанность (иногда)
    if (Math.random() < this.speechPatterns.trailingChance) {
      // Убираем последнее слово или добавляем многоточие
      if (words.length > 4 && Math.random() < 0.3) {
        words.pop();
        text = words.join(' ') + '...';
      } else {
        const trailing = this.speechPatterns.trailingOff[
          Math.floor(Math.random() * this.speechPatterns.trailingOff.length)
        ];
        text = text + trailing;
      }
    }

    return text;
  }

  /**
   * Добавляет естественные сокращения
   */
  _addContractions(text) {
    if (Math.random() > this.speechPatterns.contractionChance) return text;

    for (const [full, short] of Object.entries(this.speechPatterns.contractions)) {
      if (text.includes(full) && Math.random() < 0.6) {
        text = text.replace(full, short);
        break; // Только одно сокращение
      }
    }

    return text;
  }

  /**
   * Добавляет редкие опечатки
   */
  _addTypos(text) {
    const words = text.split(' ');

    // Пропуск последней буквы
    if (Math.random() < this.typoPatterns.endings && words.length > 2) {
      const idx = Math.floor(Math.random() * words.length);
      if (words[idx].length > 3) {
        words[idx] = words[idx].slice(0, -1);
      }
    }

    // Опечатка на клавиатуре (очень редко)
    if (Math.random() < 0.02) {
      const idx = Math.floor(Math.random() * words.length);
      const word = words[idx];

      for (const [correct, typo] of Object.entries(this.typoPatterns.keyboard)) {
        if (word.includes(correct) && Math.random() < 0.5) {
          words[idx] = word.replace(correct, typo);
          break;
        }
      }
    }

    // Пропуск пробела между короткими словами
    if (Math.random() < this.typoPatterns.spaceMissing && words.length > 3) {
      const idx = Math.floor(Math.random() * (words.length - 1));
      if (words[idx].length <= 3 && words[idx + 1].length <= 4) {
        words[idx] = words[idx] + words[idx + 1];
        words.splice(idx + 1, 1);
      }
    }

    // Повтор буквы
    if (Math.random() < this.typoPatterns.doubleChar) {
      const idx = Math.floor(Math.random() * words.length);
      const word = words[idx];
      if (word.length > 3) {
        const pos = Math.floor(Math.random() * (word.length - 1));
        words[idx] = word.slice(0, pos) + word[pos] + word.slice(pos);
      }
    }

    return words.join(' ');
  }

  /**
   * Вычисляет задержку перед ответом (люди думают!)
   */
  calculateResponseDelay(message, isQuestion, personality = {}) {
    let delay = 0;

    // Если вопрос — думаем перед ответом
    if (isQuestion) {
      const { min, max } = this.timings.thinkBeforeAnswer;
      delay += min + Math.random() * (max - min);
    }

    // Задержка на "печатание"
    const typingSpeed = this.timings.typingSpeed.min +
                        Math.random() * (this.timings.typingSpeed.max - this.timings.typingSpeed.min);
    delay += message.length * typingSpeed;

    // Случайная пауза (отвлёкся)
    if (Math.random() < this.timings.pauseInTyping) {
      const { min, max } = this.timings.pauseDuration;
      delay += min + Math.random() * (max - min);
    }

    // Личность влияет на скорость
    if (personality.impulsiveness > 0.7) {
      delay *= 0.6; // Быстрее
    } else if (personality.patience > 0.7) {
      delay *= 1.3; // Медленнее, обдумывает
    }

    // Ограничиваем разумными пределами
    return Math.max(800, Math.min(12000, delay));
  }

  /**
   * Должен ли агент ответить на сообщение?
   * (Большинство сообщений НЕ требуют ответа от всех)
   */
  shouldRespond(agentName, message, context = {}) {
    const { speaker, isQuestion, mentioned, recentlySpokeCount } = context;

    // Сам себе не отвечаем
    if (speaker === agentName) return false;

    // Прямое упоминание — почти всегда отвечаем
    if (mentioned) return Math.random() < 0.92;

    // Вопрос к группе — иногда отвечаем
    if (isQuestion) {
      // Если уже кто-то ответил — скорее всего молчим
      if (recentlySpokeCount > 1) return Math.random() < 0.1;

      return Math.random() < 0.25; // 25% шанс ответить на групповой вопрос
    }

    // Обычное сообщение — редко комментируем
    if (recentlySpokeCount > 0) return Math.random() < 0.03;

    return Math.random() < 0.08; // 8% шанс поддержать беседу
  }

  /**
   * Вероятность начать разговор самому
   */
  shouldInitiate(silenceDuration, personality = {}) {
    // Первые 3 минуты молчания — не начинаем
    if (silenceDuration < 180000) return false;

    // 3-10 минут — очень низкий шанс
    if (silenceDuration < 600000) {
      const baseChance = 0.003; // 0.3%
      const personalityBonus = (personality.talkativeness || 0.5) * 0.002;
      return Math.random() < (baseChance + personalityBonus);
    }

    // Больше 10 минут — низкий шанс
    const baseChance = 0.01; // 1%
    const personalityBonus = (personality.talkativeness || 0.5) * 0.01;
    return Math.random() < (baseChance + personalityBonus);
  }
}

export const humanChatBehavior = new HumanChatBehavior();
