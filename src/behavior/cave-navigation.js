import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';
import { BotActionWrapper } from './bot-action-wrapper.js';
import { HumanTradeoffs } from './human-tradeoffs.js';

const logger = createLogger('CAVE_NAV');

/**
 * CaveNavigation — управление поведением в пещерах и темных пространствах:
 * 1. Интеллектуальная расстановка факелов на полу и стенах при низком освещении (light <= 7).
 * 2. Человеческая осторожность в темноте (замедление, аккуратное сканирование взглядом при отсутствии света/факелов).
 * 3. Защита от спама факелами (проверка дистанции до существующих источников света и кулдаун).
 */
export class CaveNavigation {
  /**
   * @param {Object} options
   * @param {Object} [options.bot]
   * @param {Object} [options.emotionalSystem]
   * @param {Object} [options.errorSystem]
   * @param {string} [options.agentName]
   */
  constructor(options = {}) {
    this.bot = options.bot || null;
    this.emotionalSystem = options.emotionalSystem || null;
    this.errorSystem = options.errorSystem || null;
    this.agentName = options.agentName || 'Bot';
    this.lastTorchTime = 0;
    this.minTorchInterval = 8000; // Минимальный интервал между факелами (8 сек)
    this.lastGazeScan = 0;
  }

  /**
   * Оценивает освещенность и окружение бота
   */
  checkEnvironment(bot = this.bot) {
    if (!bot || !bot.entity || !bot.entity.position) {
      return { lightLevel: 15, blockLight: 15, skyLight: 15, inCave: false, isDark: false, isPitchBlack: false };
    }

    const pos = typeof bot.entity.position.floored === 'function'
      ? bot.entity.position.floored()
      : {
          x: Math.floor(bot.entity.position.x),
          y: Math.floor(bot.entity.position.y),
          z: Math.floor(bot.entity.position.z),
        };

    let blockLight = 15;
    let skyLight = 0;
    let lightLevel = 15;

    if (typeof bot.blockAt === 'function' || bot.world) {
      const block = typeof bot.blockAt === 'function'
        ? bot.blockAt(pos)
        : (typeof bot.world.getBlock === 'function' ? bot.world.getBlock(pos) : null);

      if (block) {
        blockLight = block.light ?? 15;
        if (block.skyLight !== undefined) {
          skyLight = block.skyLight;
          lightLevel = Math.max(blockLight, skyLight);
        } else {
          skyLight = 0;
          lightLevel = blockLight;
        }
      }
    }

    const yPos = bot.entity.position.y;
    const inCave = Boolean(yPos < 55 || (skyLight <= 4 && yPos < 65));
    const isDark = lightLevel <= 7;
    const isPitchBlack = lightLevel <= 4;

    return { lightLevel, blockLight, skyLight, inCave, isDark, isPitchBlack, pos };
  }

  /**
   * Подсчитывает количество факелов в инвентаре
   */
  countTorches(bot = this.bot) {
    if (!bot || !bot.inventory) return 0;
    const items = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
    return items.reduce((acc, item) => {
      if (item.name === 'torch' || item.name === 'soul_torch') {
        return acc + (item.count || 1);
      }
      return acc;
    }, 0);
  }

  /**
   * Проверяет, является ли текущее место перекрёстком / развилкой в пещере (3+ открытых направлений)
   */
  isIntersection(bot = this.bot) {
    if (!bot?.entity?.position || typeof bot.blockAt !== 'function') return false;
    const feetPos = typeof bot.entity.position.floored === 'function'
      ? bot.entity.position.floored()
      : {
          x: Math.floor(bot.entity.position.x),
          y: Math.floor(bot.entity.position.y),
          z: Math.floor(bot.entity.position.z),
        };

    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];
    let openPassages = 0;
    for (const { dx, dz } of dirs) {
      const b1 = bot.blockAt(vec3(feetPos.x + dx, feetPos.y, feetPos.z + dz));
      const b2 = bot.blockAt(vec3(feetPos.x + dx, feetPos.y + 1, feetPos.z + dz));
      const isAir1 = !b1 || b1.name === 'air' || b1.name === 'cave_air';
      const isAir2 = !b2 || b2.name === 'air' || b2.name === 'cave_air';
      if (isAir1 && isAir2) {
        openPassages++;
      }
    }
    return openPassages >= 3;
  }

  /**
   * Проверяет, требуется ли ставить факел в данной точке
   */
  shouldPlaceTorch(bot = this.bot) {
    if (!bot || !bot.entity) return false;
    const now = Date.now();
    const timeSinceLastTorch = now - this.lastTorchTime;

    const torches = this.countTorches(bot);
    if (torches <= 0) return false;

    const env = this.checkEnvironment(bot);
    const isInter = this.isIntersection(bot);

    const decision = HumanTradeoffs.evaluateTorchDecision({
      torchCount: torches,
      isDark: env.isDark || env.isPitchBlack,
      inCave: env.inCave,
      isIntersection: isInter,
      timeSinceLastTorch,
    });

    if (!decision.shouldPlace) return false;

    // Не спамим, если рядом (в радиусе 6 блоков) уже стоит факел
    if (typeof bot.findBlock === 'function') {
      try {
        const nearbyTorch = bot.findBlock({
          matching: (b) => b && (b.name === 'torch' || b.name === 'wall_torch' || b.name === 'soul_torch' || b.name === 'soul_wall_torch'),
          maxDistance: 6,
        });
        if (nearbyTorch) return false;
      } catch (_) {}
    }

    return true;
  }

  /**
   * Ищет подходящий твердый блок и сторону для установки факела
   */
  findTorchSpot(bot = this.bot) {
    if (!bot || !bot.entity || typeof bot.blockAt !== 'function') return null;

    const feetPos = typeof bot.entity.position.floored === 'function'
      ? bot.entity.position.floored()
      : {
          x: Math.floor(bot.entity.position.x),
          y: Math.floor(bot.entity.position.y),
          z: Math.floor(bot.entity.position.z),
        };

    const isSolid = (b) => b && b.boundingBox === 'block' && !b.name.includes('water') && !b.name.includes('lava') && !b.name.includes('leaves') && !b.name.includes('air');
    const isAir = (b) => b && (b.name === 'air' || b.name === 'cave_air');

    // 1. Попытка установить на ПОЛ под ногами или на шаг вперед/вбок
    const floorOffsets = [
      { dx: 0, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    for (const { dx, dz } of floorOffsets) {
      const airCandidatePos = vec3(feetPos.x + dx, feetPos.y, feetPos.z + dz);
      const floorCandidatePos = vec3(feetPos.x + dx, feetPos.y - 1, feetPos.z + dz);

      const airBlock = bot.blockAt(airCandidatePos);
      const floorBlock = bot.blockAt(floorCandidatePos);

      if (isAir(airBlock) && isSolid(floorBlock)) {
        if (!floorBlock.position) floorBlock.position = floorCandidatePos;
        return {
          referenceBlock: floorBlock,
          faceVector: vec3(0, 1, 0),
          targetPos: airCandidatePos,
          type: 'floor',
        };
      }
    }

    // 2. Попытка установить на СТЕНУ рядом (на уровне пояса/глаз)
    const wallOffsets = [
      { dx: 1, dz: 0, normal: vec3(-1, 0, 0) },
      { dx: -1, dz: 0, normal: vec3(1, 0, 0) },
      { dx: 0, dz: 1, normal: vec3(0, 0, -1) },
      { dx: 0, dz: -1, normal: vec3(0, 0, 1) },
    ];

    for (const { dx, dz, normal } of wallOffsets) {
      const wallPos = vec3(feetPos.x + dx, feetPos.y + 1, feetPos.z + dz);
      const airPos = vec3(feetPos.x, feetPos.y + 1, feetPos.z);

      const wallBlock = bot.blockAt(wallPos);
      const airBlock = bot.blockAt(airPos);

      if (isSolid(wallBlock) && isAir(airBlock)) {
        if (!wallBlock.position) wallBlock.position = wallPos;
        return {
          referenceBlock: wallBlock,
          faceVector: normal,
          targetPos: airPos,
          type: 'wall',
        };
      }
    }

    return null;
  }

  /**
   * Выполняет установку факела как живой игрок
   */
  async placeTorch(bot = this.bot) {
    if (!bot || !this.shouldPlaceTorch(bot)) return false;

    const spot = this.findTorchSpot(bot);
    if (!spot) return false;

    try {
      const torchItem = bot.inventory?.items()?.find((i) => i.name === 'torch' || i.name === 'soul_torch');
      if (!torchItem) return false;

      // Запоминаем текущий предмет, чтобы вернуть его в руку
      const prevHeld = bot.heldItem;

      // Экипируем факел
      if (typeof bot.equip === 'function') {
        await bot.equip(torchItem, 'hand');
      }

      // Поворачиваемся к месту установки
      if (typeof bot.lookAt === 'function') {
        const refPos = spot.referenceBlock.position || spot.targetPos;
        const offsetFn = typeof refPos.offset === 'function'
          ? (dx, dy, dz) => refPos.offset(dx, dy, dz)
          : (dx, dy, dz) => vec3(refPos.x + dx, refPos.y + dy, refPos.z + dz);
        const lookTarget = offsetFn(
          0.5 + spot.faceVector.x * 0.4,
          0.5 + spot.faceVector.y * 0.4,
          0.5 + spot.faceVector.z * 0.4
        );
        await bot.lookAt(lookTarget, true);
      }

      // Устанавливаем факел с проверкой ошибок
      const wrapper = new BotActionWrapper(bot, this.emotionalSystem, this.agentName);
      const placed = await wrapper.placeBlock(spot.referenceBlock, spot.faceVector);

      this.lastTorchTime = Date.now();

      // Возвращаем исходный предмет в руку (меч/кирку)
      if (prevHeld && typeof bot.equip === 'function' && prevHeld.name !== torchItem.name) {
        try {
          await bot.equip(prevHeld, 'hand');
        } catch (_) {}
      }

      const env = this.checkEnvironment(bot);
      logger.info(`[${this.agentName}] 🕯️ Установлен факел (${spot.type}) в темноте (свет был ${env.lightLevel})`);
      return placed !== false;
    } catch (err) {
      logger.debug(`[${this.agentName}] Ошибка установки факела: ${err.message}`);
      return false;
    }
  }

  /**
   * Отрабатывает поведение осторожности в темноте
   */
  handleDarknessCaution(bot = this.bot, movementController = null) {
    if (!bot || !bot.entity) return;

    const env = this.checkEnvironment(bot);
    const torches = this.countTorches(bot);
    const now = Date.now();

    // Если темно и нет факелов — включаем режим осторожности
    const needsCaution = env.isDark && (torches === 0 || env.isPitchBlack);

    if (movementController && typeof movementController.setDarkCaution === 'function') {
      movementController.setDarkCaution(needsCaution);
    }

    if (needsCaution && now - this.lastGazeScan > 2200) {
      this.lastGazeScan = now;
      // Осторожно осматриваемся по сторонам и вниз (проверяем пол/обрыв/врагов)
      if (typeof bot.look === 'function' && bot.entity) {
        const yawJitter = (Math.random() - 0.5) * 1.2;
        const pitchCheck = -0.3 + (Math.random() * 0.4); // Смотрим чуть под ноги или на уровень глаз
        bot.look(bot.entity.yaw + yawJitter, pitchCheck, true).catch(() => {});
      }
    }
  }
}
