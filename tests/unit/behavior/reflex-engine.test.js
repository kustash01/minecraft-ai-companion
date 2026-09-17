import { describe, expect, it, vi } from 'vitest';
import { ReflexEngine } from '../../../src/behavior/reflex-engine.js';
import vec3 from 'vec3';

describe('ReflexEngine', () => {
  it('triggers emergency shield raise when a creeper approaches within 3.5m', async () => {
    const activateItem = vi.fn();
    const equip = vi.fn();
    const look = vi.fn();

    const bot = {
      entity: {
        position: vec3(0, 64, 0),
        yaw: 0,
        pitch: 0,
        height: 1.6,
      },
      entities: {
        10: {
          name: 'creeper',
          position: vec3(1.5, 64, 1.5), // distance ~ 2.1m (< 3.5m)
        },
      },
      inventory: {
        items: () => [{ name: 'shield', slot: 36 }],
        slots: { 45: null },
      },
      equip,
      activateItem,
      look,
    };

    const reflex = new ReflexEngine(bot);
    await reflex._checkCreeperDanger();

    expect(equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'shield' }), 'off-hand');
    expect(activateItem).toHaveBeenCalledWith(true);
  });

  it('steps back and sneaks on friendly fire without attacking teammate', () => {
    const setControlState = vi.fn();
    const botEntity = { id: 1, position: vec3(0, 64, 0) };
    const playerEntity = { id: 2, position: vec3(1, 64, 0) };

    const bot = {
      entity: botEntity,
      players: {
        kustash01: { username: 'kustash01', entity: playerEntity },
      },
      setControlState,
    };

    const reflex = new ReflexEngine(bot);
    reflex._onHurt(botEntity);

    // Bot should step back
    expect(setControlState).toHaveBeenCalledWith('back', true);
  });

  it('responds with friendly shift when teammate double-crouches nearby', async () => {
    const look = vi.fn();
    const setControlState = vi.fn();
    const playerEntity = {
      id: 2,
      position: vec3(1, 64, 1),
      height: 1.6,
      metadata: [0x02], // sneak bit active
    };

    const bot = {
      entity: { position: vec3(0, 64, 0), yaw: 0, pitch: 0, height: 1.6 },
      players: {
        kustash01: { username: 'kustash01', entity: playerEntity },
      },
      look,
      setControlState,
    };

    const reflex = new ReflexEngine(bot);

    // Crouch 1
    await reflex._checkSocialSneak();
    // Crouch 2
    await reflex._checkSocialSneak();

    // Bot should have crouched in return
    expect(setControlState).toHaveBeenCalledWith('sneak', true);
  });

  it('triggers emergencyHandler (Spinal Reflex Abort) when danger is detected', async () => {
    const emergencyHandler = vi.fn();
    const bot = {
      entity: { position: vec3(0, 64, 0), yaw: 0, pitch: 0, height: 1.6 },
      entities: {
        10: { name: 'creeper', position: vec3(1, 64, 1) },
      },
      inventory: { items: () => [], slots: {} },
      setControlState: vi.fn(),
      clearControlStates: vi.fn(),
    };

    const reflex = new ReflexEngine(bot, { emergencyHandler });
    await reflex._checkCreeperDanger();

    expect(emergencyHandler).toHaveBeenCalledWith(expect.stringMatching(/Крипер в опасной близости/));
  });
});
