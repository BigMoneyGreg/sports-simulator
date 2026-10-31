import type { SportFormat } from './format';
import type { Rng } from './rng';
import type { MatchOptions, MatchOutcome } from './sport';

export type RoundKind = 'league' | 'playoffSemi1' | 'playoffSemi2' | 'playoffFinal' | 'cup' | 'championship';

export interface Fixture {
  /** The league, or 0 for cup matches. */
  tier: number;
  home: number;
  away: number;
  kind: RoundKind;
  options: MatchOptions;
  /** Cup matches: which stage of the competition. */
  stage?: number;
  /** The second leg of a two-legged tie. */
  secondLeg?: boolean;
}

export interface TableRow {
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Results in order, most recent last: W, D or L. */
  form: ('W' | 'D' | 'L')[];
  /** Cricket: balls faced and bowled, for net run rate. */
  ballsFaced?: number;
  ballsBowled?: number;
}

/** Shuffles `ratings` (strongest first) within each of the sport's starting pots. */
export function potShuffle(format: SportFormat, ratings: number[], rng: Rng): number[] {
  const out: number[] = [];
  let from = 0;
  for (const end of format.startingPots) {
    out.push(...rng.shuffle(ratings.slice(from, end)));
    from = end;
  }
  return out;
}

/** Rating band for each league, the world spread across 0–99: in football League 1 is 80–99, League 5 is 0–19. */
export function band(format: SportFormat, tier: number): { min: number; max: number } {
  const width = 100 / format.leagues;
  const min = (format.leagues - tier) * width;
  return { min, max: min + width - 1 };
}

/**
 * Double round-robin (circle method): every club plays every other once at
 * home and once away; the second half mirrors the first with venues swapped.
 */
export function doubleRoundRobin(clubIds: number[], rng: Rng): [number, number][][] {
  const teams = rng.shuffle([...clubIds]);
  const n = teams.length;
  const firstHalf: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      // Alternating every pair by round keeps runs to two home or away games.
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    firstHalf.push(round);
    teams.splice(1, 0, teams.pop()!);
  }
  const secondHalf = firstHalf.map((round) => round.map(([h, a]) => [a, h] as [number, number]));
  return [...firstHalf, ...secondHalf];
}

export function emptyTable(clubIds: number[]): TableRow[] {
  return clubIds.map((clubId) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] }));
}

export function recordResult(table: TableRow[], home: number, away: number, result: MatchOutcome): void {
  const h = table.find((r) => r.clubId === home);
  const a = table.find((r) => r.clubId === away);
  if (!h || !a) throw new Error(`club not in table: ${home} v ${away}`);
  // A set winner settles a level score (cricket's super over); points default to football's 3-1-0.
  const homeResult = result.winner ? (result.winner === 'home' ? 1 : -1) : Math.sign(result.homeGoals - result.awayGoals);
  apply(h, result.homeGoals, result.awayGoals, homeResult, result.points?.[0]);
  apply(a, result.awayGoals, result.homeGoals, -homeResult, result.points?.[1]);
  if (result.balls) {
    h.ballsFaced = (h.ballsFaced ?? 0) + result.balls[0];
    h.ballsBowled = (h.ballsBowled ?? 0) + result.balls[1];
    a.ballsFaced = (a.ballsFaced ?? 0) + result.balls[1];
    a.ballsBowled = (a.ballsBowled ?? 0) + result.balls[0];
  }
}

function apply(row: TableRow, scored: number, conceded: number, result: number, points?: number): void {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  if (result > 0) {
    row.won++;
    row.points += points ?? 3;
    row.form.push('W');
  } else if (result === 0) {
    row.drawn++;
    row.points += points ?? 1;
    row.form.push('D');
  } else {
    row.lost++;
    row.points += points ?? 0;
    row.form.push('L');
  }
}

/** Runs scored per over; 0 before a ball is faced. */
export function runRateFor(row: TableRow): number {
  return row.ballsFaced ? (row.goalsFor * 6) / row.ballsFaced : 0;
}

/** Runs conceded per over; 0 before a ball is bowled. */
export function runRateAgainst(row: TableRow): number {
  return row.ballsBowled ? (row.goalsAgainst * 6) / row.ballsBowled : 0;
}

/** Net run rate where the sport counts balls, otherwise goal or points difference: the table's tie-break. */
export function difference(row: TableRow): number {
  return row.ballsFaced === undefined ? row.goalsFor - row.goalsAgainst : runRateFor(row) - runRateAgainst(row);
}

/**
 * Where a club ranks in its league for goals scored (1 = most) and goals
 * conceded (1 = fewest): the summer's clue to which side dropped off. Cricket
 * ranks run rates: a side stops batting once it has chased a target down, so
 * its strongest batting wins would otherwise look like its lowest totals.
 */
export function goalRanks(table: TableRow[], clubId: number): { scored: number; conceded: number } {
  const me = table.find((r) => r.clubId === clubId)!;
  const made = (r: TableRow) => (r.ballsFaced === undefined ? r.goalsFor : runRateFor(r));
  const given = (r: TableRow) => (r.ballsBowled === undefined ? r.goalsAgainst : runRateAgainst(r));
  return {
    scored: 1 + table.filter((r) => made(r) > made(me)).length,
    conceded: 1 + table.filter((r) => given(r) < given(me)).length,
  };
}

/** Points, then goal difference (or net run rate), then goals scored. */
export function sortTable(table: TableRow[]): TableRow[] {
  return [...table].sort(
    (x, y) =>
      y.points - x.points ||
      difference(y) - difference(x) ||
      y.goalsFor - x.goalsFor ||
      x.clubId - y.clubId,
  );
}

/**
 * A random starting rating within a league, weighted towards the middle:
 * half the time 40–60% of the way up the league's band, a quarter of the time
 * 20–40%, and a quarter 60–80%. Never at the very top or bottom.
 */
export function startRating(format: SportFormat, tier: number, rng: Rng): number {
  const r = rng.next();
  const from = r < 0.5 ? 8 : r < 0.75 ? 4 : 12;
  const { min, max } = band(format, tier);
  return Math.round(min + (((max + 1 - min) / 20) * (from + rng.int(0, 3))));
}

export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

/** What a finishing position means in a given league. */
export function zone(format: SportFormat, tier: number, position: number): Zone {
  if (tier === 1 && position === 1) return 'champion';
  if (tier > 1 && position <= format.promoted) return 'promotion';
  if (tier > 1 && format.playoffs && position <= format.promoted + 4) return 'playoff';
  if (tier < format.leagues && position > format.leagueSize - format.relegated) return 'relegation';
  return null;
}
