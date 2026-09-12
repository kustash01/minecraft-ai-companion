import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TYPING_SIMULATOR');

/**
 * Симулятор человеческой печати с опечатками, исправлениями и отвлечениями.
 */
export class TypingSimulator {
  constructor(profile) {
    this.profile = profile;
    
    // Скорость печати для каждого бота (символов в минуту)
    this.typingSpeed = this._getTypingSpeed(profile.name);
    
    // Вероятность опечатки
    this.typoChance = this._getTypoChance(profile);
    
    // Вероятность отвлечься
    this.distractionChance = 0.05; // 5% шанс отвлечься
  }

  /**
   * Определяет скорость печати для персонажа
   */
  _getTypingSpeed(name) {
    const speeds = {
      Sam: 250,      // Средняя скорость
      Max: 300,      // Быстрый
      Jack: 180,     // Медленный, энергичный
      Ryan: 220,     // Средне-медленный
      Alex: 240,     // Средний
      Leo: 200       // Медленно-средний
    };
    
    return speeds[name] || 240;
  }

  /**
   * Определяет вероятность опечатки для персонажа
   */
  _getTypoChance(profile) {
    const baseChance = 0.03; // 3% базовый шанс
    
    // Jack печатает быстро и небрежно - больше опечаток
    if (profile.name === 'Jack') return 0.08;
    
    // Max аккуратный - меньше опечаток
    if (profile.name === 'Max') return 0.01;
    
    return baseChance;
  }

  /**
   * Обрабатывает сообщение перед отправкой
   * @param {string} message - оригинальное сообщение
   * @returns {Object} { finalMessage: string, delay: number, interrupted: boolean }
   */
  async processMessage(message) {
    // Проверяем отвлечение
    if (Math.random() < this.distractionChance) {
      // Отвлекся - не отправляет сообщение
      logger.debug(`[${this.profile.name}] Отвлекся, сообщение не отправлено`);
      return { finalMessage: null, delay: 0, interrupted: true };
    }

    // Добавляем опечатки
    let finalMessage = this._addTypos(message);
    
    // Иногда исправляем опечатки
    if (finalMessage !== message && Math.random() < 0.6) {
      finalMessage = this._addCorrection(message, finalMessage);
    }

    // Рассчитываем задержку печати
    const delay = this._calculateTypingDelay(finalMessage);

    return { finalMessage, delay, interrupted: false };
  }

  /**
   * Добавляет опечатки в текст
   */
  _addTypos(text) {
    if (text.length < 5) return text; // Короткие сообщения без опечаток
    
    let result = text;
    const words = text.split(' ');
    
    // Проверяем каждое слово
    for (let i = 0; i < words.length; i++) {
      if (Math.random() < this.typoChance && words[i].length > 3) {
        words[i] = this._makeTypo(words[i]);
      }
    }
    
    return words.join(' ');
  }

  /**
   * Создает опечатку в слове
   */
  _makeTypo(word) {
    if (word.length < 3) return word;
    
    const typoTypes = [
      'swap',      // Перестановка соседних букв
      'duplicate', // Дублирование буквы
      'skip',      // Пропуск буквы
      'wrong'      // Неправильная буква (соседняя на клавиатуре)
    ];
    
    const type = typoTypes[Math.floor(Math.random() * typoTypes.length)];
    const chars = word.split('');
    const pos = 1 + Math.floor(Math.random() * (chars.length - 2)); // Не первая и не последняя
    
    switch (type) {
      case 'swap':
        if (pos < chars.length - 1) {
          [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
        }
        break;
      
      case 'duplicate':
        chars.splice(pos, 0, chars[pos]);
        break;
      
      case 'skip':
        chars.splice(pos, 1);
        break;
      
      case 'wrong':
        chars[pos] = this._getNeighborKey(chars[pos]);
        break;
    }
    
    return chars.join('');
  }

  /**
   * Возвращает соседнюю букву на клавиатуре
   */
  _getNeighborKey(char) {
    const ruKeyboard = {
      'а': ['ы', 'ф', 'в'],
      'б': ['н', 'г', 'д'],
      'в': ['а', 'с', 'п'],
      'г': ['ш', 'л', 'р'],
      'д': ['б', 'л', 'о'],
      'е': ['н', 'у', 'к'],
      'ж': ['д', 'о', 'л'],
      'з': ['ч', 'я', 'х'],
      'и': ['п', 'р', 'т'],
      'й': ['ф', 'ц', 'у'],
      'к': ['е', 'н', 'у'],
      'л': ['д', 'ж', 'р'],
      'м': ['т', 'и', 'ь'],
      'н': ['г', 'т', 'е'],
      'о': ['д', 'ш', 'щ'],
      'п': ['в', 'р', 'и'],
      'р': ['п', 'о', 'л'],
      'с': ['в', 'м', 'ы'],
      'т': ['н', 'б', 'и'],
      'у': ['к', 'й', 'ц'],
      'ф': ['а', 'й', 'я'],
      'х': ['з', 'ъ', 'щ'],
      'ц': ['й', 'у', 'в'],
      'ч': ['я', 'с', 'м'],
      'ш': ['г', 'щ', 'о'],
      'щ': ['ш', 'з', 'х'],
      'ы': ['а', 'в', 'п'],
      'ь': ['б', 'м', 'ю'],
      'э': ['ю', 'ж', 'д'],
      'ю': ['ь', 'б', '.'],
      'я': ['ф', 'ч', 'с']
    };
    
    const neighbors = ruKeyboard[char.toLowerCase()];
    if (neighbors && neighbors.length > 0) {
      return neighbors[Math.floor(Math.random() * neighbors.length)];
    }
    
    return char;
  }

  /**
   * Добавляет исправление опечатки
   */
  _addCorrection(original, typo) {
    // Варианты исправления:
    // 1. "*правильное слово" (самый частый)
    // 2. "опечатка* правильное" 
    // 3. Просто переотправить правильную версию
    
    const correctionType = Math.random();
    
    if (correctionType < 0.6) {
      // Исправление через *
      return `${typo}\n*${original}`;
    } else if (correctionType < 0.8) {
      // Просто правильная версия
      return original;
    } else {
      // Оставляем с опечаткой
      return typo;
    }
  }

  /**
   * Рассчитывает задержку печати
   */
  _calculateTypingDelay(message) {
    const charsPerMinute = this.typingSpeed;
    const charsPerMs = charsPerMinute / 60000;
    
    // Базовая задержка
    let delay = message.length / charsPerMs;
    
    // Добавляем случайную вариацию ±30%
    const variation = 0.3;
    delay = delay * (1 + (Math.random() * 2 - 1) * variation);
    
    // Минимум 500мс, максимум 10сек
    delay = Math.max(500, Math.min(10000, delay));
    
    // Добавляем "время на раздумье" перед отправкой
    const thinkTime = 200 + Math.random() * 800; // 200-1000мс
    
    return Math.round(delay + thinkTime);
  }

  /**
   * Симулирует начало печати и возможное прерывание
   * @returns {boolean} true если начал печатать, false если передумал
   */
  startTyping() {
    // 10% шанс что начал печатать и передумал
    return Math.random() > 0.1;
  }

  /**
   * Возвращает индикатор печати (для отображения "печатает...")
   */
  getTypingIndicatorDuration(messageLength) {
    // Показываем "печатает..." на время реальной печати
    return this._calculateTypingDelay('x'.repeat(messageLength));
  }
}
