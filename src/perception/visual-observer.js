import { createLogger } from '../utils/logger.js';

const logger = createLogger('VISUAL_OBSERVER');

/**
 * Builds a compact first-person observation from the same camera pose that
 * Mineflayer uses. This is deliberately separate from WorldState: it changes
 * quickly and is consumed by the local vision loop.
 */
export class VisualObserver {
  constructor(options = {}) {
    this.horizontalRays = options.horizontalRays ?? 13;
    this.verticalRays = options.verticalRays ?? 7;
    this.maxDistance = options.maxDistance ?? 18;
    this.fov = options.fov ?? (Math.PI * 0.95);
    this.lastFrame = null;
  }

  observe(bot) {
    if (!bot?.entity?.position || typeof bot.blockAt !== 'function') return null;

    const origin = bot.entity.position.offset(0, 1.62, 0);
    const yaw = bot.entity.yaw || 0;
    const pitch = bot.entity.pitch || 0;
    const rays = [];

    for (let y = 0; y < this.verticalRays; y++) {
      const v = this.verticalRays === 1 ? 0 : y / (this.verticalRays - 1) * 2 - 1;
      const rayPitch = pitch + v * 0.58;
      for (let x = 0; x < this.horizontalRays; x++) {
        const h = this.horizontalRays === 1 ? 0 : x / (this.horizontalRays - 1) * 2 - 1;
        const block = this._raycastBlock(bot, origin, yaw + h * this.fov / 2, rayPitch);
        rays.push({ x, y, block: block?.name || 'air', distance: block?.distance ?? this.maxDistance });
      }
    }

    const entities = Object.values(bot.entities || {})
      .filter(entity => entity !== bot.entity && entity.position)
      .map(entity => ({
        name: entity.username || entity.name || entity.type,
        type: entity.type,
        distance: Math.round(bot.entity.position.distanceTo(entity.position) * 10) / 10,
        position: {
          x: Math.round(entity.position.x * 10) / 10,
          y: Math.round(entity.position.y * 10) / 10,
          z: Math.round(entity.position.z * 10) / 10,
        },
      }))
      .filter(entity => entity.distance <= this.maxDistance)
      .sort((a, b) => a.distance - b.distance);

    this.lastFrame = {
      capturedAt: Date.now(),
      camera: { yaw, pitch, fov: this.fov, position: origin },
      player: { health: bot.health, food: bot.food, onGround: bot.entity.onGround },
      visibleEntities: entities,
      rayGrid: rays,
      controls: typeof bot.getControlState === 'function'
        ? ['forward', 'back', 'left', 'right', 'jump', 'sprint'].filter(key => bot.getControlState(key))
        : [],
    };
    return this.lastFrame;
  }

  _raycastBlock(bot, origin, yaw, pitch) {
    const direction = {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: -Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    for (let distance = 1; distance <= this.maxDistance; distance += 1) {
      const position = origin.offset(
        direction.x * distance,
        direction.y * distance,
        direction.z * distance,
      );
      const block = bot.blockAt(position);
      if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
        return { name: block.name, distance };
      }
    }
    return null;
  }

  describe(frame = this.lastFrame) {
    if (!frame) return 'Кадр недоступен.';
    const rows = [];
    for (let y = 0; y < this.verticalRays; y++) {
      rows.push(frame.rayGrid.slice(y * this.horizontalRays, (y + 1) * this.horizontalRays)
        .map(cell => `${cell.block}@${cell.distance}`).join(' | '));
    }
    return JSON.stringify({
      camera: frame.camera,
      player: frame.player,
      visibleEntities: frame.visibleEntities,
      firstPersonRayGrid: rows,
      controls: frame.controls,
    });
  }
}
