import minecraftData from 'minecraft-data';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GAME_KNOWLEDGE');

/**
 * FoodKnowledge — всесторонний анализ любых продуктов питания в Minecraft:
 * питательность, насыщение, целебные эффекты и применимость в ситуациях.
 */
export class FoodKnowledge {
  /**
   * Получить характеристики любого продукта
   */
  static getFoodProfile(itemName, version = '1.20.1') {
    if (!itemName) return null;
    const mcData = minecraftData(version);
    const cleanName = itemName.toLowerCase().replace('minecraft:', '');

    // 1. Проверяем стандартные данные MC
    const foodData = mcData.foodsByName?.[cleanName];
    const itemData = mcData.itemsByName?.[cleanName];

    if (!itemData && !foodData) return null;

    // 2. Особые предметы питания со специфическими эффектами
    const specialFoods = {
      enchanted_golden_apple: { foodPoints: 4, saturation: 9.6, tier: 'god', heals: true, clearsEffects: false, grantsEffects: ['absorption', 'regeneration', 'resistance', 'fire_resistance'] },
      golden_apple: { foodPoints: 4, saturation: 9.6, tier: 'legendary', heals: true, clearsEffects: false, grantsEffects: ['absorption', 'regeneration'] },
      golden_carrot: { foodPoints: 6, saturation: 14.4, tier: 'elite_combat', heals: false, clearsEffects: false, grantsEffects: [] },
      milk_bucket: { foodPoints: 0, saturation: 0, tier: 'cure', heals: false, clearsEffects: true, grantsEffects: [] },
      honey_bottle: { foodPoints: 6, saturation: 1.2, tier: 'cure_poison', heals: false, clearsEffects: true, grantsEffects: [] },
      chorus_fruit: { foodPoints: 4, saturation: 2.4, tier: 'teleport_escape', heals: false, clearsEffects: false, grantsEffects: [] },
      rotten_flesh: { foodPoints: 4, saturation: 0.8, tier: 'emergency_starvation', heals: false, clearsEffects: false, grantsEffects: ['hunger'] },
      pufferfish: { foodPoints: 1, saturation: 0.2, tier: 'hazard', heals: false, clearsEffects: false, grantsEffects: ['poison', 'nausea'] },
      spider_eye: { foodPoints: 2, saturation: 3.2, tier: 'hazard', heals: false, clearsEffects: false, grantsEffects: ['poison'] },
      poisonous_potato: { foodPoints: 2, saturation: 1.2, tier: 'hazard', heals: false, clearsEffects: false, grantsEffects: ['poison'] },
    };

    if (specialFoods[cleanName]) {
      return {
        name: cleanName,
        id: itemData?.id || foodData?.id,
        foodPoints: specialFoods[cleanName].foodPoints,
        saturation: specialFoods[cleanName].saturation,
        tier: specialFoods[cleanName].tier,
        heals: specialFoods[cleanName].heals,
        clearsEffects: specialFoods[cleanName].clearsEffects,
        grantsEffects: specialFoods[cleanName].grantsEffects,
        isHazard: specialFoods[cleanName].tier === 'hazard',
      };
    }

    const foodPoints = foodData?.foodPoints || 2;
    const saturation = foodData?.saturation || 1.0;

    let tier = 'snack';
    if (saturation >= 12.0) tier = 'elite_combat';
    else if (saturation >= 8.0) tier = 'hearty_meal'; // cooked_beef, cooked_porkchop, cooked_mutton
    else if (foodPoints >= 5) tier = 'standard_meal'; // bread, baked_potato, cooked_chicken

    return {
      name: cleanName,
      id: itemData?.id || foodData?.id,
      foodPoints,
      saturation,
      tier,
      heals: false,
      clearsEffects: false,
      grantsEffects: [],
      isHazard: false,
    };
  }

  /**
   * Выбирает лучшую еду из инвентаря под текущую ситуацию
   */
  static selectBestFood(bot, situation = {}) {
    if (!bot?.inventory?.items) return null;
    const items = bot.inventory.items();
    const { inCombat = false, health = 20, foodLevel = 20, activeEffects = [] } = situation;

    const availableFoods = items
      .map((item) => ({ item, profile: FoodKnowledge.getFoodProfile(item.name, bot.version) }))
      .filter((entry) => entry.profile && !entry.profile.isHazard && entry.profile.tier !== 'emergency_starvation');

    if (availableFoods.length === 0) {
      // Экстренный голод: если умираем от голода (food == 0, health < 10), можно съесть даже гнилую плоть
      if (foodLevel === 0 && health < 10) {
        const emergency = items.find((i) => i.name === 'rotten_flesh');
        if (emergency) return emergency;
      }
      return null;
    }

    // 1. Если отравлены или под иссушением — ищем молоко или мед
    const hasBadEffect = activeEffects.some((eff) => ['poison', 'wither', 'weakness', 'nausea'].includes(eff.name || eff));
    if (hasBadEffect) {
      const cure = availableFoods.find((f) => f.profile.clearsEffects);
      if (cure) return cure.item;
    }

    // 2. В тяжелом бою при низком здоровье — золотые яблоки
    if (inCombat && health < 10) {
      const gApple = availableFoods.find((f) => f.profile.heals);
      if (gApple) return gApple.item;
    }

    // 3. В бою — высоконасыщенная еда для регенерации (золотая морковь, стейки, свинина)
    if (inCombat) {
      const combatFood = availableFoods.find((f) => f.profile.tier === 'elite_combat' || f.profile.tier === 'hearty_meal');
      if (combatFood) return combatFood.item;
    }

    // 4. Обычный перекус — сортируем по убыванию питательности
    availableFoods.sort((a, b) => b.profile.saturation - a.profile.saturation);
    return availableFoods[0].item;
  }
}

/**
 * ToolKnowledge — всесторонняя оценка ценности любого инструмента и оружия:
 * тир материала, износ и зачарования (Починка, Шёлковое касание, Удача).
 */
export class ToolKnowledge {
  static getToolValue(item) {
    if (!item || !item.name) return { value: 0, isPrecious: false, canSacrifice: true };

    const name = item.name.toLowerCase();
    let materialTier = 1; // wood/gold

    if (name.includes('netherite')) materialTier = 6;
    else if (name.includes('diamond')) materialTier = 5;
    else if (name.includes('iron')) materialTier = 4;
    else if (name.includes('stone')) materialTier = 2;
    else if (name.includes('golden')) materialTier = 1.5;

    // Анализ зачарований
    const enchants = item.nbt?.value?.Enchantments?.value?.value || [];
    let hasMending = false;
    let hasSilkTouch = false;
    let hasFortune = false;
    let totalEnchantPower = 0;

    for (const ench of enchants) {
      const id = String(ench.id?.value || '').toLowerCase();
      const lvl = Number(ench.lvl?.value || 1);
      totalEnchantPower += lvl;

      if (id.includes('mending')) hasMending = true;
      if (id.includes('silk_touch')) hasSilkTouch = true;
      if (id.includes('fortune')) hasFortune = true;
    }

    // Драгоценный инструмент: алмаз/незерит, либо зачарован на Починку, Шёлковое касание или Удачу
    const isPrecious = materialTier >= 5 || hasMending || hasSilkTouch || (hasFortune && materialTier >= 4);
    // Расходный инструмент: можно пожертвовать ради выхода из ловушки
    const canSacrifice = !isPrecious && materialTier <= 4;

    const durabilityMax = item.maxDurability || 250;
    const durabilityUsed = item.durabilityUsed || 0;
    const durabilityLeft = Math.max(0, durabilityMax - durabilityUsed);
    const durabilityPercent = durabilityLeft / durabilityMax;

    return {
      name: item.name,
      materialTier,
      isPrecious,
      canSacrifice,
      hasMending,
      hasSilkTouch,
      hasFortune,
      totalEnchantPower,
      durabilityLeft,
      durabilityPercent,
    };
  }
}

/**
 * ThreatKnowledge — универсальный анализ уровня опасности любых существ и угроз мира.
 */
export class ThreatKnowledge {
  static evaluateEntityThreat(entity, botPos) {
    if (!entity || !entity.name) return { threatLevel: 0, isLethal: false, type: 'neutral' };

    const name = entity.name.toLowerCase();
    let threatLevel = 0;
    let isAxeWielder = false;
    let isRanged = false;
    let isExplosive = false;

    // Анализ типа моба
    if (['warden', 'wither', 'ender_dragon'].includes(name)) threatLevel = 10;
    else if (['creeper'].includes(name)) { threatLevel = 9; isExplosive = true; }
    else if (['piglin_brute', 'vindicator'].includes(name)) { threatLevel = 8.5; isAxeWielder = true; }
    else if (['witch', 'evoker', 'ravager'].includes(name)) threatLevel = 8;
    else if (['skeleton', 'stray', 'pillager', 'drowned'].includes(name)) { threatLevel = 7; isRanged = true; }
    else if (['enderman'].includes(name)) threatLevel = 7;
    else if (['spider', 'cave_spider'].includes(name)) threatLevel = 6;
    else if (['zombie', 'husk', 'zombified_piglin'].includes(name)) threatLevel = 5;
    else if (['slime', 'magma_cube'].includes(name)) threatLevel = 3;

    // Дистанция
    let distance = 10;
    if (botPos && entity.position) {
      const dx = botPos.x - entity.position.x;
      const dy = botPos.y - entity.position.y;
      const dz = botPos.z - entity.position.z;
      distance = Math.hypot(dx, dy, dz);
    }

    // Если моб с топором в упоре — опасность сбития щита
    if (isAxeWielder && distance < 3.5) {
      threatLevel += 2;
    }

    return {
      name,
      threatLevel,
      distance,
      isLethal: threatLevel >= 8 || (threatLevel >= 6 && distance < 3.0),
      isAxeWielder,
      isRanged,
      isExplosive,
    };
  }
}
