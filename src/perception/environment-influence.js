import { createLogger } from '../utils/logger.js';

const logger = createLogger('ENVIRONMENT_INFLUENCE');

/**
 * ОЧЕНЬ МНОГО фишек - окружение ОЧЕНЬ влияет на ошибки!
 *
 * Система отслеживает ВСЕ условия окружения и модифицирует вероятность ошибок.
 */
export class EnvironmentInfluence {
  constructor() {
    this.currentConditions = {};
  }

  /**
   * Анализирует окружение и возвращает множители ошибок
   */
  analyzeEnvironment(bot, worldState) {
    const multipliers = {
      darkness: 1.0,
      weather: 1.0,
      hostiles: 1.0,
      height: 1.0,
      water: 1.0,
      lava: 1.0,
      cave: 1.0,
      crowded: 1.0,
      tired: 1.0,
      hungry: 1.0,
      damaged: 1.0,
      falling: 1.0,
      fire: 1.0,
      poison: 1.0,
      slowness: 1.0,
      blindness: 1.0,
      confusion: 1.0,
      nausea: 1.0,
      temperature: 1.0,
      noise: 1.0,
      company: 1.0,
      total: 1.0,
    };

    if (!bot) return multipliers;

    // 🌙 ТЕМНОТА - очень важна!
    const light = this._getLightLevel(bot, worldState);
    if (light < 7) {
      multipliers.darkness = 1 + (0.3 * ((7 - light) / 7)); // До +30% при полной темноте
    }

    // 🌧️ ПОГОДА
    if (worldState?.isRaining) {
      multipliers.weather = 1.15; // +15% при дожде
    }

    // 👹 ВРАГИ РЯДОМ
    const nearbyHostiles = this._countNearbyHostiles(bot);
    if (nearbyHostiles > 0) {
      multipliers.hostiles = 1 + (nearbyHostiles * 0.25); // +25% за каждого врага
    }

    // 📏 ВЫСОТА
    const height = bot.entity?.position?.y || 0;
    if (height > 100) {
      multipliers.height = 1.3; // +30% на большой высоте
    } else if (height > 64) {
      multipliers.height = 1.15; // +15% на средней высоте
    }

    // 💧 ВОДА
    if (bot.entity?.isInWater) {
      multipliers.water = 1.4; // +40% в воде
    }

    // 🔥 ЛАВА
    if (bot.entity?.isInLava) {
      multipliers.lava = 1.6; // +60% в лаве!
    }

    // 🕳️ ПЕЩЕРЫ (темнота + враги)
    if (this._isInCave(bot)) {
      multipliers.cave = 1.25; // +25% в пещерах
    }

    // 🤝 МНОГО СУЩНОСТЕЙ РЯДОМ (скученность)
    const nearbyEntities = this._countNearbyEntities(bot);
    if (nearbyEntities > 5) {
      multipliers.crowded = 1.2; // +20% когда много кого-то рядом
    }

    // 😴 УСТАЛОСТЬ
    if (bot.food && bot.food < 6) {
      multipliers.tired = 1.25; // +25% когда голоден
    }

    // 💔 ПОВРЕЖДЕН
    if (bot.health && bot.health < 8) {
      multipliers.damaged = 1.4; // +40% когда сильно поврежден
    }

    // 📉 ПАДЕНИЕ
    if (!bot.entity?.onGround) {
      multipliers.falling = 1.3; // +30% во время падения
    }

    // 🔥 ГОРИТ
    if (bot.entity?.isOnFire) {
      multipliers.fire = 1.5; // +50% когда горит!
    }

    // ☠️ ЯД
    if (this._hasEffect(bot, 'poison')) {
      multipliers.poison = 1.25; // +25% под ядом
    }

    // 🐌 ЗАМЕДЛЕНИЕ
    if (this._hasEffect(bot, 'slowness')) {
      multipliers.slowness = 1.2; // +20% при замедлении
    }

    // 👁️ СЛЕПОТА
    if (this._hasEffect(bot, 'blindness')) {
      multipliers.blindness = 1.8; // +80% при слепоте!
    }

    // 🌀 CONFUSIO (confusion)
    if (this._hasEffect(bot, 'nausea')) {
      multipliers.nausea = 1.6; // +60% при головокружении
    }

    // 🌡️ ТЕМПЕРАТУРА (экстремальные условия)
    if (this._isInExtremeTemperature(bot)) {
      multipliers.temperature = 1.3; // +30% в лесу адов или ледяных равнинах
    }

    // 🔊 ШУМ (если много мобов вокруг - психологический фактор)
    if (nearbyHostiles > 3) {
      multipliers.noise = 1.2; // +20% от шума боя
    }

    // 👥 ОДИНОЧЕСТВО (психологический)
    if (nearbyEntities === 0 && nearbyHostiles === 0) {
      multipliers.company = 1.1; // +10% когда совсем один
    }

    // ИТОГОВЫЙ МНОЖИТЕЛЬ (все условия накапливаются)
    multipliers.total =
      multipliers.darkness *
      multipliers.weather *
      multipliers.hostiles *
      multipliers.height *
      multipliers.water *
      multipliers.lava *
      multipliers.cave *
      multipliers.crowded *
      multipliers.tired *
      multipliers.hungry *
      multipliers.damaged *
      multipliers.falling *
      multipliers.fire *
      multipliers.poison *
      multipliers.slowness *
      multipliers.blindness *
      multipliers.confusion *
      multipliers.nausea *
      multipliers.temperature *
      multipliers.noise *
      multipliers.company;

    // Ограничиваем максимальный множитель
    multipliers.total = Math.min(multipliers.total, 5.0); // Максимум 5x ошибок

    this.currentConditions = multipliers;
    return multipliers;
  }

  _getLightLevel(bot, worldState) {
    try {
      const pos = bot.entity?.position?.floored();
      if (!pos) return 15;
      const block = bot.blockAt(pos);
      return block?.light || 15;
    } catch (e) {
      return 15;
    }
  }

  _countNearbyHostiles(bot) {
    try {
      const pos = bot.entity?.position;
      if (!pos) return 0;
      const hostiles = bot.entities?.filter(e => {
        if (!e.position) return false;
        const dist = pos.distanceTo(e.position);
        return dist < 20 && this._isHostile(e.name);
      }) || [];
      return hostiles.length;
    } catch (e) {
      return 0;
    }
  }

  _countNearbyEntities(bot) {
    try {
      const pos = bot.entity?.position;
      if (!pos) return 0;
      const nearby = bot.entities?.filter(e => {
        if (!e.position) return false;
        const dist = pos.distanceTo(e.position);
        return dist < 16 && e.name !== bot.username;
      }) || [];
      return nearby.length;
    } catch (e) {
      return 0;
    }
  }

  _isInCave(bot) {
    try {
      const pos = bot.entity?.position?.floored();
      if (!pos) return false;
      const light = this._getLightLevel(bot);
      const blockAbove = bot.blockAt(pos.offset(0, 1, 0));
      // Пещера = темно И блок выше это не небо
      return light < 7 && blockAbove?.name !== 'air';
    } catch (e) {
      return false;
    }
  }

  _isInExtremeTemperature(bot) {
    try {
      const biome = bot.biome?.name || '';
      return biome.includes('nether') || biome.includes('ice') || biome.includes('frozen');
    } catch (e) {
      return false;
    }
  }

  _hasEffect(bot, effectName) {
    try {
      return bot.statusEffects?.some(e => e.name?.includes(effectName)) || false;
    } catch (e) {
      return false;
    }
  }

  _isHostile(name) {
    const hostiles = ['creeper', 'skeleton', 'zombie', 'spider', 'enderman', 'witch', 'piglin', 'ghast', 'wither'];
    return hostiles.some(h => name?.toLowerCase().includes(h));
  }

  /**
   * Получить описание текущих условий
   */
  getConditionsDescription() {
    let desc = '🌍 Условия окружения:\n';

    for (const [key, value] of Object.entries(this.currentConditions)) {
      if (key === 'total') continue;
      if (value > 1) {
        const percent = Math.round((value - 1) * 100);
        desc += `  • ${key}: +${percent}%\n`;
      }
    }

    if (this.currentConditions.total) {
      desc += `\n📊 ОБЩИЙ МНОЖИТЕЛЬ: x${this.currentConditions.total.toFixed(2)}`;
    }

    return desc;
  }
}
