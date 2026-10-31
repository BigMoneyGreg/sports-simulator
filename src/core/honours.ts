// What's kept across careers and sports: honours for doing well in several
// sports, and the numbers behind the Honours page. Only looks at finished seasons.

import { SPORT_IDS, type SportId } from './format';
import type { Records } from './records';

/** The parts of a season these rules read. */
export interface SeasonSummary {
  tier: number;
  position: number;
  cup?: string;
  championship?: string;
}

/** A career, running or archived, as these rules see it. */
export interface CareerSummary {
  club: string;
  sport: SportId;
  history: SeasonSummary[];
  records?: Records;
  /** Seasons before this one came before the player reset their honours, so can't earn any. */
  honoursFrom?: number;
}

export type FeatId = 'twoChampions' | 'threeChampions' | 'twoWorld' | 'threeWorld';

export interface Feat {
  id: FeatId;
  /** When it was earned (ISO). */
  at: string;
  /** Who did it: "Football with Scotland · Rugby with Wales". */
  detail: string;
}

export const FEAT_TITLES: Record<FeatId, string> = {
  twoChampions: 'League 1 champions in two sports at once',
  threeChampions: 'League 1 champions in all three sports at once',
  twoWorld: 'World champions in two sports',
  threeWorld: 'World champions in all three sports',
};

function isChampion(s: SeasonSummary): boolean {
  return s.tier === 1 && s.position === 1;
}

function isWorldChampion(s: SeasonSummary): boolean {
  return s.championship === 'Winners';
}

/**
 * The honours just earned. A League 1 title is held until that sport's next
 * season ends, so only running careers count for "at once"; a world title
 * stands for ever, whichever career won it.
 */
export function newFeats(live: CareerSummary[], past: CareerSummary[], earned: Feat[], at: string, label: (sport: SportId) => string): Feat[] {
  const has = new Set(earned.map((f) => f.id));
  const detail = (who: CareerSummary[]) => who.map((c) => `${label(c.sport)} with ${c.club}`).join(' · ');
  const counting = (c: CareerSummary) => c.history.slice(c.honoursFrom ?? 0);
  const holding = live.filter((c) => {
    const last = counting(c).at(-1);
    return last && isChampion(last);
  });
  const worlds = SPORT_IDS.flatMap((sport) => [...live, ...past].filter((c) => c.sport === sport && counting(c).some(isWorldChampion)).slice(0, 1));
  const out: Feat[] = [];
  const award = (id: FeatId, who: CareerSummary[], needed: number) => {
    if (who.length >= needed && !has.has(id)) out.push({ id, at, detail: detail(who) });
  };
  award('twoChampions', holding, 2);
  award('threeChampions', holding, 3);
  award('twoWorld', worlds, 2);
  award('threeWorld', worlds, 3);
  return out;
}

export interface Trophies {
  worlds: number;
  titles: number;
  cups: number;
  /** Best league finish: lowest league number, then position. */
  best?: { tier: number; position: number };
}

export function trophies(c: CareerSummary): Trophies {
  const best = c.history.reduce<Trophies['best']>((b, s) => (!b || s.tier < b.tier || (s.tier === b.tier && s.position < b.position) ? { tier: s.tier, position: s.position } : b), undefined);
  return {
    worlds: c.history.filter(isWorldChampion).length,
    titles: c.history.filter(isChampion).length,
    cups: c.history.filter((s) => s.cup === 'Winners').length,
    best,
  };
}

/** Greatest first: world titles, then League 1 titles, then cups, then the best finish, then the longest career. */
export function greatest(careers: CareerSummary[]): CareerSummary[] {
  const key = (c: CareerSummary) => {
    const t = trophies(c);
    return [t.worlds, t.titles, t.cups, -(t.best?.tier ?? 99), -(t.best?.position ?? 99), c.history.length];
  };
  return [...careers].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    const i = x.findIndex((v, n) => v !== y[n]);
    return i < 0 ? 0 : y[i] - x[i];
  });
}
