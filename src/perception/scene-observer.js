import minecraftData from 'minecraft-data';
import { createLogger } from '../utils/logger.js';
import { spatialIntelligence } from '../world/spatial-intelligence.js';

const logger = createLogger('SCENE');

/**
 * SceneObserver — turns raw block/entity data into a human-readable scene
 * description ("что видит игрок"): facing direction, terrain around, biome,
 * what stands out in each compass direction, nearby entities and their side.
 *
 * This is intentionally cheap (sparse block sampling, no per-tick raycasts) so
 * it can be folded into the AI context on every request. Heavy first-person
 * raycasting stays in VisualObserver.
 */
export class SceneObserver {
  constructor(options = {}) {
    // How far out we sample the horizon along each compass ray.
    this.horizonRadius = options.horizonRadius ?? 48;
    this.horizonStep = options.horizonStep ?? 6;
    // Vertical span we scan when sampling a column's surface height.
    this.maxSurfaceScan = options.maxSurfaceScan ?? 40;
    this._mcDataCache = new Map();
    this.lastObservation = null;
    this.recentSounds = [];
    this._attachedBots = new WeakSet();
  }

  _mcData(version) {
    const v = version || '1.20.4';
    if (!this._mcDataCache.has(v)) {
      this._mcDataCache.set(v, minecraftData(v));
    }
    return this._mcDataCache.get(v);
  }

  _attachSoundListeners(bot) {
    if (!bot || !bot.on || this._attachedBots.has(bot)) return;
    this._attachedBots.add(bot);

    const onSound = (soundName, pos, volume) => {
      this.recentSounds.push({
        name: String(soundName || 'sound'),
        pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
        volume: volume ?? 1,
        time: Date.now(),
      });
      if (this.recentSounds.length > 25) {
        this.recentSounds.shift();
      }
    };

    try {
      bot.on('soundEffect', (soundName, pos, volume) => onSound(soundName, pos, volume));
      bot.on('hardcodedSoundEffect', (soundId, cat, pos, volume) => onSound(cat || 'sound', pos, volume));
    } catch (_) {}
  }

  _recentSoundsNearby(botPos, botYaw) {
    const now = Date.now();
    // Оставляем звуки за последние 10 секунд
    this.recentSounds = this.recentSounds.filter(s => now - s.time < 10000);
    if (this.recentSounds.length === 0) return [];

    const sideRu = { ahead: 'впереди', behind: 'позади', left: 'слева', right: 'справа', above: 'сверху', below: 'снизу' };
    const soundRu = {
      'creeper.primed': 'шипение крипера! (ОПАСНОСТЬ)',
      'creeper': 'звук крипера',
      'lava.ambient': 'бурление лавы',
      'lava.pop': 'всплеск лавы',
      'water.ambient': 'шум воды',
      'zombie.ambient': 'стоны зомби',
      'zombie.step': 'шаги зомби',
      'skeleton.ambient': 'звуки скелета',
      'spider.ambient': 'шипение паука',
      'explosion': 'грохот взрыва!',
      'chest.open': 'открытие сундука',
      'player.hurt': 'звук получения урона',
      'ambient.cave': 'жуткий звук пещеры',
    };

    const out = [];
    const seen = new Set();
    for (let i = this.recentSounds.length - 1; i >= 0 && out.length < 4; i--) {
      const s = this.recentSounds[i];
      let ruName = s.name;
      for (const [k, v] of Object.entries(soundRu)) {
        if (s.name.includes(k)) {
          ruName = v;
          break;
        }
      }

      let direction = '';
      if (s.pos && botPos) {
        const side = spatialIntelligence.getRelativeDirection(botPos, botYaw, s.pos);
        const dist = Math.round(Math.hypot(s.pos.x - botPos.x, s.pos.y - botPos.y, s.pos.z - botPos.z));
        direction = ` (${sideRu[side] || side}, ~${dist}м)`;
      }

      const desc = `${ruName}${direction}`;
      if (!seen.has(desc)) {
        seen.add(desc);
        out.push(desc);
      }
    }
    return out;
  }

  /**
   * Build a structured observation of the surroundings.
   * @param {object} bot - Mineflayer bot
   * @returns {object|null}
   */
  observe(bot) {
    if (!bot?.entity?.position || typeof bot.blockAt !== 'function') return null;
    this._attachSoundListeners(bot);

    const pos = bot.entity.position;
    const eyePos = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
    const yaw = bot.entity.yaw || 0;

    const facing = spatialIntelligence.getFacingDirection(yaw);
    const biome = this._biomeAt(bot, eyePos);
    const horizon = this._scanHorizon(bot, eyePos);
    const entities = this._nearbyEntities(bot, pos, yaw);
    const ground = this._groundContext(bot, eyePos);
    const nearby = this._scanNearby(bot, eyePos);
    const status = this._selfStatus(bot);
    const sounds = this._recentSoundsNearby(eyePos, yaw);
    const light = this._lightContext(bot, eyePos);
    const celestial = this._celestialContext(bot);
    const metabolism = this._metabolismStatus(bot);

    const result = {
      capturedAt: Date.now(),
      position: eyePos,
      facing,
      biome,
      ground,
      horizon,
      entities,
      nearby,
      status,
      sounds,
      light,
      celestial,
      metabolism,
    };
    this.lastObservation = result;
    return result;
  }

  _biomeAt(bot, pos) {
    try {
      const block = bot.blockAt({ ...pos });
      if (block?.biome?.name) return block.biome.name;
      if (typeof block?.biome?.id === 'number') {
        const mc = this._mcData(bot.version);
        return mc.biomes?.[block.biome.id]?.name || `biome#${block.biome.id}`;
      }
    } catch (_) {}
    return 'unknown';
  }

  /**
   * Surface height + what is directly under/around the feet.
   */
  _groundContext(bot, pos) {
    const below = this._safeBlockName(bot, { x: pos.x, y: pos.y - 1, z: pos.z });
    const surfaceY = this._surfaceHeight(bot, pos.x, pos.z, pos.y);
    let elevation = 'на ровной земле';
    if (surfaceY !== null) {
      const delta = pos.y - surfaceY;
      if (delta > 3) elevation = 'высоко (на возвышении/в воздухе)';
      else if (delta < -3) elevation = 'в низине/яме';
    }
    return { standingOn: below, surfaceY, elevation };
  }

  /**
   * Sample the surface height of a column by scanning down from a high ceiling.
   * Scanning from well above the bot lets us detect mountains that rise above
   * the bot's own Y (otherwise a peak overhead would be missed).
   */
  _surfaceHeight(bot, x, z, startY) {
    const top = startY + this.maxSurfaceScan;
    const bottom = startY - this.maxSurfaceScan;
    for (let y = top; y > bottom; y--) {
      const name = this._safeBlockName(bot, { x, y, z });
      if (name && name !== 'air' && name !== 'cave_air' && name !== 'void_air') {
        // The first solid block from the top is the surface.
        const above = this._safeBlockName(bot, { x, y: y + 1, z });
        if (above === 'air' || above === 'cave_air' || above === 'void_air' || above === null) {
          return y;
        }
      }
    }
    return null;
  }

  /**
   * For each of the 8 compass directions, sample outward and describe the
   * dominant feature (rising ground = mountain, water, trees, drop-off).
   */
  _scanHorizon(bot, pos) {
    const dirs = [
      { code: 'N', dx: 0, dz: -1 },
      { code: 'NE', dx: 1, dz: -1 },
      { code: 'E', dx: 1, dz: 0 },
      { code: 'SE', dx: 1, dz: 1 },
      { code: 'S', dx: 0, dz: 1 },
      { code: 'SW', dx: -1, dz: 1 },
      { code: 'W', dx: -1, dz: 0 },
      { code: 'NW', dx: -1, dz: -1 },
    ];

    const baseSurface = this._surfaceHeight(bot, pos.x, pos.z, pos.y) ?? pos.y;
    const results = [];

    for (const dir of dirs) {
      // Normalise diagonal step so ray length is comparable across directions.
      const norm = dir.dx !== 0 && dir.dz !== 0 ? Math.SQRT1_2 : 1;
      let maxRise = 0;
      let maxDrop = 0;
      let sawWater = false;
      let sawTrees = false;
      let farthestSurface = baseSurface;

      for (let d = this.horizonStep; d <= this.horizonRadius; d += this.horizonStep) {
        const sx = Math.round(pos.x + dir.dx * d * norm);
        const sz = Math.round(pos.z + dir.dz * d * norm);
        const surfaceY = this._surfaceHeight(bot, sx, sz, pos.y);
        if (surfaceY === null) continue;
        farthestSurface = surfaceY;

        const rise = surfaceY - baseSurface;
        if (rise > maxRise) maxRise = rise;
        if (rise < maxDrop) maxDrop = rise;

        const topName = this._safeBlockName(bot, { x: sx, y: surfaceY, z: sz });
        if (topName && (topName.includes('water') || topName.includes('kelp'))) sawWater = true;
        if (topName && (topName.includes('log') || topName.includes('leaves'))) sawTrees = true;
      }

      const features = [];
      if (maxRise >= 12) features.push('высокая гора');
      else if (maxRise >= 5) features.push('холм/возвышенность');
      if (maxDrop <= -8) features.push('обрыв/низина');
      if (sawWater) features.push('вода');
      if (sawTrees) features.push('деревья/лес');
      if (features.length === 0) features.push('ровная местность');

      results.push({
        code: dir.code,
        ru: spatialIntelligence.compassFromVector(dir.dx, dir.dz).ru,
        rise: maxRise,
        drop: maxDrop,
        features,
      });
    }

    return results;
  }

  /**
   * Wide "what's around me" scan: nearby ores, hazards, useful stations, item
   * drops, and the block the bot is currently looking at. Gives the LLM the
   * situational awareness a real player has at a glance. Bounded radius keeps
   * it cheap.
   */
  _scanNearby(bot, pos) {
    const result = {
      lookingAt: null,
      ores: [],
      hazards: [],
      stations: [],
    };
    if (typeof bot.blockAt !== 'function') return result;

    // What the bot is currently aiming at (reach ~5 blocks).
    try {
      if (typeof bot.blockAtCursor === 'function') {
        const b = bot.blockAtCursor(5);
        if (b && b.name && b.name !== 'air') result.lookingAt = b.name;
      }
    } catch (_) {}

    const R = 6;
    const oreKw = ['_ore', 'ancient_debris'];
    const hazardKw = ['lava', 'fire', 'magma_block', 'campfire', 'sweet_berry'];
    const stationNames = new Set([
      'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'chest', 'trapped_chest',
      'barrel', 'ender_chest', 'anvil', 'chipped_anvil', 'damaged_anvil',
      'enchanting_table', 'brewing_stand', 'smithing_table', 'grindstone',
      'loom', 'cartography_table', 'stonecutter', 'bed', 'bell', 'composter',
    ]);
    const isBed = (n) => n.endsWith('_bed');

    const seenStations = new Set();
    const seenOres = new Set();

    // Step 1 on every axis: point objects like ores/stations sit on any offset,
    // so a coarse step silently skips them. Early air-skip keeps this cheap.
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dz = -R; dz <= R; dz++) {
          const name = this._safeBlockName(bot, { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz });
          if (!name || name === 'air' || name === 'cave_air') continue;
          const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

          if (oreKw.some(k => name.includes(k))) {
            if (!seenOres.has(name)) { seenOres.add(name); result.ores.push({ name, dist }); }
          } else if (hazardKw.some(k => name.includes(k))) {
            result.hazards.push({ name, dist });
          } else if (stationNames.has(name) || isBed(name)) {
            const key = isBed(name) ? 'bed' : name;
            if (!seenStations.has(key)) { seenStations.add(key); result.stations.push({ name: key, dist }); }
          }
        }
      }
    }

    // Nearest first, cap lists so the context stays small.
    result.ores.sort((a, b) => a.dist - b.dist);
    result.hazards.sort((a, b) => a.dist - b.dist);
    result.stations.sort((a, b) => a.dist - b.dist);
    result.ores = result.ores.slice(0, 4);
    result.hazards = result.hazards.slice(0, 3);
    result.stations = result.stations.slice(0, 5);
    return result;
  }

  /**
   * "What is happening to me right now" — the awareness a live player has of
   * their own body. Detects taking damage (HP dropped since last observe),
   * being on fire, in/under water (drowning), in lava, and falling. Pure read,
   * no side effects beyond remembering last HP for the delta.
   */
  _selfStatus(bot) {
    const status = [];
    try {
      const e = bot.entity;
      const hp = typeof bot.health === 'number' ? bot.health : null;

      // Damage detection via HP delta between observes.
      if (hp !== null) {
        if (this._lastHealth != null && hp < this._lastHealth - 0.1) {
          status.push(`получаю урон (${Math.round(this._lastHealth - hp)} хп)`);
        }
        this._lastHealth = hp;
      }

      // On fire (metadata bit 0x01 of index 0).
      const onFire = e?.metadata && (Number(e.metadata[0]) & 0x01) !== 0;
      if (onFire) status.push('горю');

      if (e?.isInLava) status.push('в лаве');
      else if (e?.isInWater) {
        const air = typeof bot.oxygenLevel === 'number' ? bot.oxygenLevel : null;
        status.push(air != null && air < 10 ? `под водой, задыхаюсь (воздух ${air})` : 'в воде');
      }

      // Falling fast (not in liquid).
      if (e?.velocity && e.velocity.y < -0.6 && !e.isInWater && !e.isInLava && !e.onGround) {
        status.push('падаю');
      }

      if (hp !== null && hp <= 6) status.push('мало здоровья!');
    } catch (_) {}
    return status;
  }

  _isLookingAtBot(playerEntity, botPos) {
    if (!playerEntity || !playerEntity.position) return false;
    const pYaw = playerEntity.yaw || 0;
    const pPitch = playerEntity.pitch || 0;
    const lookX = -Math.sin(pYaw) * Math.cos(pPitch);
    const lookY = -Math.sin(pPitch);
    const lookZ = -Math.cos(pYaw) * Math.cos(pPitch);

    const dx = botPos.x - playerEntity.position.x;
    const dy = (botPos.y + 1.6) - (playerEntity.position.y + 1.6);
    const dz = botPos.z - playerEntity.position.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.1) return true;

    const dot = (lookX * dx + lookY * dy + lookZ * dz) / len;
    return dot > 0.8;
  }

  _nearbyEntities(bot, pos, yaw) {
    const out = [];
    const botPos = { x: pos.x, y: pos.y, z: pos.z };
    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || e === bot.entity || !e.position) continue;
      const dist = pos.distanceTo(e.position);
      if (dist > 32) continue;
      const target = { x: e.position.x, y: e.position.y, z: e.position.z };

      const isPlayer = e.type === 'player';
      let heldItem = null;
      let isSneaking = false;
      let isLookingAtBot = false;

      if (isPlayer) {
        heldItem = e.heldItem?.name || (e.equipment && e.equipment[0] ? e.equipment[0].name : null);
        isSneaking = Boolean(e.crouching || (e.metadata && (Number(e.metadata[0]) & 0x02) !== 0));
        isLookingAtBot = this._isLookingAtBot(e, botPos);
      }

      out.push({
        name: e.username || e.name || e.type,
        type: e.type,
        distance: Math.round(dist * 10) / 10,
        side: spatialIntelligence.getRelativeDirection(botPos, yaw, target),
        compass: spatialIntelligence.getCompassToTarget(botPos, target).ru,
        isPlayer,
        heldItem,
        isSneaking,
        isLookingAtBot,
      });
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, 8);
  }

  _lightContext(bot, pos) {
    let blockLight = null;
    let skyLight = null;
    try {
      if (bot?.world && typeof bot.world.getBlockLight === 'function') {
        blockLight = bot.world.getBlockLight(pos);
      }
      if (bot?.world && typeof bot.world.getSkyLight === 'function') {
        skyLight = bot.world.getSkyLight(pos);
      }
    } catch (_) {}
    if (blockLight === null) {
      try {
        const b = bot?.blockAt?.(pos);
        if (b && typeof b.light === 'number') blockLight = b.light;
      } catch (_) {}
    }
    return { blockLight, skyLight };
  }

  _celestialContext(bot) {
    const time = typeof bot?.time?.timeOfDay === 'number' ? bot.time.timeOfDay : null;
    let timeDesc = 'день';
    if (time !== null) {
      if (time >= 0 && time < 1000) timeDesc = 'рассвет (восход солнца)';
      else if (time >= 1000 && time < 11500) timeDesc = 'день';
      else if (time >= 11500 && time < 13000) timeDesc = 'закат (солнце садится, скоро ночь!)';
      else if (time >= 13000 && time < 18000) timeDesc = 'ночь (спавнятся монстры, можно спать)';
      else if (time >= 18000 && time < 23000) timeDesc = 'глубокая ночь';
      else timeDesc = 'рассвет';
    }
    const isRaining = Boolean(bot?.isRaining);
    const isThundering = Boolean(bot?.thunderState && bot.thunderState > 0);
    return { time, timeDesc, isRaining, isThundering };
  }

  _metabolismStatus(bot) {
    const food = typeof bot?.food === 'number' ? bot.food : null;
    const saturation = typeof bot?.foodSaturation === 'number' ? bot.foodSaturation : null;
    const effects = [];
    if (bot?.entity?.effects) {
      for (const [id, eff] of Object.entries(bot.entity.effects)) {
        effects.push(eff?.name || `effect_${id}`);
      }
    }
    return { food, saturation, effects };
  }

  _safeBlockName(bot, pos) {
    try {
      const b = bot.blockAt(pos);
      return b ? b.name : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Compact Russian narration of a scene, for injection into the AI context.
   */
  describe(scene) {
    if (!scene) return 'Вид недоступен.';
    const parts = [];

    // Most urgent first: what is happening to me right now.
    if (scene.status && scene.status.length > 0) {
      parts.push(`Сейчас со мной: ${scene.status.join(', ')}.`);
    }

    parts.push(`Смотрю на ${scene.facing.ru}. Биом: ${scene.biome}. ${scene.ground.elevation}, под ногами ${scene.ground.standingOn || 'воздух'}.`);

    // Only mention directions that have something notable.
    const notable = scene.horizon.filter(h => !(h.features.length === 1 && h.features[0] === 'ровная местность'));
    if (notable.length > 0) {
      const bits = notable.map(h => `на ${h.ru} — ${h.features.join(', ')}`);
      parts.push(`Вокруг: ${bits.join('; ')}.`);
    } else {
      parts.push('Вокруг в основном ровная местность.');
    }

    // Wide situational awareness: what I'm aiming at, ores, hazards, stations.
    const n = scene.nearby;
    if (n) {
      if (n.lookingAt) parts.push(`Прямо перед взглядом: ${n.lookingAt}.`);
      if (n.ores.length > 0) {
        parts.push(`Руда рядом: ${n.ores.map(o => `${o.name} (${o.dist}м)`).join(', ')}.`);
      }
      if (n.hazards.length > 0) {
        parts.push(`Опасно рядом: ${n.hazards.map(h => `${h.name} (${h.dist}м)`).join(', ')}.`);
      }
      if (n.stations.length > 0) {
        parts.push(`Полезное рядом: ${n.stations.map(s => `${s.name} (${s.dist}м)`).join(', ')}.`);
      }
    }

    // Light and safety context
    if (scene.light && scene.light.blockLight !== null) {
      if (scene.light.blockLight <= 0) {
        parts.push(`Освещение под ногами: полная тьма (свет: ${scene.light.blockLight}), здесь могут спавниться монстры!`);
      } else if (scene.light.blockLight <= 4) {
        parts.push(`Освещение под ногами: тускло (свет: ${scene.light.blockLight}).`);
      }
    }

    // Celestial / weather
    if (scene.celestial) {
      if (scene.celestial.isThundering) {
        parts.push('Погода: гроза с молниями (очень темно, монстры спавнятся даже днём)!');
      } else if (scene.celestial.isRaining) {
        parts.push('Погода: идёт дождь.');
      }
      if (scene.celestial.timeDesc) {
        parts.push(`Время: ${scene.celestial.timeDesc}.`);
      }
    }

    // Metabolism & body state
    if (scene.metabolism) {
      if (scene.metabolism.food !== null && scene.metabolism.food < 6) {
        parts.push(`Критический голод (${scene.metabolism.food}/20), спринт заблокирован!`);
      }
      if (scene.metabolism.effects && scene.metabolism.effects.length > 0) {
        parts.push(`Эффекты: ${scene.metabolism.effects.join(', ')}.`);
      }
    }

    if (scene.entities.length > 0) {
      const sideRu = { ahead: 'впереди', behind: 'позади', left: 'слева', right: 'справа', above: 'сверху', below: 'снизу' };
      const ents = scene.entities.slice(0, 5).map(e => {
        let details = `${e.name} (${sideRu[e.side] || e.side}, ${e.distance}м`;
        if (e.isPlayer) {
          const pBits = [];
          if (e.isLookingAtBot) pBits.push('смотрит на тебя');
          if (e.heldItem) pBits.push(`держит ${e.heldItem}`);
          if (e.isSneaking) pBits.push('приседает');
          if (pBits.length > 0) details += `, ${pBits.join(', ')}`;
        }
        details += ')';
        return details;
      });
      parts.push(`Рядом: ${ents.join(', ')}.`);
    }

    if (scene.sounds && scene.sounds.length > 0) {
      parts.push(`Слышу: ${scene.sounds.join(', ')}.`);
    }

    return parts.join(' ');
  }
}

export const sceneObserver = new SceneObserver();
