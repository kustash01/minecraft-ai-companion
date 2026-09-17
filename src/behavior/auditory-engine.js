import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('AUDITORY_ENGINE');

/**
 * AuditoryEngine ? 3D ???????? ????? ? ??????????????? ????????? ??????????.
 * 
 * ????????:
 * 1. 3D-??????????? ????? ? ??????? ???????????? ????????????? ??? (Angular Jitter ~10-20?).
 * 2. ??????????? ??????? (Inattentional Deafness): ??? ??????? ???????????? ?? ?????? (???????, ?????)
 *    ????? ??? ??????? ????? ?? ??????? ?? ????????.
 * 3. ???????? ????? (Startle Reflex) ?? ??????? ??????? / ????? ? ??????????? ??????? (???, ?????? ??? ??????).
 */
export class AuditoryEngine {
  constructor(bot, adrenalineController = null) {
    this.bot = bot;
    this.adrenaline = adrenalineController;
    this.cognitiveLoad = 0.1;
    this.activeTask = 'idle';
    this.recentSounds = [];
    this.maxSoundHistory = 20;

    this.criticalSounds = {
      'entity.creeper.primed': { threat: 'critical', radius: 8 },
      'entity.generic.explode': { threat: 'critical', radius: 24 },
      'entity.skeleton.shoot': { threat: 'high', radius: 16 },
      'block.lava.pop': { threat: 'medium', radius: 6 },
      'block.lava.ambient': { threat: 'medium', radius: 8 },
      'entity.zombie.ambient': { threat: 'low', radius: 12 },
    };
  }

  setTaskFocus(task = 'idle', load = 0.1) {
    this.activeTask = task;
    this.cognitiveLoad = Math.min(1.0, Math.max(0.0, load));
    logger.debug(`[AUDITORY] Фокус внимания: ${task} (когнитивная нагрузка: ${this.cognitiveLoad.toFixed(2)})`);
  }

  processSound(soundName, soundPos, volume = 1.0, pitch = 1.0) {
    const botPos = this.bot?.entity?.position;
    if (!botPos || !soundPos) return { heard: false, reason: 'no_position' };

    const distance = botPos.distanceTo(soundPos);

    // 1. ??????????? ??????? (Inattentional Deafness)
    const effVolume = Math.max(0.05, volume / (1.0 + distance * 0.15));

    const tunneling = this.adrenaline ? this.adrenaline.getAttentionTunnelingFactor() : 0;
    const totalLoad = Math.min(1.0, this.cognitiveLoad + tunneling * 0.5);

    const perceptionScore = HumanErrorEngine.gaussian(effVolume - totalLoad * 0.45, 0.12);

    const isPointBlankCritical = (soundName.includes('creeper') || soundName.includes('explode')) && distance < 3.5;

    if (perceptionScore < 0.22 && !isPointBlankCritical) {
      logger.debug(`[AUDITORY] Пропущен звук: ${soundName} (дистанция ${distance.toFixed(1)}м, глухота из-за фокуса на ${this.activeTask})`);
      return { heard: false, reason: 'inattentional_deafness' };
    }

    // 2. ???????? 3D ??????????? ? ??????? ????????????
    const dx = soundPos.x - botPos.x;
    const dy = (soundPos.y - (botPos.y + 1.6));
    const dz = soundPos.z - botPos.z;
    const rawYaw = Math.atan2(-dx, -dz);
    const rawPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

    const jitterFactor = 0.15 + (totalLoad * 0.1);
    const perceivedYaw = rawYaw + HumanErrorEngine.gaussian(0, jitterFactor);
    const perceivedPitch = rawPitch + HumanErrorEngine.gaussian(0, jitterFactor * 0.6);

    const soundEvent = {
      name: soundName,
      pos: soundPos,
      distance,
      volume: effVolume,
      perceivedYaw,
      perceivedPitch,
      timestamp: Date.now(),
    };

    this.recentSounds.unshift(soundEvent);
    if (this.recentSounds.length > this.maxSoundHistory) this.recentSounds.pop();

    logger.debug(`[AUDITORY] Услышан звук: ${soundName} на расстоянии ${distance.toFixed(1)}м (направление: yaw ${perceivedYaw.toFixed(2)})`);

    let reaction = null;
    if (soundName.includes('creeper.primed') || (soundName.includes('explode') && distance < 12)) {
      reaction = this.evaluateStartleReflex(soundEvent);
      if (this.adrenaline) {
        if (soundName.includes('creeper')) this.adrenaline.triggerCreeperHiss(distance);
        else this.adrenaline.triggerExplosion();
      }
    }

    return {
      heard: true,
      sound: soundEvent,
      reaction,
    };
  }

  evaluateStartleReflex(soundEvent) {
    const efficiency = this.adrenaline ? this.adrenaline.getYerkesDodsonEfficiency() : 0.85;
    const curAdrenaline = this.adrenaline ? this.adrenaline.adrenaline : 0.2;

    const baseDelay = 100 / Math.max(0.3, efficiency);
    const delayMs = Math.max(50, Math.round(HumanErrorEngine.gaussian(baseDelay, 25)));

    const panicStress = HumanErrorEngine.gaussian(curAdrenaline, 0.18);

    if (panicStress > 0.82) {
      return {
        action: 'panic_fumble',
        delayMs: delayMs + 100,
        reason: 'панический отскок назад с заминкой щита',
      };
    }
    if (panicStress > 0.68) {
      return {
        action: 'freeze_hesitate',
        delayMs: delayMs + 160,
        reason: 'секундный ступор от неожиданности (brain lag)',
      };
    }
    return {
      action: 'snap_shield',
      delayMs,
      reason: 'мгновенный разворот на звук и подъём щита',
    };
  }

  getRecentSounds(maxAgeMs = 5000) {
    const now = Date.now();
    return this.recentSounds.filter(s => now - s.timestamp <= maxAgeMs);
  }
}
