import { createLogger } from '../utils/logger.js';
import { WorldInteractionErrors } from '../perception/world-interaction-errors.js';
import { ThreatKnowledge } from '../perception/game-knowledge.js';
import { HumanTradeoffs } from '../behavior/human-tradeoffs.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('COMBAT_AI');


export const ThreatRank = {
  CREEPER: 10,
  WITCH: 9,
  SKELETON: 8,
  STRAY: 8,
  PIGLIN_BRUTE: 9,
  ENDERMAN: 7,
  SPIDER: 6,
  CAVE_SPIDER: 6,
  ZOMBIE: 5,
  DROWNED: 5,
  HUSK: 5,
  SLIME: 3,
};

export const CombatStrategy = {
  RANGED_INTERCEPT: 'RANGED_INTERCEPT', // Skeletons/Strays: sprint + strafe + shield + jump crit
  KITE_HIT: 'KITE_HIT',                 // Creepers: hit & backpedal 4m to reset fuse
  RUSH_BURST: 'RUSH_BURST',             // Witches: rapid melee rush before potions
  SWEEP_LEAP: 'SWEEP_LEAP',             // Spiders: look up/down and sweep
  MELEE_CIRCLE: 'MELEE_CIRCLE',         // Zombies: circular strike + jump crit
  FEET_FOCUS: 'FEET_FOCUS',             // Enderman: hit legs, avoid direct eye gaze
  DEFAULT: 'DEFAULT',
};

const WEAPON_PRIORITY = [
  'netherite_sword',
  'diamond_sword',
  'iron_sword',
  'stone_sword',
  'wooden_sword',
  'golden_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'wooden_axe',
];

export class TacticalCombatAI {
  constructor(options = {}) {
    this.mode = 'balanced'; // 'balanced' | 'bodyguard' | 'rescue' | 'defensive'
    this.targetEntity = null;
    this.strafeDirection = 'left';
    this.lastStrafeSwitch = 0;
    this.lastAttackTime = 0;
    this.isBlocking = false;
    this.inCombat = false;

    // Система ошибок при взаимодействии с миром
    this.errorSystem = options.errorSystem || null;
    this.agentName = options.agentName || 'Bot';
    this.emotionalSystem = options.emotionalSystem || null;
    this.worldState = options.worldState || null;

    // Инициализируем систему ошибок если нет
    if (!this.errorSystem && this.emotionalSystem) {
      this.errorSystem = new WorldInteractionErrors({
        agentName: this.agentName,
        emotionalSystem: this.emotionalSystem,
      });
    }
  }

  /**
   * Prioritize hostile targets based on threat level and distance to bot and player.
   */
  rankTargets(hostileEntities = [], playerPos = null) {
    const scored = hostileEntities.map((ent) => {
      const mobName = (ent.name || ent.type || '').toUpperCase();
      let baseThreat = ThreatRank[mobName] || 4;
      let score = baseThreat * 10;

      // Distance penalty
      const dist = ent.distance || (playerPos && ent.position ? Math.hypot(ent.position.x - playerPos.x, ent.position.z - playerPos.z) : 10);
      score -= dist * 2;

      // High priority if attacking or close to player (< 5 blocks)
      if (playerPos && ent.position) {
        const distToPlayer = Math.hypot(ent.position.x - playerPos.x, ent.position.z - playerPos.z);
        if (distToPlayer < 5) score += 30;
      }

      return { entity: ent, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.entity);
  }

  /**
   * Determine the optimal combat strategy for a specific mob
   */
  getStrategyForMob(mobName = '') {
    const name = mobName.toLowerCase();
    if (name.includes('skeleton') || name.includes('stray') || name.includes('pillager') || name.includes('bow')) {
      return CombatStrategy.RANGED_INTERCEPT;
    }
    if (name.includes('creeper')) {
      return CombatStrategy.KITE_HIT;
    }
    if (name.includes('witch') || name.includes('evoker')) {
      return CombatStrategy.RUSH_BURST;
    }
    if (name.includes('spider')) {
      return CombatStrategy.SWEEP_LEAP;
    }
    if (name.includes('enderman')) {
      return CombatStrategy.FEET_FOCUS;
    }
    return CombatStrategy.MELEE_CIRCLE;
  }

  /**
   * Automatically equip best available weapon and shield
   */
  async equipBestGear(bot) {
    if (!bot || !bot.inventory) return;

    try {
      const items = bot.inventory.items();

      // 1. Equip Best Weapon in Main Hand
      let bestWeapon = null;
      let bestRank = Infinity;

      for (const item of items) {
        const rank = WEAPON_PRIORITY.indexOf(item.name);
        if (rank !== -1 && rank < bestRank) {
          bestRank = rank;
          bestWeapon = item;
        }
      }

      if (bestWeapon && bot.heldItem?.name !== bestWeapon.name) {
        await bot.equip(bestWeapon, 'hand');
      }

      // 2. Equip Shield in Off-Hand if available and not already in off-hand
      const offHandItem = bot.inventory?.slots?.[45];
      if (!offHandItem || offHandItem.name !== 'shield') {
        const shield = items.find((i) => i.name === 'shield');
        if (shield && typeof bot.equip === 'function') {
          try {
            await bot.equip(shield, 'off-hand');
          } catch (e) {}
        }
      }

      // 3. Auto Armor Equip
      if (bot.armorManager && typeof bot.armorManager.equipAll === 'function') {
        await bot.armorManager.equipAll();
      } else {
        await this.autoEquipArmor(bot);
      }
    } catch (err) {
      logger.debug(`Equip gear error: ${err.message}`);
    }
  }

  /**
   * Auto-equip best available armor pieces from inventory
   */
  async autoEquipArmor(bot) {
    if (!bot || !bot.inventory || typeof bot.equip !== 'function') return;
    const ARMOR_PRIORITY = {
      head: ['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'golden_helmet', 'chainmail_helmet', 'leather_helmet'],
      torso: ['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'golden_chestplate', 'chainmail_chestplate', 'leather_chestplate'],
      legs: ['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'golden_leggings', 'chainmail_leggings', 'leather_leggings'],
      feet: ['netherite_boots', 'diamond_boots', 'iron_boots', 'golden_boots', 'chainmail_boots', 'leather_boots'],
    };

    const slots = { head: 5, torso: 6, legs: 7, feet: 8 };
    const items = bot.inventory.items ? bot.inventory.items() : [];

    for (const [dest, priorityList] of Object.entries(ARMOR_PRIORITY)) {
      const currentPiece = bot.inventory.slots?.[slots[dest]];
      const currentRank = currentPiece ? priorityList.indexOf(currentPiece.name) : Infinity;

      let bestPiece = null;
      let bestRank = currentRank === -1 ? Infinity : currentRank;

      for (const item of items) {
        const rank = priorityList.indexOf(item.name);
        if (rank !== -1 && rank < bestRank) {
          bestRank = rank;
          bestPiece = item;
        }
      }

      if (bestPiece && (!currentPiece || bestRank < currentRank)) {
        try {
          await bot.equip(bestPiece, dest);
        } catch (_) {}
      }
    }
  }

  /**
   * Shoot bow or crossbow with realistic human aim jitter
   */
  async shootBow(bot, target) {
    if (!bot || !target || !target.position) return false;
    const items = bot.inventory?.items?.() || [];
    const bow = items.find(i => i.name === 'bow' || i.name === 'crossbow');
    if (!bow) return false;

    try {
      if (bot.heldItem?.name !== bow.name && typeof bot.equip === 'function') {
        await bot.equip(bow, 'hand');
      }

      // Check combat error system for bow aim with natural tremor
      let jitterYaw = HumanErrorEngine.jitter(0.03, bot);
      let jitterPitch = HumanErrorEngine.jitter(0.02, bot);

      if (this.errorSystem) {
        const combatErrors = this.errorSystem.checkCombatErrors('attack', {
          health: bot?.health,
          isMoving: bot?.entity?.velocity?.length() > 0,
        });
        if (combatErrors.missed) {
          jitterYaw += HumanErrorEngine.coinFlip() * 0.18;
          jitterPitch += HumanErrorEngine.coinFlip() * 0.12;
        }
      }

      const aimTarget = target.position.offset(0, target.height ? target.height * 0.6 : 1.2, 0);
      if (typeof bot.lookAt === 'function') {
        await bot.lookAt(aimTarget, true);
      }

      if (bot.entity && typeof bot.look === 'function') {
        await bot.look(bot.entity.yaw + jitterYaw, bot.entity.pitch + jitterPitch, true);
      }

      if (typeof bot.activateItem === 'function') {
        bot.activateItem();
        await new Promise(r => setTimeout(r, 1100));
        if (typeof bot.deactivateItem === 'function') {
          bot.deactivateItem();
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Execute intelligent real-time micro-combat tick against target
   */
  async executeCombatTick(bot, target) {
    if (!bot || !bot.entity || !target || !target.position || !target.isValid) {
      this.stopCombat(bot);
      return false;
    }

    const dist = bot.entity.position.distanceTo(target.position);
    const mobName = target.name || target.type || 'hostile';
    const strategy = this.getStrategyForMob(mobName);
    const now = Date.now();

    this.inCombat = true;

    // Face target with natural slight jitter
    try {
      const aimOffset = target.height ? target.height * 0.75 : 1.5;
      await bot.lookAt(target.position.offset(0, aimOffset, 0), true);
      if (HumanErrorEngine.chance(0.25, bot) && bot.entity && typeof bot.look === 'function') {
        const jitterYaw = HumanErrorEngine.jitter(0.02, bot);
        const jitterPitch = HumanErrorEngine.jitter(0.015, bot);
        bot.look(bot.entity.yaw + jitterYaw, bot.entity.pitch + jitterPitch, true).catch(() => {});
      }
    } catch (e) {}

    // Auto-equip best weapon and shield
    await this.equipBestGear(bot);

    switch (strategy) {
      case CombatStrategy.RANGED_INTERCEPT: {
        // SKELETON COMBAT:
        // Strafe zigzag and sprint to close distance fast
        if (now - this.lastStrafeSwitch > 600) {
          this.lastStrafeSwitch = now;
          this.strafeDirection = this.strafeDirection === 'left' ? 'right' : 'left';
        }

        if (dist > 3.2) {
          // Sprint + strafe towards skeleton
          bot.setControlState('forward', true);
          bot.setControlState('sprint', true);
          bot.setControlState(this.strafeDirection, true);
          bot.setControlState(this.strafeDirection === 'left' ? 'right' : 'left', false);

          // Raise shield if arrows flying at medium distance
          const hasShield = bot.inventory?.slots?.[45]?.name === 'shield' ||
            bot.inventory?.items()?.some((i) => i.name === 'shield');

          if (dist > 4.5 && dist < 14 && hasShield) {
            if (!this.isBlocking) {
              // ✅ ПРОВЕРКА ОШИБОК - щит может не спасти
              let shieldOk = true;
              if (this.errorSystem) {
                const shieldErrors = this.errorSystem.checkCombatErrors('block', {
                  health: bot?.health,
                });

                if (shieldErrors.shieldFailed) {
                  logger.debug(`[${this.agentName}] Щит не спас!`);
                  bot.deactivateItem?.();
                  this.isBlocking = false;
                  shieldOk = false;
                }
              }

              if (shieldOk && typeof bot.activateItem === 'function') {
                bot.activateItem(true); // Right-click shield
                this.isBlocking = true;
              }
            }
          } else if (this.isBlocking && typeof bot.deactivateItem === 'function') {
            bot.deactivateItem();
            this.isBlocking = false;
          }
        } else {
          // Melee reach: stop blocking, perform jump critical hit
          if (this.isBlocking && typeof bot.deactivateItem === 'function') {
            bot.deactivateItem();
            this.isBlocking = false;
          }
          bot.setControlState('left', false);
          bot.setControlState('right', false);

          if (now - this.lastAttackTime > 550) {
            this.lastAttackTime = now;

            // ✅ ПРОВЕРКА ОШИБОК - может ли промахнуться?
            if (this.errorSystem) {
              const combatErrors = this.errorSystem.checkCombatErrors('attack', {
                health: bot?.health,
                isMoving: bot?.entity?.velocity?.length() > 0,
              });

              if (combatErrors.missed) {
                logger.debug(`[${this.agentName}] Промахнулся при атаке на ${target.name}!`);
                if (bot.entity && typeof bot.look === 'function') {
                  bot.look(bot.entity.yaw + 0.12, bot.entity.pitch, true).catch(() => {});
                }
                if (bot.pvp && typeof bot.pvp.attack === 'function') {
                  try { await bot.pvp.attack(target); } catch (e) {}
                }
                return true;
              }

              if (combatErrors.crit) {
                logger.debug(`[${this.agentName}] Критический промах!`);
                return true;
              }
            }

            // Человеческая тактика компромиссов (W-Tap, криты в падении)
            const isSprinting = Boolean(bot.getControlState?.('sprint'));
            const tactic = HumanTradeoffs.evaluateCombatTactic({
              target,
              hasObstacleBehind: false,
              shieldDisabled: Boolean(this.shieldDisabledUntil && Date.now() < this.shieldDisabledUntil),
              health: bot?.health ?? 20,
              isSprinting,
            });

            // W-Tap: микро-сброс спринта на 60 мс для нанесения максимального отброса
            if (tactic.wTap) {
              bot.setControlState?.('forward', false);
              setTimeout(() => bot.setControlState?.('forward', true), 60);
            }

            // Прыжковый крит: строго при наличии воздуха над головой и фазе падения
            const headBlock = bot.blockAt ? bot.blockAt(bot.entity.position.offset(0, 2, 0)) : null;
            const ceilingClear = !headBlock || headBlock.name === 'air';

            if (tactic.jumpCrit && ceilingClear && bot.entity.onGround) {
              bot.setControlState('jump', true);
              // Удар наносится в фазе падения (150 мс после прыжка)
              setTimeout(() => {
                bot.setControlState?.('jump', false);
                if (bot.pvp && typeof bot.pvp.attack === 'function') bot.pvp.attack(target);
                else if (typeof bot.attack === 'function') bot.attack(target);
              }, 150);
              return true;
            }

            // Обычный удар с земли
            if (bot.pvp && typeof bot.pvp.attack === 'function') {
              bot.pvp.attack(target);
            } else if (typeof bot.attack === 'function') {
              bot.attack(target);
            }
          }
        }
        break;
      }

      case CombatStrategy.KITE_HIT: {
        // CREEPER COMBAT:
        // Hit and backpedal 4 meters to avoid detonation, raise shield if too close
        const hasShield = bot.inventory?.slots?.[45]?.name === 'shield' ||
          bot.inventory?.items()?.some((i) => i.name === 'shield');

        if (dist > 2.8) {
          if (this.isBlocking && typeof bot.deactivateItem === 'function') {
            bot.deactivateItem();
            this.isBlocking = false;
          }
          bot.setControlState('forward', true);
          bot.setControlState('back', false);
          bot.setControlState('sprint', true);

          if (dist <= 3.5 && now - this.lastAttackTime > 500) {
            this.lastAttackTime = now;
            if (bot.pvp && typeof bot.pvp.attack === 'function') bot.pvp.attack(target);
            else if (typeof bot.attack === 'function') bot.attack(target);
          }
        } else {
          // Just hit, immediately backpedal!
          bot.setControlState('forward', false);
          bot.setControlState('back', true);
          bot.setControlState('sprint', true);

          // Raise shield against impending explosion if creeper is close and keep it raised
          if (hasShield && dist <= 3.2) {
            if (!this.isBlocking && typeof bot.activateItem === 'function') {
              let shieldOk = true;
              if (this.errorSystem) {
                const shieldErrors = this.errorSystem.checkCombatErrors('block', { health: bot?.health });
                if (shieldErrors.shieldFailed) shieldOk = false;
              }
              if (shieldOk) {
                bot.activateItem(true);
                this.isBlocking = true;
              }
            }
            return true;
          }

          if (now - this.lastAttackTime > 500) {
            this.lastAttackTime = now;

            // ✅ ПРОВЕРКА ОШИБОК - промах на крипере
            if (this.errorSystem) {
              const combatErrors = this.errorSystem.checkCombatErrors('attack', {
                health: bot?.health,
              });

              if (combatErrors.missed) {
                logger.debug(`[${this.agentName}] Промахнулся на крипере!`);
                if (bot.entity && typeof bot.look === 'function') {
                  bot.look(bot.entity.yaw + 0.1, bot.entity.pitch, true).catch(() => {});
                }
                return true;
              }
            }

            if (this.isBlocking && typeof bot.deactivateItem === 'function') {
              bot.deactivateItem();
              this.isBlocking = false;
            }
            if (bot.pvp && typeof bot.pvp.attack === 'function') bot.pvp.attack(target);
            else if (typeof bot.attack === 'function') bot.attack(target);
          }
        }
        break;
      }

      case CombatStrategy.MELEE_CIRCLE:
      case CombatStrategy.RUSH_BURST:
      default: {
        const hasShield = bot.inventory?.slots?.[45]?.name === 'shield' ||
          bot.inventory?.items()?.some((i) => i.name === 'shield');

        // Standard aggressive jump-crit melee with shield parry
        if (dist > 2.8) {
          if (this.isBlocking && typeof bot.deactivateItem === 'function') {
            bot.deactivateItem();
            this.isBlocking = false;
          }
          bot.setControlState('forward', true);
          bot.setControlState('sprint', true);
        } else {
          bot.setControlState('forward', false);

          // Shield parry right after striking while cooldown is recharging
          if (hasShield && now - this.lastAttackTime < 380 && dist <= 2.5 && !this.isBlocking) {
            let shieldOk = true;
            if (this.errorSystem) {
              const shieldErrors = this.errorSystem.checkCombatErrors('block', { health: bot?.health });
              if (shieldErrors.shieldFailed) shieldOk = false;
            }
            if (shieldOk && typeof bot.activateItem === 'function') {
              bot.activateItem(true);
              this.isBlocking = true;
            }
          } else if (this.isBlocking && now - this.lastAttackTime >= 450 && typeof bot.deactivateItem === 'function') {
            bot.deactivateItem();
            this.isBlocking = false;
          }

          if (now - this.lastAttackTime > 550) {
            this.lastAttackTime = now;
            if (this.isBlocking && typeof bot.deactivateItem === 'function') {
              bot.deactivateItem();
              this.isBlocking = false;
            }

            // ✅ ПРОВЕРКА ОШИБОК - промах в ближнем бою
            if (this.errorSystem) {
              const combatErrors = this.errorSystem.checkCombatErrors('attack', {
                health: bot?.health,
              });

              if (combatErrors.missed) {
                logger.debug(`[${this.agentName}] Промахнулся в ближнем бою!`);
                if (bot.entity && typeof bot.look === 'function') {
                  bot.look(bot.entity.yaw + (HumanErrorEngine.coinFlip() * 0.12), bot.entity.pitch, true).catch(() => {});
                }
                return true;
              }
            }

            if (bot.entity.onGround) {
              bot.setControlState('jump', true);
              setTimeout(() => bot.setControlState?.('jump', false), 200);
            }
            if (bot.pvp && typeof bot.pvp.attack === 'function') bot.pvp.attack(target);
            else if (typeof bot.attack === 'function') bot.attack(target);
          }
        }
        break;
      }
    }

    return true;
  }

  /**
   * Stop active combat state and release controls
   */
  stopCombat(bot) {
    this.inCombat = false;
    this.targetEntity = null;
    if (this.isBlocking && bot?.deactivateItem) {
      bot.deactivateItem();
      this.isBlocking = false;
    }
    if (bot?.clearControlStates) {
      bot.clearControlStates();
    }
    if (bot?.pvp?.stop) {
      bot.pvp.stop();
    }
  }

  /**
   * Find nearest hostile mob within radius
   */
  findHostileTarget(bot, radius = 14) {
    if (!bot || !bot.entities || !bot.entity) return null;

    let nearest = null;
    let minDist = radius;

    for (const id in bot.entities) {
      const ent = bot.entities[id];
      if (!ent || !ent.position || ent === bot.entity) continue;

      const name = (ent.name || ent.type || '').toLowerCase();
      const isHostile = Object.keys(ThreatRank).some((k) => name.includes(k.toLowerCase()));

      if (isHostile) {
        const dist = bot.entity.position.distanceTo(ent.position);
        if (dist < minDist) {
          minDist = dist;
          nearest = ent;
        }
      }
    }

    return nearest;
  }

  /**
   * Verify if a 3-block pillar location is safe from Golem ledge climbing.
   */
  verifyPillarSafety(pillarPos, worldState) {
    const nearbyBlocks = worldState?.nearbyBlocks || [];
    for (const b of nearbyBlocks) {
      if (b.y >= pillarPos.y + 1 && Math.hypot(b.x - pillarPos.x, b.z - pillarPos.z) <= 2) {
        return { isSafe: false, reason: 'Nearby ledge exists, build 4 blocks high' };
      }
    }
    return { isSafe: true, recommendedHeight: 3 };
  }
}

export const combatAI = new TacticalCombatAI();
