import pathfinderPkg from 'mineflayer-pathfinder';
import pvpPkg from 'mineflayer-pvp';
import collectBlockPkg from 'mineflayer-collectblock';
import * as autoEatPkg from 'mineflayer-auto-eat';
import armorManagerPkg from 'mineflayer-armor-manager';
import toolPluginPkg from 'mineflayer-tool';
import logger from '../utils/logger.js';

const pathfinder = pathfinderPkg.pathfinder || pathfinderPkg.default?.pathfinder;
const Movements = pathfinderPkg.Movements || pathfinderPkg.default?.Movements;
const pvp = pvpPkg.plugin || pvpPkg.default?.plugin || pvpPkg;
const collectBlock = collectBlockPkg.plugin || collectBlockPkg.default?.plugin || collectBlockPkg;
const autoEat = autoEatPkg.loader || autoEatPkg.plugin || autoEatPkg.default?.loader || autoEatPkg.default;
const armorManager = armorManagerPkg.default || armorManagerPkg;
const toolPlugin = toolPluginPkg.plugin || toolPluginPkg.default?.plugin || toolPluginPkg;
const installedPlugins = new WeakSet();
const configuredPathfinder = new WeakSet();

export function loadPlugins(bot, { enableAutoEat = true } = {}) {
  if (installedPlugins.has(bot)) return { ready: true, failures: [], alreadyLoaded: true };
  logger.info('[BOT] Loading plugins...');
  
  const plugins = [
    { name: 'pathfinder', module: pathfinder },
    { name: 'pvp', module: pvp },
    { name: 'collectBlock', module: collectBlock },
    ...(enableAutoEat ? [{ name: 'autoEat', module: autoEat }] : []),
    { name: 'armorManager', module: armorManager },
    { name: 'tool', module: toolPlugin }
  ];

  const failures = [];
  for (const plugin of plugins) {
    try {
      if (typeof plugin.module !== 'function') {
        throw new TypeError('plugin module is not a function');
      }
      bot.loadPlugin(plugin.module);
      logger.info(`[BOT] Loaded plugin: ${plugin.name}`);
    } catch (err) {
      failures.push({ name: plugin.name, error: err.message });
      logger.error(`[BOT] Failed to load plugin ${plugin.name}:`, err);
    }
  }

  if (!configurePathfinder(bot)) {
    failures.push({ name: 'pathfinderConfiguration', error: 'pathfinder is unavailable or could not be configured' });
  }
  if (failures.length === 0) installedPlugins.add(bot);
  return { ready: failures.length === 0, failures, alreadyLoaded: false };
}

export function configurePathfinder(bot) {
  try {
    if (configuredPathfinder.has(bot)) return true;
    if (!bot.pathfinder) return false;
    const defaultMove = new Movements(bot);
    // Human-like locomotion:
    // - don't tunnel through terrain on a normal walk (looks robotic & wrecks the
    //   world); only dig when there is genuinely no way around.
    // - sprint on open ground and allow parkour jumps so movement looks natural,
    //   not a slow forced shuffle.
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = true;
    if ('allowSprinting' in defaultMove) defaultMove.allowSprinting = true;
    if ('allowParkour' in defaultMove) defaultMove.allowParkour = true;
    bot.pathfinder.setMovements(defaultMove);

    // collectBlock uses its OWN Movements profile and calls setMovements() every
    // time it mines, which would otherwise wipe our sprint/parkour tuning. Give
    // it a matching human-like profile (but let it dig — mining IS its job).
    try {
      if (bot.collectBlock && bot.collectBlock.movements) {
        const cm = bot.collectBlock.movements;
        cm.canDig = true; // mining requires digging
        cm.allow1by1towers = true;
        if ('allowSprinting' in cm) cm.allowSprinting = true;
        if ('allowParkour' in cm) cm.allowParkour = true;
      }
    } catch (_) {}

    configuredPathfinder.add(bot);
    logger.info('[BOT] Configured pathfinder movements');
    return true;
  } catch (err) {
    logger.error('[BOT] Error configuring pathfinder:', err);
    return false;
  }
}
