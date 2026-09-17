import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('HUMAN_CHAT');

/**
 * Раскладки соседних клавиш для естественных опечаток пальцев
 */
const KEYBOARD_ADJACENT = {
  // ЙЦУКЕН (русская раскладка)
  'й': ['ц', 'ф', 'я'],
  'ц': ['й', 'у', 'ы', 'в'],
  'у': ['ц', 'к', 'в', 'а'],
  'к': ['у', 'е', 'а', 'п'],
  'е': ['к', 'н', 'п', 'р'],
  'н': ['е', 'г', 'р', 'о'],
  'г': ['н', 'ш', 'о', 'л'],
  'ш': ['г', 'щ', 'л', 'д'],
  'щ': ['ш', 'з', 'д', 'ж'],
  'з': ['щ', 'х', 'ж', 'э'],
  'х': ['з', 'ъ', 'э'],
  'ф': ['й', 'ы', 'я'],
  'ы': ['ц', 'ф', 'в', 'ч'],
  'в': ['у', 'ы', 'а', 'с'],
  'а': ['к', 'в', 'п', 'м'],
  'п': ['е', 'а', 'р', 'и'],
  'р': ['н', 'п', 'о', 'т'],
  'о': ['г', 'р', 'л', 'ь'],
  'л': ['ш', 'о', 'д', 'б'],
  'д': ['щ', 'л', 'ж', 'ю'],
  'я': ['ф', 'ч'],
  'ч': ['я', 'ы', 'с'],
  'с': ['ч', 'в', 'м'],
  'м': ['с', 'а', 'и'],
  'и': ['м', 'п', 'т'],
  'т': ['и', 'р', 'ь'],
  'ь': ['т', 'о', 'б'],
  'б': ['ь', 'л', 'ю'],
  'ю': ['б', 'д'],

  // QWERTY (английская раскладка)
  'q': ['w', 'a', 's'],
  'w': ['q', 'e', 's', 'd'],
  'e': ['w', 'r', 'd', 'f'],
  'r': ['e', 't', 'f', 'g'],
  't': ['r', 'y', 'g', 'h'],
  'y': ['t', 'u', 'h', 'j'],
  'u': ['y', 'i', 'j', 'k'],
  'i': ['u', 'o', 'k', 'l'],
  'o': ['i', 'p', 'l'],
  'p': ['o', 'l'],
  'a': ['q', 'w', 's', 'z'],
  's': ['a', 'w', 'e', 'd', 'x', 'z'],
  'd': ['s', 'e', 'r', 'f', 'c', 'x'],
  'f': ['d', 'r', 't', 'g', 'v', 'c'],
  'g': ['f', 't', 'y', 'h', 'b', 'v'],
  'h': ['g', 'y', 'u', 'j', 'n', 'b'],
  'j': ['h', 'u', 'i', 'k', 'm', 'n'],
  'k': ['j', 'i', 'o', 'l', 'm'],
  'l': ['k', 'o', 'p'],
  'z': ['a', 's', 'x'],
  'x': ['z', 's', 'd', 'c'],
  'c': ['x', 'd', 'f', 'v'],
  'v': ['c', 'f', 'g', 'b'],
  'b': ['v', 'g', 'h', 'n'],
  'n': ['b', 'h', 'j', 'm'],
  'm': ['n', 'j', 'k'],
};

/**
 * HumanChatFlow — симуляция физической печати живого игрока:
 * 1. Остановка персонажа / sneak на время набора в чат (руки на клавиатуре).
 * 2. Задержка набора 200-350 знаков/мин с нормальным распределением.
 * 3. Естественные случайные опечатки по соседним клавишам.
 * 4. ВАЖНО: в 65% случаев опечатка НЕ исправляется (понятно по смыслу),
 *    и только в 35% отправляется быстрое исправление (*приду).
 * 5. Разбивка длинных реплик на 2 короткие фразы в чате.
 */
export class HumanChatFlow {
  /**
   * Генерация опечатки в слове
   */
  static injectTypo(word) {
    if (!word || word.length < 4) return { typoWord: word, hasTypo: false, originalWord: word };

    // Выбираем букву ближе к середине или концу слова
    const charIndex = Math.max(1, Math.min(word.length - 2, Math.round(HumanErrorEngine.range(1, word.length - 2))));
    const char = word[charIndex].toLowerCase();
    const adjacent = KEYBOARD_ADJACENT[char];

    if (!adjacent || adjacent.length === 0) {
      return { typoWord: word, hasTypo: false, originalWord: word };
    }

    const replacement = HumanErrorEngine.choice(adjacent);
    const isUpper = word[charIndex] === word[charIndex].toUpperCase() && word[charIndex] !== word[charIndex].toLowerCase();
    const typoChar = isUpper ? replacement.toUpperCase() : replacement;

    const typoWord = word.slice(0, charIndex) + typoChar + word.slice(charIndex + 1);
    return {
      typoWord,
      hasTypo: true,
      originalWord: word,
    };
  }

  /**
   * Подготовка текста к отправке с реалистичной обработкой опечаток
   * @param {string} text
   * @param {object} bot
   * @returns {{ messages: string[], correction: string | null }}
   */
  static prepareMessages(text, bot = null) {
    if (!text || typeof text !== 'string') return { messages: [], correction: null };

    const clean = text.trim();
    if (clean.length === 0) return { messages: [], correction: null };

    // Проверяем психофизиологический стресс / усталость для шанса опечатки
    const state = HumanErrorEngine.getPsychophysiologicalState(bot);
    // Базовый шанс опечатки 4%, растет при стрессе/усталости до 14%
    const typoProbability = 0.04 + state.stress * 0.06 + state.fatigue * 0.04;

    const words = clean.split(' ');
    let madeTypo = null;

    for (let i = 0; i < words.length; i++) {
      // Опечатываемся максимум 1 раз за сообщение
      if (!madeTypo && words[i].length >= 4 && HumanErrorEngine.chance(typoProbability, bot)) {
        const res = this.injectTypo(words[i]);
        if (res.hasTypo) {
          words[i] = res.typoWord;
          madeTypo = res;
        }
      }
    }

    const processedText = words.join(' ');

    // Решаем: исправлять ли опечатку?
    // В 65% случаев реальный игрок НЕ исправляет опечатку, если слово и так читаемо!
    let correction = null;
    if (madeTypo) {
      const shouldCorrect = HumanErrorEngine.gaussian(0, 1) > 0.4; // ~35% шанс исправления
      if (shouldCorrect) {
        correction = `*${madeTypo.originalWord}`;
      }
    }

    // Разбивка на 2 коротких сообщения, если есть логическое разделение (точка, запятая, союз)
    // и длина > 40 символов
    const messages = [];
    if (processedText.length > 40 && HumanErrorEngine.chance(0.45, bot)) {
      const splitIndex = processedText.search(/[.,!?]\s+/);
      if (splitIndex !== -1 && splitIndex > 10 && splitIndex < processedText.length - 10) {
        messages.push(processedText.slice(0, splitIndex + 1).trim());
        messages.push(processedText.slice(splitIndex + 2).trim());
      } else {
        messages.push(processedText);
      }
    } else {
      messages.push(processedText);
    }

    return { messages, correction };
  }

  /**
   * Физическая симуляция набора сообщения персонажем в чат
   * @param {object} bot - Mineflayer bot
   * @param {string} text - Текст сообщения
   * @param {Function} [chatFn] - Функция отправки в чат
   */
  static async typeAndSend(bot, text, chatFn = null) {
    if (!text) return;
    const send = chatFn || ((msg) => {
      if (typeof bot?.chat === 'function') bot.chat(String(msg));
    });

    const { messages, correction } = this.prepareMessages(text, bot);

    for (let m = 0; m < messages.length; m++) {
      const msg = messages[m];

      // 1. Физическая остановка: игрок нажимает 'T' и печатает руками
      if (bot && typeof bot.setControlState === 'function') {
        try {
          bot.setControlState('forward', false);
          bot.setControlState('sprint', false);
          // В 30% случаев присаживается на шифт во время набора
          if (HumanErrorEngine.chance(0.3, bot)) bot.setControlState('sneak', true);
        } catch (_) {}
      }

      // 2. Расчет реалистичной задержки набора (240-340 CPM)
      const cpm = Math.max(180, Math.min(380, Math.round(HumanErrorEngine.gaussian(260, 35))));
      const msPerChar = 60000 / cpm;
      const typingTimeMs = Math.max(250, Math.min(2200, Math.round(msg.length * msPerChar)));

      await new Promise(r => setTimeout(r, typingTimeMs));

      // 3. Отправка сообщения
      send(msg);

      // Снимаем шифт
      if (bot && typeof bot.setControlState === 'function') {
        try { bot.setControlState('sneak', false); } catch (_) {}
      }

      // Пауза между раздельными фразами (если было разбито)
      if (m < messages.length - 1) {
        const splitPause = Math.round(HumanErrorEngine.range(400, 700, bot));
        await new Promise(r => setTimeout(r, splitPause));
      }
    }

    // 4. Если было решено исправить опечатку — шлем исправление через 600-1100мс
    if (correction) {
      const correctionDelay = Math.round(HumanErrorEngine.range(650, 1100, bot));
      await new Promise(r => setTimeout(r, correctionDelay));
      send(correction);
    }
  }
}
