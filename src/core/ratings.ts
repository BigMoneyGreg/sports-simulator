import { band, LEAGUE_COUNT, LEAGUE_SIZE } from './league';
import { MAX_STAT, MIN_STAT, rating, shiftRating, STATS, type Club, type Stat } from './club';
import type { Rng } from './rng';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Starting values from DESIGN.md §7; tuned by tools/balance.ts. */
export const RATING_TUNING = {
  /** Rating every club loses each summer, split at random between attack and defence. */
  decline: 10,
  /** The share of the decline that hits attack is drawn from this range; defence takes the rest. */
  declineSplit: [0.25, 0.75] as [number, number],
  averageGain: 10,
  performanceMultiplier: 1.0,
  topBonus: [6, 4, 2],
  bottomBonus: [-2, -4, -6],
  difficultyBoost: { easy: 10, medium: 5, hard: 0 } as Record<Difficulty, number>,
  /** The smaller boost while the player is reigning League 1 champion; back to the full one once they lose the title. */
  championBoost: { easy: 4, medium: 2, hard: 0 } as Record<Difficulty, number>,
  /** Standard deviation of the AI-only random variation, in rating points. */
  aiNoise: 1.5,
  /** AI only: net rises are scaled down linearly from this rating to plateauFloor at 99. */
  plateauStart: 85,
  plateauFloor: 0.3,
  /** Fraction of the distance outside its band an AI club is pulled back each season. */
  bandPull: 0.8,
  /** AI clubs above this rating lose this share of the excess each season (stars get poached). */
  aiCeiling: 93,
  aiCeilingPull: 0.3,
  /** Rating an AI club gains on promotion (investment), so promoted sides can compete. */
  promotedBoost: 4,
  /** Points the player allocates per point of rating gained (1 point = +1 to a stat). */
  pointsPerRating: 2,
  /** Share of the summer's points that go to the side the player rebuilds; the rest go to the other. */
  focusShare: 0.65,
};

/** Rank by rating within a league: the highest-rated club is expected 1st. */
export function expectedPositions(clubs: Club[]): Map<number, number> {
  const ranked = [...clubs].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
  return new Map(ranked.map((c, i) => [c.id, i + 1]));
}

/** Top/bottom bonus by finishing position; none for League 1's top 3 or League 5's bottom 3. */
export function positionBonus(tier: number, position: number): number {
  if (position <= 3) return tier === 1 ? 0 : RATING_TUNING.topBonus[position - 1];
  const fromBottom = LEAGUE_SIZE - position;
  if (fromBottom < 3) return tier === LEAGUE_COUNT ? 0 : RATING_TUNING.bottomBonus[2 - fromBottom];
  return 0;
}

const PLATEAU_TOP = 99;

/** AI only: share of a net rise a club keeps at this rating. */
export function plateau(value: number): number {
  const { plateauStart, plateauFloor } = RATING_TUNING;
  if (value <= plateauStart) return 1;
  return 1 - ((1 - plateauFloor) * (Math.min(value, PLATEAU_TOP) - plateauStart)) / (PLATEAU_TOP - plateauStart);
}

/**
 * Rating regained at the end of a season (on top of the flat decline):
 * average gain + performance against expectation + top/bottom bonus + extra
 * (AI noise or the player's difficulty boost). An AI club's net rise is
 * flattened near 99; the player's isn't, but their boost shrinks while they
 * hold the title.
 */
export function seasonGain(tier: number, expected: number, actual: number, currentRating: number, extra = 0, isPlayer = false): number {
  const performance = expected - actual;
  const gain = RATING_TUNING.averageGain + RATING_TUNING.performanceMultiplier * performance + positionBonus(tier, actual) + extra;
  const net = gain - RATING_TUNING.decline;
  return RATING_TUNING.decline + (net > 0 && !isPlayer ? net * plateau(currentRating) : net);
}

/**
 * The season's decline, split at random between attack and defence: one
 * summer the strikers leave, the next the back four ages. Returns what each
 * stat lost.
 */
export function applyDecline(club: Club, amount: number, rng: Rng): Record<Stat, number> {
  const [lo, hi] = RATING_TUNING.declineSplit;
  const share = lo + (hi - lo) * rng.next();
  const before = { attack: club.attack, defence: club.defence };
  // Both stats together lose `amount` of rating, i.e. twice that in stat points.
  const loss = { attack: 2 * amount * share, defence: 2 * amount * (1 - share) };
  let shortfall = 0;
  for (const s of STATS) {
    const next = Math.max(MIN_STAT, club[s] - loss[s]);
    shortfall += loss[s] - (club[s] - next);
    club[s] = next;
  }
  if (shortfall > 0) shiftRating(club, -shortfall / STATS.length);
  return { attack: before.attack - club.attack, defence: before.defence - club.defence };
}

/**
 * Pulls an AI club drifting outside its league's band part of the way back,
 * and keeps runaway clubs from settling at the very top.
 */
export function bandPull(club: Club, tier: number): void {
  const { min, max } = band(tier);
  const r = rating(club);
  const outside = r < min ? min - r : r > max ? max - r : 0;
  if (outside !== 0) shiftRating(club, outside * RATING_TUNING.bandPull);
  const excess = rating(club) - RATING_TUNING.aiCeiling;
  if (excess > 0) shiftRating(club, -excess * RATING_TUNING.aiCeilingPull);
}

/**
 * Spreads whatever the AI clubs' total has drifted from `target` evenly
 * across them, so the AI world's total never changes. The player sits
 * outside it: their gains and losses neither drain nor feed the AI.
 */
export function normalise(clubs: Club[], target: number): void {
  const ai = clubs.filter((c) => !c.isPlayer);
  for (let pass = 0; pass < 20; pass++) {
    const leftover = target - totalRating(ai);
    if (Math.abs(leftover) < 1e-9) return;
    const movable = ai.filter((c) => (leftover > 0 ? rating(c) < MAX_STAT : rating(c) > MIN_STAT));
    if (movable.length === 0) return;
    const each = leftover / movable.length;
    for (const c of movable) shiftRating(c, each);
  }
}

export function totalRating(clubs: Club[]): number {
  return clubs.reduce((t, c) => t + rating(c), 0);
}
