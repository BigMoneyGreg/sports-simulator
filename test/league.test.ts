import { describe, expect, it } from 'vitest';
import {
  allocatePoints,
  completeRound,
  chooseFocus,
  fillAllocation,
  focusAllocation,
  isSeasonOver,
  newCareer,
  nextRound,
  playRound,
  playSeason,
  type Career,
} from '../src/core/career';
import { MAX_STAT, MIN_STAT, rating, shiftRating, statsFor, STYLE_TUNING, type Club } from '../src/core/club';
import { band, doubleRoundRobin, emptyTable, goalRanks, recordResult, sortTable, startRating, styleSplit, zone } from '../src/core/league';
import { applyDecline, normalise, plateau, positionBonus, RATING_TUNING, seasonGain, totalRating } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';

const evenSplit = (career: Career) =>
  fillAllocation(career.clubs[career.playerClubId], career.pending!.points, { attack: 1, defence: 1 });

describe('fixtures', () => {
  const ids = Array.from({ length: 20 }, (_, i) => i);
  const rounds = doubleRoundRobin(ids, new Rng(1));

  it('has 38 rounds of 10 matches, each club once per round', () => {
    expect(rounds).toHaveLength(38);
    for (const r of rounds) {
      expect(r).toHaveLength(10);
      expect(new Set(r.flat()).size).toBe(20);
    }
  });

  it('pairs every club with every other once at home and once away', () => {
    const seen = new Set<string>();
    for (const r of rounds) for (const [h, a] of r) seen.add(`${h}-${a}`);
    expect(seen.size).toBe(20 * 19);
  });

  it('avoids long runs of home or away games', () => {
    for (const id of ids) {
      const venues = rounds.map((r) => (r.some(([h]) => h === id) ? 'H' : 'A')).join('');
      expect(venues).not.toMatch(/HHH|AAA/);
      expect(venues.split('H').length - 1).toBe(19);
    }
  });
});

describe('table', () => {
  it('ranks by points, then goal difference, then goals scored', () => {
    const t = emptyTable([1, 2, 3]);
    recordResult(t, 1, 2, { homeGoals: 1, awayGoals: 0, goals: [] });
    recordResult(t, 3, 2, { homeGoals: 3, awayGoals: 2, goals: [] });
    // 1 and 3 both on 3 points and +1; 3 has scored more.
    expect(sortTable(t).map((r) => r.clubId)).toEqual([3, 1, 2]);
    expect(t.find((r) => r.clubId === 2)!.form).toEqual(['L', 'L']);
  });

  it('marks promotion, play-off and relegation places', () => {
    expect(zone(1, 1)).toBe('champion');
    expect(zone(1, 2)).toBe(null);
    expect(zone(2, 2)).toBe('promotion');
    expect(zone(3, 6)).toBe('playoff');
    expect(zone(4, 18)).toBe('relegation');
    expect(zone(5, 20)).toBe(null);
  });

  it('has bands of 20 from League 1 (80–99) down to League 5 (0–19)', () => {
    expect(band(1)).toEqual({ min: 80, max: 99 });
    expect(band(5)).toEqual({ min: 0, max: 19 });
  });
});

describe('ratings', () => {
  it('reproduces the worked examples in the design', () => {
    expect(seasonGain(1, 1, 10, 99) - 10).toBe(-9);
    expect(seasonGain(1, 10, 12, 90) - 10).toBe(-2);
    expect(seasonGain(5, 11, 8, 9) - 10).toBe(3);
    expect(seasonGain(5, 20, 10, 0) - 10).toBe(10);
    expect(seasonGain(1, 1, 1, 99) - 10).toBe(0);
  });

  it('gives staggered top/bottom bonuses, with none at the very top or bottom', () => {
    expect([1, 2, 3, 4, 17, 18, 19, 20].map((p) => positionBonus(3, p))).toEqual([6, 4, 2, 0, 0, -2, -4, -6]);
    expect([1, 2, 3].map((p) => positionBonus(1, p))).toEqual([0, 0, 0]);
    expect([18, 19, 20].map((p) => positionBonus(5, p))).toEqual([0, 0, 0]);
    expect(positionBonus(1, 20)).toBe(-6);
    expect(positionBonus(5, 1)).toBe(6);
  });

  it('flattens AI rises near 99 but not falls', () => {
    expect(plateau(50)).toBe(1);
    expect(plateau(99)).toBeCloseTo(0.3);
    expect(seasonGain(1, 10, 1, 95) - 10).toBeLessThan(9);
    expect(seasonGain(1, 1, 10, 95) - 10).toBe(-9);
  });

  it('leaves the player’s rises unflattened', () => {
    expect(seasonGain(1, 10, 1, 95, 0, true) - 10).toBe(9);
  });

  it('gives the reigning League 1 champion the smaller boost, and the full one once the title is lost', () => {
    const c = newCareer({ rating: 99, difficulty: 'medium', seed: 3, team: 'BRA' }, footballSport);
    const boosts: [string | null, number][] = [];
    for (let season = 0; season < 8; season++) {
      playSeason(c, footballSport);
      boosts.push([c.history.at(-1)?.outcome ?? null, c.pending!.boost]);
      allocatePoints(c, evenSplit(c));
    }
    for (const [before, boost] of boosts) expect(boost).toBe(before === 'champion' ? RATING_TUNING.championBoost.medium : RATING_TUNING.difficultyBoost.medium);
    expect(boosts.some(([before]) => before === 'champion')).toBe(true);
  });

  it('keeps stats within the bounds and passes the excess to other stats', () => {
    const club = { attack: MAX_STAT - 2, defence: 50 } as Club;
    const applied = shiftRating(club, 3);
    expect(club.attack).toBe(MAX_STAT);
    expect(applied).toBeCloseTo(3);
    expect(club.defence).toBeCloseTo(54);
    const low = { attack: MIN_STAT + 1, defence: 0 } as Club;
    shiftRating(low, -2);
    expect(low.attack).toBe(MIN_STAT);
    expect(low.defence).toBeCloseTo(-3);
  });

  it('gives styled clubs stats that still average the rating', () => {
    for (const r of [MIN_STAT, -10, 0, 50, 99, MAX_STAT - 3, MAX_STAT]) {
      for (const style of ['attacking', 'defensive', 'balanced'] as const) {
        const s = statsFor(r, style);
        expect((s.attack + s.defence) / 2).toBe(r);
        expect(Math.min(s.attack, s.defence)).toBeGreaterThanOrEqual(MIN_STAT);
        expect(Math.max(s.attack, s.defence)).toBeLessThanOrEqual(MAX_STAT);
      }
    }
  });

  it('normalises the AI back to the target total without touching the player', () => {
    const clubs = Array.from({ length: 10 }, (_, id) => ({ id, attack: 50, defence: 50, isPlayer: id === 0 }) as Club);
    clubs[0].attack = 80;
    clubs[3].attack = 70;
    normalise(clubs, 450);
    expect(totalRating(clubs.slice(1))).toBeCloseTo(450, 9);
    expect(clubs[0].attack).toBe(80);
  });
});

describe('career', () => {
  const start = (rating = 50, seed = 1, difficulty: 'easy' | 'medium' | 'hard' = 'medium') =>
    newCareer({ rating, difficulty, seed }, footballSport);

  it('uses every rating from 0 to 99 exactly once at the start', () => {
    const c = start(85);
    const ratings = c.clubs.map((cl) => rating(cl)).sort((a, b) => a - b);
    expect(ratings).toEqual(Array.from({ length: 100 }, (_, i) => i));
    // The AI's own total, without the player.
    expect(c.totalRating).toBe(4950 - 85);
    expect(rating(c.clubs[c.playerClubId])).toBe(85);
  });

  it('places clubs into leagues by rating band', () => {
    const c = start(14);
    c.season.leagues.forEach((l) => {
      const { min, max } = band(l.tier);
      expect(l.clubIds).toHaveLength(20);
      for (const id of l.clubIds) {
        expect(rating(c.clubs[id])).toBeGreaterThanOrEqual(min);
        expect(rating(c.clubs[id])).toBeLessThanOrEqual(max);
      }
    });
    expect(c.season.leagues[4].clubIds).toContain(c.playerClubId);
    // 14 is the 6th-highest rating in League 5 (19, 18, 17, 16, 15 above it).
    expect(c.season.expected[c.playerClubId]).toBe(6);
  });

  it('accepts an uneven split that averages the rating, rejects one that does not', () => {
    const c = newCareer({ rating: 50, difficulty: 'hard', seed: 1, split: { attack: 60, defence: 40 } }, footballSport);
    expect(c.clubs[0].attack).toBe(60);
    expect(() => newCareer({ rating: 50, difficulty: 'hard', seed: 1, split: { attack: 60, defence: 50 } }, footballSport)).toThrow();
  });

  it('plays 38 league rounds with six cup rounds between them, then three play-off rounds, then waits', () => {
    const c = start();
    const sizes: Record<string, number[]> = {};
    while (nextRound(c)) {
      const kind = c.season.calendar[c.season.round].kind;
      (sizes[kind] ??= []).push(nextRound(c)!.length);
      playRound(c, footballSport);
    }
    expect(sizes.league).toEqual(Array(38).fill(50));
    expect(sizes.cup).toEqual([32, 16, 8, 4, 2, 1]);
    expect(sizes.playoff).toEqual([8, 8, 4]);
    expect(sizes.championship).toBeUndefined();
    for (const l of c.season.leagues) for (const row of l.table) expect(row.played).toBe(38);
    expect(isSeasonOver(c)).toBe(true);
    for (const p of c.season.playoffs) {
      const table = sortTable(c.season.leagues[p.tier - 1].table).map((r) => r.clubId);
      expect(table.slice(2, 6)).toContain(p.winner);
    }
  });

  it('moves 3 up and 3 down at every boundary, keeping 20 clubs per league', () => {
    const c = start();
    const end = playSeason(c, footballSport);
    expect(end.nextLeagues.map((l) => l.length)).toEqual([20, 20, 20, 20, 20]);
    expect(new Set(end.nextLeagues.flat()).size).toBe(100);
    for (const tier of [2, 3, 4, 5]) {
      expect(end.promoted[tier]).toHaveLength(3);
      for (const id of end.promoted[tier]) expect(end.nextLeagues[tier - 2]).toContain(id);
    }
    for (const tier of [1, 2, 3, 4]) {
      expect(end.relegated[tier]).toHaveLength(3);
      for (const id of end.relegated[tier]) expect(end.nextLeagues[tier]).toContain(id);
    }
  });

  it('actually plays next season with promoted and relegated clubs in their new leagues', () => {
    const c = start();
    for (let season = 0; season < 3; season++) {
      const end = playSeason(c, footballSport);
      allocatePoints(c, evenSplit(c));
      const tierOf = (id: number) => c.season.leagues.find((l) => l.clubIds.includes(id))!.tier;
      for (const tier of [2, 3, 4, 5]) for (const id of end.promoted[tier]) expect(tierOf(id)).toBe(tier - 1);
      for (const tier of [1, 2, 3, 4]) for (const id of end.relegated[tier]) expect(tierOf(id)).toBe(tier + 1);
      for (const l of c.season.leagues) expect(l.table.map((r) => r.clubId).sort()).toEqual([...l.clubIds].sort());
    }
  });

  it('keeps the AI total fixed across many seasons, whatever the player gains or loses', () => {
    const c = start(30, 7, 'easy');
    for (let season = 0; season < 6; season++) {
      playSeason(c, footballSport);
      // 10 a summer, more once the player is high up.
      expect(c.pending!.decline).toBeGreaterThanOrEqual(10 - 1e-9);
      const d = c.pending!.declineByStat;
      expect(d.attack + d.defence).toBeCloseTo(2 * c.pending!.decline);
      allocatePoints(c, evenSplit(c));
      expect(totalRating(c.clubs.filter((x) => !x.isPlayer))).toBeCloseTo(4950 - 30, 6);
      for (const club of c.clubs) {
        for (const s of ['attack', 'defence'] as const) {
          expect(club[s]).toBeGreaterThanOrEqual(MIN_STAT);
          expect(club[s]).toBeLessThanOrEqual(MAX_STAT);
        }
      }
    }
    expect(c.season.number).toBe(7);
    expect(c.history).toHaveLength(6);
  });

  it('gives the player points that match the gain rule', () => {
    const c = start(50, 3, 'hard');
    const before = rating(c.clubs[0]);
    const end = playSeason(c, footballSport);
    const expectedGain = 10 + end.performance + end.bonus + end.boost;
    expect(end.points).toBe(Math.max(0, Math.round(expectedGain * 2)));
    allocatePoints(c, evenSplit(c));
    // A negative gain comes off as extra decline instead of negative points.
    expect(rating(c.clubs[0])).toBeCloseTo(before - 10 + Math.round(expectedGain * 2) / 2, 6);
  });

  it('rejects allocations that do not spend exactly the points', () => {
    const c = start();
    playSeason(c, footballSport);
    const p = c.pending!.points;
    expect(() => allocatePoints(c, { attack: p + 1, defence: 0 })).toThrow();
    expect(() => allocatePoints(c, { attack: 0.5, defence: p - 0.5 })).toThrow();
  });

  it('is deterministic and survives a save/load round trip', () => {
    const a = start(40, 99);
    const b = start(40, 99);
    for (let i = 0; i < 10; i++) playRound(a, footballSport);
    const saved: Career = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 10; i++) playRound(b, footballSport);
    expect(saved).toEqual(JSON.parse(JSON.stringify(b)));
    playSeason(a, footballSport);
    playSeason(saved, footballSport);
    expect(saved.pending).toEqual(a.pending);
  });

  it('records the player club matches and a season history entry', () => {
    const c = start(60, 5);
    playSeason(c, footballSport);
    const league = c.season.playerMatches.filter((m) => m.kind === 'league');
    expect(league).toHaveLength(38);
    expect(league.filter((m) => m.home)).toHaveLength(19);
    allocatePoints(c, evenSplit(c));
    const h = c.history[0];
    expect(h.played).toBe(38);
    expect(h.won + h.drawn + h.lost).toBe(38);
    expect(h.points).toBe(h.won * 3 + h.drawn);
  });

  it('only accepts results for a round once', () => {
    const c = start();
    const fixtures = nextRound(c)!;
    completeRound(c, fixtures.map((fixture) => ({ fixture, outcome: { homeGoals: 1, awayGoals: 1, goals: [] } })));
    expect(c.season.round).toBe(1);
    expect(nextRound(c)).not.toBe(fixtures);
  });
});

describe('goal ranks', () => {
  it('ranks scoring from the most and conceding from the fewest, ties sharing a place', () => {
    const table = emptyTable([1, 2, 3, 4]);
    const set = (id: number, goalsFor: number, goalsAgainst: number) => Object.assign(table.find((r) => r.clubId === id)!, { goalsFor, goalsAgainst });
    set(1, 40, 30);
    set(2, 55, 50);
    set(3, 40, 20);
    set(4, 30, 45);
    expect(goalRanks(table, 1)).toEqual({ scored: 2, conceded: 2 });
    expect(goalRanks(table, 2)).toEqual({ scored: 1, conceded: 4 });
    expect(goalRanks(table, 3)).toEqual({ scored: 2, conceded: 1 });
  });
});

describe('allocation and decline', () => {
  it('fills an allocation without passing the cap and spends every point it can', () => {
    const club = { attack: MAX_STAT - 1.6, defence: 50 } as Club;
    const a = fillAllocation(club, 12, { attack: 1, defence: 0 });
    expect(a.attack).toBe(1);
    expect(a.attack + a.defence).toBe(12);
  });

  it('splits the decline at random, each side taking a quarter to three quarters, always totalling the amount', () => {
    const rng = new Rng(4);
    let spread = 0;
    for (let i = 0; i < 200; i++) {
      const club = { attack: 60, defence: 50 } as Club;
      const d = applyDecline(club, 10, rng);
      expect(d.attack + d.defence).toBeCloseTo(20);
      expect(Math.min(d.attack, d.defence)).toBeGreaterThanOrEqual(5 - 1e-9);
      spread += Math.abs(d.attack - d.defence);
    }
    expect(spread / 200).toBeGreaterThan(2);
  });
});

describe('summer focus', () => {
  it('puts most of the points into the side being rebuilt', () => {
    const club = { attack: 50, defence: 50 } as Club;
    expect(focusAllocation(club, 20, 'attack')).toEqual({ attack: 13, defence: 7 });
    expect(focusAllocation(club, 20, 'defence')).toEqual({ attack: 7, defence: 13 });
    const odd = focusAllocation(club, 31, 'attack');
    expect(odd.attack + odd.defence).toBe(31);
  });

  it('never pushes a stat past the cap', () => {
    const club = { attack: MAX_STAT - 4, defence: 60 } as Club;
    const a = focusAllocation(club, 30, 'attack');
    expect(a.attack).toBe(4);
    expect(a.defence).toBe(26);
  });

  it('applies the focus and starts the next season', () => {
    const c = newCareer({ rating: 40, difficulty: 'medium', seed: 12 }, footballSport);
    playSeason(c, footballSport);
    const before = { ...c.clubs[0] };
    const points = c.pending!.points;
    chooseFocus(c, 'defence');
    expect(c.season.number).toBe(2);
    expect(c.clubs[0].defence - before.defence).toBeGreaterThan(c.clubs[0].attack - before.attack);
    expect(c.clubs[0].defence - before.defence + c.clubs[0].attack - before.attack).toBeCloseTo(points, 9);
  });
});

describe('league picker', () => {
  it('starts the player mid-table in whichever league they choose', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const c = newCareer({ rating: band(tier).min + 10, difficulty: 'medium', seed: tier }, footballSport);
      expect(c.season.leagues[tier - 1].clubIds).toContain(c.playerClubId);
      expect(c.season.expected[c.playerClubId]).toBe(10);
    }
  });
});

describe('starting position', () => {
  it('starts somewhere in the chosen league, weighted towards mid-table', () => {
    const rng = new Rng(3);
    const counts = { low: 0, mid: 0, high: 0 };
    for (let i = 0; i < 4000; i++) {
      const tier = 1 + (i % 5);
      const r = startRating(tier, rng);
      const pos = r - band(tier).min;
      expect(pos).toBeGreaterThanOrEqual(4);
      expect(pos).toBeLessThanOrEqual(15);
      counts[pos < 8 ? 'low' : pos < 12 ? 'mid' : 'high']++;
    }
    expect(counts.mid / 4000).toBeCloseTo(0.5, 1);
    expect(counts.low / 4000).toBeCloseTo(0.25, 1);
    expect(counts.high / 4000).toBeCloseTo(0.25, 1);
  });

  it('turns a style into a free lean that keeps the rating', () => {
    expect(styleSplit(50, 'attacking', 5)).toEqual({ attack: 55, defence: 45 });
    expect(styleSplit(50, 'defensive', 5)).toEqual({ attack: 45, defence: 55 });
    expect(styleSplit(50, 'balanced', 5)).toEqual({ attack: 50, defence: 50 });
    expect(styleSplit(3, 'attacking', 5)).toEqual({ attack: 6, defence: 0 });
  });
});

describe('AI clubs', () => {
  it('are randomly attacking or defensive, leaning by the style skew either way', () => {
    const styles = { attacking: 0, defensive: 0, balanced: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const c = newCareer({ rating: 50, difficulty: 'medium', seed }, footballSport);
      for (const club of c.clubs.filter((x) => !x.isPlayer)) {
        styles[club.style]++;
        expect(Math.abs(club.attack - club.defence)).toBeCloseTo(2 * STYLE_TUNING.skew);
        expect(Math.sign(club.attack - club.defence)).toBe(club.style === 'attacking' ? 1 : -1);
      }
    }
    const total = styles.attacking + styles.defensive;
    expect(styles.balanced).toBe(0);
    expect(styles.attacking / total).toBeGreaterThan(0.45);
    expect(styles.attacking / total).toBeLessThan(0.55);
  });
});
