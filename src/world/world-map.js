import logger from '../utils/logger.js';

export class WorldMapEngine {
  constructor() {
    this.chunks = new Map(); // 'chunkX,chunkZ' -> { biome, dangerLevel, structures: [], lastVisited }
    this.landmarks = new Map(); // name -> { coords, description, landmarkType }
  }

  recordChunk(x, z, { biome = 'plains', dangerLevel = 1, structure = null } = {}) {
    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    const key = `${chunkX},${chunkZ}`;

    const existing = this.chunks.get(key) || {
      chunkX,
      chunkZ,
      biome,
      dangerLevel,
      structures: [],
    };

    existing.lastVisited = Date.now();
    if (structure && !existing.structures.includes(structure)) {
      existing.structures.push(structure);
    }

    this.chunks.set(key, existing);
  }

  addLandmark(name, coords, description = '', landmarkType = 'natural') {
    this.landmarks.set(name.toLowerCase(), {
      name,
      coords,
      description,
      landmarkType,
      createdAt: Date.now(),
    });
    logger.info(`[MAP] Landmark registered: "${name}" at (${coords.x}, ${coords.y}, ${coords.z})`);
  }

  getLandmark(name) {
    return this.landmarks.get(name.toLowerCase()) || null;
  }
}

export const worldMap = new WorldMapEngine();
