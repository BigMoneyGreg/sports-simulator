import { footballSport } from '../src/sports/football';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillAllocation } from '../src/core/career';
import { Game, migrate, tickMs, SAVE_VERSION, type SavedGame } from '../src/extension/game';
import { buildView, collapsedText, GoalWatch, statusText, statusTooltip } from '../src/extension/viewModel';

function setup() {
  const saves: (SavedGame | null)[] = [];
  const seasonOver = vi.fn();
  const fullTime = vi.fn();
  const changed = vi.fn();
  const game = new Game({ save: (g) => saves.push(g && JSON.parse(JSON.stringify(g))), changed, seasonOver, fullTime });
  return { game, saves, seasonOver, fullTime, changed };
}

const minute = tickMs(footballSport, '2m');

describe('game clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('kicks off straight away and advances one match-minute per tick', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 1 });
    expect(game.phase).toBe('live');
    const m = game.shownMatch!.match;
    expect(m.minute).toBe(0);
    vi.advanceTimersByTime(minute * 10);
    expect(m.minute).toBe(10);
    expect(game.live!.matches.every((x) => x.minute === 10)).toBe(true);
  });

  it('stands still while held, keeping the player\'s own pause, and carries on from the same minute', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 2 });
    vi.advanceTimersByTime(minute * 20);
    game.setHeld(true);
    vi.advanceTimersByTime(minute * 50);
    expect(game.shownMatch!.match.minute).toBe(20);
    expect(game.snapshot()!.paused).toBe(false);
    game.setHeld(false);
    vi.advanceTimersByTime(minute * 5);
    expect(game.shownMatch!.match.minute).toBe(25);

    game.togglePause();
    game.setHeld(true);
    game.setHeld(false);
    vi.advanceTimersByTime(minute * 5);
    expect(game.shownMatch!.match.minute).toBe(25);
    expect(game.paused).toBe(true);
  });

  it('a held career loaded from its save waits, and only starts in the window running the game', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 2 });
    vi.advanceTimersByTime(minute * 20);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    game.shutdown();
    const { game: other } = setup();
    other.setHeld(true, false);
    other.load(saved);
    vi.advanceTimersByTime(minute * 5);
    expect(other.shownMatch!.match.minute).toBe(20);
    other.setHeld(false, false);
    vi.advanceTimersByTime(minute * 5);
    expect(other.shownMatch!.match.minute).toBe(20);
  });

  it('pauses and resumes from the exact minute', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 2 });
    vi.advanceTimersByTime(minute * 20);
    game.togglePause();
    vi.advanceTimersByTime(minute * 50);
    expect(game.shownMatch!.match.minute).toBe(20);
    game.togglePause();
    vi.advanceTimersByTime(minute * 5);
    expect(game.shownMatch!.match.minute).toBe(25);
  });

  it('saves mid-match and resumes from the save with identical results', () => {
    const a = setup();
    a.game.start({ rating: 50, difficulty: 'medium', seed: 3 });
    vi.advanceTimersByTime(minute * 30);
    a.game.shutdown();
    const saved = a.saves.at(-1)!;
    expect(saved.live!.matches[0].minute).toBe(30);

    const b = setup();
    b.game.load(JSON.parse(JSON.stringify(saved)));
    a.game.load(JSON.parse(JSON.stringify(saved)));
    vi.advanceTimersByTime(minute * 120);
    expect(b.game.career!.season.round).toBe(1);
    expect(b.game.career!.season.playerMatches).toEqual(a.game.career!.season.playerMatches);
  });

  it('shows full time for 5 seconds, then starts the next matchday', () => {
    const { game, fullTime } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 4 });
    for (let i = 0; i < 200 && game.phase === 'live'; i++) vi.advanceTimersByTime(minute);
    expect(game.phase).toBe('fullTime');
    expect(fullTime).toHaveBeenCalledTimes(1);
    expect(game.career!.season.round).toBe(1);
    expect(game.shownMatch!.match.period).toBe('done');
    vi.advanceTimersByTime(4900);
    expect(game.phase).toBe('fullTime');
    vi.advanceTimersByTime(200);
    expect(game.phase).toBe('live');
    expect(game.shownMatch!.match.minute).toBe(0);
  });

  it('plays a whole season, waits at the end, and moves on after allocation', () => {
    const { game, seasonOver } = setup();
    game.duration = '30s';
    game.start({ rating: 50, difficulty: 'medium', seed: 5 });
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(game.phase).toBe('seasonOver');
    expect(seasonOver).toHaveBeenCalledTimes(1);
    const career = game.career!;
    expect(career.season.playerMatches.filter((m) => m.kind === 'league')).toHaveLength(38);
    // Play-off rounds without the player are resolved instantly.
    expect(career.season.playoffs.every((p) => p.winner !== undefined)).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(game.phase).toBe('seasonOver');
    expect(statusText(game)).toMatch(/Season over/);

    game.allocate(fillAllocation(career.clubs[0], career.pending!.points, { attack: 1, defence: 1 }));
    expect(game.career!.season.number).toBe(2);
    expect(game.phase).toBe('live');
  });

  it('suggests a country from a display language that points to one, but not from plain English', () => {
    const { game } = setup();
    const suggested = (language: string) => {
      const v = buildView(game, { fullTimeOverlay: true, language });
      return v.screen === 'setup' ? v.setup.suggested : 'n/a';
    };
    expect(suggested('de')).toBe('GER');
    expect(suggested('en-GB')).toBe('ENG');
    expect(suggested('pt-br')).toBe('BRA');
    expect(suggested('en')).toBeUndefined();
  });

  it('builds a view at every stage', () => {
    const { game } = setup();
    expect(buildView(game).screen).toBe('setup');
    game.start({ rating: 70, difficulty: 'hard', seed: 6, team: 'WAL' });
    vi.advanceTimersByTime(minute * 60);
    const v = buildView(game);
    if (v.screen !== 'game') throw new Error('expected game view');
    expect(v.header.club.name).toBe('Wales');
    expect(v.tables).toHaveLength(5);
    // An hour in, the live tables show clubs moving since kick-off.
    expect(v.tables.some((t) => t.rows.some((r) => r.move))).toBe(true);
    expect(v.fixtures.filter((f) => f.kind === 'league')).toHaveLength(38);
    // Wales are in the first-round cup draw, so their tie is listed before it's played.
    expect(v.fixtures.filter((f) => f.kind === 'cup')).toEqual([expect.objectContaining({ label: 'Cup 64', current: false })]);
    expect(v.cups.cup.status).toMatch(/^Still in · Round of 64 v .+ \((home|away)\)$/);
    expect(v.cups.cup.next).toBe('After matchday 6');
    expect(v.match!.clock).toMatch(/^\d+'$/);
    expect(statusText(game)).toMatch(/^\$\(trophy\) [A-Z0-9]{3} \d+–\d+ [A-Z0-9]{3} \d+'$/);
  });

  it('resets back to setup', () => {
    const { game, saves } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 7 });
    game.reset();
    expect(game.career).toBeNull();
    expect(saves.at(-1)).toBeNull();
    vi.advanceTimersByTime(minute * 10);
    expect(game.live).toBeNull();
  });
});

describe('season end view', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports the season and lets the player allocate exactly their points', () => {
    const { game } = setup();
    game.duration = '30s';
    game.start({ rating: 30, difficulty: 'easy', seed: 9 });
    vi.advanceTimersByTime(60 * 60 * 1000);
    const v = buildView(game);
    if (v.screen !== 'game' || !v.seasonEnd) throw new Error('expected season end');
    const e = v.seasonEnd;
    expect(e.table.rows).toHaveLength(20);
    expect(e.report.record).toMatch(/^\d+W \d+D \d+L$/);
    // Players never see ratings or how the drain split: no numbers reach the webview.
    expect(JSON.stringify(v.club)).not.toMatch(/"attack"|"defence"|"rating"/);
    expect(e).not.toHaveProperty('decline');
    expect(v.club.goals.played).toBe(38);
    // One question: attack answer first, and nothing about how the points split.
    expect(e.question.options.map((o) => o.focus)).toEqual(['attack', 'defence']);
    expect(e.question.prompt).toMatch(/\?$/);
    expect(JSON.stringify(e.question)).not.toMatch(/\d/);
    expect(e.playoffs?.semis).toHaveLength(2);

    expect(e).not.toHaveProperty('points');
    const points = game.career!.pending!.points;
    expect(() => game.allocate({ attack: points + 1, defence: 0 })).toThrow();
    const half = Math.floor(points / 2);
    game.allocate({ attack: half, defence: points - half });
    expect(game.career!.history).toHaveLength(1);
    expect(buildView(game).screen).toBe('game');
  });
});

describe('match length', () => {
  it('never changes results: 30 sec, 2 min and 5 min play identically', () => {
    const play = (duration: '30s' | '2m' | '5m') => {
      let pending: (() => void) | null = null;
      const game = new Game({ save: () => {}, changed: () => {} }, { setTimeout: (fn) => ((pending = fn), 1), clearTimeout: () => (pending = null) });
      game.duration = duration;
      game.start({ rating: 50, difficulty: 'medium', seed: 77 });
      for (let i = 0; i < 2000 && game.career!.season.round < 10 && pending; i++) {
        const fn: () => void = pending;
        pending = null;
        fn();
      }
      return JSON.stringify(game.career!.season.leagues.map((l) => l.table));
    };
    const short = play('30s');
    expect(play('2m')).toBe(short);
    expect(play('5m')).toBe(short);
  });
});

describe('saves from other versions', () => {
  const current = () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 11 });
    game.shutdown();
    return JSON.parse(JSON.stringify(game.snapshot())) as SavedGame;
  };

  it('runs each upgrade in turn up to the current version', () => {
    const old = { ...current(), version: SAVE_VERSION - 2, paused: false };
    const migrations = {
      [SAVE_VERSION - 2]: (s: SavedGame) => ({ ...s, paused: true }),
      [SAVE_VERSION - 1]: (s: SavedGame) => ({ ...s, live: null }),
    };
    expect(migrate(old, migrations)).toMatchObject({ version: SAVE_VERSION, paused: true, live: null });
  });

  it("can't read a save with a gap in its upgrades, or one from a newer version", () => {
    expect(migrate({ ...current(), version: SAVE_VERSION - 1 }, {})).toBeNull();
    expect(migrate({ ...current(), version: SAVE_VERSION + 1 }, {})).toBeNull();
    expect(migrate(current(), {})).not.toBeNull();
  });

  it('hands an unreadable save to the host once, from the window running the game', () => {
    const unreadable = vi.fn();
    const game = new Game({ save: () => {}, changed: () => {}, unreadable });
    const old = { ...current(), version: SAVE_VERSION + 1 };
    game.load(old, false);
    expect(unreadable).not.toHaveBeenCalled();
    game.load(old);
    expect(unreadable).toHaveBeenCalledWith(old);
    expect(game.career).toBeNull();
  });
});

describe('outside the box', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks for a career in the status bar until one starts', () => {
    const { game } = setup();
    expect(statusText(game)).toBe('$(trophy) Start a career');
    expect(statusTooltip(game)).toMatch(/start a career/);
    expect(collapsedText(game)).toBeUndefined();
  });

  it('calls out a goal in the player\'s match for a few seconds, then goes back to the score', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 21, team: 'SCO' });
    const watch = new GoalWatch();
    const goals = () => game.shownMatch!.match.home.goals + game.shownMatch!.match.away.goals;
    let now = 0;
    expect(watch.check(game, now)).toBe(false);
    while (game.phase === 'live' && goals() === 0) {
      vi.advanceTimersByTime(minute);
      now += minute;
      if (game.phase === 'live' && goals() === 0) expect(watch.check(game, now)).toBe(false);
    }
    expect(game.phase).toBe('live'); // seed 21 has a goal
    expect(watch.check(game, now)).toBe(true);
    expect(statusText(game, true)).toMatch(/^\$\(trophy\) GOAL! SCO|^\$\(trophy\) GOAL! [A-Z]{3} \d–\d SCO/);
    expect(watch.check(game, now + GoalWatch.MS + 1)).toBe(false);
  });

  it('sums up the club in the hover and beside the collapsed box', () => {
    const { game } = setup();
    game.start({ rating: 50, difficulty: 'medium', seed: 22, team: 'WAL' });
    vi.advanceTimersByTime(minute * 30);
    expect(statusTooltip(game)).toMatch(/^\*\*Wales\*\* · League \d, \d+(st|nd|rd|th) · 0\/38 played/);
    expect(statusTooltip(game)).toMatch(/Expected to finish \d+/);
    expect(collapsedText(game)).toMatch(/^\d+(st|nd|rd|th) Wk 1\/38 · [A-Z]{3} \d+–\d+ [A-Z]{3} 30'$/);
  });
});
