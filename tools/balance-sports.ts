/**
 * Headless balance check for rugby and cricket (football has tools/balance.ts):
 * match realism, season length, how much reading the season pays and how the
 * AI world behaves, played through the real engines.
 *
 *   npx tsx tools/balance-sports.ts [rugby|cricket]
 */
import { allocatePoints, endSeason, focusAllocation, newCareer, nextRound, playRound, type Career, type Focus } from '../src/core/career';
import { rating } from '../src/core/club';
import { teamCount, type SportId } from '../src/core/format';
import { goalRanks, sortTable, startRating } from '../src/core/league';
import { Rng } from '../src/core/rng';
import { tickMs, fullTimePause } from '../src/extension/game';
import { SPORTS, type AnySport } from '../src/sports';

const CAREERS = 16;
const SEASONS = 30;

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : NaN);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results: boolean[] = [];
function check(name: string, pass: boolean, detail: string | number): void {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${detail}`);
}

/** Targets differ by sport: rugby's favourites win more, and its promoted sides bounce more with two going up. Champions should still lose a few. */
const TARGETS: Record<'rugby' | 'cricket', { favourite: [number, number]; score: [number, number]; seasonMinutes: [number, number]; straightBack: [number, number]; championLosses: number }> = {
  rugby: { favourite: [68, 74], score: [20, 32], seasonMinutes: [20, 32], straightBack: [30, 55], championLosses: 2.2 },
  cricket: { favourite: [63, 69], score: [140, 170], seasonMinutes: [20, 32], straightBack: [8, 30], championLosses: 1.9 },
};

function worldRun(id: 'rugby' | 'cricket', sport: AnySport): void {
  const t = TARGETS[id];
  const fav = { n: 0, won: 0, draws: 0 };
  const scores: number[] = [];
  const championLosses: number[] = [];
  let unbeaten = 0;
  let teamSeasons = 0;
  let champion = new Map<number, number>();
  const topAI: number[] = [];
  let distinct = 0;
  let promotedBottom = 0;
  let promotedBack = 0;
  let promoted = 0;
  let sizesOk = true;
  let cups = 0;
  let cupsDone = 0;
  const seed0 = 40;
  for (let seed = 0; seed < CAREERS; seed++) {
    const c = newCareer({ rating: 2, seed: seed0 + seed }, sport);
    const rng = new Rng(seed);
    champion = new Map();
    let last: number[] = [];
    for (let s = 0; s < 40; s++) {
      while (nextRound(c)) {
        for (const { fixture: f, outcome: o } of playRound(c, sport)) {
          if (f.kind !== 'league' || f.home === c.playerClubId || f.away === c.playerClubId) continue;
          scores.push(o.homeGoals, o.awayGoals);
          const rh = rating(c.clubs[f.home]);
          const ra = rating(c.clubs[f.away]);
          if (rh === ra) continue;
          const homeWon = o.winner ? o.winner === 'home' : o.homeGoals > o.awayGoals;
          const awayWon = o.winner ? o.winner === 'away' : o.awayGoals > o.homeGoals;
          fav.n++;
          if (rh > ra ? homeWon : awayWon) fav.won++;
          if (!homeWon && !awayWon) fav.draws++;
        }
      }
      for (const league of c.season.leagues) {
        if (league.clubIds.includes(c.playerClubId)) continue;
        const table = sortTable(league.table);
        championLosses.push(table[0].lost);
        teamSeasons += table.length;
        unbeaten += table.filter((r) => r.lost === 0).length;
      }
      cups++;
      if (c.season.cup.winner !== undefined && (!c.season.calendar.some((x) => x.kind === 'championship') || c.season.championship?.winner !== undefined)) cupsDone++;
      const end = endSeason(c, sport);
      const size = sport.format.leagueSize;
      if (end.nextLeagues.some((l) => l.length !== size) || new Set(end.nextLeagues.flat()).size !== teamCount(sport.format)) sizesOk = false;
      const top = sortTable(c.season.leagues[0].table)[0].clubId;
      if (top !== c.playerClubId) champion.set(top, (champion.get(top) ?? 0) + 1);
      for (const pid of last) {
        const league = c.season.leagues.find((l) => l.clubIds.includes(pid))!;
        const pos = sortTable(league.table).findIndex((r) => r.clubId === pid) + 1;
        promoted++;
        if (pos > size / 2) promotedBottom++;
        if (end.relegated[league.tier]?.includes(pid)) promotedBack++;
      }
      last = Object.values(end.promoted).flat().filter((x) => x !== c.playerClubId);
      allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], c.pending!.points, rng.next() < 0.5 ? 'attack' : 'defence'));
    }
    topAI.push(Math.max(...champion.values()));
    distinct = Math.max(distinct, champion.size);
  }
  const favourite = (100 * fav.won) / (fav.n - fav.draws);
  scores.sort((a, b) => a - b);
  const q = (p: number) => scores[Math.floor(p * scores.length)];
  console.log(`\n-- Matches and world --`);
  check('Favourite wins its target share of decided games', favourite >= t.favourite[0] && favourite <= t.favourite[1], `${favourite.toFixed(1)}%`);
  check('Typical score per side', mean(scores) >= t.score[0] && mean(scores) <= t.score[1], `mean ${mean(scores).toFixed(1)}, p5 ${q(0.05)}, median ${q(0.5)}, p95 ${q(0.95)}, max ${scores[scores.length - 1]}`);
  check('Leagues stay the right size, every team in exactly one', sizesOk, sizesOk ? 'always' : 'BROKEN');
  check('Every cup is finished every season', cups === cupsDone, `${cupsDone}/${cups}`);
  check('Leagues stay close: champions lose a few', mean(championLosses) >= t.championLosses, `${mean(championLosses).toFixed(1)} a season`);
  check('Unbeaten seasons are rare (under 1 team-season in 100)', unbeaten / teamSeasons < 0.01, `${((100 * unbeaten) / teamSeasons).toFixed(2)}%`);
  const back = (100 * promotedBack) / promoted;
  check('Promoted sides finish bottom half most seasons', (100 * promotedBottom) / promoted >= 55, `${((100 * promotedBottom) / promoted).toFixed(0)}%`);
  check('Promoted sides go straight back at a fair rate', back >= t.straightBack[0] && back <= t.straightBack[1], `${back.toFixed(0)}%`);
  // Judged on the typical career: one in a dozen or so goes higher, and a single worst case swings with the seeds.
  check('No AI dynasty: most titles for one AI side in 40 seasons, typical', median(topAI) <= 12, `median ${median(topAI)}, worst ${Math.max(...topAI)}`);
  check('Titles go round', distinct >= 6, `up to ${distinct} AI champions in 40 seasons`);
}

/** Reads the season as the summer screen shows it: the worse rank, then the leavers. */
function read(c: Career, sport: AnySport, rng: Rng, clue?: { n: number; tied: number; right: number }): Focus {
  const p = c.pending!;
  const me = c.clubs[c.playerClubId];
  const ranks = goalRanks(c.season.leagues[p.tier - 1].table, c.playerClubId);
  const change = p.turnover.find((x) => x.clubId === c.playerClubId)!;
  const a = change.out.filter((id) => sport.role(me.squad.find((x) => x.id === id)!).side === 'attack').length;
  const d = change.out.length - a;
  const tied = ranks.scored === ranks.conceded;
  const pick: Focus = !tied ? (ranks.scored > ranks.conceded ? 'attack' : 'defence') : a !== d ? (a > d ? 'attack' : 'defence') : rng.next() < 0.5 ? 'attack' : 'defence';
  if (clue) {
    clue.n++;
    if (tied) clue.tied++;
    if (pick === (me.attack < me.defence ? 'attack' : 'defence')) clue.right++;
  }
  return pick;
}

/** A new career should finish about where it's predicted, not walk its first season. */
function firstSeasonRun(sport: AnySport): void {
  const f = sport.format;
  const places: number[] = [];
  let titles = 0;
  let unbeaten = 0;
  const careers = 200;
  for (let seed = 1; seed <= careers; seed++) {
    const c = newCareer({ rating: startRating(f, 1, new Rng(seed * 97)), seed }, sport);
    while (nextRound(c)) playRound(c, sport);
    const end = endSeason(c, sport);
    places.push(end.expected - end.position);
    if (end.position === 1) titles++;
    if (c.season.leagues[0].table.find((r) => r.clubId === c.playerClubId)!.lost === 0) unbeaten++;
  }
  console.log('\n-- First season in League 1 --');
  check('Finishes about where predicted (within half a place)', Math.abs(mean(places)) <= 0.5, `${mean(places).toFixed(2)} places`);
  check('Rarely wins the league straight away (under 1 in 6)', titles / careers < 1 / 6, `${((100 * titles) / careers).toFixed(0)}%`);
  check('Almost never goes unbeaten (2 in 100 at most)', unbeaten / careers <= 0.02, `${((100 * unbeaten) / careers).toFixed(1)}%`);
}

function careerRun(id: 'rugby' | 'cricket', sport: AnySport): void {
  const clue = { n: 0, tied: 0, right: 0 };
  const games: number[] = [];
  const run = (start: number, strategy: 'reader' | 'guesser', seed: number) => {
    const c = newCareer({ rating: start, seed }, sport);
    const rng = new Rng(seed * 13);
    const o = { top: SEASONS, title: SEASONS, titles: 0, relegated: 0, last: [] as number[] };
    for (let s = 1; s <= SEASONS; s++) {
      while (nextRound(c)) playRound(c, sport);
      games.push(c.season.playerMatches.length);
      const end = endSeason(c, sport);
      if (end.tier === 1 && o.top === SEASONS) o.top = s;
      if (end.outcome === 'champion') {
        o.titles++;
        if (o.title === SEASONS) o.title = s;
      }
      if (end.outcome === 'relegated') o.relegated++;
      const focus = strategy === 'reader' ? read(c, sport, rng, s > 2 ? clue : undefined) : rng.next() < 0.5 ? 'attack' : 'defence';
      allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], c.pending!.points, focus));
      if (s > SEASONS - 10) o.last.push(rating(c.clubs[c.playerClubId]));
    }
    return o;
  };
  const many = (start: number, s: 'reader' | 'guesser', base: number) => Array.from({ length: CAREERS }, (_, i) => run(start, s, base + i));
  const reader = many(50, 'reader', 100);
  const guesser = many(50, 'guesser', 100);
  // The climb varies a lot from career to career, so its median needs more of them.
  const climb = (s: 'reader' | 'guesser') => Array.from({ length: CAREERS * 3 }, (_, i) => run(3, s, 300 + i));
  const lowReader = climb('reader');
  const lowGuesser = climb('guesser');
  console.log(`\n-- Careers (${CAREERS} × ${SEASONS} seasons) --`);
  const last = (xs: { last: number[] }[]) => mean(xs.flatMap((x) => x.last));
  const titles = (xs: { titles: number }[]) => mean(xs.map((x) => x.titles));
  check('Reading clearly beats guessing (last 10 seasons, 40+ apart)', last(reader) - last(guesser) >= 40, `${last(reader).toFixed(0)} v ${last(guesser).toFixed(0)}`);
  check('A reader wins far more titles', titles(reader) >= 2 * titles(guesser), `${titles(reader).toFixed(1)} v ${titles(guesser).toFixed(1)}`);
  check('A good reader is rarely relegated (≤ 3 in 30 seasons)', mean(reader.map((x) => x.relegated)) <= (3 * SEASONS) / 30, mean(reader.map((x) => x.relegated)).toFixed(1));
  check('From the bottom, a reader reaches League 1 in about 8–14 seasons', median(lowReader.map((x) => x.top)) >= 7 && median(lowReader.map((x) => x.top)) <= 15, median(lowReader.map((x) => x.top)));
  check('A guesser takes far longer', median(lowGuesser.map((x) => x.top)) >= 1.5 * median(lowReader.map((x) => x.top)), median(lowGuesser.map((x) => x.top)));
  console.log(`      first title from the bottom: reader ${median(lowReader.map((x) => x.title))}, guesser ${median(lowGuesser.map((x) => x.title))}`);
  // Closer leagues make the ranks a little noisier, so this sits lower than when favourites won more.
  check('The summer clue points the right way 68%+ of the time', clue.right / clue.n >= 0.68, `${((100 * clue.right) / clue.n).toFixed(0)}%, ranks level ${((100 * clue.tied) / clue.n).toFixed(0)}%`);

  console.log(`\n-- Season length --`);
  // A match's full clock plus the full-time pause; a chase that ends early makes cricket's a little shorter.
  const matchMinutes = (d: (typeof sport.present.durations)[number]) => (tickMs(sport, d) * sport.module.ticks + fullTimePause(d)) / 60000;
  for (const d of sport.present.durations) console.log(`      ${d}: about ${(mean(games) * matchMinutes(d)).toFixed(0)} min (label "${sport.present.terms.seasonLabels[d]}")`);
  console.log(`      matches a season: mean ${mean(games).toFixed(1)}, ${Math.min(...games)}–${Math.max(...games)}`);
  const shortest = sport.present.durations[0];
  const t = TARGETS[id].seasonMinutes;
  const minutes = mean(games) * matchMinutes(shortest);
  check(`Shortest match length gives a season of ${t[0]}–${t[1]} min`, minutes >= t[0] && minutes <= t[1], `${minutes.toFixed(0)} min at ${shortest}`);
}

const only = process.argv.slice(2).find((a) => a === 'rugby' || a === 'cricket') as 'rugby' | 'cricket' | undefined;
for (const id of (only ? [only] : ['rugby', 'cricket']) as Exclude<SportId, 'football'>[]) {
  console.log(`\n==== ${id} ====`);
  worldRun(id, SPORTS[id]);
  firstSeasonRun(SPORTS[id]);
  careerRun(id, SPORTS[id]);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} targets met`);
process.exitCode = results.every(Boolean) ? 0 : 1;
