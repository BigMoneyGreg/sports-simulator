import type { Rng } from './rng';
import type { MatchOptions, MatchOutcome } from './sport';

export const LEAGUE_COUNT = 5;
export const LEAGUE_SIZE = 20;
export const PROMOTED_AUTOMATICALLY = 2;
export const PLAYOFF_PLACES = [3, 4, 5, 6] as const;
export const RELEGATED = 3;

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
}

/**
 * Starting pots by world order: each pot's ratings are shuffled among its
 * teams, so the order inside a pot changes every career. Pots straddling a
 * league line (17–24, 37–44, …) can start on either side of it.
 */
export const STARTING_POTS = [8, 16, 24, 36, 44, 56, 64, 76, 84, 92, 100];

/** Shuffles `ratings` (strongest first) within each starting pot. */
export function potShuffle(ratings: number[], rng: Rng): number[] {
  const out: number[] = [];
  let from = 0;
  for (const end of STARTING_POTS) {
    out.push(...rng.shuffle(ratings.slice(from, end)));
    from = end;
  }
  return out;
}

/** Rating band for each league: League 1 is 80–99, League 5 is 0–19. */
export function band(tier: number): { min: number; max: number } {
  const min = (LEAGUE_COUNT - tier) * LEAGUE_SIZE;
  return { min, max: min + LEAGUE_SIZE - 1 };
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
  apply(h, result.homeGoals, result.awayGoals);
  apply(a, result.awayGoals, result.homeGoals);
}

function apply(row: TableRow, scored: number, conceded: number): void {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  if (scored > conceded) {
    row.won++;
    row.points += 3;
    row.form.push('W');
  } else if (scored === conceded) {
    row.drawn++;
    row.points += 1;
    row.form.push('D');
  } else {
    row.lost++;
    row.form.push('L');
  }
}

/**
 * Where a club ranks in its league for goals scored (1 = most) and goals
 * conceded (1 = fewest): the summer's clue to which side dropped off.
 */
export function goalRanks(table: TableRow[], clubId: number): { scored: number; conceded: number } {
  const me = table.find((r) => r.clubId === clubId)!;
  return {
    scored: 1 + table.filter((r) => r.goalsFor > me.goalsFor).length,
    conceded: 1 + table.filter((r) => r.goalsAgainst < me.goalsAgainst).length,
  };
}

/** Points, then goal difference, then goals scored. */
export function sortTable(table: TableRow[]): TableRow[] {
  return [...table].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      x.clubId - y.clubId,
  );
}

/**
 * A random starting rating within a league, weighted towards the middle:
 * half the time 40–60% of the way up the league's band, a quarter of the time
 * 20–40%, and a quarter 60–80%. Never at the very top or bottom.
 */
export function startRating(tier: number, rng: Rng): number {
  const r = rng.next();
  const from = r < 0.5 ? 8 : r < 0.75 ? 4 : 12;
  return band(tier).min + from + rng.int(0, 3);
}

/** Starting attack/defence for a style: leaning `lean` either way, or level. */
export function styleSplit(rating: number, style: 'attacking' | 'balanced' | 'defensive', lean: number): { attack: number; defence: number } {
  const l = style === 'balanced' ? 0 : Math.min(lean, rating, 99 - rating);
  const sign = style === 'attacking' ? 1 : -1;
  return { attack: rating + sign * l, defence: rating - sign * l };
}

export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

/** What a finishing position means in a given league. */
export function zone(tier: number, position: number): Zone {
  if (tier === 1 && position === 1) return 'champion';
  if (tier > 1 && position <= PROMOTED_AUTOMATICALLY) return 'promotion';
  if (tier > 1 && (PLAYOFF_PLACES as readonly number[]).includes(position)) return 'playoff';
  if (tier < LEAGUE_COUNT && position > LEAGUE_SIZE - RELEGATED) return 'relegation';
  return null;
}
