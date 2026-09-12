import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIntelligence } from '../../../src/world/spatial-intelligence.js';
import { WorldMapEngine } from '../../../src/world/world-map.js';
import { BaseStateManager } from '../../../src/world/base-state.js';
import { LongTermProjectManager } from '../../../src/economy/project-manager.js';

describe('SpatialIntelligence', () => {
  let spatial;
  beforeEach(() => {
    spatial = new SpatialIntelligence();
  });

  it('should identify target ahead, left, right, and vertical', () => {
    const botPos = { x: 0, y: 64, z: 0 };
    const botYaw = 0; // facing south (positive Z)

    expect(spatial.getRelativeDirection(botPos, botYaw, { x: 0, y: 70, z: 0 })).toBe('above');
    expect(spatial.getRelativeDirection(botPos, botYaw, { x: 0, y: 55, z: 0 })).toBe('below');
    expect(spatial.getRelativeDirection(botPos, botYaw, { x: 0, y: 64, z: 10 })).toBe('behind');
  });

  it('compassFromVector maps Minecraft axes to 8-wind directions', () => {
    // +Z = south, -Z = north, +X = east, -X = west
    expect(spatial.compassFromVector(0, 10).code).toBe('S');
    expect(spatial.compassFromVector(0, -10).code).toBe('N');
    expect(spatial.compassFromVector(10, 0).code).toBe('E');
    expect(spatial.compassFromVector(-10, 0).code).toBe('W');
    expect(spatial.compassFromVector(10, -10).code).toBe('NE');
    expect(spatial.compassFromVector(-10, 10).code).toBe('SW');
  });

  it('getFacingDirection reads bot yaw (0 = north, PI = south)', () => {
    expect(spatial.getFacingDirection(0).code).toBe('N');
    expect(spatial.getFacingDirection(Math.PI).code).toBe('S');
    expect(spatial.getFacingDirection(Math.PI / 2).code).toBe('W');
    expect(spatial.getFacingDirection(-Math.PI / 2).code).toBe('E');
  });

  it('getCompassToTarget points from bot toward a POI', () => {
    const botPos = { x: 0, y: 64, z: 0 };
    // Village to the north-west
    expect(spatial.getCompassToTarget(botPos, { x: -50, y: 64, z: -50 }).code).toBe('NW');
    expect(spatial.getCompassToTarget(botPos, { x: 0, y: 64, z: 120 }).ru).toBe('юг');
  });

  it('describeTarget produces a human phrase with compass + relative side', () => {
    const botPos = { x: 0, y: 64, z: 0 };
    const phrase = spatial.describeTarget(botPos, 0, { x: 0, y: 64, z: 120 }, 'деревня');
    expect(phrase).toContain('деревня');
    expect(phrase).toContain('юг');
    expect(phrase).toContain('м)');
  });
});

describe('WorldMapEngine', () => {
  let mapEngine;
  beforeEach(() => {
    mapEngine = new WorldMapEngine();
  });

  it('should register chunks and landmarks', () => {
    mapEngine.recordChunk(100, 200, { biome: 'forest', structure: 'village' });
    mapEngine.addLandmark('Старый дуб', { x: 105, y: 64, z: 210 }, 'Ориентир у базы');

    const lm = mapEngine.getLandmark('старый дуб');
    expect(lm).not.toBeNull();
    expect(lm.coords.x).toBe(105);
  });
});

describe('BaseStateManager', () => {
  let bs;
  beforeEach(() => {
    bs = new BaseStateManager();
  });

  it('should manage multi-home points', () => {
    bs.setHomePoint('main_base', { x: 100, y: 64, z: 200 });
    bs.setHomePoint('mine', { x: 120, y: 30, z: 250 });

    expect(bs.getHomePoint('main_base').x).toBe(100);
    expect(bs.getHomePoint('mine').y).toBe(30);
  });
});

describe('LongTermProjectManager', () => {
  let pm;
  beforeEach(() => {
    pm = new LongTermProjectManager();
  });

  it('should calculate missing project materials', () => {
    pm.createProject('house_1', 'Уютный дом', 'medieval', {
      oak_planks: 100,
      cobblestone: 50,
    });

    const inv = [
      { name: 'oak_planks', count: 40 },
      { name: 'cobblestone', count: 50 },
    ];

    const missing = pm.calculateMissingMaterials('house_1', inv);
    expect(missing.oak_planks).toBe(60);
    expect(missing.cobblestone).toBeUndefined();
  });
});
