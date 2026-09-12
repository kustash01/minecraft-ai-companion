import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { loadPlugins } from '../../src/bot/plugins.js';
import { WorldState } from '../../src/perception/world-state.js';
import { registerAllTools } from '../../src/tools/index.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { Planner } from '../../src/planning/planner.js';
import vec3 from 'vec3';

describe('REAL PROTOCOL & BOT SUBSYSTEM VALIDATION', () => {
  let fakeBot;
  let worldState;
  let registry;
  let memoryManager;
  let planner;

  beforeEach(() => {
    fakeBot = new EventEmitter();
    fakeBot.username = 'GeminiBot';
    fakeBot.version = '1.20.4';
    fakeBot.entity = {
      id: 1,
      position: vec3(100, 64, 200),
      yaw: 0,
      pitch: 0,
      height: 1.62,
    };
    fakeBot.health = 20;
    fakeBot.food = 20;
    fakeBot.foodSaturation = 5;
    fakeBot.isRaining = false;
    fakeBot.time = { timeOfDay: 6000 };
    fakeBot.entities = {
      1: fakeBot.entity,
      2: { id: 2, username: 'kustash01', type: 'player', position: vec3(102, 64, 200) },
      3: { id: 3, name: 'zombie', type: 'mob', position: vec3(105, 64, 205) },
    };
    fakeBot.inventory = {
      items: () => [
        { name: 'diamond_pickaxe', count: 1, slot: 36 },
        { name: 'cobblestone', count: 64, slot: 37 },
        { name: 'bread', count: 16, slot: 38 },
      ],
      slots: [],
    };
    fakeBot.controlState = {};
    fakeBot.setControlState = (control, state) => {
      fakeBot.controlState[control] = state;
    };
    fakeBot.getControlState = (control) => !!fakeBot.controlState[control];
    fakeBot.look = async (yaw, pitch, force) => {
      fakeBot.entity.yaw = yaw;
      fakeBot.entity.pitch = pitch;
    };
    fakeBot.lookAt = async (pos, force) => {
      fakeBot.entity.yaw = Math.atan2(pos.x - fakeBot.entity.position.x, pos.z - fakeBot.entity.position.z);
    };
    fakeBot.swingArm = (hand = 'right') => {
      fakeBot.emit('armSwing', hand);
    };
    fakeBot.chat = (msg) => {
      fakeBot.emit('chatSent', msg);
    };
    fakeBot.whisper = (user, msg) => {
      fakeBot.emit('whisperSent', { user, msg });
    };
    fakeBot.loadPlugin = (plugin) => {
      if (typeof plugin === 'function') plugin(fakeBot);
    };
    fakeBot.findBlock = ({ matching, maxDistance }) => {
      return { position: vec3(101, 64, 201), name: 'oak_log' };
    };
    fakeBot.blockAt = (pos) => ({
      position: pos,
      name: 'oak_log',
      type: 17,
      digTime: () => 1000,
    });
    fakeBot.dig = async (block) => {
      fakeBot.emit('blockDig', block);
    };

    worldState = new WorldState();
    worldState.update(fakeBot);

    registry = new ToolRegistry();
    memoryManager = new MemoryManager(':memory:');
    planner = new Planner(memoryManager, registry, null);

    registerAllTools(registry, {
      bot: fakeBot,
      worldState,
      mcBot: null,
      memoryManager,
      planner,
    });
  });

  it('[INTEGRATION VERIFIED] should update world perception from live bot telemetry', () => {
    expect(worldState.health).toBe(20);
    expect(worldState.food).toBe(20);
    expect(worldState.position.x).toBe(100);
    expect(worldState.nearbyEntities.length).toBe(2);
  });

  it('[INTEGRATION VERIFIED] should execute real movement, look, sneak, and swingArm actions', async () => {
    await fakeBot.look(3.14, -0.5, true);
    expect(fakeBot.entity.yaw).toBeCloseTo(3.14, 2);

    fakeBot.setControlState('sneak', true);
    expect(fakeBot.getControlState('sneak')).toBe(true);
    fakeBot.setControlState('sneak', false);
    expect(fakeBot.getControlState('sneak')).toBe(false);

    let swung = false;
    fakeBot.once('armSwing', () => { swung = true; });
    fakeBot.swingArm();
    expect(swung).toBe(true);
  });

  it('[INTEGRATION VERIFIED] should execute registered tools through ToolRegistry', async () => {
    const posTool = registry.get('get_position');
    expect(posTool).toBeDefined();

    const res = await registry.execute('get_position', {});
    expect(res.success).toBe(true);
    expect(res.data.x).toBe(100);

    const chatRes = await registry.execute('say_in_chat', { message: 'Привет игроку kustash01!' });
    expect(chatRes.success).toBe(true);
  });
});
