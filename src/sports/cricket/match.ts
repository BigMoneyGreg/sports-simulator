import type { Rng } from '../../core/rng';
import type { MatchOptions, MatchOutcome, SportModule, TeamSheet } from '../../core/sport';
import { effectiveStats } from '../football/match';

/** T20: tuned by tools/balance-sports.ts so that favourites win about 75% of games and a typical total is about 160. */
export const TUNING = {
  overs: 20,
  /** Runs per ball and chance of a wicket per ball between level sides. */
  baseRuns: 1.52,
  baseWicket: 0.057,
  /** How much a gap between batting and bowling moves runs and wickets. */
  runSlope: 0.1,
  wicketSlope: 0.12,
  gapKnee: 20,
  gapBeyond: 0.3,
  homeAdvantage: 1.03,
  awayFactor: 0.98,
  formSpread: 0.1,
  /** The batting order thins out from this position. */
  tailFrom: 7,
  tailRuns: 0.75,
  tailWicket: 1.5,
  milestones: [50, 100, 150],
};

export type SideKey = 'home' | 'away';
export type Period = 'first' | 'break' | 'second' | 'superOver' | 'done';

export type CricketEvent =
  | { type: 'toss'; over: string; winner: SideKey; bat: boolean }
  | { type: 'wicket'; over: string; side: SideKey; batter: number; bowler: number; how: 'b' | 'c' | 'lbw' | 'run out'; runs: number; score: string }
  | { type: 'milestone'; over: string; side: SideKey; playerId: number; runs: number }
  | { type: 'inningsBreak'; over: string; text: string }
  | { type: 'superOver'; over: string; score: [number, number]; decided: boolean }
  | { type: 'result'; over: string; text: string };

export interface Side {
  sheet: TeamSheet;
  /** The side's runs. Named as in the other sports, so tables and records treat them alike. */
  goals: number;
  wickets: number;
  balls: number;
  /** Runs per ball and wicket chance before the other side's bowling comes into it. */
  runRate: number;
  wicketRate: number;
  runsBy: Record<number, number>;
  wicketsBy: Record<number, number>;
}

export interface CricketMatch {
  home: Side;
  away: Side;
  period: Period;
  batting: SideKey;
  /** Who bats first, from the toss. */
  first: SideKey;
  /** Batting-order positions at the crease, the striker first, and the next man in. */
  striker: number;
  nonStriker: number;
  nextIn: number;
  target?: number;
  /** The super over's runs, home first, once it has been played. */
  penalties?: [number, number];
  events: CricketEvent[];
}

function other(key: SideKey): SideKey {
  return key === 'home' ? 'away' : 'home';
}

function counted(gap: number): number {
  const excess = Math.max(0, Math.abs(gap) - TUNING.gapKnee);
  return Math.sign(gap) * (Math.abs(gap) - excess * (1 - TUNING.gapBeyond));
}

/** Runs per ball and the chance of a wicket for a batting side against a bowling side. */
export function ballRates(batting: number, bowling: number, venue: 'home' | 'away' | 'neutral'): { runs: number; wicket: number } {
  const gap = counted(batting - bowling);
  const v = venue === 'home' ? TUNING.homeAdvantage : venue === 'away' ? TUNING.awayFactor : 1;
  return { runs: TUNING.baseRuns * Math.exp((TUNING.runSlope * gap) / 10) * v, wicket: TUNING.baseWicket * Math.exp((-TUNING.wicketSlope * gap) / 10) };
}

export function overLabel(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): CricketMatch {
  const neutral = options.neutral ?? false;
  const homeForm = 1 + rng.range(-1, 1) * TUNING.formSpread;
  const awayForm = 1 + rng.range(-1, 1) * TUNING.formSpread;
  const h = effectiveStats(home);
  const a = effectiveStats(away);
  const homeRates = ballRates(h.attack, a.defence, neutral ? 'neutral' : 'home');
  const awayRates = ballRates(a.attack, h.defence, neutral ? 'neutral' : 'away');
  const side = (sheet: TeamSheet, rates: { runs: number; wicket: number }, form: number): Side => ({
    sheet,
    goals: 0,
    wickets: 0,
    balls: 0,
    runRate: rates.runs * form,
    wicketRate: rates.wicket,
    runsBy: {},
    wicketsBy: {},
  });
  const winner: SideKey = rng.chance(0.5) ? 'home' : 'away';
  // Captains mostly prefer to chase.
  const bat = rng.chance(0.35);
  const first = bat ? winner : other(winner);
  return {
    home: side(home, homeRates, homeForm),
    away: side(away, awayRates, awayForm),
    period: 'first',
    batting: first,
    first,
    striker: 0,
    nonStriker: 1,
    nextIn: 2,
    events: [{ type: 'toss', over: '0.0', winner, bat }],
  };
}

/** Attack in the powerplay, consolidate, then swing hard at the death. */
function phase(over: number): { runs: number; wicket: number } {
  if (over < 6) return { runs: 1.0, wicket: 0.8 };
  if (over < 16) return { runs: 0.9, wicket: 0.85 };
  return { runs: 1.3, wicket: 1.75 };
}

/** Chasing: behind the rate means taking risks, ahead of it means playing safe. */
function chase(m: CricketMatch, side: Side, rates: { runs: number }): { runs: number; wicket: number } {
  if (m.target === undefined) return { runs: 1, wicket: 1 };
  const left = TUNING.overs * 6 - side.balls;
  const need = (m.target - side.goals) / Math.max(1, left);
  const pressure = need / rates.runs;
  if (pressure > 1.25) return { runs: 1.15, wicket: 1.35 };
  if (pressure < 0.8) return { runs: 0.9, wicket: 0.7 };
  return { runs: 1, wicket: 1 };
}

function bowlers(sheet: TeamSheet): number[] {
  const attack = sheet.lineup.filter((p) => p.position === 'BWL' || p.position === 'AR').map((p) => p.id);
  return attack.length ? attack : sheet.lineup.map((p) => p.id);
}

/** Runs off one ball, for a batter this good. */
function runsOffBall(rng: Rng, mean: number): number {
  const boundaries = Math.max(0.1, (mean - 0.5) / 0.84);
  const weights: [number, number][] = [
    [6, 0.06 * boundaries],
    [4, 0.12 * boundaries],
    [2, 0.06],
    [1, 0.38],
  ];
  const taken = weights.reduce((t, [, p]) => t + p, 0);
  return rng.weighted([...weights, [0, Math.max(0.05, 1 - taken)] as [number, number]], ([, p]) => p)[0];
}

/** One ball of a normal innings. */
function bowl(m: CricketMatch, rng: Rng, bowler: number): void {
  const key = m.batting;
  const side = m[key];
  const fielding = m[other(key)];
  const over = Math.floor(side.balls / 6);
  const p = phase(over);
  const c = chase(m, side, { runs: side.runRate * p.runs });
  const batterAt = m.striker;
  const tail = batterAt >= TUNING.tailFrom;
  const mean = side.runRate * p.runs * c.runs * (tail ? TUNING.tailRuns : 1);
  const wicketChance = side.wicketRate * p.wicket * c.wicket * (tail ? TUNING.tailWicket : 1);
  const batter = side.sheet.lineup[batterAt].id;
  side.balls++;
  if (rng.chance(wicketChance)) {
    side.wickets++;
    const how = rng.weighted(['c', 'b', 'lbw', 'run out'] as const, (x) => ({ c: 6, b: 2, lbw: 1.5, 'run out': 0.5 })[x]);
    if (how !== 'run out') fielding.wicketsBy[bowler] = (fielding.wicketsBy[bowler] ?? 0) + 1;
    m.events.push({ type: 'wicket', over: overLabel(side.balls), side: other(key), batter, bowler, how, runs: side.runsBy[batter] ?? 0, score: `${side.goals}/${side.wickets}` });
    m.striker = m.nextIn++;
    return;
  }
  const runs = runsOffBall(rng, mean);
  const before = side.runsBy[batter] ?? 0;
  side.goals += runs;
  side.runsBy[batter] = before + runs;
  for (const mark of TUNING.milestones) {
    if (before < mark && before + runs >= mark) m.events.push({ type: 'milestone', over: overLabel(side.balls), side: key, playerId: batter, runs: mark });
  }
  if (runs % 2 === 1) [m.striker, m.nonStriker] = [m.nonStriker, m.striker];
}

function inningsOver(m: CricketMatch): boolean {
  const side = m[m.batting];
  return side.wickets >= 10 || side.balls >= TUNING.overs * 6 || (m.target !== undefined && side.goals >= m.target);
}

/** One over, or what's left of the innings. */
function playOver(m: CricketMatch, rng: Rng): void {
  const side = m[m.batting];
  const attack = bowlers(m[other(m.batting)].sheet);
  const bowler = attack[Math.floor(side.balls / 6) % attack.length];
  for (let ball = 0; ball < 6 && !inningsOver(m); ball++) bowl(m, rng, bowler);
  if (!inningsOver(m)) [m.striker, m.nonStriker] = [m.nonStriker, m.striker];
}

export function step(m: CricketMatch, rng: Rng): void {
  switch (m.period) {
    case 'first':
      playOver(m, rng);
      if (inningsOver(m)) {
        const side = m[m.batting];
        m.target = side.goals + 1;
        m.period = 'break';
        m.events.push({ type: 'inningsBreak', over: overLabel(side.balls), text: `${side.goals}/${side.wickets}` });
      }
      return;
    case 'break':
      m.batting = other(m.first);
      m.striker = 0;
      m.nonStriker = 1;
      m.nextIn = 2;
      m.period = 'second';
      return;
    case 'second':
      playOver(m, rng);
      if (inningsOver(m)) {
        if (m.home.goals === m.away.goals) m.period = 'superOver';
        else finish(m);
      }
      return;
    case 'superOver':
      superOver(m, rng);
      return;
    case 'done':
      return;
  }
}

/** Tied: one over each, two wickets and you're out; level again and they play another. */
function superOver(m: CricketMatch, rng: Rng): void {
  const innings = (key: SideKey): number => {
    const side = m[key];
    let runs = 0;
    let wickets = 0;
    for (let ball = 0; ball < 6 && wickets < 2; ball++) {
      if (rng.chance(side.wicketRate * 1.75)) wickets++;
      else runs += runsOffBall(rng, side.runRate * 1.3);
    }
    return runs;
  };
  const score: [number, number] = [innings('home'), innings('away')];
  const decided = score[0] !== score[1];
  m.events.push({ type: 'superOver', over: 'SO', score, decided });
  if (!decided) return;
  m.penalties = score;
  finish(m);
}

function finish(m: CricketMatch): void {
  m.period = 'done';
  m.events.push({ type: 'result', over: 'FT', text: resultLine(m, [m.home.sheet.clubId, m.away.sheet.clubId].map(String) as [string, string]) });
}

function winnerOf(m: CricketMatch): SideKey {
  if (m.penalties) return m.penalties[0] > m.penalties[1] ? 'home' : 'away';
  return m.home.goals > m.away.goals ? 'home' : 'away';
}

/** "India won by 14 runs", "by 5 wickets", or "in the super over". */
export function resultLine(m: CricketMatch, names: [string, string]): string {
  const key = winnerOf(m);
  const name = names[key === 'home' ? 0 : 1];
  if (m.penalties) return `${name} won the super over`;
  if (key === m.first) {
    const by = m[key].goals - m[other(key)].goals;
    return `${name} won by ${by} run${by === 1 ? '' : 's'}`;
  }
  const by = 10 - m[key].wickets;
  return `${name} won by ${by} wicket${by === 1 ? '' : 's'}`;
}

export function isFinished(m: CricketMatch): boolean {
  return m.period === 'done';
}

export function outcome(m: CricketMatch): MatchOutcome {
  const batters = (key: SideKey) =>
    Object.entries(m[key].runsBy)
      .filter(([, runs]) => runs > 0)
      .map(([id, runs]) => ({ side: key, playerId: Number(id), minute: 0, added: 0, ownGoal: false, count: runs }));
  // A side bowled out counts its full 20 overs in its run rate, as in the real rule.
  const counts = (s: Side) => (s.wickets >= 10 ? TUNING.overs * 6 : s.balls);
  const result: MatchOutcome = {
    homeGoals: m.home.goals,
    awayGoals: m.away.goals,
    goals: [...batters('home'), ...batters('away')],
    balls: [counts(m.home), counts(m.away)],
    wicketTakers: [m.home, m.away].flatMap((s) => Object.entries(s.wicketsBy).map(([id, count]) => ({ playerId: Number(id), count }))),
  };
  if (m.period === 'done') {
    const winner = winnerOf(m);
    result.winner = winner;
    result.points = winner === 'home' ? [2, 0] : [0, 2];
    if (m.penalties) result.penalties = m.penalties;
  }
  return result;
}

export const cricket: SportModule<CricketMatch> = {
  createMatch,
  step,
  isFinished,
  outcome,
  ticks: 40,
  // Half a game of cricket says nothing about who's winning it, so only finished matches move the table.
  countsLive: (m) => m.period === 'done',
  alerts: (m) => [m.away.wickets, m.home.wickets],
  notable: (m) => m.home.wickets + m.away.wickets,
};
