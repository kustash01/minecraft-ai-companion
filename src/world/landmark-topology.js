import { createLogger } from '../utils/logger.js';
import { spatialIntelligence } from './spatial-intelligence.js';

const logger = createLogger('LANDMARK_TOPOLOGY');

/**
 * LandmarkTopology — человеческая пространственная память по ориентирам:
 * Человек не мыслит "пойти на x: 124, y: 64, z: -289".
 * Человек мыслит: "у старого дуба", "в сундуке справа от печи", "в шахте за рекой к северу".
 */
export class LandmarkTopology {
  constructor() {
    this.landmarks = new Map(); // name -> { name, coords, description, landmarkType, createdAt }
  }

  /**
   * Запомнить ориентир
   */
  remember(name, coords, description = '', landmarkType = 'landmark') {
    if (!name || !coords) return null;
    const cleanName = String(name).trim();
    const entry = {
      name: cleanName,
      coords: {
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        z: Math.round(coords.z),
      },
      description,
      landmarkType,
      createdAt: Date.now(),
    };
    this.landmarks.set(cleanName.toLowerCase(), entry);
    logger.info(`[LANDMARK] Запомнен ориентир: "${cleanName}" на [${entry.coords.x}, ${entry.coords.y}, ${entry.coords.z}] (${description})`);
    return entry;
  }

  /**
   * Найти ориентир по названию
   */
  get(name) {
    if (!name) return null;
    return this.landmarks.get(String(name).toLowerCase()) || null;
  }

  /**
   * Поиск ближайшего ориентира к заданной точке
   */
  findNearest(pos, type = null) {
    if (!pos) return null;
    let best = null;
    let minDistance = Infinity;

    for (const [_, entry] of this.landmarks) {
      if (type && entry.landmarkType !== type) continue;
      const dist = Math.hypot(pos.x - entry.coords.x, pos.y - entry.coords.y, pos.z - entry.coords.z);
      if (dist < minDistance) {
        minDistance = dist;
        best = { ...entry, distance: Math.round(dist) };
      }
    }
    return best;
  }

  /**
   * Человеческое топологическое описание позиции относительно известных ориентиров
   */
  describeRelative(pos, botYaw = 0) {
    if (!pos) return 'неизвестное место';
    const nearest = this.findNearest(pos);
    if (!nearest) return `[${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}]`;

    if (nearest.distance <= 3) {
      return `прямо у ориентира "${nearest.name}"`;
    }

    const direction = spatialIntelligence?.describeRelativePosition
      ? spatialIntelligence.describeRelativePosition(nearest.coords, botYaw, pos)
      : `${nearest.distance}м`;

    return `около "${nearest.name}" (${direction})`;
  }

  /**
   * Список всех активных ориентиров для контекста Gemini
   */
  list() {
    return Array.from(this.landmarks.values());
  }
}

export const landmarkTopology = new LandmarkTopology();
