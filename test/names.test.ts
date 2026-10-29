import { BADGE_MAIN, BADGE_SECOND, badgeAllowed } from '../src/shared/view';
import { describe, expect, it } from 'vitest';
import { newCareer } from '../src/core/career';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';
import { CURATED_CLUBS, SPARE_TOWNS } from '../src/sports/football/data/clubs';
import { clubIdentities, displayName, editDistance, isBlocked, playerNamer, shortCode, suggestClubName, surname, townName } from '../src/sports/football/names';

describe('club names', () => {
  it('has 100 curated clubs with unique names and codes', () => {
    expect(CURATED_CLUBS).toHaveLength(100);
    expect(new Set(CURATED_CLUBS.map((c) => c.town)).size).toBe(100);
    expect(new Set(CURATED_CLUBS.map((c) => c.short)).size).toBe(100);
    for (const c of CURATED_CLUBS) expect(c.short).toMatch(/^[A-Z]{3}$/);
  });

  it('never ships a curated or spare name that hits the real-club blocklist', () => {
    for (const c of CURATED_CLUBS) expect(isBlocked(displayName(c.town, c.suffix)), c.town).toBe(false);
    for (const t of SPARE_TOWNS) expect(isBlocked(`${t} United`), t).toBe(false);
  });

  it('blocks real clubs and close imitations of famous ones', () => {
    for (const name of ['Manchester United', 'Liverpool Town', 'Manchester FC', 'Arsenal', 'Brentford', 'Brenford City', 'Tadcaster Albion', 'AFC Wimbledon', 'Hearts', 'Bayern Rovers']) {
      expect(isBlocked(name), name).toBe(true);
    }
  });

  it('suggests fresh names for the player club', () => {
    const rng = new Rng(3);
    const taken = CURATED_CLUBS.map((c) => displayName(c.town, c.suffix));
    for (let i = 0; i < 50; i++) {
      const name = suggestClubName(rng, taken);
      expect(isBlocked(name)).toBe(false);
      expect(taken).not.toContain(name);
    }
  });

  it('builds a world of 100 identities with the player club first', () => {
    const ids = clubIdentities(new Rng(1), 100);
    expect(ids).toHaveLength(100);
    expect(new Set(ids.map((c) => c.name)).size).toBe(100);
    expect(new Set(ids.map((c) => c.short)).size).toBe(100);
    expect(CURATED_CLUBS.map((c) => displayName(c.town, c.suffix))).not.toContain(ids[0].name);
  });

  it('formats AFC as a prefix and makes unique short codes', () => {
    expect(displayName('Warkstow', 'AFC')).toBe('AFC Warkstow');
    expect(shortCode('AFC Warkstow', new Set())).toBe('WAR');
    expect(shortCode('Warkstow Town', new Set(['WAR']))).toBe('WAK');
  });

  it('measures edit distance', () => {
    expect(editDistance('brenford', 'brentford')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('player names', () => {
  it('gives every squad distinct surnames', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 1 }, footballSport);
    for (const club of c.clubs) {
      expect(club.squad).toHaveLength(18);
      expect(new Set(club.squad.map((p) => surname(p.name))).size).toBe(18);
    }
  });

  it('takes the last word as the surname, keeping particles', () => {
    expect(surname('Daan De Vries')).toBe('De Vries');
    expect(surname('Jack Okafor')).toBe('Okafor');
    expect(playerNamer()(new Rng(1))).toMatch(/^\S+ .+$/);
  });
});

describe('player club naming', () => {
  it('derives the short code from a typed club name', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 1, clubName: 'Wexstead Rovers' }, footballSport);
    expect(c.clubs[0].name).toBe('Wexstead Rovers');
    expect(c.clubs[0].short).toMatch(/^W/);
    expect(new Set(c.clubs.map((x) => x.short)).size).toBe(100);
  });

  it('uses the badge colours picked at setup', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 1, clubColours: ['#7a263a', '#6cabdd'] }, footballSport);
    expect(c.clubs[0].colours).toEqual(['#7a263a', '#6cabdd']);
  });

  it('every main colour has a second colour that works, and clashes are refused', () => {
    for (const [main] of BADGE_MAIN) expect(BADGE_SECOND.some(([second]) => badgeAllowed(main, second))).toBe(true);
    expect(badgeAllowed('#c8102e', '#c8102e')).toBe(false);
    expect(badgeAllowed('#123456', '#ffffff')).toBe(false);
  });

  it('strips the suffix for the narrow table', () => {
    expect(townName('Wexstead Rovers')).toBe('Wexstead');
    expect(townName('AFC Holtbury')).toBe('Holtbury');
    expect(townName('Ashminster')).toBe('Ashminster');
  });
});
