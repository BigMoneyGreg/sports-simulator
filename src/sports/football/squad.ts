import type { Stat } from '../../core/club';
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

/** What a shirt number plays, and which end of the pitch it mainly works at. */
const ROLES: Record<number, { label: string; side: Stat }> = {
  1: { label: 'goalkeeper', side: 'defence' },
  13: { label: 'goalkeeper', side: 'defence' },
  2: { label: 'full-back', side: 'defence' },
  3: { label: 'full-back', side: 'defence' },
  12: { label: 'full-back', side: 'defence' },
  4: { label: 'centre-back', side: 'defence' },
  5: { label: 'centre-back', side: 'defence' },
  15: { label: 'centre-back', side: 'defence' },
  6: { label: 'defensive midfielder', side: 'defence' },
  8: { label: 'defensive midfielder', side: 'defence' },
  14: { label: 'defensive midfielder', side: 'defence' },
  7: { label: 'winger', side: 'attack' },
  11: { label: 'winger', side: 'attack' },
  16: { label: 'attacking midfielder', side: 'attack' },
  9: { label: 'striker', side: 'attack' },
  10: { label: 'striker', side: 'attack' },
  17: { label: 'striker', side: 'attack' },
  18: { label: 'striker', side: 'attack' },
};

export function role(player: Pick<Player, 'number' | 'position'>): { label: string; side: Stat } {
  return ROLES[player.number] ?? (player.position === 'FWD' || player.position === 'MID' ? { label: 'midfielder', side: 'attack' } : { label: 'defender', side: 'defence' });
}

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
