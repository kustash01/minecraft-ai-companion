import { createLogger } from '../utils/logger.js';

const logger = createLogger('MEMORY');

export const POITypes = {
  BASE: 'base',
  VILLAGE: 'village',
  CAVE: 'cave',
  STRONGHOLD: 'stronghold',
  NETHER_FORTRESS: 'nether_fortress',
  PORTAL: 'portal',
  MINE: 'mine',
  FARM: 'farm',
  DEATH: 'death_location',
  OTHER: 'other',
};

export class POIManager {
  constructor(longTermMemory) {
    this.storage = longTermMemory;
  }

  /**
   * Добавляет новую точку интереса.
   */
  addPOI(name, type, { x, y, z }, notes = '', dimension = 'overworld') {
    const id = this.storage.addPOI(name, type, { x, y, z }, notes, dimension);
    logger.info(`Сохранена точка интереса [${type}] "${name}" на [${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}]`);
    return { id, name, type, x, y, z, notes };
  }

  /**
   * Получает все POI указанного типа или все.
   */
  getPOIs(type = null) {
    return this.storage.getPOIs(type);
  }

  /**
   * Поиск POI по имени.
   */
  findByName(name) {
    return this.storage.getPOIByName(name);
  }

  /**
   * Находит ближайшую точку интереса к заданной позиции.
   */
  findNearest(pos, type = null) {
    const all = this.getPOIs(type);
    if (all.length === 0) return null;

    let nearest = null;
    let minDist = Infinity;

    for (const poi of all) {
      const dx = pos.x - poi.x;
      const dy = pos.y - poi.y;
      const dz = pos.z - poi.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < minDist) {
        minDist = dist;
        nearest = { ...poi, distance: Math.round(dist * 10) / 10 };
      }
    }

    return nearest;
  }

  /**
   * Возвращает базу (если задана).
   */
  getBase() {
    const bases = this.getPOIs(POITypes.BASE);
    return bases.length > 0 ? bases[0] : null;
  }

  /**
   * Устанавливает или обновляет главную базу.
   */
  setBase(pos, name = 'Главная база', notes = 'Наша база') {
    return this.addPOI(name, POITypes.BASE, pos, notes);
  }
}
