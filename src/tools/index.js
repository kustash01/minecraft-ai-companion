import { registerMovementTools } from './movement.js';
import { registerWorldTools } from './world.js';
import { registerInventoryTools } from './inventory.js';
import { registerMiningTools } from './mining.js';
import { registerCraftingTools } from './crafting.js';
import { registerCombatTools } from './combat.js';
import { registerInteractionTools } from './interaction.js';
import { registerCommunicationTools } from './communication.js';
import { registerMemoryTools } from './memory.js';
import { registerPlanningTools } from './planning.js';
import { registerFarmingTools } from './farming.js';
import { registerExplorationTools } from './exploration.js';
import { registerSurvivalTools } from './survival.js';
import { registerSmeltTradeTools } from './smelt-trade.js';
import { registerUtilityTools } from './utility.js';
import { registerRidingCombatTools } from './riding-combat.js';
import { registerStationTools } from './station.js';
import { registerBrewingTools } from './brewing.js';
import { registerWorldInteractionTools } from './world-interaction.js';
import { registerCodeActionTools } from './code-action-tools.js';

export function registerAllTools(registry, deps) {
  // Универсальный запуск JS-кода и библиотека навыков (Code-as-Action)
  registerCodeActionTools(registry, deps);

  registerMovementTools(registry, deps);
  registerWorldTools(registry, deps);
  registerInventoryTools(registry, deps);
  registerMiningTools(registry, deps);
  registerCraftingTools(registry, deps);
  registerCombatTools(registry, deps);
  registerInteractionTools(registry, deps);
  registerCommunicationTools(registry, deps);
  registerMemoryTools(registry, deps);
  registerPlanningTools(registry, deps);
  registerFarmingTools(registry, deps);
  registerExplorationTools(registry, deps);
  registerSurvivalTools(registry, deps);
  registerSmeltTradeTools(registry, deps);
  registerUtilityTools(registry, deps);
  registerRidingCombatTools(registry, deps);
  registerStationTools(registry, deps);
  registerBrewingTools(registry, deps);
  registerWorldInteractionTools(registry, deps);
}

