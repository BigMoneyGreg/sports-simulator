import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allocatePoints, fillAllocation, fullHistory, newCareer, playRound, playSeason, teamSheet } from '../src/core/career';
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

describe('record against the rival', () => {
  it('counts only matches against the rival, a shootout as a draw', () => {
    const r = emptyRecords();
    const match = { goalsAgainst: 1, opponent: 'England', season: 1, scorers: [] };
    recordMatch(r, { ...match, goalsFor: 2, rival: true });
    recordMatch(r, { ...match, goalsFor: 1, rival: true, won: true });
    recordMatch(r, { ...match, goalsFor: 0, rival: false });
    expect(r.rival).toEqual({ won: 1, drawn: 1, lost: 0 });
  });

  it('shows on the Team tab with where the rival is', () => {
    const game = new Game({ save: () => {}, changed: () => {} });
    game.start({ rating: 50, difficulty: 'medium', seed: 2, team: 'SCO' });
    const v = buildView(game);
    if (v.screen !== 'game') throw new Error('expected game view');
    expect(v.club.rival).toMatchObject({ name: 'England', record: 'Not played yet' });
    expect(v.club.rival!.where).toMatch(/^League [1-5], \d+(st|nd|rd|th)$/);
    expect(v.tables.flatMap((t) => t.rows).filter((r) => r.isRival).map((r) => r.short)).toEqual(['ENG']);
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

describe('squads over time', () => {
  it('replaces 2–4 players a summer at every club, same positions and shirts, and the summer screen says who', () => {
    const game = new Game({ save: () => {}, changed: () => {} });
    game.start({ rating: 50, difficulty: 'medium', seed: 8, team: 'SCO' });
    const c = game.career!;
    playSeason(c, footballSport);
    const before = c.clubs.map((club) => club.squad.map((p) => p.id));
    const v = buildView(game);
    if (v.screen !== 'game' || !v.seasonEnd) throw new Error('expected the summer screen');
    const mine = c.pending!.turnover.find((t) => t.clubId === c.playerClubId)!;
    expect(v.seasonEnd.squad.leaving).toHaveLength(mine.out.length);
    expect(v.seasonEnd.squad.leaving[0]).toMatch(/· dropped$/);
    allocatePoints(c, fillAllocation(c.clubs[0], c.pending!.points, { attack: 1, defence: 1 }));
    c.clubs.forEach((club, i) => {
      const changed = club.squad.filter((p) => !before[i].includes(p.id));
      expect(changed.length).toBeGreaterThanOrEqual(2);
      expect(changed.length).toBeLessThanOrEqual(4);
      expect(changed.every((p) => p.joined === 2)).toBe(true);
      expect(club.squad).toHaveLength(18);
      expect(new Set(club.squad.map((p) => p.number)).size).toBe(18);
    });
  });

  it('keeps a leaver’s goals in the all-time records', () => {
    const c = newCareer({ rating: 60, difficulty: 'medium', seed: 9, team: 'SCO' }, footballSport);
    for (let s = 0; s < 4; s++) {
      playSeason(c, footballSport);
      allocatePoints(c, fillAllocation(c.clubs[0], c.pending!.points, { attack: 1, defence: 1 }));
    }
    const current = new Set(c.clubs[0].squad.map((p) => p.id));
    expect(Object.keys(c.records.scorers).some((id) => !current.has(Number(id)))).toBe(true);
  });
});

describe('suspensions', () => {
  it('bans a sent-off player from their club’s next match only', () => {
    const c = newCareer({ rating: 50, difficulty: 'medium', seed: 10, team: 'SCO' }, footballSport);
    let checked = 0;
    for (let round = 0; round < 38 && checked < 3; round++) {
      const results = playRound(c, footballSport);
      const reds = results.flatMap((r) => (r.outcome.sentOff ?? []).map((x) => ({ ...x, fixture: r.fixture })));
      if (!reds.length) continue;
      const red = reds[0];
      const clubId = red.side === 'home' ? red.fixture.home : red.fixture.away;
      expect(c.suspended).toContain(red.playerId);
      expect(teamSheet(c, clubId, footballSport).lineup.map((p) => p.id)).not.toContain(red.playerId);
      // Their club's next match serves the ban.
      for (;;) {
        const next = playRound(c, footballSport);
        if (next.some((r) => r.fixture.home === clubId || r.fixture.away === clubId)) break;
      }
      const sentAgain = c.suspended.includes(red.playerId);
      if (!sentAgain) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
