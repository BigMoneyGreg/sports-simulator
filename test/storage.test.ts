import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SavedGame } from '../src/extension/game';
import { Storage } from '../src/extension/storage';

function memento(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  return {
    values,
    keys: () => Object.keys(values),
    get: <T>(key: string, fallback?: T) => (key in values ? (values[key] as T) : fallback),
    update: (key: string, value: unknown) => {
      if (value === undefined) delete values[key];
      else values[key] = value;
      return Promise.resolve();
    },
  };
}

const save = (n: number) => ({ version: 7, career: { n }, live: null, paused: false }) as unknown as SavedGame;

describe('storage', () => {
  it('saves to a file, loads it back, and removes it on reset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    expect(s.load()).toBeNull();
    s.save(save(1));
    expect(new Storage(dir, memento()).load()).toEqual(save(1));
    s.save(null);
    expect(s.load()).toBeNull();
    // No temporary files left behind.
    expect(readdirSync(dir)).toEqual([]);
  });

  it('carries a save over from global state, then clears it there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const m = memento({ 'sportsSimulator.career': JSON.stringify(save(2)) });
    const s = new Storage(dir, m);
    expect(s.load()).toEqual(save(2));
    s.save(save(3));
    expect(m.values['sportsSimulator.career']).toBeUndefined();
    expect(s.load()).toEqual(save(3));
  });

  it('backs up a save it can\'t read, under its version, and clears it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    s.save(save(4));
    s.backup({ ...save(4), version: 5 });
    expect(s.load()).toBeNull();
    expect(readdirSync(dir)).toEqual(['career.v5.json']);
  });

  it('reads a missing or broken lock as nobody running the game', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    expect(s.read()).toEqual({ owner: null });
    s.write({ owner: 'a', ready: true });
    expect(s.read()).toEqual({ owner: 'a', ready: true });
  });

  it('shares the running window\'s status text and tells other windows when the save changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    expect(s.readLive()).toBeNull();
    expect(s.savedAt()).toBe(0);
    s.writeLive({ at: 5, text: "⚽ SCO 1–0 ENG 30'", tooltip: 'Scotland', description: "3rd · SCO 1–0 ENG 30'" });
    expect(new Storage(dir, memento()).readLive()).toMatchObject({ text: "⚽ SCO 1–0 ENG 30'" });
    s.save(save(5));
    expect(s.savedAt()).toBeGreaterThan(0);
  });
});
