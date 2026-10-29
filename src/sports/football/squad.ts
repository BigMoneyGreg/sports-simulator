import type { Rng } from '../../core/rng';
import type { Player, TeamSheet } from '../../core/sport';

/** Squad shape: 18 players, of whom a 4-4-2 starts. */
const SQUAD: { position: string; count: number; starters: number }[] = [
  { position: 'GK', count: 2, starters: 1 },
  { position: 'DEF', count: 6, starters: 4 },
  { position: 'MID', count: 6, starters: 4 },
  { position: 'FWD', count: 4, starters: 2 },
];

const NUMBERS: Record<string, number[]> = {
  GK: [1, 13],
  DEF: [2, 3, 4, 5, 12, 15],
  MID: [6, 7, 8, 11, 14, 16],
  FWD: [9, 10, 17, 18],
};

export function generateSquad(rng: Rng, firstId: number, name: (rng: Rng) => string): Player[] {
  const players: Player[] = [];
  let id = firstId;
  for (const { position, count } of SQUAD) {
    for (let i = 0; i < count; i++) {
      players.push({ id: id++, name: name(rng), position, number: NUMBERS[position][i] });
    }
  }
  return players;
}

/** The first-choice players in each position start, unless suspended; the next in line steps in. */
export function lineup(squad: Player[], unavailable: ReadonlySet<number> = new Set()): TeamSheet['lineup'] {
  const out: TeamSheet['lineup'] = [];
  for (const { position, starters } of SQUAD) {
    const inPosition = squad.filter((pl) => pl.position === position);
    const available = inPosition.filter((pl) => !unavailable.has(pl.id));
    for (const p of (available.length >= starters ? available : inPosition).slice(0, starters)) {
      out.push({ id: p.id, position: p.position });
    }
  }
  return out;
}
