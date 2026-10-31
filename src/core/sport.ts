import type { Rng } from './rng';

/** A player in a squad. Positions are sport-specific codes (e.g. GK, DEF). */
export interface Player {
  id: number;
  name: string;
  position: string;
  number: number;
  /** The season they joined; the first squad joined in season 1. */
  joined?: number;
}

/** What a sport module needs to know about a team for one match. */
export interface TeamSheet {
  clubId: number;
  attack: number;
  defence: number;
  /** Attack minus defence as the side has settled into it; the lopsidedness penalty follows this. Defaults to the real gap. */
  settledLean?: number;
  /** Starting line-up: player ids and positions. */
  lineup: { id: number; position: string }[];
}

export interface MatchOptions {
  /** Played at a neutral venue: no home advantage. */
  neutral?: boolean;
  /**
   * Knockout tie that must produce a winner. `aggregate` is the score from
   * earlier legs (home side's goals first), added before deciding a winner.
   */
  knockout?: { aggregate: [number, number] };
}

export interface GoalRecord {
  side: 'home' | 'away';
  playerId: number;
  minute: number;
  added: number;
  ownGoal: boolean;
}

export interface MatchOutcome {
  homeGoals: number;
  awayGoals: number;
  goals: GoalRecord[];
  /** Set for knockout ties (after aggregate, extra time and penalties). */
  winner?: 'home' | 'away';
  penalties?: [number, number];
  extraTime?: boolean;
  /** Players sent off, who miss their team's next match. */
  sentOff?: { side: 'home' | 'away'; playerId: number }[];
}

/** The match simulation a sport plugs into the shared league core. */
export interface SportModule<M> {
  createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): M;
  /** Advances one tick (one match-minute). Returns nothing once finished. */
  step(match: M, rng: Rng): void;
  isFinished(match: M): boolean;
  outcome(match: M): MatchOutcome;
}
