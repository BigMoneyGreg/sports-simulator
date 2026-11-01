// The game clock. No VS Code imports: timers, saving and notifications are
// injected, so the whole loop runs under fake timers in tests.

import {
  chooseFocus,
  type Focus,
  completeRound,
  endSeason,
  isSeasonOver,
  newCareer,
  nextRound,
  playerInRound,
  playRound,
  teamSheet,
  type Career,
  type CareerOptions,
  type SeasonEnd,
} from '../core/career';
import type { Fixture } from '../core/league';
import { Rng } from '../core/rng';
import type { SportId } from '../core/format';
import { SPORTS, type AnySport } from '../sports';
import { SEASON_LENGTHS, type SeasonLength } from '../shared/view';

export const SAVE_VERSION = 8;

/**
 * Upgrades for older saves: `MIGRATIONS[n]` turns a version-n save into
 * version n + 1. Whenever SAVE_VERSION goes up, add one here, so players'
 * careers carry over.
 */
export const MIGRATIONS: Record<number, (saved: SavedGame) => SavedGame> = {};

/** The save brought up to SAVE_VERSION, or null if it can't be (too old, or from a newer version). */
export function migrate(saved: SavedGame, migrations = MIGRATIONS): SavedGame | null {
  let s = saved;
  while (s.version < SAVE_VERSION) {
    const upgrade = migrations[s.version];
    if (!upgrade) return null;
    s = { ...upgrade(s), version: s.version + 1 };
  }
  return s.version === SAVE_VERSION ? s : null;
}


/** Real milliseconds per tick of a match: a match-minute, or in cricket an over. */
export function tickMs(sport: AnySport, duration: SeasonLength): number {
  return (sport.present.matchSeconds[duration] * 1000) / sport.module.ticks;
}

/** How long the full-time result stays up before the next matchday. */
export function fullTimePause(duration: SeasonLength): number {
  return duration === '25m' ? 3000 : 5000;
}

export interface LiveRound {
  fixtures: Fixture[];
  // Each sport's own match type: only its definition reads them.
  matches: any[];
  /** Index of the player's match in `fixtures`. */
  player: number;
  rng: number;
}

export interface SavedGame {
  version: number;
  career: Career;
  live: LiveRound | null;
  paused: boolean;
  /** This career's season length; older saves go without and take the default. */
  duration?: SeasonLength;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface GameHost {
  save(game: SavedGame | null): void;
  /** Something visible changed. */
  changed(): void;
  fullTime?(match: unknown, fixture: Fixture): void;
  seasonOver?(end: SeasonEnd): void;
  /** A save that couldn't be brought up to date: keep it somewhere before a new career replaces it. */
  unreadable?(saved: SavedGame): void;
}

export type Phase = 'idle' | 'live' | 'fullTime' | 'seasonOver';

export class Game {
  career: Career | null = null;
  live: LiveRound | null = null;
  /** The player's last finished match, shown during the full-time pause. */
  lastMatch: { match: any; fixture: Fixture } | null = null;
  paused = false;
  phase: Phase = 'idle';
  duration: SeasonLength = '90m';
  /** The sport being played, or chosen for the next career. */
  sportId: SportId = 'football';
  /** Hidden in the settings: the clock stands still, and `paused` stays as the player left it. Not saved. */
  private held = false;
  private timer: unknown = null;

  constructor(
    private readonly host: GameHost,
    private readonly scheduler: Scheduler = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  ) {}

  get sport(): AnySport {
    return SPORTS[this.sportId];
  }

  // -- lifecycle ------------------------------------------------------------

  /** Changes sport, with the clock stopped: the caller then loads that sport's save, if it has one. */
  selectSport(sport: SportId): void {
    this.stop();
    this.sportId = sport;
  }

  /** Loads a save; with `run` false it's only shown (another window is running the game). */
  load(found: SavedGame | null, run = true): void {
    this.stop();
    this.lastMatch = null;
    const saved = found && migrate(found);
    if (!saved) {
      this.career = null;
      this.live = null;
      this.phase = 'idle';
      // Only the window running the game deals with it, so it's kept once.
      if (found && run) this.host.unreadable?.(found);
      return;
    }
    this.career = saved.career;
    this.sportId = saved.career.sport;
    // A length from before seasons were what's chosen falls back to the default.
    if (saved.duration && SEASON_LENGTHS.includes(saved.duration)) this.duration = saved.duration;
    this.live = saved.live;
    this.paused = saved.paused;
    this.phase = this.career.pending ? 'seasonOver' : this.live ? 'live' : 'idle';
    if (run) this.run();
  }

  start(options: CareerOptions): void {
    this.stop();
    this.career = newCareer(options, this.sport);
    this.live = null;
    this.lastMatch = null;
    this.paused = false;
    this.phase = 'idle';
    this.save();
    this.run();
  }

  reset(): void {
    this.stop();
    this.career = null;
    this.live = null;
    this.lastMatch = null;
    this.phase = 'idle';
    this.tell(() => this.host.save(null));
    this.tell(() => this.host.changed());
  }

  /** Stops the clock (VS Code closing) and saves exactly where it was. */
  shutdown(): void {
    this.stop();
    this.save();
  }

  setDuration(duration: SeasonLength): void {
    const before = this.duration;
    this.duration = duration;
    if (this.career && this.duration !== before) this.save();
    // Only a running clock is rescheduled: a window that's just showing the game must not start one.
    if (this.phase === 'live' && this.timer !== null) {
      this.stop();
      this.schedule(() => this.tick(), tickMs(this.sport, this.duration));
    }
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    if (!this.career || this.paused === paused) return;
    this.paused = paused;
    this.stop();
    this.save();
    this.tell(() => this.host.changed());
    if (!paused) this.run();
  }

  /** With `run` false the clock isn't started (another window is running the game). */
  setHeld(held: boolean, run = true): void {
    if (this.held === held) return;
    this.held = held;
    this.stop();
    if (!held && run) this.run();
  }

  /** The summer answer: a call-up joins, most of the points go to that side, and the next season starts. */
  chooseFocus(focus: Focus): void {
    if (!this.career?.pending) return;
    chooseFocus(this.career, focus);
    this.nextSeason();
  }

  private nextSeason(): void {
    this.phase = 'idle';
    this.save();
    this.tell(() => this.host.changed());
    this.run();
  }

  // -- the loop -------------------------------------------------------------

  private run(): void {
    if (!this.career || this.paused || this.held) return;
    switch (this.phase) {
      case 'seasonOver':
        return;
      case 'live':
        this.schedule(() => this.tick(), tickMs(this.sport, this.duration));
        return;
      case 'fullTime':
        this.schedule(() => this.nextMatchday(), fullTimePause(this.duration));
        return;
      case 'idle':
        this.nextMatchday();
        return;
    }
  }

  /** Starts the next round the player plays in, resolving any rounds without them instantly. */
  private nextMatchday(): void {
    const career = this.career!;
    const sport = this.sport;
    this.lastMatch = null;
    for (;;) {
      if (career.pending || isSeasonOver(career)) {
        const end = endSeason(career, sport);
        this.phase = 'seasonOver';
        this.live = null;
        this.save();
        this.tell(() => this.host.seasonOver?.(end));
        this.tell(() => this.host.changed());
        return;
      }
      const fixtures = nextRound(career)!;
      const mine = playerInRound(career, fixtures);
      if (!mine) {
        playRound(career, sport);
        continue;
      }
      const rng = new Rng(career.rng);
      const matches = fixtures.map((f) => sport.module.createMatch(teamSheet(career, f.home, sport), teamSheet(career, f.away, sport), f.options, rng));
      this.live = { fixtures, matches, player: fixtures.indexOf(mine), rng: rng.state };
      this.phase = 'live';
      this.save();
      this.tell(() => this.host.changed());
      this.schedule(() => this.tick(), tickMs(sport, this.duration));
      return;
    }
  }

  /** One tick (in football, a match-minute) for every match in the round. */
  tick(): void {
    const live = this.live;
    if (!live || this.paused) return;
    const rng = new Rng(live.rng);
    const { module } = this.sport;
    const mine = live.matches[live.player];
    const notableBefore = module.notable(mine);
    for (const m of live.matches) if (!module.isFinished(m)) module.step(m, rng);
    live.rng = rng.state;

    if (module.isFinished(mine)) {
      // The player's match is over: finish the rest of the round straight away.
      for (const m of live.matches) while (!module.isFinished(m)) module.step(m, rng);
      live.rng = rng.state;
      this.finishRound();
      return;
    }
    if (module.notable(mine) !== notableBefore) this.save();
    this.tell(() => this.host.changed());
    this.schedule(() => this.tick(), tickMs(this.sport, this.duration));
  }

  private finishRound(): void {
    const career = this.career!;
    const live = this.live!;
    career.rng = live.rng;
    completeRound(
      career,
      live.fixtures.map((fixture, i) => ({ fixture, outcome: this.sport.module.outcome(live.matches[i]) })),
    );
    const last = { match: live.matches[live.player], fixture: live.fixtures[live.player] };
    this.lastMatch = last;
    this.live = null;
    this.phase = 'fullTime';
    this.save();
    this.tell(() => this.host.fullTime?.(last.match, last.fixture));
    this.tell(() => this.host.changed());
    this.schedule(() => this.nextMatchday(), fullTimePause(this.duration));
  }

  // -- helpers --------------------------------------------------------------

  /** Saving or redrawing can fail (a full disk, a file held open); that must never stop the clock. */
  private tell(call: () => void): void {
    try {
      call();
    } catch (error) {
      console.error('Sports Simulator:', error);
    }
  }

  /** The match to show: live, or the one that just finished. */
  get shownMatch(): { match: any; fixture: Fixture } | null {
    if (this.live) return { match: this.live.matches[this.live.player], fixture: this.live.fixtures[this.live.player] };
    return this.lastMatch;
  }

  snapshot(): SavedGame | null {
    if (!this.career) return null;
    return { version: SAVE_VERSION, career: this.career, live: this.live, paused: this.paused, duration: this.duration };
  }

  private save(): void {
    this.tell(() => this.host.save(this.snapshot()));
  }

  private schedule(fn: () => void, ms: number): void {
    this.stop();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private stop(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }
}
