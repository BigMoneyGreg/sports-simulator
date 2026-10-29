import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { TeamSheet } from '../src/core/sport';
import { createMatch, formSpread, isFinished, outcome, playMatch, step, type MatchEvent } from '../src/sports/football/match';
import { generateSquad, lineup } from '../src/sports/football/squad';

function sheet(clubId: number, rating: number, rng = new Rng(clubId)): TeamSheet {
  const squad = generateSquad(rng, clubId * 100, () => 'Player');
  return { clubId, attack: rating, defence: rating, chemistry: rating, lineup: lineup(squad) };
}

function many(n: number, home: TeamSheet, away: TeamSheet, seed = 1) {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => playMatch(home, away, {}, rng));
}

describe('rng', () => {
  it('is reproducible from a seed and from saved state', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    const saved = new Rng(a.state);
    expect(saved.next()).toBe(a.next());
  });

  it('int stays in range and hits both ends', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('squad', () => {
  it('has 18 players and a 4-4-2 line-up with one keeper', () => {
    const squad = generateSquad(new Rng(1), 0, () => 'X');
    expect(squad).toHaveLength(18);
    const xi = lineup(squad);
    expect(xi).toHaveLength(11);
    expect(xi.filter((p) => p.position === 'GK')).toHaveLength(1);
    expect(new Set(squad.map((p) => p.number)).size).toBe(18);
  });
});

describe('football match', () => {
  const even = [sheet(1, 50), sheet(2, 50)] as const;

  it('is deterministic for a given seed', () => {
    const a = playMatch(even[0], even[1], {}, new Rng(99));
    const b = playMatch(even[0], even[1], {}, new Rng(99));
    expect(a.events).toEqual(b.events);
  });

  it('can be saved and resumed mid-match with identical results', () => {
    const rng = new Rng(5);
    const live = createMatch(even[0], even[1], {}, rng);
    for (let i = 0; i < 50; i++) step(live, rng);
    const saved = JSON.parse(JSON.stringify({ match: live, rng: rng.state }));
    const resumedRng = new Rng(saved.rng);
    while (!isFinished(live)) step(live, rng);
    while (!isFinished(saved.match)) step(saved.match, resumedRng);
    expect(saved.match.events).toEqual(live.events);
  });

  it('produces realistic results between evenly matched sides', () => {
    const matches = many(4000, even[0], even[1]);
    const results = matches.map(outcome);
    const goals = results.reduce((t, r) => t + r.homeGoals + r.awayGoals, 0) / results.length;
    const homeWin = results.filter((r) => r.homeGoals > r.awayGoals).length / results.length;
    const draw = results.filter((r) => r.homeGoals === r.awayGoals).length / results.length;
    expect(goals).toBeGreaterThan(2.4);
    expect(goals).toBeLessThan(3.1);
    expect(homeWin).toBeGreaterThan(0.38);
    expect(homeWin).toBeLessThan(0.52);
    expect(draw).toBeGreaterThan(0.18);
    expect(draw).toBeLessThan(0.32);
  });

  it('lets the stronger side win more, with upsets still happening', () => {
    const results = many(2000, sheet(1, 60), sheet(2, 40)).map(outcome);
    const strongWins = results.filter((r) => r.homeGoals > r.awayGoals).length / results.length;
    const upsets = results.filter((r) => r.homeGoals < r.awayGoals).length / results.length;
    expect(strongWins).toBeGreaterThan(0.6);
    expect(upsets).toBeGreaterThan(0.05);
  });

  it('runs 90 minutes plus added time and records the clock in order', () => {
    const m = playMatch(even[0], even[1], {}, new Rng(3));
    const types = m.events.map((e) => e.type);
    expect(types[0]).toBe('kickoff');
    expect(types.filter((t) => t === 'halftime')).toHaveLength(1);
    expect(types.at(-1)).toBe('fulltime');
    const order = (e: MatchEvent) => e.minute * 100 + e.added;
    for (let i = 1; i < m.events.length; i++) expect(order(m.events[i])).toBeGreaterThanOrEqual(order(m.events[i - 1]));
    const last = m.events.at(-1)!;
    expect(last.minute).toBe(90);
  });

  it('credits goals to players in the line-up, mostly forwards', () => {
    const matches = many(500, even[0], even[1]);
    const goals = matches.flatMap((m) => m.events.filter((e) => e.type === 'goal' && !e.ownGoal));
    const forwards = new Set([...even[0].lineup, ...even[1].lineup].filter((p) => p.position === 'FWD').map((p) => p.id));
    const all = new Set([...even[0].lineup, ...even[1].lineup].map((p) => p.id));
    for (const g of goals) expect(all.has((g as { playerId: number }).playerId)).toBe(true);
    const byForwards = goals.filter((g) => forwards.has((g as { playerId: number }).playerId)).length;
    expect(byForwards / goals.length).toBeGreaterThan(0.4);
  });

  it('shows cards at a realistic rate and weakens a side down to ten', () => {
    const matches = many(3000, even[0], even[1], 11);
    const yellows = matches.flatMap((m) => m.events.filter((e) => e.type === 'yellow')).length / matches.length;
    expect(yellows).toBeGreaterThan(2.5);
    expect(yellows).toBeLessThan(4.5);
    const reds = matches.flatMap((m) => m.events.filter((e) => e.type === 'red')).length / matches.length;
    expect(reds).toBeGreaterThan(0.05);
    expect(reds).toBeLessThan(0.3);
    for (const m of matches) {
      for (const e of m.events) {
        if (e.type === 'goal' && !e.ownGoal) {
          const side = m[e.side];
          const sentBefore = m.events.some((x) => x.type === 'red' && x.side === e.side && x.playerId === e.playerId && x.minute * 100 + x.added < e.minute * 100 + e.added);
          expect(sentBefore, `goal by sent-off player for club ${side.sheet.clubId}`).toBe(false);
        }
      }
    }
  });

  it('narrows the form range as chemistry rises', () => {
    expect(formSpread(99)).toBeLessThan(formSpread(50));
    expect(formSpread(50)).toBeLessThan(formSpread(0));
  });

  it('always produces a winner in knockout ties, using extra time and penalties', () => {
    const rng = new Rng(21);
    let extraTime = 0;
    let penalties = 0;
    for (let i = 0; i < 600; i++) {
      const m = playMatch(even[0], even[1], { neutral: true, knockout: { aggregate: [0, 0] } }, rng);
      const r = outcome(m);
      expect(r.winner).toBeDefined();
      expect(m.events.at(-1)!.type).toBe('fulltime');
      if (r.extraTime) extraTime++;
      if (r.penalties) {
        penalties++;
        expect(r.penalties[0]).not.toBe(r.penalties[1]);
        expect(r.homeGoals).toBe(r.awayGoals);
      } else {
        expect(r.winner).toBe(r.homeGoals > r.awayGoals ? 'home' : 'away');
      }
    }
    expect(extraTime).toBeGreaterThan(60);
    expect(penalties).toBeGreaterThan(20);
  });

  it('uses the aggregate score from the first leg', () => {
    const m = playMatch(even[0], even[1], { knockout: { aggregate: [5, 0] } }, new Rng(1));
    const r = outcome(m);
    expect(r.extraTime).toBe(false);
    if (r.awayGoals - r.homeGoals < 5) expect(r.winner).toBe('home');
  });
});
