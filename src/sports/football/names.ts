import type { ClubIdentity } from '../../core/career';
import type { Rng } from '../../core/rng';
import { COUNTRY_NAMES } from './data/commonNames';
import { NAME_POOLS, pool, type NamePool } from './data/names';
import { FAMOUS_PLAYERS } from '../famous';
import { EXTRA_LOCATIONS, EXTRA_NATIONS, LOCATIONS, NATIONS, RIVALS, WORLD_ORDER, type Nation } from './data/nations';

const BY_CODE = new Map([...NATIONS, ...EXTRA_NATIONS].map((n) => [n.code, n]));

export function nation(code: string): Nation {
  const n = BY_CODE.get(code);
  if (!n) throw new Error(`unknown nation ${code}`);
  return n;
}

export function identity(n: Nation): ClubIdentity {
  return { name: n.name, short: n.code, colours: [...n.colours], ...(n.shortName ? { shortName: n.shortName } : {}) };
}

/** The league a nation starts in by default: its place in the world order, or the bottom league. */
export function naturalTier(code: string, leagueSize: number, leagues: number, order: string[] = WORLD_ORDER): number {
  const rank = order.indexOf(code);
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
export function rivalAmong(code: string, world: string[], rivals: Record<string, string> = RIVALS): string {
  if (world.includes(rivals[code])) return rivals[code];
  const sameRegion = world.filter((c) => nation(c).region === nation(code).region);
  return (sameRegion.length ? sameRegion : world).reduce((best, c) => (distance(code, c) < distance(code, best) ? c : best));
}

/** Great-circle distance between two nations' capitals, in km. */
function distance(a: string, b: string): number {
  const [lat1, lon1] = (LOCATIONS[a] ?? EXTRA_LOCATIONS[a]).map((d) => (d * Math.PI) / 180);
  const [lat2, lon2] = (LOCATIONS[b] ?? EXTRA_LOCATIONS[b]).map((d) => (d * Math.PI) / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * A sport's world and its playable countries, for the sports where only the
 * nations in the world can be chosen. `renamed`: names that differ from
 * football's, such as the all-island Ireland side.
 */
export function sportWorld(order: string[], rivals: Record<string, string>, leagueSize: number, leagues: number, renamed: Record<string, string> = {}) {
  const team = (code: string): ClubIdentity => ({ ...identity(nation(code)), ...(renamed[code] ? { name: renamed[code] } : {}) });
  return {
    world(rng: Rng, count: number, code?: string): { player: ClubIdentity; others: ClubIdentity[]; rival?: string } {
      const mine = code ?? rng.pick(order.slice(0, count));
      const others = order.filter((c) => c !== mine).slice(0, count - 1);
      return { player: team(mine), others: others.map(team), rival: rivalAmong(mine, others, rivals) };
    },
    nations: () => order.map((code) => ({ ...team(code), tier: naturalTier(code, leagueSize, leagues, order) })),
  };
}

const POOLS = new Map<string, NamePool>();

/** The names a nation's players are drawn from: its own common names, or its region's if it has no list. */
export function namesOf(code: string): NamePool {
  let names = POOLS.get(code);
  if (!names) {
    const regional = NAME_POOLS[nation(code).names];
    const own = COUNTRY_NAMES[code];
    names = own ? pool(own[1] ?? regional.first.join(' '), own[0]) : regional;
    POOLS.set(code, names);
  }
  return names;
}

/**
 * A name generator for one squad: surnames only repeat once the list runs out,
 * as with Kims and Nguyens. Nobody in a squad shares a whole name, and a real
 * star's name is never drawn: common names can still make one by chance.
 */
export function playerNamer(code: string, squad: { name: string }[] = []): (rng: Rng) => string {
  const names = namesOf(code);
  const used = new Set(squad.map((p) => surname(p.name)));
  const taken = new Set(squad.map((p) => p.name));
  return (rng) => {
    const fresh = names.last.filter((s) => !used.has(s));
    const last = rng.pick(fresh.length ? fresh : names.last);
    used.add(last);
    let full = `${rng.pick(names.first)} ${last}`;
    for (let tries = 0; tries < 50 && (FAMOUS_PLAYERS.has(full) || taken.has(full)); tries++) full = `${rng.pick(names.first)} ${last}`;
    // A squad bigger than a short list could run out of whole names; a star's never gets through.
    while (FAMOUS_PLAYERS.has(full)) full = `${rng.pick(names.first)} ${rng.pick(names.last)}`;
    taken.add(full);
    return full;
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
