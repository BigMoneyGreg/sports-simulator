import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('keeps one career per sport, and football in the file it always used', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    expect(s.activeSport()).toBe('football');
    s.save(save(1));
    s.setActiveSport('rugby');
    expect(s.load()).toBeNull();
    s.save(save(2));
    s.setActiveSport('cricket');
    s.save(save(3));
    expect(readdirSync(dir).sort()).toEqual(['career.cricket.json', 'career.json', 'career.rugby.json', 'sport.json']);
    expect(s.load('football')).toEqual(save(1));
    expect(s.load('rugby')).toEqual(save(2));
    expect(s.load()).toEqual(save(3));
    // A fresh window picks up the same sport.
    expect(new Storage(dir, memento()).activeSport()).toBe('cricket');
    // Resetting one leaves the others.
    s.save(null);
    expect(s.load('football')).toEqual(save(1));
    expect(s.load('rugby')).toEqual(save(2));
  });

  it('saves each sport to its own file, whichever is active', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    s.save(save(1), 'football');
    s.save(save(2), 'rugby');
    s.setActiveSport('cricket');
    s.save(save(3), 'football');
    expect(s.load('football')).toEqual(save(3));
    expect(s.load('rugby')).toEqual(save(2));
    expect(s.load('cricket')).toBeNull();
    s.save(null, 'rugby');
    expect(s.load('rugby')).toBeNull();
    expect(s.load('football')).toEqual(save(3));
    s.backup({ ...save(3), version: 5 }, 'football');
    expect(s.load('football')).toBeNull();
    expect(readdirSync(dir)).toContain('career.v5.json');
  });

  it('resets honours and past careers, noting where running careers count from', () => {
    const s = new Storage(mkdtempSync(join(tmpdir(), 'ss-storage-')), memento({ 'sportsSimulator.archive': [{ club: 'Scotland', sport: 'football' }] }));
    s.addFeats([{ id: 'twoWorld', at: 'now', detail: 'x' }]);
    s.resetHonours({ rugby: 4 });
    expect(s.feats()).toEqual([]);
    expect(s.archives()).toEqual([]);
    expect(s.honoursFrom('rugby')).toBe(4);
    expect(s.honoursFrom('cricket')).toBeUndefined();
    s.clearHonoursFrom('rugby');
    expect(s.honoursFrom('rugby')).toBeUndefined();
  });

  it('sets a damaged save aside instead of losing it, and says so', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const damaged: string[] = [];
    const s = new Storage(dir, memento(), { damagedSave: (sport, kept) => damaged.push(`${sport} ${kept}`) });
    writeFileSync(join(dir, 'career.rugby.json'), '{"version":8,"career"');
    expect(s.load('rugby')).toBeNull();
    expect(damaged).toEqual([expect.stringMatching(/^rugby career\.rugby\.damaged-\d+\.json$/)]);
    expect(readdirSync(dir)).not.toContain('career.rugby.json');
    expect(readFileSync(join(dir, damaged[0].split(' ')[1]), 'utf8')).toBe('{"version":8,"career"');
    // Deleting "no career" afterwards can't touch it.
    s.save(null, 'rugby');
    expect(readdirSync(dir).filter((f) => f.includes('damaged'))).toHaveLength(1);
  });

  it('saves over a file another window has open, or reports that it could not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const s = new Storage(dir, memento());
    s.save(save(1), 'football');
    const held = openSync(join(dir, 'career.json'), 'r');
    expect(() => s.save(save(2), 'football')).not.toThrow();
    closeSync(held);
    s.save(save(3), 'football');
    expect(s.load('football')).toEqual(save(3));
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('never throws when the disk fails, and reports it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    const failed: unknown[] = [];
    const s = new Storage(dir, memento(), { writeFailed: (e) => failed.push(e) });
    rmSync(dir, { recursive: true });
    expect(() => s.save(save(1), 'football')).not.toThrow();
    expect(() => s.writeLive({ at: 1, text: 'x', tooltip: 'y' })).not.toThrow();
    expect(failed.length).toBe(2);
  });

  it('falls back to football if the sport file is damaged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-storage-'));
    writeFileSync(join(dir, 'sport.json'), 'nonsense');
    expect(new Storage(dir, memento()).activeSport()).toBe('football');
  });
});
