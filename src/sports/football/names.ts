import type { ClubIdentity } from '../../core/career';
import type { Rng } from '../../core/rng';
import { NAME_POOLS } from './data/names';
import { NATIONS, WORLD_ORDER, type Nation } from './data/nations';

const BY_CODE = new Map(NATIONS.map((n) => [n.code, n]));

export function isNation(code: string): boolean {
  return BY_CODE.has(code);
}

export function nation(code: string): Nation {
  const n = BY_CODE.get(code);
  if (!n) throw new Error(`unknown nation ${code}`);
  return n;
}

function identity(n: Nation): ClubIdentity {
  return { name: n.name, short: n.code, colours: [...n.colours], ...(n.shortName ? { shortName: n.shortName } : {}) };
}

/** The league a nation starts in by default: its place in the world order, or the bottom league. */
export function naturalTier(code: string, leagueSize: number, leagues: number): number {
  const rank = WORLD_ORDER.indexOf(code);
  return rank < 0 ? leagues : Math.floor(rank / leagueSize) + 1;
}

/**
 * The world: the player's nation first, then the other nations of the world
 * order, strongest first. A nation from outside it takes the place of the
 * weakest.
 */
export function world(rng: Rng, count: number, code?: string): { player: ClubIdentity; others: ClubIdentity[] } {
  const mine = code ?? rng.pick(WORLD_ORDER.slice(0, count));
  const others = WORLD_ORDER.filter((c) => c !== mine).slice(0, count - 1);
  return { player: identity(nation(mine)), others: others.map((c) => identity(nation(c))) };
}

/** A name generator for one squad: surnames only repeat once the pool runs out, as with Kims and Nguyens. */
export function playerNamer(code: string): (rng: Rng) => string {
  const pools = [nation(code).names].flat().map((k) => NAME_POOLS[k]);
  const used = new Set<string>();
  return (rng) => {
    const pool = pools.length > 1 && rng.next() < 0.25 ? pools[1] : pools[0];
    const fresh = pool.last.filter((s) => !used.has(s));
    const surname = rng.pick(fresh.length ? fresh : pool.last);
    used.add(surname);
    return `${rng.pick(pool.first)} ${surname}`;
  };
}

/** The name for tight spaces. */
export function shortName(club: Pick<ClubIdentity, 'name' | 'shortName'>): string {
  return club.shortName ?? club.name;
}

/** Surname for commentary and scorer lists. */
export function surname(fullName: string): string {
  return fullName.split(' ').slice(1).join(' ');
}
