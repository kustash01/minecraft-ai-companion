import { createLogger } from '../utils/logger.js';

const logger = createLogger('SCREENSHOT');

/**
 * FrameCapture — renders a single first-person frame of the bot's view using
 * prismarine-viewer's headless renderer, IF the optional native stack
 * (node-canvas-webgl / three) is installed. On any machine without that stack
 * it degrades gracefully instead of crashing the bot.
 *
 * This is intentionally lazy: nothing heavy is imported until the first capture
 * attempt, so a normal run never pays for it.
 */
export class FrameCapture {
  constructor() {
    this._available = null; // null = unknown, true/false once probed
    this._renderer = null;
    this._viewer = null;
    this._worldView = null;
    this._deps = null;
  }

  /**
   * Probe whether the headless render stack can be loaded. Cached.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (this._available !== null) return this._available;
    try {
      const [{ Viewer, WorldView, getBufferFromStream }, three, canvasWebgl] = await Promise.all([
        import('prismarine-viewer/viewer/index.js').catch(() => import('prismarine-viewer').then(m => m.viewer)),
        import('three'),
        import('node-canvas-webgl/lib/index.js').catch(() => import('node-canvas-webgl')),
      ]);
      const createCanvas = canvasWebgl.createCanvas || canvasWebgl.default?.createCanvas;
      if (!Viewer || !WorldView || !createCanvas || !three) {
        this._available = false;
      } else {
        this._deps = { Viewer, WorldView, getBufferFromStream, THREE: three.default || three, createCanvas };
        this._available = true;
      }
    } catch (err) {
      logger.debug(`Headless render stack unavailable: ${err.message}`);
      this._available = false;
    }
    return this._available;
  }

  /**
   * Capture a PNG buffer of the bot's current first-person view.
   * @param {object} bot
   * @param {object} [opts] { width, height, viewDistance }
   * @returns {Promise<Buffer|null>} PNG buffer, or null if unavailable.
   */
  async capture(bot, opts = {}) {
    if (!(await this.isAvailable())) return null;
    if (!bot?.entity?.position) return null;

    const { Viewer, WorldView, THREE, createCanvas } = this._deps;
    const width = opts.width || 512;
    const height = opts.height || 512;
    const viewDistance = opts.viewDistance || 4;

    let renderer = null;
    try {
      const canvas = createCanvas(width, height);
      renderer = new THREE.WebGLRenderer({ canvas });
      const viewer = new Viewer(renderer);
      if (!viewer.setVersion(bot.version)) {
        logger.debug(`Viewer does not support version ${bot.version}`);
        return null;
      }
      viewer.setFirstPersonCamera(bot.entity.position, bot.entity.yaw, bot.entity.pitch);

      const worldView = new WorldView(bot.world, viewDistance, bot.entity.position);
      viewer.listen(worldView);
      await worldView.init(bot.entity.position);

      // Give chunk meshes a moment to build.
      await new Promise(r => setTimeout(r, opts.settleMs || 800));
      viewer.setFirstPersonCamera(bot.entity.position, bot.entity.yaw, bot.entity.pitch);
      viewer.update();
      renderer.render(viewer.scene, viewer.camera);

      // node-canvas-webgl canvas exposes toBuffer for PNG.
      const buf = canvas.toBuffer ? canvas.toBuffer('image/png') : null;
      return buf;
    } catch (err) {
      logger.warn(`Ошибка захвата кадра: ${err.message}`);
      return null;
    } finally {
      try { renderer?.dispose?.(); } catch (_) {}
    }
  }
}

export const frameCapture = new FrameCapture();
