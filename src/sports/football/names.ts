import type { ClubIdentity } from '../../core/career';
import type { Rng } from '../../core/rng';
import { NAME_POOLS } from './data/names';
import { LOCATIONS, NATIONS, RIVALS, WORLD_ORDER, type Nation } from './data/nations';

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
export function world(rng: Rng, count: number, code?: string): { player: ClubIdentity; others: ClubIdentity[]; rival?: string } {
  const mine = code ?? rng.pick(WORLD_ORDER.slice(0, count));
  const others = WORLD_ORDER.filter((c) => c !== mine).slice(0, count - 1);
  return { player: identity(nation(mine)), others: others.map((c) => identity(nation(c))), rival: rivalAmong(mine, others) };
}

/** The nation's rival if it's in the world; otherwise its nearest neighbour that is, from its own continent where there is one. */
export function rivalAmong(code: string, world: string[]): string {
  if (world.includes(RIVALS[code])) return RIVALS[code];
  const sameRegion = world.filter((c) => nation(c).region === nation(code).region);
  return (sameRegion.length ? sameRegion : world).reduce((best, c) => (distance(code, c) < distance(code, best) ? c : best));
}

/** Great-circle distance between two nations' capitals, in km. */
function distance(a: string, b: string): number {
  const [lat1, lon1] = LOCATIONS[a].map((d) => (d * Math.PI) / 180);
  const [lat2, lon2] = LOCATIONS[b].map((d) => (d * Math.PI) / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** A name generator for one squad: surnames only repeat once the pool runs out, as with Kims and Nguyens. */
export function playerNamer(code: string, squad: { name: string }[] = []): (rng: Rng) => string {
  const pools = [nation(code).names].flat().map((k) => NAME_POOLS[k]);
  const used = new Set(squad.map((p) => surname(p.name)));
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
