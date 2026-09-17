import { describe, it, expect } from 'vitest';
import { CommitmentMemory } from '../../../src/memory/commitment-memory.js';

// In-memory fake of LongTermMemory's facts store (setFact/getFact/getAllFacts).
function fakeMemoryManager() {
  const facts = new Map();
  return {
    longTerm: {
      setFact(key, value, category = 'general') {
        facts.set(key, { key, value: typeof value === 'object' ? JSON.stringify(value) : String(value), category });
      },
      getFact(key) {
        const row = facts.get(key);
        return row ? row.value : null;
      },
      getAllFacts() {
        return [...facts.values()];
      },
    },
  };
}

describe('CommitmentMemory', () => {
  it('remembers a promise and lists it as open', () => {
    const cm = new CommitmentMemory(fakeMemoryManager());
    const rec = cm.remember('набрать камня', { requestedBy: 'kustash01' });
    expect(rec).toBeTruthy();
    expect(rec.done).toBe(false);
    const open = cm.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0].text).toBe('набрать камня');
    expect(open[0].requestedBy).toBe('kustash01');
  });

  it('resolves a promise so it drops out of the open list', () => {
    const cm = new CommitmentMemory(fakeMemoryManager());
    const rec = cm.remember('построить забор');
    expect(cm.listOpen()).toHaveLength(1);
    const ok = cm.resolve(rec.id);
    expect(ok).toBe(true);
    expect(cm.listOpen()).toHaveLength(0);
  });

  it('builds prompt context and marks old promises as hazy', () => {
    const cm = new CommitmentMemory(fakeMemoryManager());
    const fresh = cm.remember('свежая просьба');
    const old = cm.remember('старая просьба');
    // Force the old one to be well in the past.
    old.createdAt = Date.now() - 30 * 60000;
    cm.lt.setFact(`commitment:${old.id}`, old, 'commitment');

    const ctx = cm.getContextForPrompt();
    expect(ctx).toContain('свежая просьба');
    expect(ctx).toContain('старая просьба');
    expect(ctx).toContain('смутно'); // hazy marker on the old one
  });

  it('returns null context when there are no open promises', () => {
    const cm = new CommitmentMemory(fakeMemoryManager());
    expect(cm.getContextForPrompt()).toBeNull();
  });

  it('degrades gracefully without a storage backend', () => {
    const cm = new CommitmentMemory({}); // no longTerm
    expect(cm.remember('что-то')).toBeNull();
    expect(cm.listOpen()).toEqual([]);
    expect(cm.getContextForPrompt()).toBeNull();
  });
});
