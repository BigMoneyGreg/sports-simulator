import { describe, expect, it } from 'vitest';
import {
  allocatePoints,
  completeRound,
  fillAllocation,
  isSeasonOver,
  newCareer,
  nextRound,
  playRound,
  playSeason,
  type Career,
} from '../src/core/career';
import { rating, shiftRating, statsFor, type Club } from '../src/core/club';
import { band, doubleRoundRobin, emptyTable, recordResult, sortTable, zone } from '../src/core/league';
import { applyDecline, normalise, plateau, positionBonus, seasonGain, totalRating } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';

const evenSplit = (career: Career) =>
  fillAllocation(career.clubs[career.playerClubId], career.pending!.points, { attack: 1, defence: 1, chemistry: 1 });

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

  it('flattens rises near 99 but not falls', () => {
    expect(plateau(50)).toBe(1);
    expect(plateau(99)).toBeCloseTo(0.3);
    expect(seasonGain(1, 10, 1, 95) - 10).toBeLessThan(9);
    expect(seasonGain(1, 1, 10, 95) - 10).toBe(-9);
  });

  it('keeps stats within 0–99 and passes the excess to other stats', () => {
    const club = { attack: 98, defence: 50, chemistry: 50 } as Club;
    const applied = shiftRating(club, 3);
    expect(club.attack).toBe(99);
    expect(applied).toBeCloseTo(3);
    expect(rating(club)).toBeCloseTo(69);
  });

  it('gives styled clubs stats that still average the rating', () => {
    for (const r of [0, 3, 50, 97, 99]) {
      for (const style of ['attacking', 'defensive', 'balanced'] as const) {
        const s = statsFor(r, style);
        expect((s.attack + s.defence + s.chemistry) / 3).toBe(r);
        expect(Math.min(s.attack, s.defence, s.chemistry)).toBeGreaterThanOrEqual(0);
        expect(Math.max(s.attack, s.defence, s.chemistry)).toBeLessThanOrEqual(99);
      }
    }
  });

  it('normalises the AI back to the target total without touching the player', () => {
    const clubs = Array.from({ length: 10 }, (_, id) => ({ id, attack: 50, defence: 50, chemistry: 50, isPlayer: id === 0 }) as Club);
    clubs[0].attack = 80;
    normalise(clubs, 500);
    expect(totalRating(clubs)).toBeCloseTo(500, 9);
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
    expect(c.totalRating).toBe(4950);
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
    const c = newCareer({ rating: 50, difficulty: 'hard', seed: 1, split: { attack: 60, defence: 40, chemistry: 50 } }, footballSport);
    expect(c.clubs[0].attack).toBe(60);
    expect(() => newCareer({ rating: 50, difficulty: 'hard', seed: 1, split: { attack: 60, defence: 60, chemistry: 50 } }, footballSport)).toThrow();
  });

  it('plays 38 league rounds then three play-off rounds, then waits', () => {
    const c = start();
    for (let r = 0; r < 38; r++) {
      const fixtures = nextRound(c)!;
      expect(fixtures).toHaveLength(50);
      playRound(c, footballSport);
    }
    for (const l of c.season.leagues) for (const row of l.table) expect(row.played).toBe(38);
    expect(nextRound(c)).toHaveLength(8);
    playRound(c, footballSport);
    expect(nextRound(c)).toHaveLength(8);
    playRound(c, footballSport);
    expect(nextRound(c)).toHaveLength(4);
    playRound(c, footballSport);
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

  it('keeps the total rating fixed across many seasons, with the player allocating', () => {
    const c = start(30, 7, 'easy');
    for (let season = 0; season < 6; season++) {
      playSeason(c, footballSport);
      expect(c.pending!.decline).toBeCloseTo(10);
      const d = c.pending!.declineByStat;
      expect(d.attack + d.defence + d.chemistry).toBeCloseTo(30);
      allocatePoints(c, evenSplit(c));
      expect(totalRating(c.clubs)).toBeCloseTo(4950, 6);
      for (const club of c.clubs) {
        for (const s of ['attack', 'defence', 'chemistry'] as const) {
          expect(club[s]).toBeGreaterThanOrEqual(0);
          expect(club[s]).toBeLessThanOrEqual(99);
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
    expect(end.points).toBe(Math.max(0, Math.round(expectedGain * 3)));
    allocatePoints(c, evenSplit(c));
    // A negative gain comes off as extra decline instead of negative points.
    expect(rating(c.clubs[0])).toBeCloseTo(before - 10 + Math.round(expectedGain * 3) / 3, 6);
  });

  it('rejects allocations that do not spend exactly the points', () => {
    const c = start();
    playSeason(c, footballSport);
    const p = c.pending!.points;
    expect(() => allocatePoints(c, { attack: p + 1, defence: 0, chemistry: 0 })).toThrow();
    expect(() => allocatePoints(c, { attack: 0.5, defence: p - 0.5, chemistry: 0 })).toThrow();
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

describe('allocation and decline', () => {
  it('fills an allocation without passing 99 and spends every point it can', () => {
    const club = { attack: 97.4, defence: 50, chemistry: 60 } as Club;
    const a = fillAllocation(club, 12, { attack: 1, defence: 0, chemistry: 0 });
    expect(a.attack).toBe(1);
    expect(a.attack + a.defence + a.chemistry).toBe(12);
  });

  it('lands the decline unevenly but averages 10 per stat', () => {
    const rng = new Rng(4);
    let spread = 0;
    for (let i = 0; i < 200; i++) {
      const club = { attack: 60, defence: 50, chemistry: 40 } as Club;
      const d = applyDecline(club, rng);
      expect(d.attack + d.defence + d.chemistry).toBeCloseTo(30);
      spread += Math.abs(d.attack - d.defence);
    }
    expect(spread / 200).toBeGreaterThan(2);
  });
});
