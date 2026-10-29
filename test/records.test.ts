import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allocatePoints, fillAllocation, fullHistory, newCareer, playSeason } from '../src/core/career';
import { emptyRecords, recordMatch, topScorers } from '../src/core/records';
import { Game } from '../src/extension/game';
import { buildView, summaryLine } from '../src/extension/viewModel';
import { footballSport } from '../src/sports/football';

const m = (goalsFor: number, goalsAgainst: number, season = 1) => ({ goalsFor, goalsAgainst, opponent: 'X', season, scorers: [] });

describe('records', () => {
  it('tracks biggest win, heaviest defeat and runs', () => {
    const r = emptyRecords();
    for (const [f, a] of [[1, 0], [2, 2], [5, 1], [3, 0], [0, 4], [1, 1]]) recordMatch(r, m(f, a));
    expect(r.biggestWin).toMatchObject({ goalsFor: 5, goalsAgainst: 1 });
    expect(r.heaviestDefeat).toMatchObject({ goalsFor: 0, goalsAgainst: 4 });
    expect(r.unbeaten.best).toBe(4);
    expect(r.winning.best).toBe(2);
    expect(r.manager).toEqual({ matches: 6, won: 3, drawn: 2, lost: 1 });
  });

  it('keeps all-time scorers', () => {
    const r = emptyRecords();
    recordMatch(r, { ...m(2, 0), scorers: [{ id: 1, name: 'A' }, { id: 1, name: 'A' }] });
    recordMatch(r, { ...m(1, 0), scorers: [{ id: 2, name: 'B' }] });
    expect(topScorers(r)).toEqual([{ name: 'A', goals: 2 }, { name: 'B', goals: 1 }]);
  });

  it('builds up over a real career and survives the new season', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 2 }, footballSport);
    const scored = () => c.season.playerMatches.reduce((t, x) => t + x.goals.filter((g) => g.for && !g.ownGoal).length, 0);
    playSeason(c, footballSport);
    expect(fullHistory(c)).toHaveLength(1);
    const first = scored();
    allocatePoints(c, fillAllocation(c.clubs[0], c.pending!.points, { attack: 1, defence: 1 }));
    playSeason(c, footballSport);
    expect(c.records.manager.matches).toBeGreaterThanOrEqual(76);
    expect(c.records.mostGoalsSeason!.season).toBe(1);
    const recorded = Object.values(c.records.scorers).reduce((t, s) => t + s.goals, 0);
    expect(recorded).toBe(first + scored());
  });
});

describe('rival', () => {
  const rivalCode = (c: ReturnType<typeof newCareer>) => c.clubs[c.rival!].short;

  it('is the nation’s real rival, whichever league each is in, for the whole career', () => {
    const c = newCareer({ rating: 10, difficulty: 'medium', seed: 3, team: 'ARG' }, footballSport);
    expect(rivalCode(c)).toBe('BRA');
    playSeason(c, footballSport);
    allocatePoints(c, fillAllocation(c.clubs[0], c.pending!.points, { attack: 1, defence: 1 }));
    expect(rivalCode(c)).toBe('BRA');
  });

  it('can be one-way: Scotland and Wales have England, England has Germany', () => {
    for (const [team, rival] of [['SCO', 'ENG'], ['WAL', 'ENG'], ['ENG', 'GER']]) {
      expect(rivalCode(newCareer({ rating: 50, difficulty: 'medium', seed: 1, team }, footballSport))).toBe(rival);
    }
  });

  it('falls back to the nearest neighbour in the world when the real rival is not in it', () => {
    expect(rivalCode(newCareer({ rating: 5, difficulty: 'medium', seed: 2, team: 'FIJ' }, footballSport))).toBe('NZL');
    expect(rivalCode(newCareer({ rating: 5, difficulty: 'medium', seed: 2, team: 'ETH' }, footballSport))).toBe('EGY');
    expect(rivalCode(newCareer({ rating: 5, difficulty: 'medium', seed: 2, team: 'LIE' }, footballSport))).toBe('SUI');
  });
});

describe('summary line', () => {
  it('matches the design format', () => {
    expect(summaryLine({ season: 7, tier: 3, position: 1, won: 26, drawn: 7, lost: 5, outcome: 'promoted' })).toBe('Season 7 · Champions, League 3 · 26W 7D 5L · Promoted 🏆');
    expect(summaryLine({ season: 2, tier: 4, position: 9, won: 14, drawn: 10, lost: 14, outcome: null })).toBe('Season 2 · 9th, League 4 · 14W 10D 14L');
  });
});

describe('full-time overlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears for the player match only during the full-time pause, and can be turned off', () => {
    const game = new Game({ save: () => {}, changed: () => {} });
    game.start({ rating: 50, difficulty: 'medium', seed: 4 });
    const fullTime = () => {
      const v = buildView(game);
      return v.screen === 'game' ? v.fullTime : null;
    };
    expect(fullTime()).toBeNull();
    while (game.phase === 'live') vi.advanceTimersByTime(1000);
    const ft = fullTime()!;
    expect(ft.ms).toBe(5000);
    expect(ft.home.goals + ft.away.goals).toBeGreaterThanOrEqual(0);
    const off = buildView(game, { fullTimeOverlay: false });
    expect(off.screen === 'game' && off.fullTime).toBeNull();
    vi.advanceTimersByTime(5100);
    expect(fullTime()).toBeNull();
  });
});
