/**
 * Headless balance check: simulates long careers and reports against the
 * realism targets (DESIGN.md §5) and rating targets (§7).
 *
 *   npm run balance            full run (a few minutes)
 *   npm run balance -- --quick fewer seeds and seasons
 *   npm run balance -- --only=world,climb
 */
import { allocatePoints, fillAllocation, newCareer, nextRound, playRound, endSeason, type Career, type RoundResult } from '../src/core/career';
import { rating, STATS, type Stat } from '../src/core/club';
import { band, LEAGUE_COUNT, sortTable } from '../src/core/league';
import { totalRating, type Difficulty } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';

const quick = process.argv.includes('--quick');
const SEEDS = quick ? 2 : 4;
const LONG_SEASONS = quick ? 40 : 120;
const MAX_CLIMB = quick ? 45 : 70;

// ---------------------------------------------------------------------------
// Player strategies

type Strategy = (career: Career, rng: Rng) => Record<Stat, number>;

/** Fixes weaknesses: tops up the lowest stats first, then spreads the rest. */
const smart: Strategy = (career) => {
  const me = career.clubs[career.playerClubId];
  const points = career.pending!.points;
  const target = { ...me };
  let left = points;
  while (left > 0) {
    const lowest = [...STATS].filter((s) => target[s] < 99).sort((a, b) => target[a] - target[b])[0];
    if (!lowest) break;
    target[lowest] += 1;
    left--;
  }
  const weights = { attack: target.attack - me.attack, defence: target.defence - me.defence };
  return fillAllocation(me, points, weights);
};

const even: Strategy = (career) => fillAllocation(career.clubs[career.playerClubId], career.pending!.points, { attack: 1, defence: 1 });

/** Dumps everything into one stat, picked at random each season. */
const careless: Strategy = (career, rng) => {
  const pick = rng.pick(STATS);
  return fillAllocation(career.clubs[career.playerClubId], career.pending!.points, { attack: 0, defence: 0, [pick]: 1 });
};

const STRATEGIES = { smart, even, careless };
type StrategyName = keyof typeof STRATEGIES;

// ---------------------------------------------------------------------------
// Reporting

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${detail}`);
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (x: number, d = 2) => x.toFixed(d);
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : NaN);

// ---------------------------------------------------------------------------
// Season runner that records match statistics

interface MatchStats {
  matches: number;
  homeWins: number;
  draws: number;
  goals: number;
  bigScores: number;
  teamScoresUpTo3: number;
  upsets: number;
  decisive: number;
  lateGoals: number;
  comebacks: number;
}

function newStats(): MatchStats {
  return { matches: 0, homeWins: 0, draws: 0, goals: 0, bigScores: 0, teamScoresUpTo3: 0, upsets: 0, decisive: 0, lateGoals: 0, comebacks: 0 };
}

function recordMatches(career: Career, results: RoundResult[], stats: MatchStats): void {
  for (const { fixture, outcome } of results) {
    if (fixture.kind !== 'league') continue;
    const h = outcome.homeGoals;
    const a = outcome.awayGoals;
    stats.matches++;
    stats.goals += h + a;
    if (h > a) stats.homeWins++;
    if (h === a) stats.draws++;
    if (Math.abs(h - a) >= 4) stats.bigScores++;
    stats.teamScoresUpTo3 += (h <= 3 ? 1 : 0) + (a <= 3 ? 1 : 0);
    const rh = rating(career.clubs[fixture.home]);
    const ra = rating(career.clubs[fixture.away]);
    if (h !== a && Math.abs(rh - ra) >= 3) {
      stats.decisive++;
      if ((h > a) !== (rh > ra)) stats.upsets++;
    }
    stats.lateGoals += outcome.goals.filter((g) => g.minute > 75).length;
    // Comeback: the winner was behind at some point.
    if (h !== a) {
      const winner = h > a ? 'home' : 'away';
      let diff = 0;
      let trailed = false;
      for (const g of outcome.goals) {
        diff += g.side === winner ? 1 : -1;
        if (diff < 0) trailed = true;
      }
      if (trailed) stats.comebacks++;
    }
  }
}

function playSeasonWithStats(career: Career, stats?: MatchStats): void {
  while (nextRound(career)) {
    const res = playRound(career, footballSport);
    if (stats) recordMatches(career, res, stats);
  }
  endSeason(career);
}

// ---------------------------------------------------------------------------
// 1. Long world simulation: realism and rating targets

function worldRun(): void {
  console.log(`\n== World: ${SEEDS} careers x ${LONG_SEASONS} seasons (even-split player at 50, medium) ==`);
  const stats = newStats();
  let maxLeagueDrift = 0;
  let driftLeague = 0;
  let maxAbove95 = 0;
  let maxAt99Streak = 0;
  let maxTotalDrift = 0;
  let maxAverageDrift = 0;
  let promotedBottomHalf = 0;
  let promotedTotal = 0;
  const leagueAverages: number[][] = Array.from({ length: LEAGUE_COUNT }, () => []);

  for (let seed = 1; seed <= SEEDS; seed++) {
    const career = newCareer({ rating: 50, difficulty: 'medium', seed }, footballSport);
    const rng = new Rng(seed * 7919);
    const at99 = new Map<number, number>();
    let promotedLast: number[] = [];
    for (let season = 0; season < LONG_SEASONS; season++) {
      if (season === 0) leagueAverages.forEach((xs) => (xs.length = 0));
      const before = totalRating(career.clubs);
      playSeasonWithStats(career, season < 20 ? stats : undefined);

      // Promoted clubs: where did they finish in their new league?
      for (const id of promotedLast) {
        const league = career.season.leagues.find((l) => l.clubIds.includes(id))!;
        const pos = sortTable(league.table).findIndex((r) => r.clubId === id) + 1;
        promotedTotal++;
        if (pos > 10) promotedBottomHalf++;
      }
      promotedLast = Object.values(career.pending!.promoted).flat().filter((id) => id !== career.playerClubId);

      allocatePoints(career, even(career, rng));
      const after = totalRating(career.clubs);
      maxTotalDrift = Math.max(maxTotalDrift, Math.abs(after - before));
      maxAverageDrift = Math.max(maxAverageDrift, Math.abs(after / 100 - 49.5));

      career.season.leagues.forEach((l, t) => {
        const avg = mean(l.clubIds.filter((id) => id !== career.playerClubId).map((id) => rating(career.clubs[id])));
        const { min, max } = band(l.tier);
        leagueAverages[t].push(avg);
        // Drift is a sustained shift, so measure it on a 5-season rolling average.
        const drift = Math.abs(mean(leagueAverages[t].slice(-5)) - (min + max) / 2);
        if (season >= 5 && drift > maxLeagueDrift) {
          maxLeagueDrift = drift;
          driftLeague = l.tier;
        }
      });
      const above95 = career.clubs.filter((c) => !c.isPlayer && rating(c) > 95).length;
      maxAbove95 = Math.max(maxAbove95, above95);
      for (const c of career.clubs) {
        if (c.isPlayer) continue;
        const streak = rating(c) >= 98.5 ? (at99.get(c.id) ?? 0) + 1 : 0;
        at99.set(c.id, streak);
        maxAt99Streak = Math.max(maxAt99Streak, streak);
      }
    }
  }

  const m = stats.matches;
  console.log('\n-- Match realism (§5) --');
  check('Home wins ~45%', Math.abs(stats.homeWins / m - 0.45) < 0.03, pct(stats.homeWins / m));
  check('Draws ~25%', Math.abs(stats.draws / m - 0.25) < 0.03, pct(stats.draws / m));
  check('Away wins ~30%', Math.abs(1 - (stats.homeWins + stats.draws) / m - 0.3) < 0.03, pct(1 - (stats.homeWins + stats.draws) / m));
  check('About 2.7 goals per match', Math.abs(stats.goals / m - 2.7) < 0.15, fmt(stats.goals / m));
  check('Teams mostly score 0–3', stats.teamScoresUpTo3 / (2 * m) > 0.93, pct(stats.teamScoresUpTo3 / (2 * m)));
  check('The odd thrashing (4+ goal margin) happens', stats.bigScores / m > 0.01 && stats.bigScores / m < 0.06, pct(stats.bigScores / m));
  check('Weaker side (3+ rating gap) wins a fair share', stats.upsets / stats.decisive > 0.2 && stats.upsets / stats.decisive < 0.42, pct(stats.upsets / stats.decisive));
  check('Late goals (after 75\') are common', stats.lateGoals / stats.goals > 0.2, pct(stats.lateGoals / stats.goals));
  check('Comeback wins happen regularly', stats.comebacks / m > 0.05, pct(stats.comebacks / m));

  console.log('\n-- World ratings (§7) --');
  check('Overall average stays at 49.5', maxAverageDrift < 0.005, `max drift ${maxAverageDrift.toExponential(1)}`);
  check('Total rating identical before/after every season', maxTotalDrift < 0.005, `max drift ${maxTotalDrift.toExponential(1)}`);
  check('No league average drifts more than ±3 from band (5-season avg)', maxLeagueDrift <= 3, `max ${fmt(maxLeagueDrift)} (League ${driftLeague})`);
  console.log(`      league averages (mean over run): ${leagueAverages.map((xs) => fmt(mean(xs), 1)).join(' / ')}`);
  check('Fewer than 2 AI clubs above 95 at any time', maxAbove95 < 2, `max ${maxAbove95}`);
  check('No AI club at 99 for long (≤ 2 seasons)', maxAt99Streak <= 2, `longest ${maxAt99Streak}`);
  // Premier League promoted clubs, last decade: about 78% finished in the bottom half.
  check('Promoted clubs finish bottom half ~78% (real world)', Math.abs(promotedBottomHalf / promotedTotal - 0.78) < 0.06, pct(promotedBottomHalf / promotedTotal));
}

// ---------------------------------------------------------------------------
// 2. Strategy: places over expectation

function strategyRun(): void {
  console.log('\n== Player strategies: places over expectation per season (medium) ==');
  const starts = [5, 25, 50, 70, 88];
  const seasons = quick ? 6 : 10;
  const avg: Record<StrategyName, number> = { smart: 0, even: 0, careless: 0 };
  for (const name of Object.keys(STRATEGIES) as StrategyName[]) {
    const perf: number[] = [];
    const byStart: string[] = [];
    for (const start of starts) {
      const here: number[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const career = newCareer({ rating: start, difficulty: 'medium', seed: seed * 31 + start }, footballSport);
        const rng = new Rng(seed);
        for (let s = 0; s < seasons; s++) {
          playSeasonWithStats(career);
          here.push(career.pending!.performance);
          allocatePoints(career, STRATEGIES[name](career, rng));
        }
      }
      perf.push(...here);
      byStart.push(`${start}:${fmt(mean(here), 1)}`);
    }
    avg[name] = mean(perf);
    console.log(`      ${name.padEnd(9)} ${fmt(avg[name])}   by start rating ${byStart.join('  ')}`);
  }
  check('Smart player gains ~4–6 places a season', avg.smart >= 3.5 && avg.smart <= 6.5, fmt(avg.smart));
  check('Even-split player roughly holds position', Math.abs(avg.even) <= 1.5, fmt(avg.even));
  check('Careless player sinks', avg.careless < -1, fmt(avg.careless));
}

// ---------------------------------------------------------------------------
// 3. Climb from 0 to 99

function seasonsTo99(difficulty: Difficulty, strategy: StrategyName, seed: number): number | null {
  const career = newCareer({ rating: 0, difficulty, seed }, footballSport);
  const rng = new Rng(seed);
  for (let s = 1; s <= MAX_CLIMB; s++) {
    playSeasonWithStats(career);
    allocatePoints(career, STRATEGIES[strategy](career, rng));
    if (rating(career.clubs[career.playerClubId]) >= 98.5) return s;
  }
  return null;
}

function climbRun(): void {
  console.log(`\n== Climb from 0 to 99 (cap ${MAX_CLIMB} seasons) ==`);
  const targets: Record<Difficulty, { smart: [number, number]; even: [number, number] }> = {
    easy: { smart: [5, 6], even: [9, 11] },
    medium: { smart: [7, 9], even: [16, 20] },
    hard: { smart: [12, 14], even: [40, 40] },
  };
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    for (const strategy of ['smart', 'even'] as const) {
      const runs = Array.from({ length: SEEDS }, (_, i) => seasonsTo99(difficulty, strategy, 1000 + i));
      const done = runs.filter((r): r is number => r !== null);
      const [lo, hi] = targets[difficulty][strategy];
      const summary = `${runs.map((r) => r ?? `>${MAX_CLIMB}`).join(', ')} (target ~${lo === hi ? lo : `${lo}–${hi}`})`;
      const avgSeasons = done.length === runs.length ? mean(done) : Infinity;
      // Estimates are rough: accept within 40% of the range.
      check(`${difficulty} / ${strategy}: seasons 0→99`, avgSeasons >= lo * 0.6 && avgSeasons <= hi * 1.4, summary);
    }
  }
  const careless = Array.from({ length: SEEDS }, (_, i) => seasonsTo99('hard', 'careless', 2000 + i));
  check('Careless on hard never climbs 0→99', careless.every((r) => r === null), careless.map((r) => r ?? 'never').join(', '));
}

// ---------------------------------------------------------------------------
// 4. Starting at 99

function topRun(): void {
  console.log('\n== Player club starting at 99 (smart, medium) ==');
  let titles = 0;
  let seasons = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const career = newCareer({ rating: 99, difficulty: 'medium', seed: 500 + seed }, footballSport);
    const rng = new Rng(seed);
    for (let s = 0; s < 10; s++) {
      playSeasonWithStats(career);
      seasons++;
      if (career.pending!.outcome === 'champion') titles++;
      allocatePoints(career, smart(career, rng));
    }
  }
  check('Wins League 1 most seasons, but not every season', titles / seasons > 0.5 && titles < seasons, `${titles}/${seasons}`);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const sections = { world: worldRun, strategy: strategyRun, climb: climbRun, top: topRun };
const started = Date.now();
for (const [name, run] of Object.entries(sections)) if (!only || only.split(',').includes(name)) run();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} targets met in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exitCode = failed.length ? 1 : 0;
