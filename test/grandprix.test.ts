import { describe, expect, it } from 'vitest';
import { allocatePoints, endSeason, focusAllocation, newCareer, nextRound, playerInRound, playRound, playSeason, teamSheet } from '../src/core/career';
import { recordRace, emptyTable } from '../src/core/league';
import { Rng } from '../src/core/rng';
import { Game, tickMs } from '../src/extension/game';
import { buildView, statusText } from '../src/extension/viewModel';
import { SPORTS } from '../src/sports';
import { GRAND_PRIX_ORDER, GRAND_PRIX_RIVALS } from '../src/sports/grandprix/data';
import { classified, createMatch, isFinished, outcome, RACE_POINTS, step } from '../src/sports/grandprix/match';
import { nation } from '../src/sports/football/names';

const sport = SPORTS.grandprix;

function race(seed: number, ratings: [number, number][] = Array.from({ length: 10 }, () => [50, 50])) {
  const c = newCareer({ rating: 50, seed: 1 }, sport);
  const ids = c.season.leagues[0].clubIds;
  const field = ids.map((id, i) => ({ ...teamSheet(c, id, sport), attack: ratings[i][0], defence: ratings[i][1], settledLean: 0 }));
  const rng = new Rng(seed);
  const m = createMatch(field[0], field[1], { field }, rng);
  while (!isFinished(m)) step(m, rng);
  return { m, ids };
}

describe('the race', () => {
  it('has twenty cars, two from each team, each in one place', () => {
    const { m } = race(1);
    expect(m.cars).toHaveLength(20);
    expect(new Set(m.cars.map((c) => c.driverId)).size).toBe(20);
    expect(classified(m).map((c) => c.place).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(m.lap).toBe(50);
  });

  it('pays the top ten, and nothing to a car that stopped', () => {
    for (let seed = 1; seed < 40; seed++) {
      const o = outcome(race(seed).m).race!;
      const finishers = o.order.filter((c) => !c.out);
      finishers.forEach((c, i) => expect(c.points).toBe(RACE_POINTS[i] ?? 0));
      for (const c of o.order.filter((x) => x.out)) expect(c.points).toBe(0);
    }
  });

  it('a faster car finishes further up, and a less reliable one stops more', () => {
    const fast: [number, number][] = [[90, 60], ...Array.from({ length: 9 }, (): [number, number] => [60, 60])];
    const fragile: [number, number][] = [[60, 20], ...Array.from({ length: 9 }, (): [number, number] => [60, 60])];
    let fastPlace = 0, stops = 0, others = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const a = race(seed, fast);
      fastPlace += classified(a.m).findIndex((c) => c.clubId === a.ids[0]) + 1;
      const b = race(seed, fragile);
      for (const c of b.m.cars) if (c.out) c.clubId === b.ids[0] ? stops++ : others++;
    }
    expect(fastPlace / 300).toBeLessThan(5);
    expect(stops / 2).toBeGreaterThan((others / 18) * 1.8);
  });

  it('counts a team\'s race in the table', () => {
    const table = emptyTable([1, 2]);
    recordRace(table, { fieldSize: 4, order: [
      { clubId: 1, driverId: 11, place: 1, grid: 2, points: 25, out: false },
      { clubId: 2, driverId: 21, place: 2, grid: 1, points: 18, out: false },
      { clubId: 1, driverId: 12, place: 3, grid: 3, points: 15, out: false },
      { clubId: 2, driverId: 22, place: 4, grid: 4, points: 0, out: true },
    ] });
    expect(table[0]).toMatchObject({ played: 1, points: 40, won: 1, lost: 1, goalsFor: 5, goalsAgainst: 0 });
    expect(table[1]).toMatchObject({ played: 1, points: 18, won: 0, lost: 1, goalsFor: 5, goalsAgainst: 1 });
  });
});

describe('the world', () => {
  it('is 30 real nations, the most successful first, with real rivals', () => {
    expect(GRAND_PRIX_ORDER).toHaveLength(30);
    expect(new Set(GRAND_PRIX_ORDER).size).toBe(30);
    expect(GRAND_PRIX_ORDER.slice(0, 3)).toEqual(['ENG', 'GER', 'ITA']);
    for (const code of GRAND_PRIX_ORDER) expect(nation(code).name).toBeTruthy();
    for (const rival of Object.values(GRAND_PRIX_RIVALS)) expect(nation(rival).name).toBeTruthy();
  });

  it('lets any country enter a new team, in the bottom league unless it picks otherwise', () => {
    const peru = sport.nations().find((n) => n.short === 'PER');
    expect(peru?.tier).toBe(3);
    expect(sport.nations().find((n) => n.short === 'ENG')?.tier).toBe(1);
    // The racing nations come first in the picker, most successful at the top.
    expect(sport.nations().slice(0, 3).map((n) => n.short)).toEqual(['ENG', 'GER', 'ITA']);
    const c = newCareer({ rating: 10, seed: 3, team: 'PER' }, sport);
    expect(c.clubs[c.playerClubId].name).toBe('Peru');
    expect(c.clubs).toHaveLength(30);
    expect(c.clubs.map((x) => x.short)).not.toContain('HUN');
  });

  it('every team has two race drivers and people behind them', () => {
    const c = newCareer({ rating: 50, seed: 3 }, sport);
    for (const club of c.clubs) {
      expect(club.squad).toHaveLength(8);
      expect(sport.lineup(club.squad).map((p) => p.number)).toEqual([1, 2]);
    }
    expect(sport.role({ number: 1, position: 'DRV' })).toEqual({ label: 'lead driver', side: 'attack' });
    expect(sport.role({ number: 7, position: 'RELY' })).toEqual({ label: 'reliability engineer', side: 'defence' });
  });
});

describe('a season', () => {
  it('runs 16 races in every league, with the player leading their fixture, and promotes and relegates', () => {
    const c = newCareer({ rating: 50, seed: 8, team: 'SCO' }, sport);
    const first = nextRound(c)!;
    expect(first).toHaveLength(3);
    expect(playerInRound(c, first)!.home).toBe(c.playerClubId);
    expect(first.every((f) => f.field!.length === 10)).toBe(true);
    const end = playSeason(c, sport);
    expect(c.season.leagues.every((l) => l.table.every((r) => r.played === 16))).toBe(true);
    expect(c.season.playerMatches).toHaveLength(16);
    expect(end.nextLeagues.map((l) => l.length)).toEqual([10, 10, 10]);
    expect(end.promoted[2]).toHaveLength(2);
    expect(end.relegated[1]).toHaveLength(2);
    // The drivers' points add up to the teams'.
    const league = c.season.leagues[0];
    const teams = league.table.reduce((t, r) => t + r.points, 0);
    const drivers = league.clubIds.flatMap((id) => c.clubs[id].squad).reduce((t, p) => t + (c.season.scorers[p.id] ?? 0), 0);
    expect(drivers).toBe(teams);
    const wins = league.clubIds.flatMap((id) => c.clubs[id].squad).reduce((t, p) => t + (c.season.wins?.[p.id] ?? 0), 0);
    expect(wins).toBe(16);
    allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, 'attack'));
    expect(c.season.number).toBe(2);
  });

  it('runs a Race of Nations with one car each, after the first season and then every four', () => {
    const c = newCareer({ rating: 95, seed: 8, team: 'SCO' }, sport);
    for (let n = 0; n < 1; n++) {
      const end = playSeason(c, sport);
      allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, 'attack'));
    }
    expect(c.season.calendar[0]).toEqual({ kind: 'championship', stage: 0 });
    const [gp] = nextRound(c)!;
    expect(gp.field).toHaveLength(20);
    const [{ outcome: o }] = playRound(c, sport);
    expect(o.race!.order).toHaveLength(20);
    expect(c.season.championship!.winner).toBe(o.race!.order[0].clubId);
    expect(c.honours.championship).toHaveLength(1);
    expect(c.worldEnd?.winner).toBe(o.race!.order[0].clubId);
  });

  it('keeps its records out of the head-to-head columns', () => {
    const c = newCareer({ rating: 50, seed: 8, team: 'SCO' }, sport);
    playSeason(c, sport);
    expect(c.records.manager.matches).toBe(16);
    expect(c.records.manager.drawn).toBe(0);
    // Only a rival in the same league races against the player.
    expect([0, 16]).toContain(c.records.rival.won + c.records.rival.lost);
    expect(endSeason(c, sport).question).toBeDefined();
  });
});

describe('on screen', () => {
  const noTimers = { setTimeout: () => 0, clearTimeout: () => {} };
  const start = () => {
    const game = new Game({ save: () => {}, changed: () => {} }, noTimers);
    game.selectSport('grandprix');
    game.speed = 'fastest';
    game.start({ rating: 50, seed: 8, team: 'SCO' });
    return game;
  };

  it('shows the running order, the drivers and the status line while racing', () => {
    const game = start();
    for (let i = 0; i < 10; i++) game.tick();
    const v = buildView(game);
    if (v.screen !== 'game') throw new Error('expected a game');
    expect(v.match!.race!.rows).toHaveLength(20);
    expect(v.match!.race!.rows.filter((r) => r.mine)).toHaveLength(2);
    expect(v.match!.race!.venue).toBe('Melbourne');
    expect(v.match!.clock).toBe('L10/50');
    expect(v.tables[v.playerTier - 1].drivers).toHaveLength(20);
    expect(v.fixtures[0]).toMatchObject({ label: 'R1', venue: 'Melbourne', current: true });
    expect(v.cups.cup).toBeNull();
    expect(statusText(game)).toMatch(/^🏎  SCO (P\d+|DNF) (P\d+|DNF) L10\/50 · Wk 1\/16 · \d+(st|nd|rd|th) in GP\d$/);
    // A race is 90 real minutes to football's 110: at the quickest, 49 seconds.
    expect(tickMs(sport, 'fastest') * 50).toBeCloseTo((60_000 * 90) / 110);
  });

  it('shows the result, and the season report, once it finishes', () => {
    const game = start();
    for (let i = 0; i < 50; i++) game.tick();
    const v = buildView(game);
    if (v.screen !== 'game') throw new Error('expected a game');
    expect(v.fullTime?.solo).toBe(true);
    expect(v.fullTime?.scorers).toMatch(/^Won by /);
    expect(v.fixtures[0].result).toMatch(/^(P\d+|DNF), (P\d+|DNF)$/);
    expect(v.header.form[0].label).toMatch(/^(\d+|X)$/);
  });

  it('survives being saved and reloaded in the middle of a race', () => {
    const game = start();
    for (let i = 0; i < 20; i++) game.tick();
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const back = new Game({ save: () => {}, changed: () => {} }, noTimers);
    back.selectSport('grandprix');
    back.load(saved);
    const v = buildView(back);
    if (v.screen !== 'game') throw new Error('expected a game');
    expect(v.match!.race!.venue).toBe('Melbourne');
    for (let i = 0; i < 30; i++) back.tick();
    const after = buildView(back);
    if (after.screen !== 'game') throw new Error('expected a game');
    expect(after.fixtures[0].result).toBeTruthy();
  });
});
