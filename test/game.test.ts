import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillAllocation } from '../src/core/career';
import { Game, MINUTE_MS, type SavedGame } from '../src/extension/game';
import { buildView, statusText } from '../src/extension/viewModel';

function setup() {
  const saves: (SavedGame | null)[] = [];
  const seasonOver = vi.fn();
  const fullTime = vi.fn();
  const changed = vi.fn();
  const game = new Game({ save: (g) => saves.push(g && JSON.parse(JSON.stringify(g))), changed, seasonOver, fullTime });
  return { game, saves, seasonOver, fullTime, changed };
}

const minute = MINUTE_MS['2m'];

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
    expect(v.fixtures).toHaveLength(38);
    expect(v.match!.clock).toMatch(/^\d+'$/);
    expect(statusText(game)).toMatch(/^⚽ [A-Z0-9]{3} \d+–\d+ [A-Z0-9]{3} \d+'$/);
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
    expect(e.options.map((o) => o.focus)).toEqual(['attack', 'balanced', 'defence']);
    for (const o of e.options) expect(o.attack + o.defence).toBe(e.points.total);
    const focused = e.options[0];
    expect(focused.attack).toBeGreaterThan(focused.defence);
    expect(e.playoffs?.semis).toHaveLength(2);

    expect(() => game.allocate({ attack: e.points.total + 1, defence: 0 })).toThrow();
    const half = Math.floor(e.points.total / 2);
    game.allocate({ attack: half, defence: e.points.total - half });
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
