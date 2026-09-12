import logger from '../utils/logger.js';

export const GeneralMinecraftKnowledge = {
  // 1. COMBAT & MOB MECHANICS
  GOLEM_PILLAR_CLEARANCE: {
    id: 'GOLEM_PILLAR_CLEARANCE',
    title: 'Столб против железного голема',
    versionRange: '>= 1.0.0',
    confidence: 0.99,
    height: 3,
    clearanceRadius: 2,
    conditions: 'Только на ровной поверхности. Если рядом есть блоки высотой >= 1, голем запрыгнет.',
    exceptions: 'При наличии холмов или ступеней строить столб высотой 4 блока.',
    rule: 'Строить столб в 3 блока ТОЛЬКО на ровной поверхности. Если в радиусе 2 блоков есть возвышение >= 1 блока (плита, ступенька, холм), голем может запрыгнуть и дотянуться (его рост 2.7м, хитбокс атаки 3м).',
  },
  WATER_BLAST_NEGATION: {
    id: 'WATER_BLAST_NEGATION',
    title: 'Гашение взрывов водой',
    versionRange: '>= 1.0.0',
    confidence: 1.0,
    conditions: 'Источник или течение воды покрывает взрывающийся блок/сущность.',
    exceptions: 'Игрок всё равно может получить урон, если не поднят щит.',
    rule: 'Один источник воды прямо на крипере или динамите полностью (на 100%) предотвращает разрушение блоков в мире.',
  },
  PIGLIN_BRUTE_AXE: {
    id: 'PIGLIN_BRUTE_AXE',
    title: 'Брутальные пиглины в бастионах',
    versionRange: '>= 1.16.0',
    confidence: 0.98,
    conditions: 'Нахождение в структуре бастиона в Незере.',
    exceptions: 'Обычные пиглины щит не отключают.',
    rule: 'Брутальные пиглины наносят удары топором, который отключает щит на 5 секунд. Не блокировать щитом в упор — кайтить, использовать лаву или занимать высоту.',
  },
  ENDERMAN_RULES: {
    id: 'ENDERMAN_RULES',
    title: 'Правила борьбы с эндерменами',
    versionRange: '>= 1.0.0',
    confidence: 0.99,
    conditions: 'Прямой контакт прицела с глазами эндермена.',
    exceptions: 'Если на голове надета тыква, эндермен не агрится при взгляде.',
    rule: 'Не смотреть в лицо/глаза без тыквы на голове. Если сагрился: встать в воду (1 блок) или под потолок высотой ровно 2 блока, либо поставить лодку рядом для захвата.',
  },

  // 2. MINING & CAVE EXPLORATION
  GOLDEN_RULE_DIGGING: {
    id: 'GOLDEN_RULE_DIGGING',
    title: 'Золотое правило #1 (Копка в 2 блока)',
    versionRange: '>= 1.0.0',
    confidence: 1.0,
    conditions: 'Копание вертикальных шахт или тоннелей.',
    exceptions: 'Нет.',
    rule: 'Никогда не копать прямо под себя (риск лавы/пропасти) и прямо над собой (риск гравия/лавы). Всегда стоять на границе 2 блоков и копать ступенями.',
  },
  DIAMOND_Y_META: {
    id: 'DIAMOND_Y_META',
    title: 'Идеальная высота для алмазов',
    versionRange: '>= 1.18.0',
    confidence: 0.98,
    modernY: -58,
    classicY: 11,
    conditions: 'Версия Minecraft 1.18 и новее.',
    exceptions: 'В версиях 1.17 и старее алмазы добываются на Y = 11.',
    rule: 'В версии 1.18+ алмазы генерируются плотнее всего на Y = -53..-58 (чуть выше бедрока, чтобы не тонуть в лаве).',
  },
  TORCH_LEFT_WALL_RULE: {
    id: 'TORCH_LEFT_WALL_RULE',
    title: 'Правило левой стены в пещерах',
    versionRange: '>= 1.0.0',
    confidence: 1.0,
    conditions: 'Исследование пещер и заброшенных шахт.',
    exceptions: 'Нет.',
    rule: 'Ставить факелы ТОЛЬКО на левую стену при движении вглубь. Тогда при возвращении факелы будут справа — это гарантированный выход наружу.',
  },

  // 3. DIMENSIONS & TRAVEL
  NETHER_PORTAL_MATH: {
    id: 'NETHER_PORTAL_MATH',
    title: 'Математика порталов Незера',
    versionRange: '>= 1.0.0',
    confidence: 1.0,
    ratio: 8,
    conditions: 'Путешествие между Обычным миром и Незером.',
    exceptions: 'Высота Y в пропорции 1:8 не участвует.',
    rule: '1 блок в Незере = 8 блоков в Обычном мире. Делить координаты X и Z на 8 для точной привязки порталов. В Незере и Крае кровати взрываются!',
  },

  // 4. VILLAGERS & AUTOMATION
  VILLAGER_CURE_DISCOUNT: {
    id: 'VILLAGER_CURE_DISCOUNT',
    title: 'Лечение зомби-жителя',
    versionRange: '>= 1.14.0',
    confidence: 0.98,
    conditions: 'Наличие зелья слабости и золотого яблока.',
    exceptions: 'В версии 1.20.2+ скидки суммируются только один раз при лечении.',
    rule: 'Взрывное зелье слабости + золотое яблоко. Вылеченный житель дает постоянные скидки до 1 изумруда за зачарованные книги (включая Починку).',
  },
  HOPPER_41_ITEM_FILTER: {
    id: 'HOPPER_41_ITEM_FILTER',
    title: 'Фильтр воронки на 41 предмет',
    versionRange: '>= 1.5.0',
    confidence: 1.0,
    conditions: 'Создание автоматической системы сортировки.',
    exceptions: 'Для предметов, стакающихся по 16 (таблички, жемчуг), требуется 18 предметов.',
    rule: '41 предмет в первом слоте + 4 переименованные палки в остальных слотах создают безотказный авто-сортировщик без переполнения.',
  },
  HAY_BALE_SMOKE_BEACON: {
    id: 'HAY_BALE_SMOKE_BEACON',
    title: 'Сигнальный маяк костра',
    versionRange: '>= 1.14.0',
    confidence: 1.0,
    conditions: 'Костер размещен на снопе сена.',
    exceptions: 'Без сена высота столба дыма всего 10 блоков.',
    rule: 'Сноп сена под костром увеличивает столб дыма с 10 до 24 блоков, позволяя ориентироваться на базу издалека.',
  },
};

export class MinecraftKnowledgeEngine {
  constructor() {
    this.generalKnowledge = { ...GeneralMinecraftKnowledge };
    this.worldKnowledge = new Map();   // 'room_chest_1' -> { description, coords, purpose }
    this.playerKnowledge = new Map();  // 'rule_wood_chest' -> { rule, setBy, timestamp }
  }

  // --- 1. General Knowledge ---
  getGeneralTopic(topicKey) {
    return this.generalKnowledge[topicKey] || null;
  }

  getTopic(topicKey) {
    return this.getGeneralTopic(topicKey);
  }

  searchGeneralKnowledge(query) {
    const q = query.toLowerCase();
    return Object.values(this.generalKnowledge).filter(entry =>
      entry.title.toLowerCase().includes(q) || entry.rule.toLowerCase().includes(q)
    );
  }

  searchKnowledge(query) {
    return this.searchGeneralKnowledge(query);
  }

  // --- 2. World-Specific Knowledge ---
  setWorldKnowledge(key, data) {
    this.worldKnowledge.set(key, { ...data, updatedAt: Date.now() });
    logger.debug(`[KNOWLEDGE] World knowledge updated: ${key}`);
  }

  getWorldKnowledge(key) {
    return this.worldKnowledge.get(key) || null;
  }

  // --- 3. Player-Specific Knowledge & Corrections ---
  setPlayerRule(ruleKey, ruleText, setBy = 'kustash01') {
    this.playerKnowledge.set(ruleKey, {
      ruleKey,
      ruleText,
      setBy,
      createdAt: Date.now(),
    });
    logger.info(`[KNOWLEDGE] Player rule learned: "${ruleText}" (from ${setBy})`);
  }

  getPlayerRule(ruleKey) {
    return this.playerKnowledge.get(ruleKey) || null;
  }

  getAllPlayerRules() {
    return Array.from(this.playerKnowledge.values());
  }
}

export const mcKnowledge = new MinecraftKnowledgeEngine();
