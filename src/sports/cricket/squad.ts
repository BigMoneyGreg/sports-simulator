import type { Stat } from '../../core/club';
import type { Rng } from '../../core/rng';
import type { Player, TeamSheet } from '../../core/sport';

/** Squad shape: 15 players, of whom 11 start, listed here in batting order. */
const SQUAD: { position: string; numbers: number[]; starters: number }[] = [
  { position: 'BAT', numbers: [3, 4, 5, 6, 7], starters: 4 },
  { position: 'WK', numbers: [1, 2], starters: 1 },
  { position: 'AR', numbers: [8, 9, 10], starters: 2 },
  { position: 'BWL', numbers: [11, 12, 13, 14, 15], starters: 4 },
];

/** What a shirt number plays, and which half of the game it mainly helps. */
const ROLES: Record<number, { label: string; side: Stat }> = {
  1: { label: 'wicketkeeper', side: 'attack' },
  2: { label: 'wicketkeeper', side: 'attack' },
  3: { label: 'opening batter', side: 'attack' },
  4: { label: 'opening batter', side: 'attack' },
  5: { label: 'batter', side: 'attack' },
  6: { label: 'batter', side: 'attack' },
  7: { label: 'batter', side: 'attack' },
  8: { label: 'batting all-rounder', side: 'attack' },
  9: { label: 'bowling all-rounder', side: 'defence' },
  10: { label: 'bowling all-rounder', side: 'defence' },
  11: { label: 'fast bowler', side: 'defence' },
  12: { label: 'fast bowler', side: 'defence' },
  13: { label: 'fast bowler', side: 'defence' },
  14: { label: 'spin bowler', side: 'defence' },
  15: { label: 'spin bowler', side: 'defence' },
};

export function role(player: Pick<Player, 'number' | 'position'>): { label: string; side: Stat } {
  return ROLES[player.number] ?? { label: 'batter', side: 'attack' };
}

export function generateSquad(rng: Rng, firstId: number, name: (rng: Rng) => string): Player[] {
  const players: Player[] = [];
  let id = firstId;
  for (const { position, numbers } of SQUAD) {
    for (const number of numbers) players.push({ id: id++, name: name(rng), position, number });
  }
  return players;
}

/** The first-choice players in each position start, in batting order. */
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
