/**
 * Mock Minecraft Bot для тестирования.
 */
export function createMockBot() {
  const entity = {
    position: { x: 100, y: 64, z: 200, distanceTo: (pos) => {
      return Math.sqrt(
        (entity.position.x - pos.x) ** 2 +
        (entity.position.y - pos.y) ** 2 +
        (entity.position.z - pos.z) ** 2
      );
    }},
  };

  return {
    entity,
    health: 20,
    food: 18,
    foodSaturation: 5,
    isRaining: false,
    time: { timeOfDay: 6000, isDay: true },
    game: { gameMode: 'survival' },
    experience: { points: 42 },
    username: 'GeminiBot',
    version: '1.20.4',

    inventory: {
      items: () => [
        { name: 'diamond_pickaxe', count: 1, slot: 0 },
        { name: 'cobblestone', count: 64, slot: 1 },
        { name: 'oak_log', count: 32, slot: 2 },
        { name: 'bread', count: 10, slot: 3 },
      ],
      slots: new Array(46).fill(null),
    },

    entities: {
      1: { ...entity },
      2: {
        username: 'kustash01',
        name: 'kustash01',
        type: 'player',
        position: { x: 105, y: 64, z: 203 },
      },
      3: {
        name: 'zombie',
        type: 'mob',
        position: { x: 110, y: 64, z: 195 },
      },
    },

    players: {
      kustash01: {
        username: 'kustash01',
        entity: {
          position: { x: 105, y: 64, z: 203 },
        },
      },
    },

    // Мок методы
    chat: (msg) => {},
    whisper: (player, msg) => {},
    lookAt: async (pos) => {},
    quit: () => {},

    pathfinder: {
      setGoal: (goal, dynamic) => {},
      stop: () => {},
      setMovements: (movements) => {},
    },

    findBlocks: (opts) => [],

    // Event emitter mock
    _listeners: {},
    on: function(event, handler) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(handler);
    },
    once: function(event, handler) {
      this.on(event, handler);
    },
    emit: function(event, ...args) {
      (this._listeners[event] || []).forEach(h => h(...args));
    },
    loadPlugin: (plugin) => {},
  };
}
