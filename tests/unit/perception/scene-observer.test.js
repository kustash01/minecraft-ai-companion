import { describe, it, expect } from 'vitest';
import { SceneObserver } from '../../../src/perception/scene-observer.js';

/**
 * Build a mock bot whose world is defined by a heightmap function.
 * heightFn(x, z) -> surface Y (top solid block). Anything at or below is solid,
 * above is air. topBlock(x,z,y) lets a test override the surface block name.
 */
function makeMockBot({ pos = { x: 0, y: 64, z: 0 }, yaw = 0, heightFn, topBlock, entities = {}, biome = 'plains' } = {}) {
  const distanceTo = (p) => Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
  return {
    version: '1.20.4',
    entity: { position: { ...pos, distanceTo }, yaw },
    entities,
    blockAt: ({ x, y, z }) => {
      const surface = heightFn ? heightFn(x, z) : 63;
      if (y > surface) return { name: 'air', biome: { name: biome } };
      const name = (y === surface && topBlock) ? topBlock(x, z, y) : (y === surface ? 'grass_block' : 'stone');
      return { name, biome: { name: biome } };
    },
  };
}

describe('SceneObserver', () => {
  it('reports facing direction and biome', () => {
    const bot = makeMockBot({ yaw: 0, biome: 'forest' }); // yaw 0 = facing north
    const scene = new SceneObserver().observe(bot);
    expect(scene.facing.code).toBe('N');
    expect(scene.biome).toBe('forest');
  });

  it('detects a mountain in a specific compass direction ("за горой")', () => {
    // Flat everywhere except a big rise to the north.
    const heightFn = (x, z) => (z <= -12 ? 90 : 63);
    const bot = makeMockBot({ heightFn });
    const scene = new SceneObserver().observe(bot);
    const north = scene.horizon.find(h => h.code === 'N');
    expect(north.rise).toBeGreaterThanOrEqual(12);
    expect(north.features).toContain('высокая гора');
    // Other flat directions should not claim a mountain.
    const south = scene.horizon.find(h => h.code === 'S');
    expect(south.features).toContain('ровная местность');
  });

  it('detects water and trees on the horizon', () => {
    const heightFn = () => 63;
    const topBlock = (x, z) => {
      if (x > 10) return 'water';
      if (x < -10) return 'oak_log';
      return 'grass_block';
    };
    const bot = makeMockBot({ heightFn, topBlock });
    const scene = new SceneObserver().observe(bot);
    const east = scene.horizon.find(h => h.code === 'E');
    const west = scene.horizon.find(h => h.code === 'W');
    expect(east.features).toContain('вода');
    expect(west.features).toContain('деревья/лес');
  });

  it('places nearby entities on the correct side and distance', () => {
    const heightFn = () => 63;
    const entities = {
      1: { id: 1, name: 'cow', type: 'mob', position: { x: 0, y: 64, z: -8 } },
    };
    const bot = makeMockBot({ yaw: 0, heightFn, entities }); // yaw 0 = facing north (-Z)
    const scene = new SceneObserver().observe(bot);
    expect(scene.entities).toHaveLength(1);
    const cow = scene.entities[0];
    expect(cow.name).toBe('cow');
    expect(cow.side).toBe('ahead'); // -Z is ahead when facing north
    expect(cow.distance).toBeCloseTo(8, 0);
    expect(cow.compass).toBe('север'); // -Z is geographic north
  });

  it('describe() produces a readable Russian narration', () => {
    const heightFn = (x, z) => (z <= -12 ? 90 : 63);
    const bot = makeMockBot({ yaw: 0, heightFn });
    const observer = new SceneObserver();
    const text = observer.describe(observer.observe(bot));
    expect(text).toContain('Смотрю на');
    expect(text).toMatch(/гора|холм/);
  });

  it('returns null for an unspawned bot', () => {
    expect(new SceneObserver().observe({})).toBeNull();
  });

  it('detects nearby ore, hazards and stations (step-1 scan, no skipping)', () => {
    // Flat ground at y=63. Place point objects at odd offsets that a coarse
    // step-2 scan would have skipped, to guard against the regression.
    const heightFn = () => 63;
    const topBlock = (x, z, y) => {
      if (x === 3 && z === 0) return 'iron_ore';
      if (x === 5 && z === 2) return 'diamond_ore';
      if (x === 2 && z === -2) return 'lava';
      if (x === -3 && z === 1) return 'furnace';
      if (x === -4 && z === 1) return 'crafting_table';
      return 'stone';
    };
    const bot = makeMockBot({ heightFn, topBlock });
    const scene = new SceneObserver().observe(bot);
    const oreNames = scene.nearby.ores.map(o => o.name);
    expect(oreNames).toContain('iron_ore');
    expect(oreNames).toContain('diamond_ore');
    expect(scene.nearby.hazards.map(h => h.name)).toContain('lava');
    const stationNames = scene.nearby.stations.map(s => s.name);
    expect(stationNames).toContain('furnace');
    expect(stationNames).toContain('crafting_table');
  });

  it('reports self-status: on fire, low HP', () => {
    const bot = makeMockBot({});
    bot.health = 5;
    bot.entity.metadata = { 0: 0x01 }; // on-fire bit
    bot.entity.velocity = { x: 0, y: 0, z: 0 };
    bot.entity.onGround = true;
    const scene = new SceneObserver().observe(bot);
    expect(scene.status).toContain('горю');
    expect(scene.status.some(s => s.includes('мало здоровья'))).toBe(true);
  });

  it('detects taking damage via HP drop between observes', () => {
    const observer = new SceneObserver();
    const bot = makeMockBot({});
    bot.health = 20;
    observer.observe(bot); // establishes baseline
    bot.health = 14;       // took 6 damage
    const scene = observer.observe(bot);
    expect(scene.status.some(s => s.includes('урон'))).toBe(true);
  });

  it('observes light levels, celestial time/weather, metabolism and player attention', () => {
    const observer = new SceneObserver();
    const bot = makeMockBot({});
    bot.world = {
      getBlockLight: () => 0,
      getSkyLight: () => 15,
    };
    bot.time = { timeOfDay: 12500 }; // sunset
    bot.isRaining = true;
    bot.thunderState = 1; // thunderstorm
    bot.food = 4; // critical hunger
    bot.entities = {
      player1: {
        type: 'player',
        username: 'kustash01',
        position: { x: 0, y: 64, z: -3 }, // 3m in front of bot
        yaw: 0,
        pitch: 0,
        heldItem: { name: 'diamond_sword' },
        crouching: true,
      }
    };

    const scene = observer.observe(bot);
    expect(scene.light.blockLight).toBe(0);
    expect(scene.celestial.timeDesc).toContain('закат');
    expect(scene.celestial.isThundering).toBe(true);
    expect(scene.metabolism.food).toBe(4);

    const desc = observer.describe(scene);
    expect(desc).toContain('полная тьма');
    expect(desc).toContain('гроза с молниями');
    expect(desc).toContain('закат');
    expect(desc).toContain('Критический голод');
    expect(desc).toContain('kustash01');
    expect(desc).toContain('diamond_sword');
    expect(desc).toContain('приседает');
  });
});
