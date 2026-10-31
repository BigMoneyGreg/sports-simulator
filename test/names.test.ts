import { FOOTBALL } from '../src/core/format';
import { describe, expect, it } from 'vitest';
import { newCareer } from '../src/core/career';
import { band } from '../src/core/league';
import { rating } from '../src/core/club';
import { Rng } from '../src/core/rng';
import { SPORT_IDS } from '../src/core/format';
import { SPORTS } from '../src/sports';
import { FAMOUS_PLAYERS } from '../src/sports/famous';
import { BORROWS_FROM, COUNTRY_NAMES } from '../src/sports/football/data/commonNames';
import { NAME_POOLS } from '../src/sports/football/data/names';
import { LOCATIONS, NATIONS, RIVALS, WORLD_ORDER } from '../src/sports/football/data/nations';
import { footballSport } from '../src/sports/football';
import { namesOf, nation, naturalTier, playerNamer, shortName, surname } from '../src/sports/football/names';

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
    expect(FOOTBALL.startingPots[FOOTBALL.startingPots.length - 1]).toBe(100);
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
      const c = newCareer({ rating: 50, seed, team: 'KEN' }, footballSport);
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
      const c = newCareer({ rating: 50, seed, team: 'KEN' }, footballSport);
      tiers.add(tierOf(c, c.clubs.find((x) => x.short === WORLD_ORDER[18])!.id));
    }
    expect([...tiers].sort()).toEqual([1, 2]);
  });

  it('puts the player in the league of their rating and uses every rating once', () => {
    const c = newCareer({ rating: 10, seed: 3, team: 'ENG' }, footballSport);
    expect(c.clubs[0].name).toBe('England');
    expect(tierOf(c, 0)).toBe(5);
    expect(rating(c.clubs[0])).toBeGreaterThanOrEqual(band(FOOTBALL, 5).min);
    expect(new Set(c.clubs.map((x) => Math.round(rating(x)))).size).toBe(100);
    expect(c.clubs.filter((x) => x.short === 'ENG')).toHaveLength(1);
  });

  it('makes room for a nation from outside the world', () => {
    const c = newCareer({ rating: 5, seed: 3, team: 'FIJ' }, footballSport);
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
    const c = newCareer({ rating: 50, seed: 1, team: 'JPN' }, footballSport);
    for (const club of c.clubs) {
      expect(club.squad).toHaveLength(18);
      const available = new Set(namesOf(club.short).last).size;
      expect(new Set(club.squad.map((p) => surname(p.name))).size, club.name).toBeGreaterThanOrEqual(Math.min(18, available) - 1);
    }
    for (const p of c.clubs[0].squad) expect(namesOf('JPN').last).toContain(surname(p.name));
  });

  it('draws every name from the country\'s own list, with no other country\'s names mixed in', () => {
    const rng = new Rng(4);
    for (const code of ['ENG', 'FRA', 'NGA', 'SRI']) {
      const name = playerNamer(code);
      const own = [...namesOf(code).last, ...(namesOf(code).borrowed ?? [])];
      for (let i = 0; i < 200; i++) expect(own, code).toContain(surname(name(rng)));
    }
    expect(namesOf('ENG').last).not.toContain('Eze');
  });

  it('gives every nation in every world its own list of common names', () => {
    for (const id of SPORT_IDS) {
      for (const n of SPORTS[id].nations().filter((x) => id !== 'football' || WORLD_ORDER.includes(x.short))) {
        const own = COUNTRY_NAMES[n.short];
        expect(own, `${id} ${n.name}`).toBeDefined();
        expect(own[0].split(' ').length, n.name).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('has no list for a nation that does not exist, and no name twice on a list', () => {
    for (const [code, [last, first]] of Object.entries(COUNTRY_NAMES)) {
      expect(nation(code).code).toBe(code);
      for (const list of [last, first ?? ''].filter(Boolean).map((x) => x.split(' '))) expect(new Set(list).size, code).toBe(list.length);
    }
  });

  it('borrows surnames only from neighbours that exist, and only now and then', () => {
    for (const [code, near] of Object.entries(BORROWS_FROM)) {
      expect(COUNTRY_NAMES[code], code).toBeDefined();
      for (const other of near) expect(COUNTRY_NAMES[other], `${code} from ${other}`).toBeDefined();
    }
    const rng = new Rng(8);
    const name = playerNamer('ENG');
    const own = namesOf('ENG').last;
    let borrowed = 0;
    for (let i = 0; i < 2000; i++) if (!own.includes(surname(name(rng)))) borrowed++;
    expect(borrowed / 2000).toBeGreaterThan(0.05);
    expect(borrowed / 2000).toBeLessThan(0.25);
    expect(namesOf('ENG').borrowed).toContain('Campbell');
  });

  it('keeps surnames of two words whole', () => {
    expect(namesOf('NED').last).toContain('De Jong');
    expect(surname('Jan De Jong')).toBe('De Jong');
  });

  it('never gives two players in a squad the same whole name', () => {
    for (const id of SPORT_IDS) {
      const sport = SPORTS[id];
      const rng = new Rng(9);
      for (const n of sport.nations().slice(0, 30)) {
        const squad = sport.generateSquad(rng, 0, { name: n.name, short: n.short, colours: n.colours });
        expect(new Set(squad.map((p) => p.name)).size, n.name).toBe(squad.length);
      }
    }
  });

  it('never names a real star in any sport, even from a nation they could come from', () => {
    const rng = new Rng(11);
    for (const code of ['COL', 'URU', 'GER', 'ENG', 'POR', 'BRA', 'IND', 'NZL']) {
      const name = playerNamer(code);
      for (let i = 0; i < 3000; i++) expect(FAMOUS_PLAYERS.has(name(rng))).toBe(false);
    }
  });
});
