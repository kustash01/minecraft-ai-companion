import logger from '../utils/logger.js';

export class SignReaderEngine {
  constructor() {
    this.knownSigns = new Map(); // 'x,y,z' -> { text: string[], purpose: string, nearbyChestPos: object|null }
  }

  /**
   * Scan nearby blocks for signs and parse their text.
   * @param {object} botInstance - Mineflayer bot
   * @param {number} maxDistance
   * @returns {Array} List of detected signs with text
   */
  scanSigns(botInstance, maxDistance = 16) {
    if (!botInstance?.findBlocks) return [];

    const signBlocks = botInstance.findBlocks({
      matching: (block) => block && block.name && block.name.includes('sign'),
      maxDistance,
      count: 20,
    });

    const parsed = [];
    for (const pos of signBlocks) {
      const block = botInstance.blockAt(pos);
      if (!block) continue;

      let lines = [];
      if (block.getSignText) {
        lines = block.getSignText().filter(l => l && l.trim().length > 0);
      } else if (block.blockEntity && block.blockEntity.Text1) {
        lines = [block.blockEntity.Text1, block.blockEntity.Text2, block.blockEntity.Text3, block.blockEntity.Text4]
          .map(t => typeof t === 'string' ? t.replace(/"/g, '') : '')
          .filter(t => t.length > 0);
      }

      const key = `${pos.x},${pos.y},${pos.z}`;
      const signData = {
        position: { x: pos.x, y: pos.y, z: pos.z },
        lines,
        text: lines.join(' '),
      };

      this.knownSigns.set(key, signData);
      parsed.push(signData);
    }

    if (parsed.length > 0) {
      logger.debug(`[SIGN-READER] Found ${parsed.length} signs in world.`);
    }

    return parsed;
  }

  /**
   * Find a chest or location associated with sign text query (e.g. 'склад', 'железо', 'дом').
   */
  findSignByQuery(query) {
    const q = query.toLowerCase();
    for (const sign of this.knownSigns.values()) {
      if (sign.text.toLowerCase().includes(q)) {
        return sign;
      }
    }
    return null;
  }
}

export const signReader = new SignReaderEngine();
