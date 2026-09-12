import { describe, it, expect } from 'vitest';
import { CognitiveEngine } from '../../src/cognition/cognitive-engine.js';
import { EventBus, EventTypes, EventPriority } from '../../src/events/event-bus.js';
import { SkillSystem, SkillNames } from '../../src/behavior/player-simulation/skill-system.js';
import { HumanErrorEngine } from '../../src/behavior/player-simulation/mistakes.js';
import { EmotionalStateEngine } from '../../src/personality/emotional-state.js';

describe('Endurance & Stability Simulation: 200 Cognitive Cycles', () => {
  it('should run 200 continuous cognitive decision cycles without degradation or memory leak', async () => {
    const engine = new CognitiveEngine({ config: {} });
    const bus = new EventBus();
    const skills = new SkillSystem();
    const errors = new HumanErrorEngine();
    const emotions = new EmotionalStateEngine();

    let health = 20;
    let food = 20;
    let time = 1000;

    const startMemory = process.memoryUsage().heapUsed;

    for (let cycle = 1; cycle <= 200; cycle++) {
      time = (time + 100) % 24000;
      if (cycle % 20 === 0) food = Math.max(6, food - 2);

      // Simulated world state
      const worldState = {
        position: { x: 100 + (cycle % 10), y: 64, z: 200 + (cycle % 5) },
        health,
        food,
        timeOfDay: time,
        nearbyEntities: cycle % 15 === 0
          ? [{ name: 'zombie', distance: 5, position: { x: 105, y: 64, z: 202 } }]
          : [],
      };

      // 1. Run cognitive cycle
      const res = await engine.runCycle(worldState);
      expect(res).toBeDefined();

      // 2. Perform periodic skill checks
      if (cycle % 10 === 0) {
        skills.checkSkill(SkillNames.MINING, { stressMod: 1.0 - emotions.getMood().stress });
      }

      // 3. Emit periodic events
      if (cycle === 50) {
        bus.emitEvent(EventTypes.NIGHT_STARTED, {}, EventPriority.NORMAL);
      } else if (cycle === 100) {
        bus.emitEvent(EventTypes.RARE_ITEM_FOUND, { item: 'diamond' }, EventPriority.HIGH);
        emotions.onRareDiscovery();
      } else if (cycle === 150) {
        bus.emitEvent(EventTypes.BOT_HURT, { damage: 4 }, EventPriority.HIGH);
        emotions.onDamageTaken(4);
      }

      // 4. Emotional decay
      emotions.tickDecay();

      // 5. Evaluate potential lapse
      errors.evaluateLapse({ stress: emotions.getMood().stress });
    }

    const endMemory = process.memoryUsage().heapUsed;
    const memoryDiffMb = (endMemory - startMemory) / (1024 * 1024);

    expect(engine.currentCycle).toBe(200);
    expect(memoryDiffMb).toBeLessThan(100); // Heap growth under 100MB across 200 cycles
  });
});
