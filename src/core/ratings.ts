import type { SportFormat } from './format';
import { band } from './league';
import { MAX_STAT, MIN_STAT, rating, shiftRating, STATS, type Club, type Stat } from './club';
import type { Rng } from './rng';


/** Starting values from DESIGN.md §7; tuned by tools/balance.ts. */
export const RATING_TUNING = {
  /** Rating every club loses each summer, split at random between attack and defence. */
  decline: 10,
  /** The share of the decline that hits attack is drawn from this range; defence takes the rest. */
  declineSplit: [0.1, 0.9] as [number, number],
  averageGain: 10,
  /** The hidden rise the player's club gets each season. */
  playerBoost: 7,
  /** The smaller boost while the player is reigning League 1 champion; back to the full one once they lose the title. */
  championBoost: 2,
  /** Standard deviation of the AI-only random variation, in rating points. */
  aiNoise: 1.5,
  /** AI only: net rises are scaled down linearly from this rating to plateauFloor at 99. */
  plateauStart: 85,
  plateauFloor: 0.3,
  /** Fraction of the distance outside its band an AI club is pulled back each season. */
  bandPull: 0.8,
  /** AI clubs above this rating lose this share of the excess each season (stars get poached). */
  aiCeiling: 99,
  aiCeilingPull: 0.3,
  /** Share of the distance back to its own level an AI club covers each summer. */
  levelPull: 0.45,
  /** The most an AI club's rating can move in a summer, up or down. */
  maxSwing: 6,
  /** Standard deviation of a level's yearly drift, and the share of the way back to where it began that it comes each year. */
  levelDrift: 0.6,
  levelReturn: 0.04,
  /** The chance a nation starts a golden generation or a bad spell in any summer, how many years it lasts and how much it moves the level each year. */
  eraChance: 0.04,
  eraYears: [4, 8] as [number, number],
  eraRate: [1.5, 3] as [number, number],
  /** Player only: the share of a net rise kept, falling from 1 at the first rating to the floor at the second. Closing on the elite gets harder. */
  climbStart: 60,
  climbTop: 95,
  climbFloor: 0.1,
  /** Rating an AI club gains on promotion (investment), so promoted sides can compete. */
  promotedBoost: 4,
  /** Points the player allocates per point of rating gained (1 point = +1 to a stat). */
  pointsPerRating: 2,
  /** Share of the summer's points that go to the side the player rebuilds; the rest go to the other. */
  focusShare: 0.65,
  /**
   * How much of the gap between the player's settled shape and its real one
   * closes each summer: 1 settles at once; less makes a lopsided side's
   * troubles, and their cure, build over a few seasons.
   */
  leanSettling: 0.5,
};

/** Rank by rating within a league: the highest-rated club is expected 1st. */
export function expectedPositions(clubs: Club[]): Map<number, number> {
  const ranked = [...clubs].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
  return new Map(ranked.map((c, i) => [c.id, i + 1]));
}

/** Top/bottom bonus by finishing position; none for League 1's top 3 or the bottom league's bottom 3. */
export function positionBonus(format: SportFormat, tier: number, position: number): number {
  if (position <= 3) return tier === 1 ? 0 : format.topBonus[position - 1];
  const fromBottom = format.leagueSize - position;
  if (fromBottom < 3) return tier === format.leagues ? 0 : format.bottomBonus[2 - fromBottom];
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
 * (AI noise or the player's boost). An AI club's net rise is
 * flattened near 99; the player's is too, more gently, and their boost shrinks while they
 * hold the title.
 */
export function seasonGain(format: SportFormat, tier: number, expected: number, actual: number, currentRating: number, extra = 0, isPlayer = false): number {
  const performance = expected - actual;
  const gain = RATING_TUNING.averageGain + format.performanceMultiplier * performance + positionBonus(format, tier, actual) + extra;
  const net = gain - RATING_TUNING.decline;
  if (net <= 0) return RATING_TUNING.decline + net;
  return RATING_TUNING.decline + net * (isPlayer ? climb(currentRating) : plateau(currentRating));
}

/** Player only: the share of a net rise kept at this rating. */
export function climb(value: number): number {
  const { climbStart, climbTop, climbFloor } = RATING_TUNING;
  if (value <= climbStart) return 1;
  return Math.max(climbFloor, 1 - ((1 - climbFloor) * (value - climbStart)) / (climbTop - climbStart));
}

/** A nation's strength over the years: a slow drift, and now and then a golden generation or a bad spell. */
export function driftLevel(club: Club, rng: Rng): number {
  const { levelDrift, levelReturn, eraChance, eraYears, eraRate } = RATING_TUNING;
  const level = club.level ?? rating(club);
  const base = club.base ?? level;
  club.base = base;
  if (!club.era && rng.chance(eraChance)) {
    const rate = eraRate[0] + (eraRate[1] - eraRate[0]) * rng.next();
    club.era = { rate: rng.chance(0.5) ? rate : -rate, years: rng.int(eraYears[0], eraYears[1]) };
  }
  let next = level + rng.normal(0, levelDrift) + levelReturn * (base - level);
  if (club.era) {
    next += club.era.rate;
    if (--club.era.years <= 0) delete club.era;
  }
  club.level = Math.min(99, Math.max(1, next));
  return club.level;
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
export function bandPull(format: SportFormat, club: Club, tier: number): void {
  const { min, max } = band(format, tier);
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
