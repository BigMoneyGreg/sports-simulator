import type { Rng } from '../../core/rng';
import type { MatchOptions, MatchOutcome, SportModule, TeamSheet } from '../../core/sport';
import { effectiveStats } from '../football/match';

/** Tuned by tools/balance-sports.ts: favourites win about 79% of decided games, as in real internationals. */
export const TUNING = {
  baseTries: 2.8,
  basePenalties: 2.3,
  /** How much a small gap in overall strength moves try-scoring; penalties move by `penaltyGapShare` of that. */
  slope: 1.0,
  penaltyGapShare: 0.35,
  /**
   * The most that gap can multiply tries by, as a logarithm: a small edge counts
   * for a lot, as in real rugby, but a huge one levels off, or a mismatch ends 150–0.
   */
  maxEffect: 0.6,
  /**
   * How much the sides' shapes move scoring on top: an attacking side scores more
   * and leaks more. Kept apart from strength, or two attacking sides trade tries
   * and the better one barely shows.
   */
  shapeSlope: 0.2,
  homeAdvantage: 1.1,
  awayFactor: 0.93,
  formSpread: 0.15,
  conversion: 0.72,
  dropGoalsPerTeam: 0.08,
  yellowsPerTeam: 1.1,
  straightRedsPerTeam: 0.06,
  sinBinMinutes: 10,
  /** Scoring per player off the field, for his side and for the other. */
  shortOwnFactor: 0.72,
  shortOpponentFactor: 1.25,
  contestConversion: 0.7,
};

export type Period = 'first' | 'second' | 'et1' | 'et2' | 'done';
export type SideKey = 'home' | 'away';

export type RugbyEvent =
  | { type: 'kickoff'; minute: 0 }
  | { type: 'try'; minute: number; side: SideKey; playerId: number; converted: boolean; kicker: number; score: [number, number] }
  | { type: 'penalty' | 'dropGoal'; minute: number; side: SideKey; playerId: number; score: [number, number] }
  | { type: 'yellow'; minute: number; side: SideKey; playerId: number }
  | { type: 'red'; minute: number; side: SideKey; playerId: number }
  | { type: 'halftime' | 'fulltime'; minute: number; score: [number, number] }
  | { type: 'extraTime'; minute: number }
  | { type: 'kickingContest'; minute: number; score: [number, number] };

export interface Side {
  sheet: TeamSheet;
  /** The side's points. Named as in the other sports, so tables and records treat them alike. */
  goals: number;
  tries: number;
  tryRate: number;
  penaltyRate: number;
  reds: number;
  /** Minutes at which players in the sin bin come back. */
  binned: number[];
  sentOff: number[];
}

export interface RugbyMatch {
  home: Side;
  away: Side;
  period: Period;
  minute: number;
  neutral: boolean;
  knockout?: { aggregate: [number, number] };
  penalties?: [number, number];
  events: RugbyEvent[];
}

const PERIOD_END: Record<Exclude<Period, 'done'>, number> = { first: 40, second: 80, et1: 90, et2: 100 };
const TRY_WEIGHT: Record<string, number> = { BACK3: 5, CEN: 3, LOOSE: 2, HOOK: 1.5, SH: 1.5, FH: 1, LOCK: 1, PROP: 0.8 };
const CARD_WEIGHT: Record<string, number> = { LOOSE: 3, LOCK: 3, PROP: 2, HOOK: 2, CEN: 2, BACK3: 1, SH: 1, FH: 1 };

function venueFactor(venue: 'home' | 'away' | 'neutral'): number {
  return venue === 'home' ? TUNING.homeAdvantage : venue === 'away' ? TUNING.awayFactor : 1;
}

type Stats = { attack: number; defence: number };

/** Tries and penalties a side expects from a match, before form and cards. */
export function expectedScores(mine: Stats, theirs: Stats, venue: 'home' | 'away' | 'neutral'): { tries: number; penalties: number } {
  const strength = (mine.attack + mine.defence - theirs.attack - theirs.defence) / 2;
  const shape = mine.attack - theirs.defence - strength;
  const effect = TUNING.maxEffect * Math.tanh((TUNING.slope * strength) / 10 / TUNING.maxEffect);
  return {
    tries: TUNING.baseTries * Math.exp(effect + (TUNING.shapeSlope * shape) / 10) * venueFactor(venue),
    penalties: TUNING.basePenalties * Math.exp(TUNING.penaltyGapShare * effect) * venueFactor(venue),
  };
}

export function createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): RugbyMatch {
  const neutral = options.neutral ?? false;
  const homeForm = 1 + rng.range(-1, 1) * TUNING.formSpread;
  const awayForm = 1 + rng.range(-1, 1) * TUNING.formSpread;
  const h = effectiveStats(home);
  const a = effectiveStats(away);
  const homeExpected = expectedScores(h, a, neutral ? 'neutral' : 'home');
  const awayExpected = expectedScores(a, h, neutral ? 'neutral' : 'away');
  const side = (sheet: TeamSheet, e: { tries: number; penalties: number }, mine: number, theirs: number): Side => ({
    sheet,
    goals: 0,
    tries: 0,
    tryRate: (e.tries * mine) / Math.sqrt(theirs) / 80,
    penaltyRate: e.penalties / 80,
    reds: 0,
    binned: [],
    sentOff: [],
  });
  return {
    home: side(home, homeExpected, homeForm, awayForm),
    away: side(away, awayExpected, awayForm, homeForm),
    period: 'first',
    minute: 0,
    neutral,
    knockout: options.knockout ? { aggregate: [...options.knockout.aggregate] } : undefined,
    events: [{ type: 'kickoff', minute: 0 }],
  };
}

function currentScore(m: RugbyMatch): [number, number] {
  return [m.home.goals, m.away.goals];
}

function isLevel(m: RugbyMatch): boolean {
  const [aggHome, aggAway] = m.knockout?.aggregate ?? [0, 0];
  return m.home.goals + aggHome === m.away.goals + aggAway;
}

export function step(m: RugbyMatch, rng: Rng): void {
  if (m.period === 'done') return;
  if (m.minute < PERIOD_END[m.period]) {
    m.minute++;
    playMinute(m, rng);
    return;
  }
  const score = currentScore(m);
  const at = m.minute;
  switch (m.period) {
    case 'first':
      m.events.push({ type: 'halftime', minute: at, score });
      m.period = 'second';
      return;
    case 'second':
      if (m.knockout && isLevel(m)) {
        m.events.push({ type: 'extraTime', minute: at });
        m.period = 'et1';
      } else {
        m.events.push({ type: 'fulltime', minute: at, score });
        m.period = 'done';
      }
      return;
    case 'et1':
      m.period = 'et2';
      return;
    case 'et2':
      if (isLevel(m)) kickingContest(m, rng);
      m.events.push({ type: 'fulltime', minute: at, score });
      m.period = 'done';
      return;
  }
}

function playMinute(m: RugbyMatch, rng: Rng): void {
  for (const key of ['home', 'away'] as const) {
    const side = m[key];
    const other = m[key === 'home' ? 'away' : 'home'];
    side.binned = side.binned.filter((back) => back > m.minute);
    const short = (s: Side) => s.reds + s.binned.length;
    const factor = TUNING.shortOwnFactor ** short(side) * TUNING.shortOpponentFactor ** short(other);

    if (rng.chance(side.tryRate * factor)) {
      const converted = rng.chance(TUNING.conversion);
      side.tries++;
      side.goals += converted ? 7 : 5;
      m.events.push({ type: 'try', minute: m.minute, side: key, playerId: pick(side, rng, TRY_WEIGHT), converted, kicker: kicker(side), score: currentScore(m) });
    } else if (rng.chance(side.penaltyRate * factor)) {
      side.goals += 3;
      m.events.push({ type: 'penalty', minute: m.minute, side: key, playerId: kicker(side), score: currentScore(m) });
    } else if (rng.chance(TUNING.dropGoalsPerTeam / 80)) {
      side.goals += 3;
      m.events.push({ type: 'dropGoal', minute: m.minute, side: key, playerId: kicker(side), score: currentScore(m) });
    }

    if (rng.chance(TUNING.yellowsPerTeam / 80)) {
      const playerId = pick(side, rng, CARD_WEIGHT);
      side.binned.push(m.minute + TUNING.sinBinMinutes);
      m.events.push({ type: 'yellow', minute: m.minute, side: key, playerId });
    } else if (rng.chance(TUNING.straightRedsPerTeam / 80)) {
      const playerId = pick(side, rng, CARD_WEIGHT);
      side.reds++;
      side.sentOff.push(playerId);
      m.events.push({ type: 'red', minute: m.minute, side: key, playerId });
    }
  }
}

function pick(side: Side, rng: Rng, weights: Record<string, number>): number {
  const remaining = side.sheet.lineup.filter((p) => !side.sentOff.includes(p.id));
  return rng.weighted(remaining.length ? remaining : side.sheet.lineup, (p) => weights[p.position] ?? 1).id;
}

/** The fly-half kicks; if he's off, whoever is left. */
function kicker(side: Side): number {
  const remaining = side.sheet.lineup.filter((p) => !side.sentOff.includes(p.id));
  return (remaining.find((p) => p.position === 'FH') ?? remaining[0] ?? side.sheet.lineup[0]).id;
}

/** Level after extra time: five kicks each, then one at a time until someone misses. */
function kickingContest(m: RugbyMatch, rng: Rng): void {
  const score: [number, number] = [0, 0];
  for (let round = 0; round < 5 || score[0] === score[1]; round++) {
    if (rng.chance(TUNING.contestConversion)) score[0]++;
    if (rng.chance(TUNING.contestConversion)) score[1]++;
  }
  m.penalties = score;
  m.events.push({ type: 'kickingContest', minute: m.minute, score });
}

export function isFinished(m: RugbyMatch): boolean {
  return m.period === 'done';
}

/** 4 for a win, 2 for a draw, plus a bonus for four tries and for losing by seven or fewer. */
export function leaguePoints(home: Pick<Side, 'goals' | 'tries'>, away: Pick<Side, 'goals' | 'tries'>): [number, number] {
  const one = (me: Pick<Side, 'goals' | 'tries'>, them: Pick<Side, 'goals' | 'tries'>) =>
    (me.goals > them.goals ? 4 : me.goals === them.goals ? 2 : them.goals - me.goals <= 7 ? 1 : 0) + (me.tries >= 4 ? 1 : 0);
  return [one(home, away), one(away, home)];
}

export function outcome(m: RugbyMatch): MatchOutcome {
  const goals = m.events.flatMap((e) => (e.type === 'try' ? [{ side: e.side, playerId: e.playerId, minute: e.minute, added: 0, ownGoal: false }] : []));
  const result: MatchOutcome = { homeGoals: m.home.goals, awayGoals: m.away.goals, goals, points: leaguePoints(m.home, m.away) };
  const sentOff = m.events.flatMap((e) => (e.type === 'red' ? [{ side: e.side, playerId: e.playerId }] : []));
  if (sentOff.length) result.sentOff = sentOff;
  if (m.knockout) {
    result.extraTime = m.events.some((e) => e.type === 'extraTime');
    if (m.penalties) {
      result.penalties = m.penalties;
      result.winner = m.penalties[0] > m.penalties[1] ? 'home' : 'away';
    } else {
      result.winner = m.home.goals + m.knockout.aggregate[0] > m.away.goals + m.knockout.aggregate[1] ? 'home' : 'away';
    }
  }
  return result;
}

export const rugby: SportModule<RugbyMatch> = {
  createMatch,
  step,
  isFinished,
  outcome,
  ticks: 80,
  countsLive: (m) => m.minute !== 0,
  alerts: (m) => [m.home.tries, m.away.tries],
  notable: (m) => m.home.tries + m.away.tries + m.home.reds + m.away.reds,
};
