import minecraftData from 'minecraft-data';
import { createLogger } from '../utils/logger.js';
import { spatialIntelligence } from '../world/spatial-intelligence.js';

const logger = createLogger('STRUCTURE');

/**
 * StructureDetector — recognises nearby man-made / generated structures from
 * their block + entity signatures (no server structure API needed, works like
 * a player noticing "hey, that's a village").
 *
 * Villages are identified by a cluster of workstation/utility blocks (bell,
 * composter, lectern, beds, hay bales...) and/or villager entities.
 */
export class StructureDetector {
  constructor(options = {}) {
    this.maxDistance = options.maxDistance ?? 64;
    this._mcDataCache = new Map();
  }

  _mcData(version) {
    const v = version || '1.20.4';
    if (!this._mcDataCache.has(v)) this._mcDataCache.set(v, minecraftData(v));
    return this._mcDataCache.get(v);
  }

  /**
   * Village-signature blocks. Weighted: a bell alone is a very strong signal;
   * beds/hay/workstations are supporting evidence.
   */
  static VILLAGE_BLOCK_WEIGHTS = {
    bell: 5,
    composter: 2,
    lectern: 2,
    fletching_table: 2,
    smithing_table: 2,
    cartography_table: 2,
    loom: 2,
    grindstone: 2,
    stonecutter: 2,
    blast_furnace: 2,
    smoker: 2,
    barrel: 1,
    hay_block: 2,
    bell_block: 5,
  };

  /**
   * Detect a village near the bot. Returns null if not confident.
   * @param {object} bot
   * @param {number} [maxDistance]
   * @returns {null | { type, confidence, center, blockCount, villagerCount, distance, direction }}
   */
  detectVillage(bot, maxDistance = this.maxDistance) {
    if (!bot?.entity?.position || typeof bot.findBlocks !== 'function') return null;

    const mc = this._mcData(bot.version);
    const weights = StructureDetector.VILLAGE_BLOCK_WEIGHTS;

    // Collect signature block positions with their weights.
    const hits = [];
    let score = 0;
    const isBed = (name) => name.endsWith('_bed');

    const matcher = (block) => {
      if (!block || !block.name) return false;
      const n = block.name;
      return weights[n] !== undefined || isBed(n);
    };

    let positions = [];
    try {
      positions = bot.findBlocks({ matching: matcher, maxDistance, count: 200 }) || [];
    } catch (err) {
      logger.debug(`findBlocks failed in detectVillage: ${err.message}`);
    }

    let bedCount = 0;
    for (const pos of positions) {
      const block = bot.blockAt(pos);
      if (!block) continue;
      const n = block.name;
      const w = weights[n] !== undefined ? weights[n] : (isBed(n) ? 1 : 0);
      if (w <= 0) continue;
      if (isBed(n)) bedCount++;
      score += w;
      hits.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, name: n, weight: w });
    }

    // Beds beyond the first few add little (a village has many, but so does a base).
    // Cap bed contribution so beds alone can't fake a village.
    const cappedBedBonus = Math.min(bedCount, 4);
    score += cappedBedBonus;

    // Count villager entities nearby (strong confirmation).
    let villagerCount = 0;
    const botPos = bot.entity.position;
    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || !e.position) continue;
      const name = (e.name || '').toLowerCase();
      if (name === 'villager' || name === 'wandering_trader' || name === 'iron_golem') {
        if (botPos.distanceTo(e.position) <= maxDistance) villagerCount++;
      }
    }
    score += villagerCount * 3;

    if (hits.length === 0 && villagerCount === 0) return null;

    // Require a real cluster: a lone crafting table / barrel isn't a village.
    const hasBell = hits.some(h => h.name === 'bell');
    const enoughEvidence = hasBell || villagerCount >= 2 || score >= 8;
    if (!enoughEvidence) return null;

    const center = this._centroid(hits.length ? hits.map(h => h.pos) : [{ x: botPos.x, y: botPos.y, z: botPos.z }]);
    const dist = Math.round(Math.hypot(center.x - botPos.x, center.y - botPos.y, center.z - botPos.z));
    const direction = spatialIntelligence.getCompassToTarget(
      { x: botPos.x, y: botPos.y, z: botPos.z },
      center
    );

    // Confidence 0..1 from evidence strength.
    const confidence = Math.max(0, Math.min(1, score / 20));

    return {
      type: 'village',
      confidence: Math.round(confidence * 100) / 100,
      center,
      blockCount: hits.length,
      bedCount,
      villagerCount,
      distance: dist,
      direction,
    };
  }

  _centroid(points) {
    const n = points.length || 1;
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
    return { x: Math.round(sum.x / n), y: Math.round(sum.y / n), z: Math.round(sum.z / n) };
  }

  describeVillage(detection) {
    if (!detection) return 'Деревни поблизости не вижу.';
    const conf = detection.confidence >= 0.7 ? 'точно' : detection.confidence >= 0.4 ? 'похоже' : 'возможно';
    const parts = [`${conf} деревня на ${detection.direction.ru}, примерно ${detection.distance}м`];
    if (detection.villagerCount > 0) parts.push(`жителей рядом: ${detection.villagerCount}`);
    if (detection.bedCount > 0) parts.push(`кроватей: ${detection.bedCount}`);
    parts.push(`координаты ~[${detection.center.x}, ${detection.center.y}, ${detection.center.z}]`);
    return parts.join(', ') + '.';
  }
}

export const structureDetector = new StructureDetector();
