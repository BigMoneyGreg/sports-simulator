import { describe, expect, it } from 'vitest';
import { allocatePoints, focusAllocation, newCareer, playSeason, type Career } from '../src/core/career';
import { rating } from '../src/core/club';
import { FORMATS, SPORT_IDS } from '../src/core/format';
import { ladder } from '../src/core/league';
import { climb, driftLevel, RATING_TUNING } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { SPORTS } from '../src/sports';

const seasons = (c: Career, count: number, each: (c: Career) => void = () => {}) => {
  const sport = SPORTS[c.sport];
  for (let i = 0; i < count; i++) {
    const before = c.clubs.map(rating);
    const end = playSeason(c, sport);
    allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, 'attack'));
    c.worldEnd = null;
    c.clubs.forEach((club, id) => {
      if (!club.isPlayer) club.base = club.base ?? before[id];
    });
    each(c);
  }
};

describe('the world ladder', () => {
  it.each(SPORT_IDS)('%s: runs from 99 down, always falling, wider at the top than the bottom', (id) => {
    const slots = ladder(FORMATS[id]);
    expect(slots).toHaveLength(FORMATS[id].leagues * FORMATS[id].leagueSize);
    expect(slots[0]).toBe(99);
    expect(slots[slots.length - 1]).toBeLessThanOrEqual(2);
    slots.forEach((r, i) => i && expect(r).toBeLessThan(slots[i - 1]));
    const third = Math.floor(slots.length / 3);
    expect(slots[0] - slots[third]).toBeGreaterThan(slots[slots.length - third - 1] - slots[slots.length - 1]);
  });

  it('smooths rugby\'s top: no cliff between the first few', () => {
    const slots = ladder(FORMATS.rugby);
    for (let i = 1; i < 6; i++) expect(slots[i - 1] - slots[i]).toBe(3);
  });

  it('shuffles who gets each slot within a pool from career to career', () => {
    const tops = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const c = newCareer({ rating: 10, seed, team: 'AUT' }, SPORTS.rugby);
      tops.add(c.clubs.reduce((a, b) => (rating(b) > rating(a) ? b : a)).short);
    }
    expect(tops.size).toBeGreaterThanOrEqual(4);
  });
});

describe('a nation over the years', () => {
  it('keeps the curve\'s shape for decades, rather than fading', () => {
    const c = newCareer({ rating: 50, seed: 11 }, SPORTS.rugby);
    seasons(c, 15);
    const ai = c.clubs.filter((x) => !x.isPlayer).map(rating).sort((a, b) => b - a);
    expect(ai[0]).toBeGreaterThan(90);
    expect(ai[0] - ai[12]).toBeGreaterThan(20);
    expect(ai[35] - ai[46]).toBeLessThan(25);
  });

  it('never lets an AI team move more than the swing in one summer, before the world is rebalanced', () => {
    const c = newCareer({ rating: 50, seed: 12 }, SPORTS.rugby);
    let biggest = 0;
    let before = c.clubs.map(rating);
    seasons(c, 8, (x) => {
      x.clubs.forEach((club, id) => {
        if (!club.isPlayer) biggest = Math.max(biggest, Math.abs(rating(club) - before[id]));
      });
      before = x.clubs.map(rating);
    });
    // The rebalancing and the league pull can add a little on top.
    expect(biggest).toBeLessThan(RATING_TUNING.maxSwing + 6);
  });

  it('now and then gives a nation a golden generation or a bad spell that moves its level for years', () => {
    const rng = new Rng(5);
    let eras = 0;
    let ups = 0;
    for (let n = 0; n < 400; n++) {
      const club = { attack: 50, defence: 50, level: 50, base: 50 } as Parameters<typeof driftLevel>[0];
      for (let y = 0; y < 10; y++) driftLevel(club, rng);
      if (club.era || Math.abs(club.level! - 50) > 8) {
        eras++;
        if (club.level! > 50) ups++;
      }
    }
    expect(eras).toBeGreaterThan(40);
    expect(ups).toBeGreaterThan(10);
    expect(eras - ups).toBeGreaterThan(10);
  });

  it('gives an old save\'s teams a level from where they stand', () => {
    const c = newCareer({ rating: 50, seed: 13 }, SPORTS.rugby);
    for (const club of c.clubs) {
      delete club.level;
      delete club.base;
    }
    seasons(c, 2);
    expect(c.clubs.filter((x) => !x.isPlayer).every((x) => x.level !== undefined && x.base !== undefined)).toBe(true);
  });
});

describe('the player closing on the elite', () => {
  it('keeps less of a rise the higher they are', () => {
    expect(climb(40)).toBe(1);
    expect(climb(60)).toBe(1);
    expect(climb(80)).toBeLessThan(0.6);
    expect(climb(95)).toBeCloseTo(RATING_TUNING.climbFloor);
    expect(climb(200)).toBe(RATING_TUNING.climbFloor);
  });
});

describe('who leaves in the summer', () => {
  it('a team hangs on to its top scorer more than to anyone else', () => {
    let stayed = 0;
    let topLeft = 0;
    let anyLeft = 0;
    let anyone = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const c = newCareer({ rating: 50, seed }, SPORTS.football);
      const end = playSeason(c, SPORTS.football);
      for (const change of end.turnover) {
        const club = c.clubs[change.clubId];
        const top = [...club.squad].sort((a, b) => (c.season.scorers[b.id] ?? 0) - (c.season.scorers[a.id] ?? 0))[0];
        if (change.out.includes(top.id)) topLeft++;
        else stayed++;
        anyLeft += change.out.length;
        anyone += club.squad.length;
      }
    }
    expect(topLeft / (topLeft + stayed)).toBeLessThan((anyLeft / anyone) * 0.6);
  }, 30_000);
});
