import type { Player } from './sport';

export type Style = 'attacking' | 'defensive' | 'balanced';
export type Stat = 'attack' | 'defence' | 'chemistry';
export const STATS: readonly Stat[] = ['attack', 'defence', 'chemistry'];

export const MAX_STAT = 99;

export interface Club {
  id: number;
  name: string;
  /** Three-letter code, e.g. ASH. */
  short: string;
  colours: [string, string];
  style: Style;
  /** Stats are stored with decimals and shown as whole numbers. */
  attack: number;
  defence: number;
  chemistry: number;
  squad: Player[];
  isPlayer: boolean;
}

/** How an AI club's rating changes are split across its stats. */
export const STYLE_WEIGHTS: Record<Style, Record<Stat, number>> = {
  attacking: { attack: 0.5, defence: 0.2, chemistry: 0.3 },
  defensive: { attack: 0.2, defence: 0.5, chemistry: 0.3 },
  balanced: { attack: 1 / 3, defence: 1 / 3, chemistry: 1 / 3 },
};

/** How far a style's stats lean away from the rating at the start of a career. */
const STYLE_SKEW = 5;

export function rating(club: Pick<Club, Stat>): number {
  return (club.attack + club.defence + club.chemistry) / 3;
}

/** Starting stats for a given rating, leaning towards the club's style. */
export function statsFor(value: number, style: Style): Record<Stat, number> {
  const skew = style === 'balanced' ? 0 : Math.min(STYLE_SKEW, MAX_STAT - value, value);
  const lean = style === 'attacking' ? skew : -skew;
  return { attack: value + lean, defence: value - lean, chemistry: value };
}

/**
 * Changes a club's rating by `delta`, split across stats by `weights` and
 * clamped to 0–99. Whatever a capped stat can't take goes to the others.
 * Returns the rating change actually applied.
 */
export function shiftRating(club: Club, delta: number, weights: Record<Stat, number> = STYLE_WEIGHTS.balanced): number {
  const before = rating(club);
  let remaining = delta * 3;
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
