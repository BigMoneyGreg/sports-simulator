import { describe, expect, it } from 'vitest';
import { greatest, newFeats, trophies, type CareerSummary, type Feat } from '../src/core/honours';
import type { SportId } from '../src/core/format';
import { buildHonours } from '../src/extension/viewModel';
import { emptyRecords } from '../src/core/records';

const label = (s: SportId) => s[0].toUpperCase() + s.slice(1);
const season = (tier: number, position: number, extra = {}) => ({ tier, position, ...extra });
const career = (sport: SportId, club: string, ...history: ReturnType<typeof season>[]): CareerSummary => ({ sport, club, history });
const earn = (live: CareerSummary[], past: CareerSummary[] = [], earned: Feat[] = []) => newFeats(live, past, earned, 'now', label);

describe('honours', () => {
  it('counts League 1 titles held at once, in running careers only', () => {
    const champs = season(1, 1);
    expect(earn([career('football', 'Scotland', champs)])).toEqual([]);
    // A title has been lost since: no longer held.
    expect(earn([career('football', 'Scotland', champs, season(1, 2)), career('rugby', 'Wales', champs)])).toEqual([]);
    // An ended career no longer holds anything.
    expect(earn([career('football', 'Scotland', champs)], [career('rugby', 'Wales', champs)])).toEqual([]);
    expect(earn([career('football', 'Scotland', champs), career('rugby', 'Wales', season(2, 3), champs)])).toEqual([{ id: 'twoChampions', at: 'now', detail: 'Football with Scotland · Rugby with Wales' }]);
    expect(earn([career('football', 'Scotland', champs), career('rugby', 'Wales', champs), career('cricket', 'India', champs)]).map((f) => f.id)).toEqual(['twoChampions', 'threeChampions']);
    // A title in a lower league doesn't count.
    expect(earn([career('football', 'Scotland', season(2, 1)), career('rugby', 'Wales', champs)])).toEqual([]);
  });

  it('keeps world titles for good, across ended careers, one per sport', () => {
    const world = season(3, 4, { championship: 'Winners' });
    expect(earn([career('football', 'Scotland', world)], [career('football', 'Wales', world)])).toEqual([]);
    expect(earn([career('football', 'Scotland', world)], [career('rugby', 'Wales', world)]).map((f) => f.id)).toEqual(['twoWorld']);
    expect(earn([], [career('football', 'A', world), career('rugby', 'B', world), career('cricket', 'C', world)]).map((f) => f.id)).toEqual(['twoWorld', 'threeWorld']);
  });

  it('after a reset, only seasons still to come can earn honours', () => {
    const world = season(3, 4, { championship: 'Winners' });
    const champs = season(1, 1);
    const before = [career('football', 'A', world, champs), career('rugby', 'B', world, champs)].map((c) => ({ ...c, honoursFrom: 2 }));
    expect(earn(before)).toEqual([]);
    // A career that ends carries the same line with it.
    expect(earn([], before)).toEqual([]);
    const after = before.map((c) => ({ ...c, history: [...c.history, season(1, 1, { championship: 'Winners' })] }));
    expect(earn(after).map((f) => f.id)).toEqual(['twoChampions', 'twoWorld']);
  });

  it('awards each honour once', () => {
    const world = season(3, 4, { championship: 'Winners' });
    const c = [career('football', 'A', world), career('rugby', 'B', world)];
    expect(earn(c, [], earn(c))).toEqual([]);
  });

  it('ranks by world titles, then League 1 titles, cups, best finish and length', () => {
    const a = career('football', 'Cup', season(1, 2, { cup: 'Winners' }));
    const b = career('rugby', 'Title', season(1, 1));
    const c = career('cricket', 'World', season(4, 9, { championship: 'Winners' }));
    const d = career('football', 'Low', season(5, 3));
    const e = career('football', 'Higher', season(5, 2));
    const f = career('rugby', 'Longer', season(5, 2), season(5, 7));
    expect(greatest([d, a, e, f, b, c]).map((x) => x.club)).toEqual(['World', 'Title', 'Cup', 'Longer', 'Higher', 'Low']);
    expect(trophies(career('football', 'x', season(2, 3), season(1, 15), season(1, 9))).best).toEqual({ tier: 1, position: 9 });
  });

  it('lists only what exists, and compares only with more than one career', () => {
    const empty = buildHonours([career('football', 'Scotland')], [], []);
    expect(empty).toMatchObject({ feats: [], greatest: [], records: [], past: [] });
    const live = { ...career('football', 'Scotland', season(1, 1)), records: { ...emptyRecords(), biggestWin: { goalsFor: 5, goalsAgainst: 0, opponent: 'Malta', season: 1 }, unbeaten: { current: 0, best: 9 } } };
    const old = { ...career('football', 'Wales', season(3, 2), season(2, 7)), records: { ...emptyRecords(), biggestWin: { goalsFor: 6, goalsAgainst: 0, opponent: 'Fiji', season: 2 }, scorers: { 1: { name: 'Ross', goals: 12 } } } };
    const view = buildHonours([live], [old], [{ id: 'twoWorld', at: 'now', detail: 'd' }]);
    expect(view.feats).toEqual([{ title: 'World champions in two sports', detail: 'd' }]);
    expect(view.greatest.map((c) => [c.club, c.live, c.summary])).toEqual([['Scotland', true, '1 League 1 title'], ['Wales', false, 'Best: 7th in League 2']]);
    expect(view.past.map((c) => [c.club, c.seasons])).toEqual([['Wales', 2]]);
    expect(view.records).toHaveLength(1);
    expect(view.records[0].rows).toEqual([
      { label: 'Biggest win', value: 'Wales 6–0 v Fiji' },
      { label: 'Unbeaten run', value: 'Scotland, 9 matches' },
      { label: 'Top scorer', value: 'Ross (Wales), 12' },
    ]);
  });
});
