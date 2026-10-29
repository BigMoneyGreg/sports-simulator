import type { Player } from './sport';

export type Style = 'attacking' | 'defensive' | 'balanced';
export type Stat = 'attack' | 'defence';
export const STATS: readonly Stat[] = ['attack', 'defence'];

export const MAX_STAT = 99;

export interface Club {
  id: number;
  name: string;
  /** Three-letter code, e.g. ASH. */
  short: string;
  shortName?: string;
  colours: string[];
  style: Style;
  /** Stats are stored with decimals and shown as whole numbers. */
  attack: number;
  defence: number;
  squad: Player[];
  isPlayer: boolean;
}

/**
 * Each AI style is a fixed shape around the club's rating: attacking sides
 * score more and leave gaps at the back, defensive sides the reverse. Both
 * lean the same distance, so AI clubs of equal rating are equally strong but
 * play differently. Balanced is the player's starting shape.
 */
export const STYLE_TUNING = { skew: 10 };

/** Styles an AI club can have. */
export const AI_STYLES: readonly Style[] = ['attacking', 'defensive'];

const STYLE_SHAPE: Record<Style, Record<Stat, number>> = {
  attacking: { attack: 1, defence: -1 },
  defensive: { attack: -1, defence: 1 },
  balanced: { attack: 0, defence: 0 },
};

const EVEN: Record<Stat, number> = { attack: 1, defence: 1 };

export function rating(club: Pick<Club, Stat>): number {
  return (club.attack + club.defence) / 2;
}

/** Stats for a rating in a style's shape, squeezed near 0 and 99 so the average is exact. */
export function statsFor(value: number, style: Style): Record<Stat, number> {
  const shape = STYLE_SHAPE[style];
  const v = clamp(value, 0, MAX_STAT);
  const up = Math.max(...STATS.map((s) => shape[s]));
  const down = -Math.min(...STATS.map((s) => shape[s]));
  const skew = up === 0 ? 0 : Math.min(STYLE_TUNING.skew, (MAX_STAT - v) / up, v / down);
  return { attack: v + skew * shape.attack, defence: v + skew * shape.defence };
}

/**
 * Changes a club's rating by `delta`, split across stats by `weights` and
 * clamped to 0–99. Whatever a capped stat can't take goes to the others.
 * Returns the rating change actually applied.
 */
export function shiftRating(club: Club, delta: number, weights: Record<Stat, number> = EVEN): number {
  const before = rating(club);
  let remaining = delta * STATS.length;
  let open = STATS.filter((s) => canMove(club[s], remaining));
  for (let pass = 0; pass < 3 && Math.abs(remaining) > 1e-12 && open.length > 0; pass++) {
    const total = open.reduce((t, s) => t + weights[s], 0);
    let applied = 0;
    for (const s of open) {
      const want = total > 0 ? (remaining * weights[s]) / total : remaining / open.length;
      const next = clamp(club[s] + want, 0, MAX_STAT);
      applied += next - club[s];
      club[s] = next;
    }
    remaining -= applied;
    open = open.filter((s) => canMove(club[s], remaining));
  }
  return rating(club) - before;
}

function canMove(value: number, direction: number): boolean {
  return direction > 0 ? value < MAX_STAT : value > 0;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
