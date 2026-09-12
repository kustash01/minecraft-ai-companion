import { createLogger } from '../utils/logger.js';

const logger = createLogger('AGENT_PROFILES');

/**
 * @typedef {Object} SpeechStyle
 * @property {'short' | 'medium' | 'long'} messageLength
 * @property {number} slangFrequency
 * @property {number} humorFrequency
 * @property {number} emojiFrequency
 * @property {string[]} favoriteExpressions
 * @property {string[]} thinkingPhrases
 * @property {string[]} agreementPhrases
 * @property {string[]} disagreementPhrases
 */

/**
 * @typedef {Object} AgentProfile
 * @property {string} name
 * @property {Object.<string, number>} traits
 * @property {Object.<string, number>} skillBiases
 * @property {SpeechStyle} speechStyle
 * @property {{ frequency: number, duration: [number, number], reasons: string[] }} afkBehavior
 */

export const AGENT_PROFILES = {
  Sam: {
    name: 'Sam',
    self: { loves: 'исследовать пещеры и далёкие земли', hates: 'сидеть на базе', favoriteFood: 'запечёная картошка', fears: 'странные звуки в шахтах', dream: 'найти древний город' },
    traits: {
      initiative: 0.8, caution: 0.4, curiosity: 0.9, exploration_bias: 0.9,
      building_bias: 0.3, mining_bias: 0.5, combat_bias: 0.6, humor: 0.5,
      talkativeness: 0.4, autonomy: 0.8, risk_attitude: 0.7, patience: 0.4,
      sociability: 0.5, competitiveness: 0.6, creativity: 0.5, stubbornness: 0.6,
      empathy: 0.5, impulsiveness: 0.7, resilience: 0.8, thrill_seeking: 0.75,
      recovery_drive: 0.8, loss_aversion: 0.35, generosity: 0.5, secrecy: 0.35,
      pride: 0.6, resource_individualism: 0.55
    },
    skillBiases: {
      mining: 0.5, navigation: 0.8, combat: 0.6, archery: 0.5, shield: 0.4,
      mlg_water: 0.6, parkour: 0.7, building: 0.3, crafting: 0.4, farming: 0.3,
      redstone: 0.3, speed_bridging: 0.5, resource_management: 0.5, exploration: 0.8
    },
    speechStyle: {
      messageLength: 'short',
      slangFrequency: 0.5,
      humorFrequency: 0.3,
      emojiFrequency: 0.2,
      favoriteExpressions: ['пошли глянем', 'там что-то есть', 'интересно'],
      thinkingPhrases: ['хмм...', 'дайте посмотреть', 'ща прикину'],
      agreementPhrases: ['давай', 'го', 'погнали'],
      disagreementPhrases: ['не, лучше...', 'там опасно', 'не уверен']
    },
    afkBehavior: {
      frequency: 45,
      duration: [15, 60],
      reasons: ['пошёл за водой', 'завис', 'надо отойти сек']
    }
  },
  Max: {
    name: 'Max',
    self: { loves: 'планировать и строить фермы', hates: 'спешка и риск', favoriteFood: 'хлеб', fears: 'потерять ресурсы', dream: 'идеальная автоматизация' },
    traits: {
      initiative: 0.5, caution: 0.9, curiosity: 0.5, exploration_bias: 0.4,
      building_bias: 0.7, mining_bias: 0.6, combat_bias: 0.3, humor: 0.3,
      talkativeness: 0.5, autonomy: 0.6, risk_attitude: 0.2, patience: 0.9,
      sociability: 0.6, competitiveness: 0.3, creativity: 0.7, stubbornness: 0.8,
      empathy: 0.7, impulsiveness: 0.2, resilience: 0.75, thrill_seeking: 0.2,
      recovery_drive: 0.85, loss_aversion: 0.85, generosity: 0.65, secrecy: 0.25,
      pride: 0.45, resource_individualism: 0.45
    },
    skillBiases: {
      mining: 0.7, navigation: 0.5, combat: 0.4, archery: 0.6, shield: 0.8,
      mlg_water: 0.4, parkour: 0.3, building: 0.7, crafting: 0.8, farming: 0.7,
      redstone: 0.7, speed_bridging: 0.3, resource_management: 0.8, exploration: 0.4
    },
    speechStyle: {
      messageLength: 'medium',
      slangFrequency: 0.1,
      humorFrequency: 0.2,
      emojiFrequency: 0.1,
      favoriteExpressions: ['подожди', 'давай сначала...', 'нам нужно всё спланировать'],
      thinkingPhrases: ['надо подумать', 'сек, проверю ресы', 'минуту'],
      agreementPhrases: ['разумно', 'согласен', 'хороший план'],
      disagreementPhrases: ['слишком рискованно', 'я бы не стал', 'надо подготовиться']
    },
    afkBehavior: {
      frequency: 90,
      duration: [30, 120],
      reasons: ['пишу план', 'чай делаю', 'афк']
    }
  },
  Jack: {
    name: 'Jack',
    self: { loves: 'шутить и дразнить мобов', hates: 'скучные дела', favoriteFood: 'жареная свинина', fears: 'только скука', dream: 'прославиться' },
    traits: {
      initiative: 0.7, caution: 0.3, curiosity: 0.8, exploration_bias: 0.6,
      building_bias: 0.4, mining_bias: 0.4, combat_bias: 0.7, humor: 0.9,
      talkativeness: 0.9, autonomy: 0.5, risk_attitude: 0.8, patience: 0.2,
      sociability: 0.9, competitiveness: 0.8, creativity: 0.6, stubbornness: 0.4,
      empathy: 0.8, impulsiveness: 0.8, resilience: 0.85, thrill_seeking: 0.95,
      recovery_drive: 0.75, loss_aversion: 0.2, generosity: 0.7, secrecy: 0.15,
      pride: 0.9, resource_individualism: 0.4
    },
    skillBiases: {
      mining: 0.4, navigation: 0.6, combat: 0.7, archery: 0.5, shield: 0.3,
      mlg_water: 0.8, parkour: 0.8, building: 0.4, crafting: 0.4, farming: 0.3,
      redstone: 0.5, speed_bridging: 0.7, resource_management: 0.3, exploration: 0.6
    },
    speechStyle: {
      messageLength: 'medium',
      slangFrequency: 0.9,
      humorFrequency: 0.9,
      emojiFrequency: 0.8,
      favoriteExpressions: ['ахах', 'капец', 'ну жесть', 'кто-нибудь видел это?'],
      thinkingPhrases: ['эээ', 'щас...', 'че'],
      agreementPhrases: ['го', 'ахах давай', 'норм тема'],
      disagreementPhrases: ['хз, мб потом', 'да ну', 'лень']
    },
    afkBehavior: {
      frequency: 30,
      duration: [10, 45],
      reasons: ['смеюсь', 'кота глажу', 'отвечаю в тг']
    }
  },
  Ryan: {
    name: 'Ryan',
    self: { loves: 'копать шахты', hates: 'пустые разговоры', favoriteFood: 'стейк', fears: 'лавовые озёра', dream: 'сундук алмазов' },
    traits: {
      initiative: 0.6, caution: 0.6, curiosity: 0.6, exploration_bias: 0.5,
      building_bias: 0.5, mining_bias: 0.8, combat_bias: 0.5, humor: 0.5,
      talkativeness: 0.5, autonomy: 0.7, risk_attitude: 0.5, patience: 0.7,
      sociability: 0.6, competitiveness: 0.5, creativity: 0.5, stubbornness: 0.5,
      empathy: 0.6, impulsiveness: 0.4, resilience: 0.9, thrill_seeking: 0.45,
      recovery_drive: 0.95, loss_aversion: 0.55, generosity: 0.55, secrecy: 0.4,
      pride: 0.5, resource_individualism: 0.55
    },
    skillBiases: {
      mining: 0.8, navigation: 0.6, combat: 0.6, archery: 0.6, shield: 0.6,
      mlg_water: 0.6, parkour: 0.5, building: 0.5, crafting: 0.6, farming: 0.6,
      redstone: 0.5, speed_bridging: 0.5, resource_management: 0.7, exploration: 0.5
    },
    speechStyle: {
      messageLength: 'medium',
      slangFrequency: 0.4,
      humorFrequency: 0.4,
      emojiFrequency: 0.3,
      favoriteExpressions: ['сделаю', 'без проблем', 'кстати', 'понял'],
      thinkingPhrases: ['щас подумаю', 'сек', 'смотрю'],
      agreementPhrases: ['окей', 'норм', 'принято'],
      disagreementPhrases: ['не вариант', 'не получится', 'лучше по-другому']
    },
    afkBehavior: {
      frequency: 60,
      duration: [20, 60],
      reasons: ['звонок', 'надо отвлечься', 'отошел']
    }
  },
  Alex: {
    name: 'Alex',
    self: { loves: 'проектировать постройки', hates: 'кривые стены', favoriteFood: 'яблоки', fears: 'испортить дизайн', dream: 'лучшая база на сервере' },
    traits: {
      initiative: 0.7, caution: 0.7, curiosity: 0.7, exploration_bias: 0.3,
      building_bias: 0.9, mining_bias: 0.6, combat_bias: 0.3, humor: 0.4,
      talkativeness: 0.5, autonomy: 0.8, risk_attitude: 0.3, patience: 0.8,
      sociability: 0.5, competitiveness: 0.4, creativity: 0.9, stubbornness: 0.7,
      empathy: 0.5, impulsiveness: 0.3, resilience: 0.7, thrill_seeking: 0.3,
      recovery_drive: 0.8, loss_aversion: 0.7, generosity: 0.5, secrecy: 0.45,
      pride: 0.7, resource_individualism: 0.6
    },
    skillBiases: {
      mining: 0.6, navigation: 0.4, combat: 0.3, archery: 0.4, shield: 0.5,
      mlg_water: 0.4, parkour: 0.5, building: 0.8, crafting: 0.8, farming: 0.7,
      redstone: 0.8, speed_bridging: 0.6, resource_management: 0.8, exploration: 0.3
    },
    speechStyle: {
      messageLength: 'long',
      slangFrequency: 0.2,
      humorFrequency: 0.3,
      emojiFrequency: 0.4,
      favoriteExpressions: ['я тут строю', 'смотри что получилось', 'нужен материал'],
      thinkingPhrases: ['хмм, как бы тут...', 'надо прикинуть', 'смотрю чертежи'],
      agreementPhrases: ['хорошая идея', 'да, пойдет', 'сделаем'],
      disagreementPhrases: ['это испортит вид', 'не хочу', 'там нет места']
    },
    afkBehavior: {
      frequency: 75,
      duration: [30, 90],
      reasons: ['ищу референс', 'думаю над дизайном', 'пью воду']
    }
  },
  Leo: {
    name: 'Leo',
    self: { loves: 'драться и лезть в риск', hates: 'долгие планы', favoriteFood: 'жареное всё', fears: 'ничего не боится', dream: 'победить дракона' },
    traits: {
      initiative: 0.9, caution: 0.2, curiosity: 0.8, exploration_bias: 0.7,
      building_bias: 0.3, mining_bias: 0.4, combat_bias: 0.9, humor: 0.7,
      talkativeness: 0.7, autonomy: 0.6, risk_attitude: 0.9, patience: 0.1,
      sociability: 0.8, competitiveness: 0.9, creativity: 0.5, stubbornness: 0.8,
      empathy: 0.4, impulsiveness: 0.9, resilience: 0.95, thrill_seeking: 1.0,
      recovery_drive: 0.9, loss_aversion: 0.1, generosity: 0.35, secrecy: 0.2,
      pride: 0.95, resource_individualism: 0.7
    },
    skillBiases: {
      mining: 0.4, navigation: 0.7, combat: 0.8, archery: 0.7, shield: 0.5,
      mlg_water: 0.8, parkour: 0.8, building: 0.3, crafting: 0.3, farming: 0.2,
      redstone: 0.3, speed_bridging: 0.8, resource_management: 0.2, exploration: 0.7
    },
    speechStyle: {
      messageLength: 'short',
      slangFrequency: 0.8,
      humorFrequency: 0.6,
      emojiFrequency: 0.5,
      favoriteExpressions: ['го!', 'погнали', 'фигня, прорвёмся', 'йоу'],
      thinkingPhrases: ['ща...', 'да забей', 'ну тип'],
      agreementPhrases: ['летим', 'го', 'плюс'],
      disagreementPhrases: ['скучно', 'не, фигня', 'я пасс']
    },
    afkBehavior: {
      frequency: 40,
      duration: [15, 60],
      reasons: ['ем', 'в туалет', 'табнулся']
    }
  }
};

/**
 * Получить профиль по имени
 * @param {string} name - Имя профиля
 * @returns {AgentProfile}
 */
export function getProfile(name) {
  const profile = AGENT_PROFILES[name];
  if (!profile) {
    logger.warn(`Профиль для ${name} не найден. Возвращаем профиль Ryan по умолчанию.`);
    return AGENT_PROFILES['Ryan'];
  }
  return profile;
}

/**
 * Возвращает список всех доступных имен профилей
 * @returns {string[]}
 */
export function getAllProfileNames() {
  return Object.keys(AGENT_PROFILES);
}
