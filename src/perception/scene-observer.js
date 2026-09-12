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
  }

  _mcData(version) {
    const v = version || '1.20.4';
    if (!this._mcDataCache.has(v)) {
      this._mcDataCache.set(v, minecraftData(v));
    }
    return this._mcDataCache.get(v);
  }

  /**
   * Build a structured observation of the surroundings.
   * @param {object} bot - Mineflayer bot
   * @returns {object|null}
   */
  observe(bot) {
    if (!bot?.entity?.position || typeof bot.blockAt !== 'function') return null;

    const pos = bot.entity.position;
    const eyePos = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
    const yaw = bot.entity.yaw || 0;

    const facing = spatialIntelligence.getFacingDirection(yaw);
    const biome = this._biomeAt(bot, eyePos);
    const horizon = this._scanHorizon(bot, eyePos);
    const entities = this._nearbyEntities(bot, pos, yaw);
    const ground = this._groundContext(bot, eyePos);

    return {
      capturedAt: Date.now(),
      position: eyePos,
      facing,
      biome,
      ground,
      horizon,
      entities,
    };
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

  _nearbyEntities(bot, pos, yaw) {
    const out = [];
    const botPos = { x: pos.x, y: pos.y, z: pos.z };
    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || e === bot.entity || !e.position) continue;
      const dist = pos.distanceTo(e.position);
      if (dist > 32) continue;
      const target = { x: e.position.x, y: e.position.y, z: e.position.z };
      out.push({
        name: e.username || e.name || e.type,
        type: e.type,
        distance: Math.round(dist * 10) / 10,
        side: spatialIntelligence.getRelativeDirection(botPos, yaw, target),
        compass: spatialIntelligence.getCompassToTarget(botPos, target).ru,
      });
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, 8);
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
    parts.push(`Смотрю на ${scene.facing.ru}. Биом: ${scene.biome}. ${scene.ground.elevation}, под ногами ${scene.ground.standingOn || 'воздух'}.`);

    // Only mention directions that have something notable.
    const notable = scene.horizon.filter(h => !(h.features.length === 1 && h.features[0] === 'ровная местность'));
    if (notable.length > 0) {
      const bits = notable.map(h => `на ${h.ru} — ${h.features.join(', ')}`);
      parts.push(`Вокруг: ${bits.join('; ')}.`);
    } else {
      parts.push('Вокруг в основном ровная местность.');
    }

    if (scene.entities.length > 0) {
      const sideRu = { ahead: 'впереди', behind: 'позади', left: 'слева', right: 'справа', above: 'сверху', below: 'снизу' };
      const ents = scene.entities.slice(0, 5).map(e => `${e.name} (${sideRu[e.side] || e.side}, ${e.distance}м)`);
      parts.push(`Рядом: ${ents.join(', ')}.`);
    }

    return parts.join(' ');
  }
}

export const sceneObserver = new SceneObserver();
