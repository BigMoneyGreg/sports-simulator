// The game clock. No VS Code imports: timers, saving and notifications are
// injected, so the whole loop runs under fake timers in tests.

import {
  allocatePoints,
  focusAllocation,
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
import type { Stat } from '../core/club';
import { footballSport } from '../sports/football';
import { createMatch, isFinished, outcome, step, type FootballMatch } from '../sports/football/match';
import type { Duration } from '../shared/view';

export const SAVE_VERSION = 4;

/** Real milliseconds per match-minute. */
export const MINUTE_MS: Record<Duration, number> = {
  '30s': 30_000 / 90,
  '2m': 120_000 / 90,
  '5m': 300_000 / 90,
};

/** How long the full-time result stays up before the next matchday. */
export function fullTimePause(duration: Duration): number {
  return duration === '30s' ? 3000 : 5000;
}

export interface LiveRound {
  fixtures: Fixture[];
  matches: FootballMatch[];
  /** Index of the player's match in `fixtures`. */
  player: number;
  rng: number;
}

export interface SavedGame {
  version: number;
  career: Career;
  live: LiveRound | null;
  paused: boolean;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface GameHost {
  save(game: SavedGame | null): void;
  /** Something visible changed. */
  changed(): void;
  fullTime?(match: FootballMatch, fixture: Fixture): void;
  seasonOver?(end: SeasonEnd): void;
}

export type Phase = 'idle' | 'live' | 'fullTime' | 'seasonOver';

export class Game {
  career: Career | null = null;
  live: LiveRound | null = null;
  /** The player's last finished match, shown during the full-time pause. */
  lastMatch: { match: FootballMatch; fixture: Fixture } | null = null;
  paused = false;
  phase: Phase = 'idle';
  duration: Duration = '2m';
  private timer: unknown = null;

  constructor(
    private readonly host: GameHost,
    private readonly scheduler: Scheduler = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  ) {}

  // -- lifecycle ------------------------------------------------------------

  load(saved: SavedGame | null): void {
    this.stop();
    if (!saved || saved.version !== SAVE_VERSION) return;
    this.career = saved.career;
    this.live = saved.live;
    this.paused = saved.paused;
    this.phase = this.career.pending ? 'seasonOver' : this.live ? 'live' : 'idle';
    this.run();
  }

  start(options: CareerOptions): void {
    this.stop();
    this.career = newCareer(options, footballSport);
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
    this.host.save(null);
    this.host.changed();
  }

  /** Stops the clock (VS Code closing) and saves exactly where it was. */
  shutdown(): void {
    this.stop();
    this.save();
  }

  setDuration(duration: Duration): void {
    this.duration = duration;
    if (this.phase === 'live' && !this.paused) {
      this.stop();
      this.schedule(() => this.tick(), MINUTE_MS[duration]);
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
    this.host.changed();
    if (!paused) this.run();
  }

  chooseFocus(focus: Focus): void {
    if (!this.career?.pending) return;
    this.allocate(focusAllocation(this.career.clubs[this.career.playerClubId], this.career.pending.points, focus));
  }

  allocate(allocation: Record<Stat, number>): void {
    if (!this.career?.pending) return;
    allocatePoints(this.career, allocation);
    this.phase = 'idle';
    this.save();
    this.host.changed();
    this.run();
  }

  // -- the loop -------------------------------------------------------------

  private run(): void {
    if (!this.career || this.paused) return;
    switch (this.phase) {
      case 'seasonOver':
        return;
      case 'live':
        this.schedule(() => this.tick(), MINUTE_MS[this.duration]);
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
    this.lastMatch = null;
    for (;;) {
      if (career.pending || isSeasonOver(career)) {
        const end = endSeason(career);
        this.phase = 'seasonOver';
        this.live = null;
        this.save();
        this.host.seasonOver?.(end);
        this.host.changed();
        return;
      }
      const fixtures = nextRound(career)!;
      const mine = playerInRound(career, fixtures);
      if (!mine) {
        playRound(career, footballSport);
        continue;
      }
      const rng = new Rng(career.rng);
      const matches = fixtures.map((f) =>
        createMatch(teamSheet(career, f.home, footballSport), teamSheet(career, f.away, footballSport), f.options, rng),
      );
      this.live = { fixtures, matches, player: fixtures.indexOf(mine), rng: rng.state };
      this.phase = 'live';
      this.save();
      this.host.changed();
      this.schedule(() => this.tick(), MINUTE_MS[this.duration]);
      return;
    }
  }

  /** One match-minute for every match in the round. */
  tick(): void {
    const live = this.live;
    if (!live || this.paused) return;
    const rng = new Rng(live.rng);
    const mine = live.matches[live.player];
    const eventsBefore = mine.events.length;
    for (const m of live.matches) if (!isFinished(m)) step(m, rng);
    live.rng = rng.state;

    if (isFinished(mine)) {
      // The player's match is over: finish the rest of the round straight away.
      for (const m of live.matches) while (!isFinished(m)) step(m, rng);
      live.rng = rng.state;
      this.finishRound();
      return;
    }
    if (mine.events.slice(eventsBefore).some((e) => e.type === 'goal' || e.type === 'red')) this.save();
    this.host.changed();
    this.schedule(() => this.tick(), MINUTE_MS[this.duration]);
  }

  private finishRound(): void {
    const career = this.career!;
    const live = this.live!;
    career.rng = live.rng;
    completeRound(
      career,
      live.fixtures.map((fixture, i) => ({ fixture, outcome: outcome(live.matches[i]) })),
    );
    this.lastMatch = { match: live.matches[live.player], fixture: live.fixtures[live.player] };
    this.live = null;
    this.phase = 'fullTime';
    this.save();
    this.host.fullTime?.(this.lastMatch.match, this.lastMatch.fixture);
    this.host.changed();
    this.schedule(() => this.nextMatchday(), fullTimePause(this.duration));
  }

  // -- helpers --------------------------------------------------------------

  /** The match to show: live, or the one that just finished. */
  get shownMatch(): { match: FootballMatch; fixture: Fixture } | null {
    if (this.live) return { match: this.live.matches[this.live.player], fixture: this.live.fixtures[this.live.player] };
    return this.lastMatch;
  }

  snapshot(): SavedGame | null {
    if (!this.career) return null;
    return { version: SAVE_VERSION, career: this.career, live: this.live, paused: this.paused };
  }

  private save(): void {
    this.host.save(this.snapshot());
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
