import { band, LEAGUE_COUNT, LEAGUE_SIZE } from './league';
import { clamp, MAX_STAT, rating, shiftRating, type Club } from './club';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Starting values from DESIGN.md §7; tuned by tools/balance.ts. */
export const RATING_TUNING = {
  decline: 10,
  averageGain: 10,
  performanceMultiplier: 1.0,
  topBonus: [6, 4, 2],
  bottomBonus: [-2, -4, -6],
  difficultyBoost: { easy: 10, medium: 5, hard: 2 } as Record<Difficulty, number>,
  /** Standard deviation of the AI-only random variation, in rating points. */
  aiNoise: 1.5,
  /** Net rises are scaled down linearly from this rating to plateauFloor at 99. */
  plateauStart: 85,
  plateauFloor: 0.3,
  /** Fraction of the distance outside its band an AI club is pulled back each season. */
  bandPull: 0.3,
  /** Rating points of player-allocation per point of rating. */
  pointsPerRating: 3,
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

/** Share of a net rise a club keeps at this rating. */
export function plateau(value: number): number {
  const { plateauStart, plateauFloor } = RATING_TUNING;
  if (value <= plateauStart) return 1;
  return 1 - ((1 - plateauFloor) * (Math.min(value, MAX_STAT) - plateauStart)) / (MAX_STAT - plateauStart);
}

/**
 * Rating regained at the end of a season (on top of the decline):
 * average gain + performance against expectation + top/bottom bonus + extra
 * (AI noise or the player's difficulty boost), with any net rise flattened
 * near 99.
 */
export function seasonGain(tier: number, expected: number, actual: number, currentRating: number, extra = 0): number {
  const performance = expected - actual;
  const gain = RATING_TUNING.averageGain + RATING_TUNING.performanceMultiplier * performance + positionBonus(tier, actual) + extra;
  const net = gain - RATING_TUNING.decline;
  return RATING_TUNING.decline + (net > 0 ? net * plateau(currentRating) : net);
}

/** Pulls an AI club drifting outside its league's band part of the way back. */
export function bandPull(club: Club, tier: number): void {
  const { min, max } = band(tier);
  const r = rating(club);
  const outside = r < min ? min - r : r > max ? max - r : 0;
  if (outside !== 0) shiftRating(club, outside * RATING_TUNING.bandPull);
}

/**
 * Spreads whatever the total has drifted from `target` evenly across the AI
 * clubs, so the game's total rating never changes. The player is untouched.
 */
export function normalise(clubs: Club[], target: number): void {
  const ai = clubs.filter((c) => !c.isPlayer);
  for (let pass = 0; pass < 20; pass++) {
    const leftover = target - clubs.reduce((t, c) => t + rating(c), 0);
    if (Math.abs(leftover) < 1e-9) return;
    const movable = ai.filter((c) => (leftover > 0 ? rating(c) < MAX_STAT : rating(c) > 0));
    if (movable.length === 0) return;
    const each = leftover / movable.length;
    for (const c of movable) shiftRating(c, each);
  }
}

export function totalRating(clubs: Club[]): number {
  return clubs.reduce((t, c) => t + rating(c), 0);
}

export function displayRating(club: Club): number {
  return Math.round(clamp(rating(club), 0, MAX_STAT));
}
