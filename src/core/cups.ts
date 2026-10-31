import type { SportFormat } from './format';
import { emptyTable, recordResult, sortTable, type Fixture, type TableRow } from './league';
import type { Rng } from './rng';
import type { MatchOutcome } from './sport';

export type CupId = 'cup' | 'championship';

export const CUP_NAMES: Record<CupId, string> = { cup: 'Nations Cup', championship: 'World Championship' };
/** The World Championship is played in the summer of every fourth season. */
export const CHAMPIONSHIP_EVERY = 4;

const GROUP_NAMES = 'ABCDEFGH';

interface RoundFormat {
  name: string;
  neutral: boolean;
}

interface Format {
  groupDays: number;
  rounds: RoundFormat[];
}

/** "Round of 32", "Quarter-final", … by how many teams are left. */
function roundName(teams: number): string {
  return teams === 2 ? 'Final' : teams === 4 ? 'Semi-final' : teams === 8 ? 'Quarter-final' : `Round of ${teams}`;
}

/** Knockout rounds from this many teams down to the final. */
function knockoutRounds(teams: number, neutral: (teams: number) => boolean): RoundFormat[] {
  const rounds: RoundFormat[] = [];
  for (let left = teams; left >= 2; left /= 2) rounds.push({ name: roundName(left), neutral: neutral(left) });
  return rounds;
}

/** How a competition runs in this sport, worked out from how many teams enter it. */
function cupFormat(format: SportFormat, id: CupId): Format {
  if (id === 'cup') return { groupDays: 0, rounds: knockoutRounds(format.cup.entrants, (left) => left === 2) };
  const { entrants, groupSize } = format.championship;
  // An odd-sized group needs an extra matchday, as one team rests each time. The top two of each group go through.
  return { groupDays: groupSize % 2 ? groupSize : groupSize - 1, rounds: knockoutRounds((entrants / groupSize) * 2, () => true) };
}

/** One-off knockout match; the team drawn first is at home, or nominally so at a neutral ground. */
export interface CupTie {
  home: number;
  away: number;
  /** Once played: home goals first, with the shootout if there was one. */
  score?: [number, number];
  penalties?: [number, number];
  extraTime?: boolean;
  winner?: number;
}

export interface CupRound {
  name: string;
  ties: CupTie[];
}

export interface CupGroup {
  name: string;
  table: TableRow[];
  /** Pairings for each group matchday; one team rests each time. */
  days: [number, number][][];
}

export interface Cup {
  id: CupId;
  season: number;
  /** Who qualified, strongest first. */
  entrants: number[];
  groups: CupGroup[];
  /** Knockout rounds drawn so far. */
  rounds: CupRound[];
  winner?: number;
}

/** One matchday of a cup: a group matchday, or a knockout round. */
export type CupStage = { group: number } | { round: number };

export function cupStages(format: SportFormat, id: CupId): CupStage[] {
  const f = cupFormat(format, id);
  return [...Array.from({ length: f.groupDays }, (_, group) => ({ group })), ...f.rounds.map((_, round) => ({ round }))];
}

export function stageLabel(format: SportFormat, id: CupId, stage: CupStage): string {
  return 'group' in stage ? `Group stage, matchday ${stage.group + 1}` : cupFormat(format, id).rounds[stage.round].name;
}

/** An open draw: anyone can meet anyone, and whoever comes out first is at home. */
function openDraw(ids: number[], rng: Rng): CupTie[] {
  return pairUp(rng.shuffle([...ids])).map(([home, away]) => ({ home, away }));
}

/** The Nations Cup: an open draw every round. */
export function drawCup(format: SportFormat, season: number, entrants: number[], rng: Rng): Cup {
  if (entrants.length !== format.cup.entrants) throw new Error(`the cup needs ${format.cup.entrants} entrants`);
  return { id: 'cup', season, entrants: [...entrants], groups: [], rounds: [{ name: cupFormat(format, 'cup').rounds[0].name, ties: openDraw(entrants, rng) }] };
}

/** The World Championship: one pot by seeding for each place in a group (in football, five pots of eight), one from each pot in every group. */
export function drawChampionship(format: SportFormat, season: number, entrants: number[], rng: Rng): Cup {
  const { entrants: needed, groupSize } = format.championship;
  if (entrants.length !== needed) throw new Error(`the championship needs ${needed} entrants`);
  const groupCount = needed / groupSize;
  const pots = Array.from({ length: groupSize }, (_, p) => rng.shuffle(entrants.slice(p * groupCount, (p + 1) * groupCount)));
  const groups = Array.from({ length: groupCount }, (_, g) => {
    const ids = pots.map((pot) => pot[g]);
    return { name: GROUP_NAMES[g], table: emptyTable(ids), days: singleRoundRobin(ids) };
  });
  return { id: 'championship', season, entrants: [...entrants], groups, rounds: [] };
}

/** Everyone plays everyone once; with an odd number, one team rests each matchday. */
function singleRoundRobin(ids: number[]): [number, number][][] {
  const BYE = -1;
  const teams = ids.length % 2 ? [...ids, BYE] : [...ids];
  const n = teams.length;
  const days: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const day: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const pair: [number, number] = r % 2 === 0 ? [teams[i], teams[n - 1 - i]] : [teams[n - 1 - i], teams[i]];
      if (!pair.includes(BYE)) day.push(pair);
    }
    days.push(day);
    teams.splice(1, 0, teams.pop()!);
  }
  return days;
}

/** The fixtures for one stage. */
export function cupFixtures(format: SportFormat, cup: Cup, stageIndex: number): Fixture[] {
  const stage = cupStages(format, cup.id)[stageIndex];
  const base = { tier: 0, kind: cup.id, stage: stageIndex } as const;
  if ('group' in stage) {
    return cup.groups.flatMap((g) => g.days[stage.group].map(([home, away]) => ({ ...base, home, away, options: { neutral: true } })));
  }
  const roundFormat = cupFormat(format, cup.id).rounds[stage.round];
  const round = cup.rounds[stage.round];
  if (!round) return [];
  return round.ties.map((tie) => ({ ...base, home: tie.home, away: tie.away, options: { neutral: roundFormat.neutral, knockout: { aggregate: [0, 0] } } }));
}

/** Records a cup result and, once a stage is complete, draws what comes next. */
export function recordCupResult(format: SportFormat, cup: Cup, fixture: Fixture, outcome: MatchOutcome, rng: Rng): void {
  const f = cupFormat(format, cup.id);
  const stage = cupStages(format, cup.id)[fixture.stage!];
  if ('group' in stage) {
    const group = cup.groups.find((g) => g.table.some((r) => r.clubId === fixture.home))!;
    recordResult(group.table, fixture.home, fixture.away, outcome);
    if (stage.group === f.groupDays - 1 && cup.groups.every((g) => g.table.every((r) => r.played === format.championship.groupSize - 1))) {
      cup.rounds.push({ name: f.rounds[0].name, ties: knockoutFromGroups(cup) });
    }
    return;
  }
  const round = cup.rounds[stage.round];
  const tie = round.ties.find((t) => t.home === fixture.home)!;
  tie.score = [outcome.homeGoals, outcome.awayGoals];
  if (outcome.penalties) tie.penalties = outcome.penalties;
  if (outcome.extraTime) tie.extraTime = true;
  tie.winner = outcome.winner === 'home' ? fixture.home : fixture.away;
  if (!round.ties.every((t) => t.winner !== undefined)) return;

  const next = f.rounds[stage.round + 1];
  const winners = round.ties.map((t) => t.winner!);
  if (!next) {
    cup.winner = winners[0];
    return;
  }
  // The cup is drawn afresh each round; the championship follows its bracket.
  const ties = cup.id === 'cup' ? openDraw(winners, rng) : pairUp(winners).map(([home, away]) => ({ home, away }));
  cup.rounds.push({ name: next.name, ties });
}

function pairUp(ids: number[]): [number, number][] {
  return Array.from({ length: ids.length / 2 }, (_, i) => [ids[2 * i], ids[2 * i + 1]]);
}

/**
 * Group winners play another group's runners-up: A1 v B2, C1 v D2, … then
 * B1 v A2, D1 v C2, …, so teams from the same group sit in opposite halves.
 */
function knockoutFromGroups(cup: Cup): CupTie[] {
  const placed = cup.groups.map((g) => sortTable(g.table).map((r) => r.clubId));
  const ties: CupTie[] = [];
  for (const swap of [false, true]) {
    for (let g = 0; g < placed.length; g += 2) {
      const [first, second] = swap ? [placed[g + 1][0], placed[g][1]] : [placed[g][0], placed[g + 1][1]];
      ties.push({ home: first, away: second });
    }
  }
  return ties;
}

/** How far a team went: "Winners", "Final", "Semi-final", …, "Group stage", or null if it wasn't in it. */
export function cupRun(format: SportFormat, cup: Cup, clubId: number): string | null {
  if (!cup.entrants.includes(clubId)) return null;
  if (cup.winner === clubId) return 'Winners';
  for (let r = cup.rounds.length - 1; r >= 0; r--) {
    if (cup.rounds[r].ties.some((t) => t.home === clubId || t.away === clubId)) return cup.rounds[r].name;
  }
  return cup.groups.length ? 'Group stage' : cupFormat(format, cup.id).rounds[0].name;
}

/** Whether the team is still in the competition. */
export function stillIn(cup: Cup, clubId: number): boolean {
  if (!cup.entrants.includes(clubId) || cup.winner !== undefined) return cup.winner === clubId;
  const last = cup.rounds[cup.rounds.length - 1];
  if (!last) return true;
  const tie = last.ties.find((t) => t.home === clubId || t.away === clubId);
  return !!tie && (tie.winner === undefined || tie.winner === clubId);
}
