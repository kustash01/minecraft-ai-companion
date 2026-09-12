import minecraftData from 'minecraft-data';

export function registerInventoryTools(registry, { bot, worldState }) {
  registry.register({
    name: 'get_inventory',
    description: 'Lists all items currently in the bot inventory.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const summary = worldState.getInventorySummary();
        return { success: true, data: summary };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'inspect_inventory',
    description: 'Open and read the full inventory like looking at the inventory screen: hotbar, main storage, armor worn, off-hand item, tools/weapons, and free slots. Use before crafting, equipping, or deciding what is missing.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (!bot.inventory) return { success: false, error: 'Инвентарь недоступен (бот не заспавнился).' };
        const slots = bot.inventory.slots || [];
        const brief = (item) => item ? { name: item.name, count: item.count } : null;

        // Armor slots 5..8, off-hand 45, hotbar 36..44, main 9..35.
        const armor = {
          head: brief(slots[5]),
          torso: brief(slots[6]),
          legs: brief(slots[7]),
          feet: brief(slots[8]),
        };
        const offHand = brief(slots[45]);
        const held = bot.heldItem ? brief(bot.heldItem) : null;

        const hotbar = [];
        for (let s = 36; s <= 44; s++) hotbar.push(brief(slots[s]));

        const items = (bot.inventory.items?.() || []).map(i => ({ name: i.name, count: i.count, slot: i.slot }));

        // Classify a few useful categories the AI often reasons about.
        const has = (kw) => items.some(i => i.name.includes(kw));
        const tools = items.filter(i => /_(pickaxe|axe|shovel|hoe|sword)$/.test(i.name)).map(i => i.name);
        const weapons = items.filter(i => i.name.includes('sword') || i.name.includes('bow') || i.name.includes('crossbow') || i.name.includes('trident')).map(i => i.name);

        let free = 0;
        for (let s = 9; s <= 44; s++) if (!slots[s]) free++;

        const totalCount = items.reduce((a, i) => a + i.count, 0);

        return {
          success: true,
          data: {
            held,
            offHand,
            armor,
            hotbar,
            items,
            tools,
            weapons,
            freeSlots: free,
            totalItems: totalCount,
            flags: {
              hasFood: has('cooked') || has('bread') || has('apple') || has('carrot') || has('potato'),
              hasTorch: has('torch'),
              hasPickaxe: tools.some(t => t.endsWith('_pickaxe')),
              hasSword: weapons.some(w => w.includes('sword')),
              hasShield: has('shield'),
            },
          },
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'equip_item',
    description: 'Equips any item in the game to any destination (hand, off-hand, head, torso, legs, feet). Supports elytra, shields, totems, weapons, tools, blocks.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Item name to equip (e.g. diamond_sword, shield, elytra, torch)' },
        destination: { type: 'string', enum: ['hand', 'off-hand', 'head', 'torso', 'legs', 'feet'], default: 'hand' }
      },
      required: ['itemName']
    },
    handler: async (args) => {
      try {
        const mcData = minecraftData(bot.version || '1.20.1');
        const itemType = mcData.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

        const item = bot.inventory.items().find(i => i.type === itemType.id || i.name === args.itemName);
        if (!item) return { success: false, error: `Do not have item: ${args.itemName}` };

        // Нормализация слота назначения
        let dest = (args.destination || 'hand').toLowerCase();
        if (dest === 'offhand' || dest === 'left_hand' || dest === 'shield') dest = 'off-hand';
        else if (dest === 'helmet' || dest === 'cap' || dest === 'head') dest = 'head';
        else if (dest === 'chest' || dest === 'chestplate' || dest === 'elytra' || dest === 'body') dest = 'torso';
        else if (dest === 'leggings' || dest === 'pants') dest = 'legs';
        else if (dest === 'boots' || dest === 'shoes') dest = 'feet';
        else if (dest === 'main' || dest === 'right_hand') dest = 'hand';

        await bot.equip(item, dest);
        return { success: true, data: `Equipped ${args.itemName} to ${dest}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'eat_food',
    description: 'Eats a specified food item, or automatically eats if omitted.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string' }
      }
    },
    handler: async (args) => {
      try {
        if (args.itemName) {
          const mcData = minecraftData(bot.version);
          const itemType = mcData.itemsByName[args.itemName];
          if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

          const item = bot.inventory.items().find(i => i.type === itemType.id);
          if (!item) return { success: false, error: `Do not have food: ${args.itemName}` };
          
          await bot.equip(item, 'hand');
          await bot.consume();
          return { success: true, data: `Ate ${args.itemName}` };
        } else if (bot.autoEat && typeof bot.autoEat.eat === 'function') {
          await bot.autoEat.eat();
          return { success: true, data: 'Auto-eat triggered.' };
        } else {
          const foodItem = bot.inventory?.items()?.find(i =>
            ['bread', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'apple', 'baked_potato', 'carrot'].includes(i.name)
          );
          if (!foodItem) return { success: false, error: 'No food available in inventory.' };
          await bot.equip(foodItem, 'hand');
          await bot.consume();
          return { success: true, data: `Ate ${foodItem.name}` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'drop_item',
    description: 'Drops a specific quantity of an item from inventory.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        count: { type: 'number' }
      },
      required: ['itemName']
    },
    handler: async (args) => {
      try {
        const mcData = minecraftData(bot.version);
        const itemType = mcData.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

        const item = bot.inventory.items().find(i => i.type === itemType.id);
        if (!item) return { success: false, error: `Do not have item: ${args.itemName}` };

        const amount = args.count ? Math.min(args.count, item.count) : item.count;
        await bot.toss(itemType.id, null, amount);
        return { success: true, data: `Dropped ${amount} ${args.itemName}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'toss_item_to_player',
    description: 'Tosses an item to a nearby player.',
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string' },
        itemName: { type: 'string' },
        count: { type: 'number' }
      },
      required: ['playerName', 'itemName']
    },
    handler: async (args) => {
      try {
        const player = bot.players[args.playerName]
          || Object.entries(bot.players || {}).find(([name]) => name.toLowerCase() === args.playerName.toLowerCase())?.[1];
        if (!player || !player.entity) return { success: false, error: `Player ${args.playerName} not found nearby.` };

        const mcData = minecraftData(bot.version);
        const itemType = mcData.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

        const item = bot.inventory.items().find(i => i.type === itemType.id);
        if (!item) return { success: false, error: `Do not have item: ${args.itemName}` };

        const amount = args.count ? Math.min(args.count, item.count) : item.count;
        await bot.lookAt(player.entity.position.offset(0, player.entity.height, 0));
        await bot.toss(itemType.id, null, amount);
        return { success: true, data: `Tossed ${amount} ${args.itemName} to ${args.playerName}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'swap_hands',
    description: 'Swaps items between the main hand and off-hand (F key in Minecraft).',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        // Слот 45 — оффхенд
        const currentHeld = bot.heldItem;
        const currentOffhand = bot.inventory.slots[45];

        // Используем moveSlotItem или swap
        if (typeof bot.moveSlotItem === 'function') {
          const quickBarSlot = 36 + (bot.quickBarSlot || 0);
          await bot.moveSlotItem(quickBarSlot, 45);
        } else if (typeof bot.equip === 'function' && currentOffhand) {
          await bot.equip(currentOffhand, 'hand');
        }
        return { success: true, data: 'Swapped items between hands (F key).' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'hotbar_select',
    description: 'Selects a slot on the hotbar (0 to 8).',
    parameters: {
      type: 'object',
      properties: {
        slot: { type: 'number', minimum: 0, maximum: 8 }
      },
      required: ['slot']
    },
    handler: async (args) => {
      try {
        if (typeof bot.setQuickBarSlot === 'function') {
          bot.setQuickBarSlot(args.slot);
          return { success: true, data: `Selected hotbar slot ${args.slot}` };
        }
        return { success: false, error: 'Cannot set hotbar slot.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'organize_inventory',
    description: 'Auto-organizes hotbar and packs inventory neatly like an experienced gamer.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const { HumanMotor } = await import('../behavior/human-motor.js');
        await HumanMotor.organizeHotbar(bot);
        return { success: true, data: 'Inventory and hotbar organized.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}

