import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { EventHandler } from '../../src/bot/event-handler.js';

describe('EventHandler direct player routing', () => {
  function createSetup() {
    const mcBot = new EventEmitter();
    const chatFn = vi.fn();
    const pathfinderStop = vi.fn();
    mcBot.bot = {
      chat: chatFn,
      pathfinder: { stop: pathfinderStop },
      clearControlStates: vi.fn(),
      entity: { position: { x: 120.4, y: 64, z: -35.2 } },
      players: {
        kustash01: { entity: { position: { x: 121, y: 64, z: -36 } } }
      }
    };

    const executedTools = [];
    const toolRegistry = {
      execute: vi.fn(async (name, args) => {
        executedTools.push({ name, args });
        return { success: true };
      })
    };

    const aiBrain = {
      toolRegistry,
      processMessage: vi.fn(async () => 'AI reply')
    };

    const handler = new EventHandler(mcBot, aiBrain, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'GeminiBot' }
    }, { toolRegistry });

    handler.setup();
    return { mcBot, chatFn, toolRegistry, executedTools, aiBrain };
  }

  it('routes greetings to AI brain for natural response', async () => {
    const { mcBot, aiBrain } = createSetup();
    mcBot.emit('chat', 'kustash01', 'эй');
    await new Promise(r => setTimeout(r, 10));
    expect(aiBrain.processMessage).toHaveBeenCalled();
  });

  it('routes "ты где вообще" to AI brain (coordinates come from world context, not a template)', async () => {
    const { mcBot, aiBrain } = createSetup();
    mcBot.emit('chat', 'kustash01', 'ты где вообще');
    await new Promise(r => setTimeout(r, 10));
    // Location question is no longer answered with a hardcoded string —
    // it goes through the AI brain, which sees real coords in [ЧТО Я ВИЖУ].
    expect(aiBrain.processMessage).toHaveBeenCalled();
    const call = aiBrain.processMessage.mock.calls[0];
    expect(call[0]).toContain('ты где вообще');
  });

  it('routes "добудь дерево" to AI brain for function calling', async () => {
    const { mcBot, aiBrain } = createSetup();
    mcBot.emit('chat', 'kustash01', 'добудь дерево');
    await new Promise(r => setTimeout(r, 10));
    expect(aiBrain.processMessage).toHaveBeenCalled();
    const call = aiBrain.processMessage.mock.calls[0];
    expect(call[0]).toContain('добудь дерево');
  });

  it('routes "иди за мной" to AI brain for function calling', async () => {
    const { mcBot, aiBrain } = createSetup();
    mcBot.emit('chat', 'kustash01', 'иди за мной');
    await new Promise(r => setTimeout(r, 10));
    expect(aiBrain.processMessage).toHaveBeenCalled();
    const call = aiBrain.processMessage.mock.calls[0];
    expect(call[0]).toContain('иди за мной');
  });

  it('routes "добыл" to AI brain for natural response', async () => {
    const { mcBot, aiBrain } = createSetup();
    mcBot.emit('chat', 'kustash01', 'добыл');
    await new Promise(r => setTimeout(r, 10));
    expect(aiBrain.processMessage).toHaveBeenCalled();
  });

  it('stops immediately when ordered "стой" (action fires; reply is generated live, not a template)', async () => {
    const { mcBot } = createSetup();
    const stopSpy = mcBot.bot.pathfinder.stop;
    const clearSpy = mcBot.bot.clearControlStates;
    mcBot.emit('chat', 'kustash01', 'стой');
    await new Promise(r => setTimeout(r, 10));
    // The stop ACTION must be instant. The chat acknowledgement is no longer a
    // hardcoded 'Стою' — it comes from the humanController (absent here, so no
    // chat is expected). What matters is that movement halts immediately.
    expect(stopSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
  });
});
