import type { Rng } from '../../core/rng';
import type { MatchOptions, MatchOutcome, SportModule, TeamSheet } from '../../core/sport';

/** Starting values from DESIGN.md §5; tuned by tools/balance.ts. */
export const TUNING = {
  baseXg: 1.17,
  slope: 0.25,
  homeAdvantage: 1.14,
  awayFactor: 0.9,
  /** Form-on-the-day spread at chemistry 0 and 99 (multiplier drawn from 1 ± spread). */
  formSpreadLow: 0.3,
  formSpreadHigh: 0.08,
  /** Boost after 75' per 99 points of chemistry advantage. */
  lateChemistry: 0.2,
  yellowsPerTeam: 1.7,
  straightRedsPerTeam: 0.05,
  bookedCaution: 0.25,
  redOwnFactor: 0.72,
  redOpponentFactor: 1.2,
  ownGoalShare: 0.03,
  chancesPerGoal: 2.5,
  penaltyConversion: 0.76,
  /** Share of effective attack and defence that comes from chemistry. */
  chemistryLink: 1 / 3,
  /** Effective attack and defence lost per point a stat lags the team's rating (beyond the tolerance). */
  weaknessPenalty: 2,
  weaknessTolerance: 2,
};

export type Period = 'first' | 'second' | 'et1' | 'et2' | 'done';
export type SideKey = 'home' | 'away';

export type MatchEvent =
  | { type: 'kickoff'; minute: 0; added: 0 }
  | { type: 'goal'; minute: number; added: number; side: SideKey; playerId: number; ownGoal: boolean; score: [number, number] }
  | { type: 'chance'; minute: number; added: number; side: SideKey; playerId: number; result: 'saved' | 'wide' | 'post' | 'blocked' }
  | { type: 'yellow'; minute: number; added: number; side: SideKey; playerId: number }
  | { type: 'red'; minute: number; added: number; side: SideKey; playerId: number; secondYellow: boolean }
  | { type: 'addedTime'; minute: number; added: 0; amount: number }
  | { type: 'halftime' | 'fulltime' | 'extraTimeHalftime'; minute: number; added: number; score: [number, number] }
  | { type: 'extraTime'; minute: number; added: number }
  | { type: 'penalties'; minute: number; added: number; kicks: { side: SideKey; playerId: number; scored: boolean }[]; score: [number, number] };

export interface Side {
  sheet: TeamSheet;
  goals: number;
  /** Expected goals per minute before minute weighting and red cards. */
  rate: number;
  reds: number;
  yellows: Record<number, number>;
  sentOff: number[];
}

export interface FootballMatch {
  home: Side;
  away: Side;
  period: Period;
  minute: number;
  added: number;
  addedTotal: number;
  neutral: boolean;
  knockout?: { aggregate: [number, number] };
  penalties?: [number, number];
  events: MatchEvent[];
}

const PERIOD_END: Record<Exclude<Period, 'done'>, number> = { first: 45, second: 90, et1: 105, et2: 120 };

const SCORER_WEIGHT: Record<string, number> = { GK: 0.02, DEF: 1, MID: 2.5, FWD: 6 };
const CARD_WEIGHT: Record<string, number> = { GK: 0.4, DEF: 3, MID: 3, FWD: 1.5 };

export function formSpread(chemistry: number): number {
  const c = clamp(chemistry, 0, 99) / 99;
  return TUNING.formSpreadLow + (TUNING.formSpreadHigh - TUNING.formSpreadLow) * c;
}

/**
 * Attack and defence as they play on the pitch. Chemistry links the team, so
 * it feeds both; a stat lagging behind the rest is a weakness opponents
 * exploit, which drags both down.
 */
export function effectiveStats(team: Pick<TeamSheet, 'attack' | 'defence' | 'chemistry'>): { attack: number; defence: number } {
  const { chemistryLink: link, weaknessPenalty, weaknessTolerance } = TUNING;
  const mean = (team.attack + team.defence + team.chemistry) / 3;
  const weakness = [team.attack, team.defence, team.chemistry].reduce((t, v) => t + Math.max(0, mean - v - weaknessTolerance), 0);
  const penalty = weaknessPenalty * weakness;
  return {
    attack: (1 - link) * team.attack + link * team.chemistry - penalty,
    defence: (1 - link) * team.defence + link * team.chemistry - penalty,
  };
}

/** Expected goals per match for a side before form, cards and timing. */
export function expectedGoals(attack: number, opponentDefence: number, venue: 'home' | 'away' | 'neutral'): number {
  const venueFactor = venue === 'home' ? TUNING.homeAdvantage : venue === 'away' ? TUNING.awayFactor : 1;
  return TUNING.baseXg * Math.exp((TUNING.slope * (attack - opponentDefence)) / 10) * venueFactor;
}

export function createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): FootballMatch {
  const neutral = options.neutral ?? false;
  const homeForm = 1 + rng.range(-1, 1) * formSpread(home.chemistry);
  const awayForm = 1 + rng.range(-1, 1) * formSpread(away.chemistry);
  const h = effectiveStats(home);
  const a = effectiveStats(away);
  const homeXg = (expectedGoals(h.attack, a.defence, neutral ? 'neutral' : 'home') * homeForm) / Math.sqrt(awayForm);
  const awayXg = (expectedGoals(a.attack, h.defence, neutral ? 'neutral' : 'away') * awayForm) / Math.sqrt(homeForm);
  return {
    home: newSide(home, homeXg / 90),
    away: newSide(away, awayXg / 90),
    period: 'first',
    minute: 0,
    added: 0,
    addedTotal: 0,
    neutral,
    knockout: options.knockout ? { aggregate: [...options.knockout.aggregate] } : undefined,
    events: [{ type: 'kickoff', minute: 0, added: 0 }],
  };
}

function newSide(sheet: TeamSheet, rate: number): Side {
  return { sheet, goals: 0, rate, reds: 0, yellows: {}, sentOff: [] };
}

export function step(m: FootballMatch, rng: Rng): void {
  if (m.period === 'done') return;
  const end = PERIOD_END[m.period];
  if (m.minute < end) {
    m.minute++;
  } else if (m.added < m.addedTotal) {
    m.added++;
  } else {
    endPeriod(m, rng);
    return;
  }
  playMinute(m, rng);
  if (m.minute === end && m.added === 0) {
    m.addedTotal = drawAddedTime(m.period, rng);
    if (m.addedTotal > 0) m.events.push({ type: 'addedTime', minute: m.minute, added: 0, amount: m.addedTotal });
  }
}

function drawAddedTime(period: Exclude<Period, 'done'>, rng: Rng): number {
  switch (period) {
    case 'first':
      return rng.weighted([1, 2, 3, 4], (n) => [3, 4, 2, 1][n - 1]);
    case 'second':
      return rng.weighted([2, 3, 4, 5, 6], (n) => [1, 3, 3, 2, 1][n - 2]);
    default:
      return rng.int(0, 2);
  }
}

function endPeriod(m: FootballMatch, rng: Rng): void {
  const at = { minute: m.minute, added: m.added };
  const score = currentScore(m);
  m.added = 0;
  m.addedTotal = 0;
  switch (m.period) {
    case 'first':
      m.events.push({ type: 'halftime', ...at, score });
      m.period = 'second';
      return;
    case 'second':
      if (m.knockout && isLevel(m)) {
        m.events.push({ type: 'extraTime', ...at });
        m.period = 'et1';
      } else {
        m.events.push({ type: 'fulltime', ...at, score });
        m.period = 'done';
      }
      return;
    case 'et1':
      m.events.push({ type: 'extraTimeHalftime', ...at, score });
      m.period = 'et2';
      return;
    case 'et2':
      if (isLevel(m)) shootout(m, rng, at);
      m.events.push({ type: 'fulltime', ...at, score });
      m.period = 'done';
      return;
  }
}

function currentScore(m: FootballMatch): [number, number] {
  return [m.home.goals, m.away.goals];
}

function isLevel(m: FootballMatch): boolean {
  const [aggHome, aggAway] = m.knockout?.aggregate ?? [0, 0];
  return m.home.goals + aggHome === m.away.goals + aggAway;
}

function minuteWeight(minute: number): number {
  if (minute > 90) return 1.1;
  if (minute > 75) return 1.3;
  if (minute > 30) return 1.0;
  return 0.85;
}

function playMinute(m: FootballMatch, rng: Rng): void {
  for (const key of ['home', 'away'] as const) {
    const side = m[key];
    const other = m[key === 'home' ? 'away' : 'home'];
    let rate = side.rate * minuteWeight(m.minute);
    if (m.minute > 75) rate *= 1 + (TUNING.lateChemistry * (side.sheet.chemistry - other.sheet.chemistry)) / 99;
    rate *= TUNING.redOwnFactor ** side.reds * TUNING.redOpponentFactor ** other.reds;

    if (rng.chance(rate)) {
      const ownGoal = rng.chance(TUNING.ownGoalShare);
      const scorer = ownGoal ? pickPlayer(other, rng, { GK: 0.1, DEF: 4, MID: 1, FWD: 0.2 }) : pickPlayer(side, rng, SCORER_WEIGHT);
      side.goals++;
      m.events.push({ type: 'goal', minute: m.minute, added: m.added, side: key, playerId: scorer, ownGoal, score: currentScore(m) });
    } else if (rng.chance(rate * TUNING.chancesPerGoal)) {
      const result = rng.weighted(['saved', 'wide', 'post', 'blocked'] as const, (r) => ({ saved: 4, wide: 4, post: 0.6, blocked: 2 })[r]);
      m.events.push({ type: 'chance', minute: m.minute, added: m.added, side: key, playerId: pickPlayer(side, rng, SCORER_WEIGHT), result });
    }

    if (rng.chance(TUNING.yellowsPerTeam / 90)) {
      // Booked players play more carefully, so second yellows stay rare.
      const playerId = pickPlayer(side, rng, CARD_WEIGHT, (id) => (side.yellows[id] ? TUNING.bookedCaution : 1));
      side.yellows[playerId] = (side.yellows[playerId] ?? 0) + 1;
      if (side.yellows[playerId] >= 2) sendOff(m, key, playerId, true);
      else m.events.push({ type: 'yellow', minute: m.minute, added: m.added, side: key, playerId });
    } else if (rng.chance(TUNING.straightRedsPerTeam / 90)) {
      sendOff(m, key, pickPlayer(side, rng, CARD_WEIGHT), false);
    }
  }
}

function sendOff(m: FootballMatch, key: SideKey, playerId: number, secondYellow: boolean): void {
  const side = m[key];
  side.reds++;
  side.sentOff.push(playerId);
  m.events.push({ type: 'red', minute: m.minute, added: m.added, side: key, playerId, secondYellow });
}

function pickPlayer(side: Side, rng: Rng, weights: Record<string, number>, factor: (id: number) => number = () => 1): number {
  const remaining = side.sheet.lineup.filter((p) => !side.sentOff.includes(p.id));
  const available = remaining.length > 0 ? remaining : side.sheet.lineup;
  return rng.weighted(available, (p) => (weights[p.position] ?? 1) * factor(p.id)).id;
}

function shootout(m: FootballMatch, rng: Rng, at: { minute: number; added: number }): void {
  const order = (side: Side) => {
    const takers = side.sheet.lineup.filter((p) => !side.sentOff.includes(p.id));
    return [...takers].sort((a, b) => (SCORER_WEIGHT[b.position] ?? 1) - (SCORER_WEIGHT[a.position] ?? 1));
  };
  const takers = { home: order(m.home), away: order(m.away) };
  const conversion = (key: SideKey) => {
    const own = m[key].sheet.chemistry;
    const opp = m[key === 'home' ? 'away' : 'home'].sheet.chemistry;
    return TUNING.penaltyConversion + (0.06 * (own - opp)) / 99;
  };
  const kicks: { side: SideKey; playerId: number; scored: boolean }[] = [];
  const score: [number, number] = [0, 0];
  for (let round = 0; ; round++) {
    for (const key of ['home', 'away'] as const) {
      const list = takers[key];
      const playerId = list[round % list.length].id;
      const scored = rng.chance(conversion(key));
      kicks.push({ side: key, playerId, scored });
      if (scored) score[key === 'home' ? 0 : 1]++;
      if (round < 5 && shootoutDecided(score, round, key)) {
        return finishShootout(m, at, kicks, score);
      }
    }
    if (round >= 4 && score[0] !== score[1]) return finishShootout(m, at, kicks, score);
  }
}

/** Whether a best-of-five shootout can no longer be won by one side. */
function shootoutDecided(score: [number, number], round: number, justKicked: SideKey): boolean {
  const homeTaken = round + 1;
  const awayTaken = justKicked === 'home' ? round : round + 1;
  const homeMax = score[0] + (5 - homeTaken);
  const awayMax = score[1] + (5 - awayTaken);
  return score[0] > awayMax || score[1] > homeMax;
}

function finishShootout(
  m: FootballMatch,
  at: { minute: number; added: number },
  kicks: { side: SideKey; playerId: number; scored: boolean }[],
  score: [number, number],
): void {
  m.penalties = score;
  m.events.push({ type: 'penalties', ...at, kicks, score });
}

export function isFinished(m: FootballMatch): boolean {
  return m.period === 'done';
}

export function outcome(m: FootballMatch): MatchOutcome {
  const goals = m.events.flatMap((e) =>
    e.type === 'goal' ? [{ side: e.side, playerId: e.playerId, minute: e.minute, added: e.added, ownGoal: e.ownGoal }] : [],
  );
  const result: MatchOutcome = { homeGoals: m.home.goals, awayGoals: m.away.goals, goals };
  if (m.knockout) {
    const homeTotal = m.home.goals + m.knockout.aggregate[0];
    const awayTotal = m.away.goals + m.knockout.aggregate[1];
    result.extraTime = m.events.some((e) => e.type === 'extraTime');
    if (m.penalties) {
      result.penalties = m.penalties;
      result.winner = m.penalties[0] > m.penalties[1] ? 'home' : 'away';
    } else {
      result.winner = homeTotal > awayTotal ? 'home' : 'away';
    }
  }
  return result;
}

/** Plays a whole match at once (for the balance tool and AI-only simulation). */
export function playMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): FootballMatch {
  const m = createMatch(home, away, options, rng);
  while (!isFinished(m)) step(m, rng);
  return m;
}

export const football: SportModule<FootballMatch> = { createMatch, step, isFinished, outcome };

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
