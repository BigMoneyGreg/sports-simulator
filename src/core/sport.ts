import type { Rng } from './rng';
import type { Duration } from '../shared/view';

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
  /** What this entry counts for in the tallies, if not 1: a batter's runs. */
  count?: number;
}

export interface MatchOutcome {
  homeGoals: number;
  awayGoals: number;
  goals: GoalRecord[];
  /** Set for knockout ties (after aggregate, extra time and penalties), and whenever a sport settles level scores. */
  winner?: 'home' | 'away';
  /** How a level tie was settled: a shootout, rugby's kicking contest or cricket's super over. */
  penalties?: [number, number];
  extraTime?: boolean;
  /** Players sent off, who miss their team's next match. */
  sentOff?: { side: 'home' | 'away'; playerId: number }[];
  /** League points earned, where the sport doesn't use 3 for a win and 1 for a draw. */
  points?: [number, number];
  /** Cricket: balls each side counts as having faced, for run rates. */
  balls?: [number, number];
  /** Cricket: wickets taken, by player. */
  wicketTakers?: { playerId: number; count: number }[];
}

/** The match simulation a sport plugs into the shared league core. */
export interface SportModule<M> {
  createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): M;
  /** Advances one tick (one match-minute). Returns nothing once finished. */
  step(match: M, rng: Rng): void;
  isFinished(match: M): boolean;
  outcome(match: M): MatchOutcome;
  /** Ticks in a normal match: how a match length turns into a clock speed. */
  ticks: number;
  /** Whether the live tables should fold in this match's score as it stands. */
  countsLive(match: M): boolean;
  /** How many big moments went each side's way, for the flash and status bar: goals, tries, wickets. */
  alerts(match: M): [number, number];
  /** Rises when something happens worth saving straight away. */
  notable(match: M): number;
}

/** One line of the match report: a score, a card, or a break in play. */
export interface TimelineItem {
  clock: string;
  /** `goal` is the sport's main event (a goal, a try, a wicket); `minor` a smaller one (a penalty, a fifty). */
  kind: 'goal' | 'minor' | 'yellow' | 'red' | 'break';
  side?: 'home' | 'away';
  text: string;
  /** Running score after a goal, e.g. "2–1". */
  score?: string;
}

export interface TimelineContext {
  playerName(side: 'home' | 'away', playerId: number): string;
}

/** The words a sport uses, shown as they are. */
export interface SportTerms {
  name: string;
  /** What the summer's two answers strengthen. */
  attack: string;
  defence: string;
  /** "for goals scored", beside the attack's rank. */
  clueScored: string;
  clueConceded: string;
  diffShort: string;
  diffLong: string;
  /** Whether the table needs a drawn column. */
  draws: boolean;
  /** Between the two scores: "2–1", "156/4 v 142/9". */
  scoreJoin: string;
  /** Called out in the status bar: "GOAL!". */
  alert: string;
  eventName: string;
  noEventsYet: string;
  topScorer: string;
  topScorers: string;
  mostInSeason: string;
  /** How a level knockout was settled: short for fixtures, long for sentences. */
  deciderShort: string;
  deciderLong: string;
  /** Beside its score on the scoreboard: "Pens 4–2". */
  deciderLabel: string;
  /** "Every summer some players retire…" and "Whatever the question…". */
  howTo: [string, string];
  /** Roughly how long a whole season takes at each match length. */
  seasonLabels: Partial<Record<Duration, string>>;
}

/** The summer question's wording for a sport. */
export interface QuestionCopy {
  callUp: { prompt: string };
  coach: { prompt: string };
  formation: { prompt: string; titles: Record<'attack' | 'defence', string> };
  training: { prompt: string; titles: Record<'attack' | 'defence', string> };
}

/** One innings of a scorecard, as shown. */
export interface InningsCard {
  team: string;
  /** "156/4". */
  total: string;
  /** "18.2". */
  overs: string;
  /** Being played now. */
  live: boolean;
  batters: { name: string; how: string; runs: number; balls: number; out: boolean; striker: boolean }[];
  yetToBat: string[];
  bowlers: { name: string; overs: string; runs: number; wickets: number }[];
}

/** How a sport's matches read on screen. */
export interface SportPresenter<M> {
  terms: SportTerms;
  questions: QuestionCopy;
  /** Match lengths offered, shortest first. */
  durations: Duration[];
  clock(match: M): string;
  timeline(match: M, ctx: TimelineContext): TimelineItem[];
  /** Each side's score as shown: "2", "24", "156/4". */
  score(match: M): [string, string];
  /** Under the scoreboard: "Need 34 from 18 balls". */
  situation?(match: M, names: [string, string]): string | undefined;
  /** Smaller lines under that: this over. */
  details?(match: M, ctx: TimelineContext): string[];
  /** A sport with a scorecard shows it instead of the match report, latest innings first. */
  scorecard?(match: M, ctx: TimelineContext, teams: [string, string]): InningsCard[];
  /** The full-time card's note ("after extra time") and scorers line. */
  fullTime(match: M, names: [string, string], name: (id: number) => string): { note?: string; scorers: string };
  /** Under a leaver's name: "142 goals", "38 tries", "2,310 runs". */
  tally(player: Pick<Player, 'number' | 'position'>, scored: number, wickets: number): string | undefined;
}
