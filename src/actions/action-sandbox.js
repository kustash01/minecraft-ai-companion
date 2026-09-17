import minecraftData from 'minecraft-data';
import vec3 from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';
import { HumanMotor } from '../behavior/human-motor.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';
import { sceneObserver } from '../perception/scene-observer.js';
import { ProGamerTricks } from '../behavior/pro-gamer-tricks.js';
import { BuddyDynamics } from '../behavior/buddy-dynamics.js';
import { HumanChatFlow } from '../behavior/human-chat-flow.js';
import { landmarkTopology } from '../world/landmark-topology.js';
import { thoughtStream } from '../cognition/thought-stream.js';
import { AdrenalineController } from '../behavior/adrenaline-controller.js';
import { AuditoryEngine } from '../behavior/auditory-engine.js';
import { HotbarErgonomics } from '../behavior/hotbar-ergonomics.js';
import { CombatMicroEngine } from '../behavior/combat-micro-engine.js';

const { goals } = pathfinderPkg;
const logger = createLogger('ACTION_SANDBOX');

/**
 * ActionSandbox — песочница исполнения асинхронного JavaScript-кода для Gemini.
 * Предоставляет высокоуровневые человечные методы вокруг Mineflayer:
 * навигация с таймаутами, плавный взгляд, поиск блоков и станций,
 * управление инвентарем, крафт и доступ к библиотеке навыков.
 */
export class ActionSandbox {
  constructor({ bot, worldState = null, skillLibrary = null, memoryManager = null, config = {} } = {}) {
    this.bot = bot;
    this.worldState = worldState;
    this.skillLibrary = skillLibrary;
    this.memoryManager = memoryManager;
    this.config = config;
    this.defaultTimeoutMs = config?.actionTimeoutMs ?? 30000;
    this.activeAbortController = null;
  }

  setBot(bot) {
    this.bot = bot;
  }

  setSkillLibrary(skillLibrary) {
    this.skillLibrary = skillLibrary;
  }

  setMemoryManager(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Экстренная отмена выполняющегося скрипта спинными рефлексами
   */
  abortRunning(reason = 'Экстренное прерывание рефлекторным слоем') {
    if (this.activeAbortController) {
      logger.warn(`[ACTION_SANDBOX] Прерывание активного скрипта: ${reason}`);
      this.activeAbortController.abort(new Error(reason));
      this.activeAbortController = null;
      if (this.bot?.pathfinder) {
        try {
          this.bot.pathfinder.stop();
          this.bot.pathfinder.setGoal(null);
        } catch (_) {}
      }
      if (this.bot?.clearControlStates) {
        try {
          this.bot.clearControlStates();
        } catch (_) {}
      }
      return true;
    }
    return false;
  }

  /**
   * Сборка контекстных хелперов для песочницы
   */
  _buildContext({ logs = [], signal = null } = {}) {
    const bot = this.bot;
    const mcData = bot?.version ? minecraftData(bot.version) : minecraftData('1.20.4');

    const log = (...args) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      logs.push(msg);
      logger.info(`[SCRIPT LOG] ${msg}`);
    };

    const sleep = (ms) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, Math.max(0, ms));
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error(signal.reason?.message || 'Действие отменено'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    sleep.gamerPause = (min = 200, max = 500) => sleep(HumanErrorEngine.evaluateGamerPause(min, max, bot));

    sleep.ticks = (n = 1) => new Promise((resolve, reject) => {
      let count = 0;
      const target = Math.max(1, n);
      const onTick = () => {
        count++;
        if (count >= target) {
          cleanup();
          resolve();
        }
      };
      const fallback = setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(40, target * 50 + 20));

      const cleanup = () => {
        clearTimeout(fallback);
        if (bot?.removeListener) bot.removeListener('physicsTick', onTick);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new Error(signal?.reason?.message || 'Действие отменено'));
      };

      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      if (bot?.on) {
        bot.on('physicsTick', onTick);
      }
    });

    // Навигация
    const goto = async (x, y, z, range = 1) => {
      if (!bot || !bot.pathfinder) throw new Error('Pathfinder не инициализирован');
      const targetPos = (typeof x === 'object' && x !== null) ? x : { x, y, z };
      const gx = Math.floor(targetPos.x);
      const gy = Math.floor(targetPos.y);
      const gz = Math.floor(targetPos.z);

      const goal = new goals.GoalNear(gx, gy, gz, Math.max(1, range));
      bot.pathfinder.setGoal(goal);

      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        if (signal?.aborted) {
          bot.pathfinder.stop();
          throw new Error('Перемещение отменено');
        }
        if (bot.entity?.position && bot.entity.position.distanceTo(vec3(gx, gy, gz)) <= range + 0.5) {
          bot.pathfinder.setGoal(null);
          return true;
        }
        await sleep(250);
      }
      bot.pathfinder.setGoal(null);
      throw new Error(`Таймаут перехода к [${gx}, ${gy}, ${gz}]`);
    };

    // Хелперы мира
    const world = {
      findBlock: (nameOrId, maxDistance = 32) => {
        if (!bot || typeof bot.findBlock !== 'function') return null;
        let matcher;
        if (typeof nameOrId === 'number') {
          matcher = nameOrId;
        } else {
          const b = mcData.blocksByName[nameOrId];
          if (!b) return null;
          matcher = b.id;
        }
        return bot.findBlock({ matching: matcher, maxDistance });
      },

      findBlocks: (nameOrId, count = 5, maxDistance = 32) => {
        if (!bot || typeof bot.findBlocks !== 'function') return [];
        let matcher;
        if (typeof nameOrId === 'number') {
          matcher = nameOrId;
        } else {
          const b = mcData.blocksByName[nameOrId];
          if (!b) return [];
          matcher = b.id;
        }
        const positions = bot.findBlocks({ matching: matcher, maxDistance, count });
        return positions.map(p => bot.blockAt(p)).filter(Boolean);
      },

      findEntity: (nameOrType, maxDistance = 32) => {
        if (!bot || !bot.entities) return null;
        const want = String(nameOrType).toLowerCase();
        let best = null;
        let bestDist = maxDistance;

        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity || e.isValid === false) continue;
          const n = (e.name || '').toLowerCase();
          const u = (e.username || '').toLowerCase();
          if (n === want || u === want || n.includes(want)) {
            const dist = bot.entity.position.distanceTo(e.position);
            if (dist < bestDist) {
              bestDist = dist;
              best = e;
            }
          }
        }
        return best;
      },

      findNearestStation: (stationName, maxDistance = 32) => {
        return world.findBlock(stationName, maxDistance);
      },

      openContainer: async (blockOrPos) => {
        let block;
        if (blockOrPos && typeof blockOrPos.name === 'string') {
          block = blockOrPos;
        } else if (blockOrPos && typeof blockOrPos.x === 'number') {
          block = world.getBlock(blockOrPos);
        } else {
          block = world.findNearestStation('chest', 16) || world.findNearestStation('barrel', 16);
        }
        if (!block) throw new Error('Блок контейнера (сундук/бочка) не найден');
        await goto(block.position, 2.5);

        // Человеческая задержка визуального сканирования содержимого
        const scan = HumanErrorEngine.evaluateChestSearchDelay(12, bot);
        await sleep(scan.delayMs);

        return bot.openContainer(block);
      },

      getBlock: (x, y, z) => {
        if (!bot || typeof bot.blockAt !== 'function') return null;
        const p = (typeof x === 'object' && x !== null) ? x : { x, y, z };
        return bot.blockAt(vec3(p.x, p.y, p.z));
      },

      gravelTorchBreak: (targetBlock) => ProGamerTricks.gravelTorchBreak(bot, targetBlock),
      excavateOreVein: (startBlock, opts) => ProGamerTricks.excavateOreVein(bot, startBlock, opts),
      placeRightWallTorch: () => ProGamerTricks.placeRightWallTorch(bot),
      waterAirPocket: () => ProGamerTricks.waterAirPocket(bot),
      peekThroughWall: (wallBlock) => ProGamerTricks.peekThroughWall(bot, wallBlock),
      checkSafeBedUse: () => ProGamerTricks.checkSafeBedUse(bot),

      safeDig: async (block) => {
        if (!block) throw new Error('Блок для копания не указан');
        if (!bot || typeof bot.dig !== 'function') throw new Error('Функция bot.dig недоступна');

        // Человеческая микро-заминка перед копанием (прицеливание инструментом)
        const hesitationMs = HumanErrorEngine.evaluateDiggingHesitation(bot, block);
        if (hesitationMs > 0) {
          await sleep(hesitationMs);
        }

        // Проверка: не копаем прямо под собой (правило #1 игрока)
        const myPos = bot.entity?.position;
        const bPos = block.position?.offset ? block.position : (block.position ? vec3(block.position.x, block.position.y, block.position.z) : null);
        if (myPos && bPos) {
          const isUnderFeet = Math.floor(myPos.x) === bPos.x &&
                              Math.floor(myPos.z) === bPos.z &&
                              (Math.floor(myPos.y) - 1 === bPos.y || Math.floor(myPos.y) === bPos.y);
          if (isUnderFeet) {
            log('Осторожно: блок прямо под ногами, смещаюсь на соседний блок перед копанием');
            const offsets = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
            for (const off of offsets) {
              const stepBlock = bot.blockAt(myPos.offset(off.x, -1, off.z));
              const aboveStep = bot.blockAt(myPos.offset(off.x, 0, off.z));
              if (stepBlock && stepBlock.name !== 'air' && stepBlock.name !== 'lava' && (!aboveStep || aboveStep.name === 'air')) {
                try { await goto(stepBlock.position.offset(0.5, 1, 0.5), 0.5); } catch (_) {}
                break;
              }
            }
          }
        }

        // Проверка гравитации: песок/гравий/лава над блоком
        if (bPos) {
          const above = bot.blockAt ? bot.blockAt(bPos.offset(0, 1, 0)) : null;
          if (above && ['sand', 'gravel', 'concrete_powder', 'lava'].includes(above.name)) {
            if (above.name !== 'lava') {
              const torch = bot.inventory?.items?.()?.find(i => i.name === 'torch');
              if (torch) {
                log(`[ПРО-ТРЮК] Над блоком ${above.name}, применяю разрушение факелом`);
                const used = await ProGamerTricks.gravelTorchBreak(bot, block);
                if (used) return true;
              }
            }
            log(`Внимание: над блоком находится ${above.name}, копаем с безопасной дистанции`);
            if (myPos && myPos.distanceTo(bPos) < 2.5) {
              const backVec = myPos.minus(bPos).normalize().scaled(2.8);
              try { await goto(bPos.plus(backVec), 1.5); } catch (_) {}
            }
          }
        }

        // Авто-экипировка лучшего инструмента
        if (typeof bot.equip === 'function' && bot.inventory) {
          try {
            const bName = block.name || '';
            const bestTool = (bot.inventory.items() || []).find(item => {
              if (bName.includes('stone') || bName.includes('ore') || bName.includes('deepslate') || bName.includes('cobble')) {
                return item.name.includes('pickaxe');
              }
              if (bName.includes('log') || bName.includes('wood') || bName.includes('planks')) {
                return item.name.includes('axe');
              }
              if (bName.includes('dirt') || bName.includes('sand') || bName.includes('gravel') || bName.includes('clay')) {
                return item.name.includes('shovel');
              }
              return false;
            });
            if (bestTool) await bot.equip(bestTool, 'hand');
          } catch (_) {}
        }

        await bot.dig(block);
        return true;
      },
    };

    // Хелперы инвентаря
    const inventory = {
      find: (name) => {
        return (bot?.inventory?.items() || []).find(i => i.name === name || i.name.includes(name));
      },

      findAll: (name) => {
        return (bot?.inventory?.items() || []).filter(i => i.name === name || i.name.includes(name));
      },

      count: (name) => {
        return (bot?.inventory?.items() || [])
          .filter(i => i.name === name || i.name.includes(name))
          .reduce((acc, i) => acc + i.count, 0);
      },

      has: (name, count = 1) => {
        return inventory.count(name) >= count;
      },

      getFreeSlots: () => {
        if (!bot?.inventory?.slots) return 0;
        let free = 0;
        for (let s = 9; s <= 44; s++) {
          if (!bot.inventory.slots[s]) free++;
        }
        return free;
      },

      equip: async (itemName, destination = 'hand') => {
        const item = inventory.find(itemName);
        if (!item) throw new Error(`Нет предмета ${itemName} в инвентаре`);
        await bot.equip(item, destination);
        return true;
      },

      equipOffhand: async (itemName) => {
        return inventory.equip(itemName, 'off-hand');
      },

      organizeHotbar: async () => {
        return HumanMotor.organizeHotbar(bot);
      },

      tossTo: async (playerName, itemName, count = 1) => {
        const playerEntity = world.findEntity(playerName);
        const item = inventory.find(itemName);
        if (!item) throw new Error(`Нет предмета ${itemName} в инвентаре для передачи`);

        if (playerEntity?.position) {
          await HumanMotor.smoothLook(bot, playerEntity.position.offset(0, playerEntity.height || 1.6, 0), 4);
          if (typeof bot.look === 'function' && bot.entity) {
            await bot.look(bot.entity.yaw, (bot.entity.pitch || 0) + 0.2, true);
          }
        }

        await inventory.equip(item.name, 'hand');
        if (typeof bot.toss === 'function') {
          await bot.toss(item.type, null, count);
        }

        // Дружеский одиночный шифт-тап в знак уважения
        if (humanBot && typeof humanBot.crouchSpam === 'function') {
          await humanBot.crouchSpam(1);
        }
        return true;
      },
    };

    // Хелперы крафта
    const crafting = {
      canCraft: (itemName, count = 1) => {
        const itemType = mcData.itemsByName[itemName];
        if (!itemType) return false;
        const table = world.findBlock('crafting_table', 4);
        const recipes = bot.recipesFor(itemType.id, null, count, table);
        return recipes && recipes.length > 0;
      },

      craft: async (itemName, count = 1) => {
        const itemType = mcData.itemsByName[itemName];
        if (!itemType) throw new Error(`Неизвестный предмет: ${itemName}`);
        let table = world.findBlock('crafting_table', 4);
        let recipes = bot.recipesFor(itemType.id, null, count, table);

        if ((!recipes || recipes.length === 0) && !table) {
          // Ищем верстак чуть дальше
          table = world.findBlock('crafting_table', 16);
          if (table) {
            await goto(table.position, 2);
            recipes = bot.recipesFor(itemType.id, null, count, table);
          }
        }

        // Если верстака рядом нет, но есть в инвентаре — ставим временно
        let placedTable = false;
        let tablePos = null;
        if ((!recipes || recipes.length === 0) && !table) {
          const tableItem = inventory.find('crafting_table');
          if (tableItem && typeof bot.placeBlock === 'function' && bot.entity?.position) {
            const placeBase = bot.blockAt(bot.entity.position.offset(1, -1, 0)) || bot.blockAt(bot.entity.position.offset(0, -1, 1));
            if (placeBase && placeBase.name !== 'air') {
              try {
                await bot.equip(tableItem, 'hand');
                await bot.placeBlock(placeBase, vec3(0, 1, 0));
                tablePos = placeBase.position.offset(0, 1, 0);
                table = bot.blockAt(tablePos);
                placedTable = true;
                recipes = bot.recipesFor(itemType.id, null, count, table);
              } catch (_) {}
            }
          }
        }

        if (!recipes || recipes.length === 0) {
          if (placedTable && tablePos) {
            try { await bot.dig(bot.blockAt(tablePos)); } catch (_) {}
          }
          throw new Error(`Не хватает ресурсов или нет верстака для крафта ${itemName}`);
        }

        const recipe = recipes[0];
        const craftHesitation = HumanErrorEngine.evaluateCraftingHesitation(bot, recipe.requiresTable ? 2 : 1);
        if (craftHesitation > 0) await sleep(craftHesitation);
        await bot.craft(recipe, count, recipe.requiresTable ? table : null);

        // Если ставили верстак сами — забираем обратно
        if (placedTable && tablePos) {
          try {
            const placedBlock = bot.blockAt(tablePos);
            if (placedBlock && placedBlock.name === 'crafting_table' && typeof bot.dig === 'function') {
              await bot.dig(placedBlock);
            }
          } catch (_) {}
        }
        return true;
      },
    };

    // Навигация хелпер
    const pathfinder = {
      goto,
      follow: (target, distance = 3) => {
        if (!bot || !bot.pathfinder) return;
        const g = new goals.GoalFollow(target, distance);
        bot.pathfinder.setGoal(g, true);
      },
      stop: () => {
        bot?.pathfinder?.stop();
        bot?.clearControlStates?.();
      },
      goals,
    };

    // Человечные расширения bot
    const humanBot = new Proxy(bot || {}, {
      get(target, prop) {
        if (prop === 'humanLook') {
          return (targetPos, steps = 5) => HumanMotor.smoothLook(target, targetPos, steps);
        }
        if (prop === 'goto') {
          return goto;
        }
        if (prop === 'crouchSpam') {
          return async (times = 2) => {
            for (let i = 0; i < times; i++) {
              if (typeof target.setControlState === 'function') {
                target.setControlState('sneak', true);
                await sleep(140);
                target.setControlState('sneak', false);
                await sleep(120);
              }
            }
          };
        }
        if (prop === 'say') {
          return async (msg) => {
            await HumanChatFlow.typeAndSend(target, String(msg));
          };
        }
        if (prop === 'bridgeSneak') {
          return (length = 3, blockName = null) => ProGamerTricks.bridgeSneak(target, length, blockName);
        }
        if (prop === 'waterDropClimb') {
          return () => ProGamerTricks.waterDropClimb(target);
        }
        if (prop === 'think') {
          return (text) => thoughtStream.emit(text);
        }
        if (prop === 'attackEntity') {
          return async (entityTarget, timeoutMs = 15000) => {
            if (!entityTarget) throw new Error('Цель для атаки не указана');
            if (target.pvp && typeof target.pvp.attack === 'function') {
              try { target.pvp.attack(entityTarget); } catch (_) {}
            }
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              const live = target.entities?.[entityTarget.id];
              if (!live || live.isValid === false) break;
              const dist = target.entity?.position?.distanceTo(live.position);
              const swingCheck = HumanErrorEngine.evaluateAttackReach(target, dist);
              if (swingCheck.shouldSwing && typeof target.attack === 'function') {
                if (typeof target.lookAt === 'function') {
                  await target.lookAt(live.position.offset(0, (live.height || 1) * 0.5, 0), true);
                }
                if (swingCheck.isWhiff) {
                  log(`[МОТОРИКА] Взмах мимо цели (${dist?.toFixed?.(1)}м, ${swingCheck.reason})`);
                  try { if (typeof target.swingArm === 'function') target.swingArm(); } catch (_) {}
                } else {
                  try { target.attack(live); } catch (_) {}
                }
              } else if (dist <= 3.2 && typeof target.attack === 'function') {
                await target.lookAt(live.position.offset(0, (live.height || 1) * 0.5, 0), true);
                try { target.attack(live); } catch (_) {}
              } else if (target.pathfinder) {
                target.pathfinder.setGoal(new goals.GoalFollow(live, 2), true);
              }
              await sleep(350);
            }
            try { target.pvp?.stop?.(); target.pathfinder?.setGoal?.(null); } catch (_) {}
            return true;
          };
        }
        if (prop === 'jump') {
          return async () => {
            if (typeof target.setControlState === 'function') {
              target.setControlState('jump', true);
              await sleep.ticks(2);
              target.setControlState('jump', false);
            }
          };
        }
        if (prop === 'critAttack') {
          return async (entityTarget) => {
            const live = (typeof entityTarget === 'object' && entityTarget?.position) ? entityTarget : world.findEntity(entityTarget);
            if (!live) throw new Error('Цель для крит-атаки не найдена');
            if (typeof target.lookAt === 'function') {
              await target.lookAt(live.position.offset(0, (live.height || 1) * 0.7, 0), true);
            }
            if (typeof target.setControlState === 'function') {
              const critEval = HumanErrorEngine.evaluateCritTiming(target);
              target.setControlState('jump', true);
              await sleep.ticks(2);
              target.setControlState('jump', false);

              if (critEval.isCrit) {
                // Идеальный тайминг: удар в фазе снижения
                const start = Date.now();
                while (Date.now() - start < 800) {
                  if (target.entity?.velocity && target.entity.velocity.y < -0.05) {
                    break;
                  }
                  await sleep.ticks(1);
                }
              } else if (critEval.timingOffsetMs < -45) {
                // Смазанный крит: удар на взлёте из-за спешки/паники
                log(`[МОТОРИКА] Крит смазан (${critEval.reason})`);
                await sleep.ticks(1);
              } else {
                // Смазанный крит: запоздалый клик после приземления
                log(`[МОТОРИКА] Крит смазан (${critEval.reason})`);
                await sleep.ticks(4);
              }
            }
            if (typeof target.attack === 'function') {
              target.attack(live);
            }
          };
        }
        if (prop === 'blockWithShield') {
          return async (durationMs = 1000) => {
            const offhand = target.inventory?.slots?.[45];
            if (!offhand || !offhand.name?.includes('shield')) {
              const shield = target.inventory?.items?.()?.find(i => i.name.includes('shield'));
              if (shield && typeof target.equip === 'function') {
                try { await target.equip(shield, 'off-hand'); } catch (_) {}
              }
            }
            const reaction = HumanErrorEngine.evaluateShieldReaction(target);
            if (reaction.reactionDelayMs > 0) {
              await sleep(Math.min(reaction.reactionDelayMs, Math.max(10, Math.floor(durationMs * 0.3))));
            }
            if (typeof target.activateItem === 'function') {
              target.activateItem(true);
              const actualDuration = reaction.earlyDrop ? Math.max(20, Math.floor(durationMs * 0.4)) : durationMs;
              if (reaction.earlyDrop) {
                log(`[МОТОРИКА] Судорожное опускание щита из-за паники (${reaction.stress.toFixed(2)})`);
              }
              await sleep(actualDuration);
              if (typeof target.deactivateItem === 'function') target.deactivateItem();
            } else {
              await sleep(durationMs);
            }
          };
        }
        if (prop === 'pillarUp') {
          return async (height = 3, blockName = null) => {
            for (let h = 0; h < height; h++) {
              const items = target.inventory?.items?.() || [];
              const blockItem = items.find(i => blockName ? i.name === blockName : (i.name.includes('stone') || i.name.includes('dirt') || i.name.includes('plank') || i.name.includes('cobble')));
              if (!blockItem) throw new Error(`Нет блоков в инвентаре для столба (${blockName || 'камень/земля'})`);
              if (typeof target.equip === 'function') {
                await target.equip(blockItem, 'hand');
              }
              if (typeof target.look === 'function') {
                await target.look(target.entity?.yaw || 0, -Math.PI / 2, true);
              }
              const pillarTiming = HumanErrorEngine.evaluatePillarTiming(target);
              if (pillarTiming.extraDelayTicks > 0) {
                await sleep.ticks(pillarTiming.extraDelayTicks);
              }
              if (typeof target.setControlState === 'function') {
                target.setControlState('jump', true);
                await sleep.ticks(2);
                target.setControlState('jump', false);
              }
              const underPos = target.entity?.position ? target.entity.position.offset(0, -1, 0) : null;
              const b = underPos && typeof target.blockAt === 'function' ? target.blockAt(underPos) : null;
              if (b && typeof target.placeBlock === 'function') {
                try { await target.placeBlock(b, vec3(0, 1, 0)); } catch (_) {}
              }
              await sleep.ticks(2);
            }
          };
        }
        if (prop === 'wTap') {
          return async () => {
            if (typeof target.setControlState === 'function') {
              target.setControlState('forward', false);
              target.setControlState('sprint', false);
              await sleep.ticks(2);
              target.setControlState('forward', true);
              target.setControlState('sprint', true);
            }
          };
        }
        return target[prop];
      }
    });

    const stations = new Proxy({}, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        try {
          const lastScene = sceneObserver.lastObservation;
          if (lastScene?.nearby?.stations) {
            const found = lastScene.nearby.stations.find(s => s.name === prop || s.name.includes(prop));
            if (found) {
              const b = world.findNearestStation(prop, 16);
              if (b) return b;
            }
          }
        } catch (_) {}
        return world.findNearestStation(prop, 24);
      }
    });

    const skills = this.skillLibrary ? this.skillLibrary.getSkills({
      bot: humanBot,
      world,
      inventory,
      crafting,
      pathfinder,
      stations,
      mcData,
      vec3,
      sleep,
      log,
    }) : {};

    const memory = {
      remember: async (text, metadata = {}) => {
        if (!text) return null;
        log(`[ПАМЯТЬ] Запомнил: "${text}"`);
        if (this.memoryManager?.rememberNote) {
          return this.memoryManager.rememberNote(text, metadata.tags, metadata.importance);
        } else if (this.memoryManager?.longTerm?.addNote) {
          return this.memoryManager.longTerm.addNote(text, metadata.tags, metadata.importance);
        }
        return null;
      },
      recall: async (query = '', limit = 5) => {
        if (this.memoryManager?.searchNotes) {
          return this.memoryManager.searchNotes(query, limit);
        } else if (this.memoryManager?.longTerm?.searchNotes) {
          return this.memoryManager.longTerm.searchNotes(query, limit);
        }
        return [];
      },
      getNotes: async (limit = 10) => {
        if (this.memoryManager?.getNotes) {
          return this.memoryManager.getNotes(limit);
        } else if (this.memoryManager?.longTerm?.getRecentNotes) {
          return this.memoryManager.longTerm.getRecentNotes(limit);
        }
        return [];
      },
      forget: async (idOrSubstring) => {
        log(`[ПАМЯТЬ] Забыл: "${idOrSubstring}"`);
        if (this.memoryManager?.forgetNote) {
          return this.memoryManager.forgetNote(idOrSubstring);
        } else if (this.memoryManager?.longTerm?.deleteNote) {
          return this.memoryManager.longTerm.deleteNote(idOrSubstring);
        }
        return null;
      },
    };

    const buddy = {
      shareLoot: (playerName, itemName, count = 1) => BuddyDynamics.shareLoot(bot, playerName, itemName, count),
      emergencyHeal: (playerName = null) => BuddyDynamics.checkEmergencyHeal(bot, playerName),
      syncSleep: (bedBlock = null) => BuddyDynamics.synchronousSleep(bot, bedBlock),
      yieldHallway: (playerName = null) => BuddyDynamics.yieldHallway(bot, playerName),
      celebrateVictory: () => BuddyDynamics.celebrateVictory(bot),
    };

    const landmarks = {
      remember: (name, coords, desc = '', type = 'landmark') => landmarkTopology.remember(name, coords, desc, type),
      get: (name) => landmarkTopology.get(name),
      findNearest: (type = null) => landmarkTopology.findNearest(bot?.entity?.position, type),
      describeRelative: (pos) => landmarkTopology.describeRelative(pos, bot?.entity?.yaw),
      list: () => landmarkTopology.list(),
    };

    const thought = (text) => thoughtStream.emit(text);

    if (bot) {
      if (!bot._adrenalineController) bot._adrenalineController = new AdrenalineController();
      if (!bot._auditoryEngine) bot._auditoryEngine = new AuditoryEngine(bot, bot._adrenalineController);
      if (!bot._hotbarErgonomics) bot._hotbarErgonomics = new HotbarErgonomics(bot, bot._adrenalineController);
      if (!bot._combatMicroEngine) bot._combatMicroEngine = new CombatMicroEngine(bot, bot._adrenalineController);
    }

    const adrenaline = {
      get level() { return bot?._adrenalineController?.adrenaline ?? 0.1; },
      get heartRate() { return Math.round(bot?._adrenalineController?.heartRateBpm ?? 72); },
      get efficiency() { return bot?._adrenalineController?.getYerkesDodsonEfficiency() ?? 0.85; },
      isPanicking: () => bot?._adrenalineController?.isPanicking() ?? false,
      isFlowState: () => bot?._adrenalineController?.isFlowState() ?? true,
      spike: (amount, reason) => bot?._adrenalineController?.spike(amount, reason),
    };

    const sound = {
      hear: (name, pos, vol = 1.0, pitch = 1.0) => bot?._auditoryEngine?.processSound(name, pos, vol, pitch),
      getRecent: (maxAge = 5000) => bot?._auditoryEngine?.getRecentSounds(maxAge) ?? [],
      setFocus: (task, load) => bot?._auditoryEngine?.setTaskFocus(task, load),
    };

    const hotbar = {
      equipSemantic: async (semanticRole) => {
        const slot = bot?._hotbarErgonomics?.semanticSlots?.[semanticRole] ?? 0;
        const result = bot?._hotbarErgonomics?.evaluateSlotSwitch(slot) ?? { slotToEquip: slot, intendedSlot: slot, hadKeySlip: false, realizationDelayMs: 0 };
        if (typeof bot?.setQuickBarSlot === 'function') {
          bot.setQuickBarSlot(result.slotToEquip);
          if (result.hadKeySlip) {
            log(`[ХОТБАР] Осечка клавиши (выбран слот ${result.slotToEquip + 1} вместо ${result.intendedSlot + 1})`);
            await sleep(result.realizationDelayMs);
            bot.setQuickBarSlot(result.intendedSlot);
          }
        }
        return result;
      },
      checkDurability: (item) => bot?._hotbarErgonomics?.evaluateDurabilitySafety(item),
    };

    const combat = {
      jumpCrit: async (targetEntity) => {
        const live = (typeof targetEntity === 'object' && targetEntity?.position) ? targetEntity : world.findEntity(targetEntity);
        if (!live) throw new Error('Цель для крит-атаки не найдена');
        if (typeof bot?.lookAt === 'function') {
          await bot.lookAt(live.position.offset(0, (live.height || 1) * 0.7, 0), true);
        }
        const evalRes = bot?._combatMicroEngine?.evaluateJumpCritStrike() ?? { isCrit: true, canStrike: true, timingOffsetMs: 0 };
        if (typeof bot?.setControlState === 'function') {
          bot.setControlState('jump', true);
          await sleep.ticks(2);
          bot.setControlState('jump', false);
          if (evalRes.isCrit) {
            const start = Date.now();
            while (Date.now() - start < 800) {
              if (bot.entity?.velocity && bot.entity.velocity.y < -0.05) break;
              await sleep.ticks(1);
            }
          } else {
            await sleep.ticks(evalRes.timingOffsetMs < -45 ? 1 : 4);
          }
        }
        if (typeof bot?.attack === 'function') {
          bot.attack(live);
          bot._combatMicroEngine?.recordAttack();
        }
        return evalRes;
      },
      wTap: async () => {
        const evalRes = bot?._combatMicroEngine?.evaluateWTapReset() ?? { releaseDurationMs: 50, successfulReset: true };
        if (typeof bot?.setControlState === 'function') {
          bot.setControlState('forward', false);
          await sleep(evalRes.releaseDurationMs);
          bot.setControlState('forward', true);
        }
        return evalRes;
      },
      circleStrafe: (targetEntity) => bot?._combatMicroEngine?.getCircleStrafeMove(targetEntity),
      checkAxeStun: (targetEntity) => bot?._combatMicroEngine?.checkAxeShieldStun(targetEntity),
    };

    return {
      bot: humanBot,
      world,
      inventory,
      crafting,
      pathfinder,
      stations,
      skills,
      memory,
      buddy,
      landmarks,
      thought,
      adrenaline,
      sound,
      hotbar,
      combat,
      mcData,
      vec3,
      sleep,
      log,
      console: {
        log,
        warn: log,
        error: log,
        info: log,
      },
    };
  }

  _captureStateSnapshot() {
    const bot = this.bot;
    if (!bot) return null;
    const pos = bot.entity?.position ? {
      x: Math.round(bot.entity.position.x),
      y: Math.round(bot.entity.position.y),
      z: Math.round(bot.entity.position.z)
    } : null;
    const health = typeof bot.health === 'number' ? Math.round(bot.health) : 20;
    const food = typeof bot.food === 'number' ? Math.round(bot.food) : 20;
    const items = {};
    try {
      if (typeof bot.inventory?.items === 'function') {
        for (const item of bot.inventory.items()) {
          items[item.name] = (items[item.name] || 0) + item.count;
        }
      }
    } catch (_) {}
    return { pos, health, food, items };
  }

  _formatStateDiff(pre, post) {
    if (!pre || !post) return '';
    const changes = [];

    if (pre.pos && post.pos && (pre.pos.x !== post.pos.x || pre.pos.y !== post.pos.y || pre.pos.z !== post.pos.z)) {
      changes.push(`переместился [${pre.pos.x}, ${pre.pos.y}, ${pre.pos.z}] -> [${post.pos.x}, ${post.pos.y}, ${post.pos.z}]`);
    }

    if (pre.health !== post.health) {
      const delta = post.health - pre.health;
      changes.push(`здоровье ${post.health}/20 (${delta > 0 ? '+' : ''}${delta})`);
    }

    if (pre.food !== post.food) {
      const delta = post.food - pre.food;
      changes.push(`еда ${post.food}/20 (${delta > 0 ? '+' : ''}${delta})`);
    }

    const invChanges = [];
    const allItemNames = new Set([...Object.keys(pre.items || {}), ...Object.keys(post.items || {})]);
    for (const name of allItemNames) {
      const before = pre.items?.[name] || 0;
      const after = post.items?.[name] || 0;
      const diff = after - before;
      if (diff > 0) invChanges.push(`+${diff} ${name}`);
      else if (diff < 0) invChanges.push(`${diff} ${name}`);
    }
    if (invChanges.length > 0) {
      changes.push(`инвентарь: ${invChanges.slice(0, 6).join(', ')}${invChanges.length > 6 ? ` и ещё ${invChanges.length - 6}` : ''}`);
    }

    if (changes.length === 0) return '';
    return `\n[ИТОГ ДЕЙСТВИЯ]: ${changes.join(' | ')}`;
  }

  _formatErrorDiagnostic(err, code = '') {
    const message = err?.message || 'Неизвестная ошибка выполнения';
    let line = null;
    let snippet = '';
    let hint = '';

    if (err?.stack) {
      const match = err.stack.match(/<anonymous>:(\d+):(\d+)/) || err.stack.match(/eval.*:(\d+):(\d+)/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        const codeLines = code.split('\n');
        const idx = Math.max(0, Math.min(codeLines.length - 1, lineNum - 2));
        line = idx + 1;
        const start = Math.max(0, idx - 1);
        const end = Math.min(codeLines.length, idx + 2);
        snippet = codeLines.slice(start, end).map((l, i) => `${start + i + 1 === line ? '>' : ' '} ${start + i + 1}: ${l}`).join('\n');
      }
    }

    if (/cannot read properties of null/i.test(message) || /cannot read properties of undefined/i.test(message)) {
      hint = 'Объект не найден (findBlock, findEntity или inventory.find вернул null). Сделай проверку "if (!obj) ..." перед обращением к его свойствам.';
    } else if (/is not a function/i.test(message)) {
      if (/bot\.equip/i.test(message)) {
        hint = 'Используй "await inventory.equip(itemName, \'hand\')" вместо вызова raw bot.equip.';
      } else {
        hint = 'Метод не существует. Проверь сигнатуру в TypeScript-декларации промпта.';
      }
    } else if (/recipesFor/i.test(message) || /craft/i.test(message)) {
      hint = 'Не удалось скрафтить. Проверь наличие верстака рядом или ресурсов через crafting.canCraft(name, count).';
    } else if (/timeout/i.test(message) || /таймаут/i.test(message)) {
      hint = 'Превышен таймаут операции. Возможно путь заблокирован или цель находится слишком далеко.';
    } else if (/отменено/i.test(message) || /прерван/i.test(message) || /угроза/i.test(message) || /опасн/i.test(message) || /рефлекс/i.test(message)) {
      hint = 'Скрипт был экстренно остановлен рефлексами выживания (опасность рядом). Оцени текущую обстановку.';
    }

    return { message, line, snippet, hint };
  }

  /**
   * Выполнить асинхронный скрипт
   * @param {string} code — исходный код JavaScript
   * @param {Object} options — { timeoutMs, signal }
   * @returns {Promise<{ success: boolean, result?: any, error?: string, logs: string[] }>}
   */
  async execute(code, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const logs = [];

    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Код скрипта не передан или пуст', logs };
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(options.signal.reason), { once: true });
    }
    const signal = abortController.signal;

    const ctx = this._buildContext({ logs, signal });

    let timeoutTimer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        const err = new Error(`Таймаут выполнения скрипта (${Math.round(timeoutMs / 1000)}с)`);
        err.name = 'TimeoutError';
        reject(err);
      }, timeoutMs);
    });

    const preState = this._captureStateSnapshot();

    try {
      // Оборачиваем код в асинхронную функцию
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        'bot', 'world', 'inventory', 'crafting', 'pathfinder', 'stations', 'skills', 'memory',
        'buddy', 'landmarks', 'thought', 'adrenaline', 'sound', 'hotbar', 'combat',
        'mcData', 'vec3', 'sleep', 'log', 'console',
        code
      );

      const runPromise = fn(
        ctx.bot,
        ctx.world,
        ctx.inventory,
        ctx.crafting,
        ctx.pathfinder,
        ctx.stations,
        ctx.skills,
        ctx.memory,
        ctx.buddy,
        ctx.landmarks,
        ctx.thought,
        ctx.adrenaline,
        ctx.sound,
        ctx.hotbar,
        ctx.combat,
        ctx.mcData,
        ctx.vec3,
        ctx.sleep,
        ctx.log,
        ctx.console
      );

      const result = await Promise.race([runPromise, timeoutPromise]);
      const postState = this._captureStateSnapshot();
      const diff = this._formatStateDiff(preState, postState);

      let finalResult = result !== undefined ? result : 'Скрипт успешно завершён';
      if (diff) {
        finalResult = typeof finalResult === 'string' ? `${finalResult}${diff}` : `${JSON.stringify(finalResult)}${diff}`;
      }

      return {
        success: true,
        result: finalResult,
        logs,
      };
    } catch (err) {
      logger.warn(`Ошибка исполнения скрипта: ${err.message}`);
      const diag = this._formatErrorDiagnostic(err, code);
      return {
        success: false,
        error: diag.message,
        hint: diag.hint || undefined,
        line: diag.line || undefined,
        codeSnippet: diag.snippet || undefined,
        logs,
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }
}
