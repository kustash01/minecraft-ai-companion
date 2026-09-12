import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeathHandler } from '../../../src/safety/death-handler.js';

describe('DeathHandler Deduplication Tests', () => {
  it('stores player death without forcing an automatic chat announcement', () => {
    const samChat = vi.fn();
    const maxChat = vi.fn();
    const jackChat = vi.fn();

    const samDeathHandler = new DeathHandler({ chat: samChat }, null, { bot: { owner: 'kustash01' } });
    const maxDeathHandler = new DeathHandler({ chat: maxChat }, null, { bot: { owner: 'kustash01' } });
    const jackDeathHandler = new DeathHandler({ chat: jackChat }, null, { bot: { owner: 'kustash01' } });

    const pos = { x: 120, y: 64, z: -300 };

    // All 3 bots observe the death simultaneously
    samDeathHandler.handlePlayerDeath('kustash01', pos);
    maxDeathHandler.handlePlayerDeath('kustash01', pos);
    jackDeathHandler.handlePlayerDeath('kustash01', pos);

    // Death is a fact for memory and later conversation, not a canned broadcast.
    const totalChats = samChat.mock.calls.length + maxChat.mock.calls.length + jackChat.mock.calls.length;
    expect(totalChats).toBe(0);
    expect(samChat).toHaveBeenCalledTimes(0);
    expect(maxChat).toHaveBeenCalledTimes(0);
    expect(jackChat).toHaveBeenCalledTimes(0);
  });
});
