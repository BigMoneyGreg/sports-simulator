/**
 * Headless balance check: simulates long careers and reports against the
 * realism targets (DESIGN.md §5), rating targets (§7) and how much reading
 * the season pays.
 *
 *   npm run balance            full run (a few minutes)
 *   npm run balance -- --quick fewer seeds and seasons
 *   npm run balance -- --only=world,climb
 */
import { allocatePoints, focusAllocation, newCareer, nextRound, playRound, endSeason, type Career, type Focus, type RoundResult } from '../src/core/career';
import { rating, type Stat } from '../src/core/club';
import { band, goalRanks, LEAGUE_COUNT, sortTable } from '../src/core/league';
import { totalRating, type Difficulty } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { footballSport } from '../src/sports/football';

const quick = process.argv.includes('--quick');
const SEEDS = quick ? 2 : 4;
const LONG_SEASONS = quick ? 40 : 120;
const MAX_CLIMB = quick ? 45 : 70;

// ---------------------------------------------------------------------------
// Player strategies

// Players only ever see results, so strategies pick a summer focus from them.
type Strategy = (career: Career, rng: Rng) => Record<Stat, number>;

const spend = (career: Career, focus: Focus) => focusAllocation(career.clubs[career.playerClubId], career.pending!.points, focus);

/**
 * Reads the summer like a good player, from what the summer screen shows:
 * rebuilds the side that ranked worse for goals, and when the ranks are level
 * (often, at the top), the side most of the leavers came from.
 */
const reader: Strategy = (career, rng) => {
  const p = career.pending!;
  const ranks = goalRanks(career.season.leagues[p.tier - 1].table, career.playerClubId);
  if (ranks.scored !== ranks.conceded) return spend(career, ranks.scored > ranks.conceded ? 'attack' : 'defence');
  const change = p.turnover.find((t) => t.clubId === career.playerClubId)!;
  const squad = career.clubs[career.playerClubId].squad;
  const fromAttack = change.out.filter((id) => footballSport.role(squad.find((x) => x.id === id)!).side === 'attack').length;
  const fromDefence = change.out.length - fromAttack;
  if (fromAttack !== fromDefence) return spend(career, fromAttack > fromDefence ? 'attack' : 'defence');
  return spend(career, rng.next() < 0.5 ? 'attack' : 'defence');
};

/** An average player not paying attention: picks a side at random. */
const coinFlip: Strategy = (career, rng) => spend(career, rng.next() < 0.5 ? 'attack' : 'defence');

/** One-track: always rebuilds attack, whatever the results say. */
const careless: Strategy = (career) => spend(career, 'attack');

const STRATEGIES = { reader, coinFlip, careless };
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
    // Realism is about the AI world: a player club far above it would skew the numbers.
    if (fixture.kind !== 'league' || fixture.home === career.playerClubId || fixture.away === career.playerClubId) continue;
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
  endSeason(career, footballSport);
}

// ---------------------------------------------------------------------------
// 1. Long world simulation: realism and rating targets

function worldRun(): void {
  console.log(`\n== World: ${SEEDS} careers x ${LONG_SEASONS} seasons (reading player at 50, medium) ==`);
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
      const ai = career.clubs.filter((c) => !c.isPlayer);
      const before = totalRating(ai);
      playSeasonWithStats(career, season < 20 ? stats : undefined);

      // Promoted clubs: where did they finish in their new league?
      for (const id of promotedLast) {
        const league = career.season.leagues.find((l) => l.clubIds.includes(id))!;
        const pos = sortTable(league.table).findIndex((r) => r.clubId === id) + 1;
        promotedTotal++;
        if (pos > 10) promotedBottomHalf++;
      }
      promotedLast = Object.values(career.pending!.promoted).flat().filter((id) => id !== career.playerClubId);

      allocatePoints(career, reader(career, rng));
      const after = totalRating(ai);
      maxTotalDrift = Math.max(maxTotalDrift, Math.abs(after - before));
      maxAverageDrift = Math.max(maxAverageDrift, Math.abs(after - career.totalRating) / ai.length);

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
  check('AI average never moves, whatever the player does', maxAverageDrift < 0.005, `max drift ${maxAverageDrift.toExponential(1)}`);
  check('AI total identical before/after every season', maxTotalDrift < 0.005, `max drift ${maxTotalDrift.toExponential(1)}`);
  // A strong player keeps a League 1 place for good, pushing one AI club down: the middle leagues sit a little above their bands.
  check('No league average drifts more than ±3.5 from band (5-season avg)', maxLeagueDrift <= 3.5, `max ${fmt(maxLeagueDrift)} (League ${driftLeague})`);
  console.log(`      league averages (mean over run): ${leagueAverages.map((xs) => fmt(mean(xs), 1)).join(' / ')}`);
  // A softer ceiling allows a few elite clubs, as in real football, but no permanent super-club.
  check('No more than 4 AI clubs above 95 at any time', maxAbove95 <= 4, `max ${maxAbove95}`);
  check('No AI club at 99 for long (≤ 2 seasons)', maxAt99Streak <= 2, `longest ${maxAt99Streak}`);
  // Premier League promoted clubs, last decade: about 78% finished in the bottom half.
  check('Promoted clubs finish bottom half ~78% (real world)', Math.abs(promotedBottomHalf / promotedTotal - 0.78) < 0.06, pct(promotedBottomHalf / promotedTotal));
}

// ---------------------------------------------------------------------------
// 2. Strategy: places over expectation

function strategyRun(): void {
  console.log('\n== Reading the season: places over expectation per season (medium) ==');
  const starts = [5, 25, 50, 70, 88];
  const seasons = quick ? 6 : 12;
  const avg: Record<StrategyName, number> = { reader: 0, coinFlip: 0, careless: 0 };
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
          // The first two seasons are still settling from the starting split.
          if (s >= 2) here.push(career.pending!.performance);
          allocatePoints(career, STRATEGIES[name](career, rng));
        }
      }
      perf.push(...here);
      byStart.push(`${start}:${fmt(mean(here), 1)}`);
    }
    avg[name] = mean(perf);
    console.log(`      ${name.padEnd(9)} ${fmt(avg[name])}   by start rating ${byStart.join('  ')}`);
  }
  check('Reading the season clearly beats guessing (2+ places)', avg.reader - avg.coinFlip >= 2, `${fmt(avg.reader)} v ${fmt(avg.coinFlip)}`);
  check('A guesser drifts below expectation', avg.coinFlip < 0, fmt(avg.coinFlip));
  check('Careless player sinks furthest', avg.careless < avg.coinFlip, fmt(avg.careless));
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
  // A reader's climb, in seasons; a guesser should take far longer or never make it.
  const readerTargets: Record<Difficulty, [number, number]> = { easy: [6, 12], medium: [8, 14], hard: [15, 70] };
  const average = (runs: (number | null)[]) => mean(runs.map((r) => r ?? MAX_CLIMB));
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const reading = Array.from({ length: SEEDS }, (_, i) => seasonsTo99(difficulty, 'reader', 1000 + i));
    const guessing = Array.from({ length: SEEDS }, (_, i) => seasonsTo99(difficulty, 'coinFlip', 1000 + i));
    const show = (runs: (number | null)[]) => runs.map((r) => r ?? `>${MAX_CLIMB}`).join(', ');
    const [lo, hi] = readerTargets[difficulty];
    // Estimates are rough: accept within 40% of the range.
    check(`${difficulty} / reader: seasons 0→99`, average(reading) >= lo * 0.6 && average(reading) <= hi * 1.4, `${show(reading)} (target ~${lo}–${hi})`);
    check(`${difficulty} / guesser: far slower than a reader`, average(guessing) >= 2 * average(reading) || guessing.every((r) => r === null), show(guessing));
  }
  const careless = Array.from({ length: SEEDS }, (_, i) => seasonsTo99('hard', 'careless', 2000 + i));
  check('Careless on hard never climbs 0→99', careless.every((r) => r === null), careless.map((r) => r ?? 'never').join(', '));
}

// ---------------------------------------------------------------------------
// 4. Starting at 99

function topRun(): void {
  console.log('\n== Player club starting at 99 (reader, medium) ==');
  let titles = 0;
  let seasons = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const career = newCareer({ rating: 99, difficulty: 'medium', seed: 500 + seed }, footballSport);
    const rng = new Rng(seed);
    for (let s = 0; s < 10; s++) {
      playSeasonWithStats(career);
      seasons++;
      if (career.pending!.outcome === 'champion') titles++;
      allocatePoints(career, reader(career, rng));
    }
  }
  check('Wins League 1 most seasons, but not every season', titles / seasons > 0.5 && titles < seasons, `${titles}/${seasons}`);
}

// ---------------------------------------------------------------------------
// 5. Beyond 99: how far each kind of player climbs

function peakRun(): void {
  const seasons = quick ? 25 : 40;
  // Peaks swing a lot with luck, so this section runs more careers than the rest.
  const careers = quick ? 3 : 8;
  console.log(`\n== Beyond 99: from 95 over ${seasons} seasons (medium) ==`);
  const peaks: Record<StrategyName, number[]> = { reader: [], coinFlip: [], careless: [] };
  let unbeaten = 0;
  let readerSeasonsAbove120 = 0;
  for (const name of Object.keys(STRATEGIES) as StrategyName[]) {
    for (let seed = 1; seed <= careers; seed++) {
      const career = newCareer({ rating: 95, difficulty: 'medium', seed: 900 + seed }, footballSport);
      const rng = new Rng(seed);
      let peak = 0;
      for (let s = 0; s < seasons; s++) {
        playSeasonWithStats(career);
        const r = rating(career.clubs[career.playerClubId]);
        if (name === 'reader') {
          const row = career.season.leagues[career.pending!.tier - 1].table.find((x) => x.clubId === career.playerClubId)!;
          if (row.lost === 0) unbeaten++;
          if (r > 120) readerSeasonsAbove120++;
        }
        allocatePoints(career, STRATEGIES[name](career, rng));
        peak = Math.max(peak, rating(career.clubs[career.playerClubId]));
      }
      peaks[name].push(peak);
    }
    console.log(`      ${name.padEnd(9)} peak ${peaks[name].map((p) => fmt(p, 0)).join(', ')}`);
  }
  console.log(`      reader: ${unbeaten} unbeaten season(s), ${readerSeasonsAbove120} season(s) above 120`);
  check('A good reader climbs well past 99', mean(peaks.reader) >= 130, fmt(mean(peaks.reader), 0));
  check('Nobody runs away: no peak above 200 in a career', Math.max(...Object.values(peaks).flat()) <= 200, fmt(Math.max(...Object.values(peaks).flat()), 0));
  check('A guesser peaks well below a reader (20+ lower)', mean(peaks.coinFlip) <= mean(peaks.reader) - 20, `${fmt(mean(peaks.coinFlip), 0)} v ${fmt(mean(peaks.reader), 0)}`);
  check('Unbeaten seasons happen, but not routinely', unbeaten >= 1 && unbeaten <= (seasons * careers) / 3, `${unbeaten} of ${seasons * careers}`);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const sections = { world: worldRun, strategy: strategyRun, climb: climbRun, top: topRun, peak: peakRun };
const started = Date.now();
for (const [name, run] of Object.entries(sections)) if (!only || only.split(',').includes(name)) run();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} targets met in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exitCode = failed.length ? 1 : 0;
