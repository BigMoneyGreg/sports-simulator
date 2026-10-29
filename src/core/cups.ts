import { emptyTable, recordResult, sortTable, type Fixture, type TableRow } from './league';
import type { Rng } from './rng';
import type { MatchOutcome } from './sport';

export type CupId = 'cup' | 'championship';

export const CUP_NAMES: Record<CupId, string> = { cup: 'Nations Cup', championship: 'World Championship' };
export const CUP_ENTRANTS = 64;
export const CHAMPIONSHIP_ENTRANTS = 40;
/** The World Championship is played in the summer of every fourth season. */
export const CHAMPIONSHIP_EVERY = 4;

const GROUP_SIZE = 5;
const GROUP_NAMES = 'ABCDEFGH';

interface RoundFormat {
  name: string;
  legs: 1 | 2;
  neutral: boolean;
}

interface Format {
  groupDays: number;
  rounds: RoundFormat[];
}

const FORMATS: Record<CupId, Format> = {
  cup: {
    groupDays: 0,
    rounds: [
      { name: 'Round of 64', legs: 1, neutral: false },
      { name: 'Round of 32', legs: 1, neutral: false },
      { name: 'Round of 16', legs: 1, neutral: false },
      { name: 'Quarter-final', legs: 2, neutral: false },
      { name: 'Semi-final', legs: 2, neutral: false },
      { name: 'Final', legs: 1, neutral: true },
    ],
  },
  championship: {
    groupDays: GROUP_SIZE,
    rounds: [
      { name: 'Round of 16', legs: 1, neutral: true },
      { name: 'Quarter-final', legs: 1, neutral: true },
      { name: 'Semi-final', legs: 1, neutral: true },
      { name: 'Final', legs: 1, neutral: true },
    ],
  },
};

export interface Leg {
  home: number;
  away: number;
  score: [number, number];
  /** Shootout score, home side first. */
  penalties?: [number, number];
  extraTime?: boolean;
}

export interface CupTie {
  /** Drawn first: at home in a one-off tie or the first leg. */
  home: number;
  away: number;
  legs: Leg[];
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

/** One matchday of a cup: a group matchday, or one leg of a knockout round. */
export type CupStage = { group: number } | { round: number; leg: number };

export function cupStages(id: CupId): CupStage[] {
  const f = FORMATS[id];
  const groups = Array.from({ length: f.groupDays }, (_, group) => ({ group }));
  return [...groups, ...f.rounds.flatMap((r, round) => Array.from({ length: r.legs }, (_, leg) => ({ round, leg })))];
}

export function roundFormat(id: CupId, round: number): { name: string; legs: number } {
  return FORMATS[id].rounds[round];
}

export function stageLabel(id: CupId, stage: CupStage): string {
  if ('group' in stage) return `Group stage, matchday ${stage.group + 1}`;
  const r = FORMATS[id].rounds[stage.round];
  return r.legs === 2 ? `${r.name}, ${stage.leg === 0 ? '1st' : '2nd'} leg` : r.name;
}

/** An open draw: anyone can meet anyone, and whoever comes out first is at home. */
function openDraw(ids: number[], rng: Rng): CupTie[] {
  return pairUp(rng.shuffle([...ids])).map(([home, away]) => ({ home, away, legs: [] }));
}

/** The Nations Cup: an open draw every round. */
export function drawCup(season: number, entrants: number[], rng: Rng): Cup {
  if (entrants.length !== CUP_ENTRANTS) throw new Error(`the cup needs ${CUP_ENTRANTS} entrants`);
  return { id: 'cup', season, entrants: [...entrants], groups: [], rounds: [{ name: FORMATS.cup.rounds[0].name, ties: openDraw(entrants, rng) }] };
}

/** The World Championship: five pots of eight by seeding, one from each pot in every group. */
export function drawChampionship(season: number, entrants: number[], rng: Rng): Cup {
  if (entrants.length !== CHAMPIONSHIP_ENTRANTS) throw new Error(`the championship needs ${CHAMPIONSHIP_ENTRANTS} entrants`);
  const groupCount = CHAMPIONSHIP_ENTRANTS / GROUP_SIZE;
  const pots = Array.from({ length: GROUP_SIZE }, (_, p) => rng.shuffle(entrants.slice(p * groupCount, (p + 1) * groupCount)));
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
export function cupFixtures(cup: Cup, stageIndex: number): Fixture[] {
  const stage = cupStages(cup.id)[stageIndex];
  const base = { tier: 0, kind: cup.id, stage: stageIndex } as const;
  if ('group' in stage) {
    return cup.groups.flatMap((g) => g.days[stage.group].map(([home, away]) => ({ ...base, home, away, options: { neutral: true } })));
  }
  const format = FORMATS[cup.id].rounds[stage.round];
  const round = cup.rounds[stage.round];
  if (!round) return [];
  return round.ties.map((tie): Fixture => {
    if (format.legs === 2 && stage.leg === 1) {
      const [first, second] = tie.legs[0].score;
      return { ...base, home: tie.away, away: tie.home, secondLeg: true, options: { knockout: { aggregate: [second, first] } } };
    }
    if (format.legs === 2) return { ...base, home: tie.home, away: tie.away, options: {} };
    return { ...base, home: tie.home, away: tie.away, options: { neutral: format.neutral, knockout: { aggregate: [0, 0] } } };
  });
}

/** Records a cup result and, once a stage is complete, draws what comes next. */
export function recordCupResult(cup: Cup, fixture: Fixture, outcome: MatchOutcome, rng: Rng): void {
  const stage = cupStages(cup.id)[fixture.stage!];
  const score: [number, number] = [outcome.homeGoals, outcome.awayGoals];
  if ('group' in stage) {
    const group = cup.groups.find((g) => g.table.some((r) => r.clubId === fixture.home))!;
    recordResult(group.table, fixture.home, fixture.away, outcome);
    if (stage.group === FORMATS[cup.id].groupDays - 1 && cup.groups.every((g) => g.table.every((r) => r.played === GROUP_SIZE - 1))) {
      cup.rounds.push({ name: FORMATS[cup.id].rounds[0].name, ties: knockoutFromGroups(cup) });
    }
    return;
  }
  const round = cup.rounds[stage.round];
  const tie = round.ties.find((t) => t.home === fixture.home || t.home === fixture.away)!;
  const leg: Leg = { home: fixture.home, away: fixture.away, score };
  if (outcome.penalties) leg.penalties = outcome.penalties;
  if (outcome.extraTime) leg.extraTime = true;
  tie.legs.push(leg);
  if (outcome.winner) tie.winner = outcome.winner === 'home' ? fixture.home : fixture.away;
  if (!round.ties.every((t) => t.winner !== undefined)) return;

  const next = FORMATS[cup.id].rounds[stage.round + 1];
  const winners = round.ties.map((t) => t.winner!);
  if (!next) {
    cup.winner = winners[0];
    return;
  }
  // The cup is drawn afresh each round; the championship follows its bracket.
  const ties = cup.id === 'cup' ? openDraw(winners, rng) : pairUp(winners).map(([home, away]) => ({ home, away, legs: [] }));
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
      ties.push({ home: first, away: second, legs: [] });
    }
  }
  return ties;
}

/** How far a team went: "Winners", "Final", "Semi-final", …, "Group stage", or null if it wasn't in it. */
export function cupRun(cup: Cup, clubId: number): string | null {
  if (!cup.entrants.includes(clubId)) return null;
  if (cup.winner === clubId) return 'Winners';
  for (let r = cup.rounds.length - 1; r >= 0; r--) {
    if (cup.rounds[r].ties.some((t) => t.home === clubId || t.away === clubId)) return cup.rounds[r].name;
  }
  return cup.groups.length ? 'Group stage' : FORMATS[cup.id].rounds[0].name;
}

/** Whether the team is still in the competition. */
export function stillIn(cup: Cup, clubId: number): boolean {
  if (!cup.entrants.includes(clubId) || cup.winner !== undefined) return cup.winner === clubId;
  const last = cup.rounds[cup.rounds.length - 1];
  if (!last) return true;
  const tie = last.ties.find((t) => t.home === clubId || t.away === clubId);
  return !!tie && (tie.winner === undefined || tie.winner === clubId);
}
