/**
 * Headless balance check for Grand Prix racing (its races don't fit the
 * head-to-head checks in tools/balance-sports.ts).
 *
 *   npx tsx tools/balance-grandprix.ts
 */
import { allocatePoints, endSeason, focusAllocation, newCareer, nextRound, playRound, type Career, type Focus } from '../src/core/career';
import { rating } from '../src/core/club';
import { sortTable } from '../src/core/league';
import { SPORTS } from '../src/sports';

const sport = SPORTS.grandprix;
const CAREERS = 16;
const SEASONS = 30;
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : NaN);
const results: boolean[] = [];
function check(name: string, pass: boolean, detail: string | number): void {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${detail}`);
}

function summer(c: Career, focus: (c: Career) => Focus): void {
  const end = endSeason(c, sport);
  allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, focus(c)));
  c.worldEnd = null;
}

/** The side of the car that fell further behind the league, as a player reading the clues would see. */
const reader = (c: Career): Focus => (c.clubs[c.playerClubId].attack <= c.clubs[c.playerClubId].defence ? 'attack' : 'defence');

// The racing itself, across every league.
let races = 0, cars = 0, dnfs = 0, poleWins = 0, favWins = 0, topThreeWins = 0, teamDoubles = 0;
const placeByRank: number[][] = Array.from({ length: 10 }, () => []);
const champWins: number[] = [];
const expectedGap: number[] = [];
const winnerTeams = new Map<string, number>();
const repeat: number[] = [];
for (let seed = 0; seed < CAREERS; seed++) {
  const c = newCareer({ rating: 50, seed: 300 + seed }, sport);
  let lastChamps: number[] = [];
  for (let n = 0; n < 12; n++) {
    while (nextRound(c)) {
      for (const { fixture: f, outcome: o } of playRound(c, sport)) {
        if (f.kind !== 'league' || !o.race) continue;
        races++;
        const order = o.race.order;
        cars += order.length;
        dnfs += order.filter((x) => x.out).length;
        if (order[0].grid === 1) poleWins++;
        const ranked = [...f.field!].sort((a, b) => rating(c.clubs[b]) - rating(c.clubs[a]));
        const win = ranked.indexOf(order[0].clubId);
        if (win === 0) favWins++;
        if (win < 3) topThreeWins++;
        if (order[0].clubId === order[1].clubId) teamDoubles++;
        for (const x of order) placeByRank[ranked.indexOf(x.clubId)].push(x.place);
      }
    }
    const s = c.season;
    const champs: number[] = [];
    for (const l of s.leagues) {
      const t = sortTable(l.table);
      champs.push(t[0].clubId);
      champWins.push(t[0].won);
      expectedGap.push(s.expected[t[0].clubId]);
      winnerTeams.set(`${seed}-${l.tier}-${t[0].clubId}`, (winnerTeams.get(`${seed}-${l.tier}-${t[0].clubId}`) ?? 0) + 1);
    }
    if (lastChamps.length) repeat.push(champs.filter((x, i) => x === lastChamps[i]).length / champs.length);
    lastChamps = champs;
    summer(c, reader);
  }
}
const dnfRate = (100 * dnfs) / cars;
check('Cars that fail to finish, per race', dnfRate >= 8 && dnfRate <= 18, `${dnfRate.toFixed(1)}%`);
check('Pole position wins the race', (100 * poleWins) / races >= 25 && (100 * poleWins) / races <= 50, `${((100 * poleWins) / races).toFixed(0)}%`);
check('The strongest team wins the race', (100 * favWins) / races >= 25 && (100 * favWins) / races <= 50, `${((100 * favWins) / races).toFixed(0)}%`);
check('One of the three strongest wins it', (100 * topThreeWins) / races >= 55 && (100 * topThreeWins) / races <= 85, `${((100 * topThreeWins) / races).toFixed(0)}%`);
check('A team finishes first and second', (100 * teamDoubles) / races >= 3 && (100 * teamDoubles) / races <= 20, `${((100 * teamDoubles) / races).toFixed(0)}%`);
const places = placeByRank.map((x) => mean(x));
check('The better a team, the better it finishes on average', places.every((p, i) => !i || p > places[i - 1] - 0.5), places.map((p) => p.toFixed(1)).join(' '));
check('A season champion wins between 3 and 9 of 16', mean(champWins) >= 3 && mean(champWins) <= 9, mean(champWins).toFixed(1));
check('The champion was expected to finish near the top', mean(expectedGap) <= 3.5, mean(expectedGap).toFixed(1));
check('A champion keeps the title next season', (100 * mean(repeat)) >= 15 && (100 * mean(repeat)) <= 55, `${(100 * mean(repeat)).toFixed(0)}%`);

// A career: the same climb and fall as the other sports.
function career(team: string, start: number, focus: (c: Career) => Focus) {
  const peaks: number[] = [], titles: number[] = [], relegations: number[] = [], firstTop: number[] = [];
  for (let seed = 0; seed < CAREERS; seed++) {
    const c = newCareer({ rating: start, seed: 700 + seed, team }, sport);
    let best = 99, won = 0, down = 0, top = 0;
    for (let n = 0; n < SEASONS; n++) {
      while (nextRound(c)) playRound(c, sport);
      const end = endSeason(c, sport);
      best = Math.min(best, end.tier);
      if (end.tier === 1 && end.position === 1) won++;
      if (end.outcome === 'relegated') down++;
      if (!top && end.tier === 1) top = n + 1;
      allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, focus(c)));
      c.worldEnd = null;
    }
    peaks.push(best);
    titles.push(won);
    relegations.push(down);
    firstTop.push(top || SEASONS + 1);
  }
  return { peak: mean(peaks), titles: mean(titles), relegations: mean(relegations), firstTop: mean(firstTop) };
}
const good = career('SCO', 8, reader);
const lazy = career('SCO', 8, () => 'attack');
check('A good reader climbs to League 1 from the bottom', good.firstTop <= 12, `season ${good.firstTop.toFixed(1)}`);
check('Wins League 1 sometimes, not every year (of 30)', good.titles >= 3 && good.titles <= 22, good.titles.toFixed(1));
check('A good reader is rarely relegated (≤ 4 in 30 seasons)', good.relegations <= 4, good.relegations.toFixed(1));
check('Reading the season beats always building speed', good.titles >= lazy.titles && good.relegations <= lazy.relegations + 1, `titles ${good.titles.toFixed(1)} v ${lazy.titles.toFixed(1)}, relegations ${good.relegations.toFixed(1)} v ${lazy.relegations.toFixed(1)}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} targets met`);
