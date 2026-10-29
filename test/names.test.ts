import { describe, expect, it } from 'vitest';
import { newCareer } from '../src/core/career';
import { band, STARTING_POTS } from '../src/core/league';
import { rating } from '../src/core/club';
import { Rng } from '../src/core/rng';
import { NAME_POOLS } from '../src/sports/football/data/names';
import { LOCATIONS, NATIONS, RIVALS, WORLD_ORDER } from '../src/sports/football/data/nations';
import { footballSport } from '../src/sports/football';
import { naturalTier, playerNamer, shortName, surname } from '../src/sports/football/names';

describe('nations', () => {
  it('has unique codes and names, with two or three flag colours each', () => {
    expect(new Set(NATIONS.map((n) => n.code)).size).toBe(NATIONS.length);
    expect(new Set(NATIONS.map((n) => n.name)).size).toBe(NATIONS.length);
    for (const n of NATIONS) {
      expect(n.code, n.name).toMatch(/^[A-Z]{3}$/);
      expect(n.colours.length, n.name).toBeGreaterThanOrEqual(2);
      expect(n.colours.length, n.name).toBeLessThanOrEqual(3);
      for (const c of n.colours) expect(c, n.name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('gives every nation one rival, another real nation', () => {
    const codes = new Set(NATIONS.map((n) => n.code));
    for (const n of NATIONS) {
      expect(codes.has(RIVALS[n.code]), n.name).toBe(true);
      expect(RIVALS[n.code], n.name).not.toBe(n.code);
    }
    expect(Object.keys(RIVALS)).toHaveLength(NATIONS.length);
  });

  it('places every nation on the map', () => {
    for (const n of NATIONS) expect(LOCATIONS[n.code], n.name).toHaveLength(2);
    expect(Object.keys(LOCATIONS)).toHaveLength(NATIONS.length);
  });

  it('never tints the header black or white', () => {
    for (const n of NATIONS) expect(['#000000', '#ffffff'], n.name).not.toContain(n.colours[0]);
  });

  it('orders 100 distinct known nations for the world', () => {
    expect(WORLD_ORDER).toHaveLength(100);
    expect(new Set(WORLD_ORDER).size).toBe(100);
    const codes = new Set(NATIONS.map((n) => n.code));
    for (const c of WORLD_ORDER) expect(codes.has(c), c).toBe(true);
    expect(STARTING_POTS[STARTING_POTS.length - 1]).toBe(100);
  });

  it('starts a nation in its usual league, or the bottom one from outside the world', () => {
    expect(naturalTier('ESP', 20, 5)).toBe(1);
    expect(naturalTier('SCO', 20, 5)).toBe(2);
    expect(naturalTier('SMR', 20, 5)).toBe(5);
    expect(naturalTier('KEN', 20, 5)).toBe(5);
  });

  it('uses the short name in tight spaces', () => {
    expect(shortName({ name: 'Bosnia and Herzegovina', shortName: 'Bosnia' })).toBe('Bosnia');
    expect(shortName({ name: 'Brazil' })).toBe('Brazil');
  });
});

describe('the starting world', () => {
  const tierOf = (c: ReturnType<typeof newCareer>, id: number) => c.season.leagues.find((l) => l.clubIds.includes(id))!.tier;

  it('keeps each pot within its ratings, shuffled from career to career', () => {
    const tops = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const c = newCareer({ rating: 50, difficulty: 'medium', seed, team: 'KEN' }, footballSport);
      const byName = new Map(c.clubs.map((x) => [x.short, x]));
      for (const code of WORLD_ORDER.slice(0, 8)) expect(rating(byName.get(code)!)).toBeGreaterThanOrEqual(91);
      for (const code of WORLD_ORDER.slice(0, 16)) expect(tierOf(c, byName.get(code)!.id)).toBe(1);
      for (const code of WORLD_ORDER.slice(24, 36)) expect(tierOf(c, byName.get(code)!.id)).toBe(2);
      tops.add(c.clubs.reduce((a, b) => (rating(b) > rating(a) ? b : a)).short);
    }
    expect(tops.size).toBeGreaterThan(2);
  });

  it('lets a swing pot start on either side of the league line', () => {
    const tiers = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const c = newCareer({ rating: 50, difficulty: 'medium', seed, team: 'KEN' }, footballSport);
      tiers.add(tierOf(c, c.clubs.find((x) => x.short === WORLD_ORDER[18])!.id));
    }
    expect([...tiers].sort()).toEqual([1, 2]);
  });

  it('puts the player in the league of their rating and uses every rating once', () => {
    const c = newCareer({ rating: 10, difficulty: 'medium', seed: 3, team: 'ENG' }, footballSport);
    expect(c.clubs[0].name).toBe('England');
    expect(tierOf(c, 0)).toBe(5);
    expect(rating(c.clubs[0])).toBeGreaterThanOrEqual(band(5).min);
    expect(new Set(c.clubs.map((x) => Math.round(rating(x)))).size).toBe(100);
    expect(c.clubs.filter((x) => x.short === 'ENG')).toHaveLength(1);
  });

  it('makes room for a nation from outside the world', () => {
    const c = newCareer({ rating: 5, difficulty: 'medium', seed: 3, team: 'FIJ' }, footballSport);
    expect(c.clubs[0].short).toBe('FIJ');
    expect(c.clubs.map((x) => x.short)).not.toContain(WORLD_ORDER[99]);
  });
});

describe('player names', () => {
  it('has no empty or duplicated names in a pool', () => {
    for (const [key, pool] of Object.entries(NAME_POOLS)) {
      for (const list of [pool.first, pool.last]) {
        expect(list.every((n) => n.length > 1), key).toBe(true);
        expect(new Set(list).size, key).toBe(list.length);
      }
    }
  });

  it('gives every squad distinct surnames from its own country while the pool lasts', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 1, team: 'JPN' }, footballSport);
    for (const club of c.clubs) {
      expect(club.squad).toHaveLength(18);
      const available = new Set([NATIONS.find((n) => n.code === club.short)!.names].flat().flatMap((k) => NAME_POOLS[k].last)).size;
      expect(new Set(club.squad.map((p) => surname(p.name))).size, club.name).toBeGreaterThanOrEqual(Math.min(18, available) - 1);
    }
    for (const p of c.clubs[0].squad) expect(NAME_POOLS.japanese.last).toContain(surname(p.name));
  });

  it('mixes in the second pool for nations that have one', () => {
    const name = playerNamer('FRA');
    const rng = new Rng(2);
    const surnames = Array.from({ length: 200 }, () => surname(name(rng)));
    expect(surnames.some((s) => NAME_POOLS.westafricanFr.last.includes(s))).toBe(true);
    expect(surnames.some((s) => NAME_POOLS.french.last.includes(s))).toBe(true);
  });
});
