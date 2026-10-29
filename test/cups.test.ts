import { describe, expect, it } from 'vitest';
import { allocatePoints, fillAllocation, newCareer, nextRound, playRound, playSeason, type Career } from '../src/core/career';
import { rating } from '../src/core/club';
import { cupRun, drawChampionship, drawCup, recordCupResult, cupFixtures, cupStages } from '../src/core/cups';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';
import { cupTieView } from '../src/extension/viewModel';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i);
const result = (homeGoals: number, awayGoals: number, winner?: 'home' | 'away') => ({ homeGoals, awayGoals, goals: [], winner });

function nextSeason(c: Career): void {
  playSeason(c, footballSport);
  allocatePoints(c, fillAllocation(c.clubs[c.playerClubId], c.pending!.points, { attack: 1, defence: 1 }));
}

describe('Nations Cup', () => {
  it('draws every round open, with whoever comes out first at home', () => {
    const topMeetings = new Set<number>();
    let topAtHome = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const cup = drawCup(1, ids(64), new Rng(seed));
      const ties = cup.rounds[0].ties;
      expect(ties).toHaveLength(32);
      expect(new Set(ties.flatMap((t) => [t.home, t.away])).size).toBe(64);
      for (const t of ties) if (t.home < 32 && t.away < 32) topMeetings.add(seed);
      for (const f of cupFixtures(cup, 0)) {
        expect(f.options.knockout).toBeDefined();
        expect(f.options.neutral).toBeFalsy();
        if (f.home < 32) topAtHome++;
      }
    }
    expect(topMeetings.size).toBeGreaterThan(10);
    expect(topAtHome).toBeGreaterThan(200);
    expect(topAtHome).toBeLessThan(440);
  });

  it('plays two-legged quarter- and semi-finals and a one-off neutral final', () => {
    const cup = drawCup(1, ids(64), new Rng(2));
    const rng = new Rng(3);
    cupStages('cup').forEach((stage, i) => {
      const fixtures = cupFixtures(cup, i);
      if ('round' in stage && stage.round === 5) expect(fixtures[0].options.neutral).toBe(true);
      if ('round' in stage && stage.leg === 1) expect(fixtures.every((f) => f.secondLeg && f.options.knockout)).toBe(true);
      for (const f of fixtures) recordCupResult(cup, f, f.options.knockout ? result(1, 0, 'home') : result(1, 0), rng);
    });
    expect(cup.rounds.map((r) => r.ties.length)).toEqual([32, 16, 8, 4, 2, 1]);
    expect(cup.rounds[3].ties.every((t) => t.legs.length === 2)).toBe(true);
    expect(cup.winner).toBeDefined();
    expect(cupRun(cup, cup.winner!)).toBe('Winners');
    expect(cupRun(cup, 999)).toBeNull();
  });
});

describe('World Championship', () => {
  it('draws eight groups of five with one team from each pot, so the top eight are split', () => {
    const wc = drawChampionship(4, ids(40), new Rng(5));
    expect(wc.groups).toHaveLength(8);
    for (const g of wc.groups) {
      const pots = g.table.map((r) => Math.floor(r.clubId / 8)).sort();
      expect(pots).toEqual([0, 1, 2, 3, 4]);
      const pairs = g.days.flat().map(([a, b]) => [a, b].sort().join('-'));
      expect(new Set(pairs).size).toBe(10);
      expect(g.days).toHaveLength(5);
    }
  });

  it('sends group winners against another group’s runners-up, keeping groups apart until the final', () => {
    const wc = drawChampionship(4, ids(40), new Rng(6));
    const rng = new Rng(7);
    for (let i = 0; i < 5; i++) for (const f of cupFixtures(wc, i)) recordCupResult(wc, f, f.home < f.away ? result(2, 0) : result(0, 2), rng);
    const r16 = wc.rounds[0].ties;
    expect(r16).toHaveLength(8);
    const groupOf = (id: number) => wc.groups.findIndex((g) => g.table.some((r) => r.clubId === id));
    for (const t of r16) expect(groupOf(t.home)).not.toBe(groupOf(t.away));
    for (let i = 5; i < cupStages('championship').length; i++) {
      for (const f of cupFixtures(wc, i)) {
        expect(f.options.neutral).toBe(true);
        recordCupResult(wc, f, result(1, 1, 'away'), rng);
      }
    }
    expect(wc.rounds.map((r) => r.ties.length)).toEqual([8, 4, 2, 1]);
    for (const round of wc.rounds.slice(0, 3)) for (const t of round.ties) expect(groupOf(t.home)).not.toBe(groupOf(t.away));
    expect(wc.winner).toBeDefined();
  });
});

describe('cups in a career', () => {
  it('holds the World Championship every fourth summer, for Leagues 1 and 2', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 8, team: 'NOR' }, footballSport);
    for (let season = 1; season <= 4; season++) {
      expect(c.season.calendar.some((s) => s.kind === 'championship')).toBe(season === 4);
      if (season < 4) nextSeason(c);
    }
    while (nextRound(c) && c.season.calendar[c.season.round].kind !== 'championship') playRound(c, footballSport);
    const top = c.season.leagues.slice(0, 2).flatMap((l) => l.clubIds);
    expect([...c.season.championship!.entrants].sort((a, b) => a - b)).toEqual([...top].sort((a, b) => a - b));
    nextSeason(c);
    expect(c.honours.championship).toHaveLength(1);
    expect(c.honours.cup).toHaveLength(4);
  });

  it('enters the top 64 of this season’s final standings into next season’s cup', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 9, team: 'NOR' }, footballSport);
    playSeason(c, footballSport);
    const standing = c.pending!.standing;
    nextSeason(c);
    expect(c.season.cup.entrants).toEqual(standing.slice(0, 64));
  });

  it('leaves ratings alone: only the league decides the summer', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 10, team: 'NOR' }, footballSport);
    const before = c.clubs.map(rating);
    while (nextRound(c)) playRound(c, footballSport);
    expect(c.clubs.map(rating)).toEqual(before);
  });

  it('records how far the player went', () => {
    const c = newCareer({ rating: 95, difficulty: 'medium', seed: 11, team: 'BRA' }, footballSport);
    nextSeason(c);
    expect(c.history[0].cup).toMatch(/^(Winners|Final|Semi-final|Quarter-final|Round of (16|32|64))$/);
  });
});

describe('how a tie reads', () => {
  const c = newCareer({ rating: 50, difficulty: 'medium', seed: 12, team: 'NOR' }, footballSport);
  const [eng, bra] = ['ENG', 'BRA'].map((code) => c.clubs.find((x) => x.short === code)!.id);

  it('reads every leg from the left-hand team and names the shootout winner', () => {
    // England host the first leg and lose 1–2; Brazil host the second, lose 2–3 and win the shootout 3–1.
    const tie = {
      home: eng,
      away: bra,
      winner: bra,
      legs: [
        { home: eng, away: bra, score: [1, 2] as [number, number] },
        { home: bra, away: eng, score: [2, 3] as [number, number], extraTime: true, penalties: [3, 1] as [number, number] },
      ],
    };
    const v = cupTieView(c, tie);
    expect(v.legs).toEqual(['1–2', '3–2']);
    expect(v.aggregate).toBe('4–4 agg');
    expect(v.decided).toBe('Brazil win 3–1 on penalties');
    expect(v.winner).toBe('away');
  });

  it('gives the aggregate winner first, from either side', () => {
    const tie = {
      home: eng,
      away: bra,
      winner: eng,
      legs: [
        { home: eng, away: bra, score: [3, 0] as [number, number] },
        { home: bra, away: eng, score: [2, 1] as [number, number] },
      ],
    };
    expect(cupTieView(c, tie).decided).toBe('England win 4–2 on aggregate');
  });
});
