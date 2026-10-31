import type { Stat } from '../../core/club';
import type { Rng } from '../../core/rng';
import type { Player, TeamSheet } from '../../core/sport';

/** Squad shape: 24 players, of whom 15 start. */
const SQUAD: { position: string; numbers: number[]; starters: number }[] = [
  { position: 'PROP', numbers: [1, 3, 17, 18], starters: 2 },
  { position: 'HOOK', numbers: [2, 16], starters: 1 },
  { position: 'LOCK', numbers: [4, 5, 19], starters: 2 },
  { position: 'LOOSE', numbers: [6, 7, 8, 20], starters: 3 },
  { position: 'SH', numbers: [9, 21], starters: 1 },
  { position: 'FH', numbers: [10, 22], starters: 1 },
  { position: 'CEN', numbers: [12, 13, 23], starters: 2 },
  { position: 'BACK3', numbers: [11, 14, 15, 24], starters: 3 },
];

/** What a shirt number plays. Forwards mostly hold the line; backs mostly make the tries. */
const LABELS: Record<number, string> = {
  1: 'prop', 3: 'prop', 17: 'prop', 18: 'prop', 2: 'hooker', 16: 'hooker', 4: 'lock', 5: 'lock', 19: 'lock',
  6: 'flanker', 7: 'flanker', 20: 'flanker', 8: 'number eight', 9: 'scrum-half', 21: 'scrum-half', 10: 'fly-half', 22: 'fly-half',
  12: 'centre', 13: 'centre', 23: 'centre', 11: 'wing', 14: 'wing', 24: 'wing', 15: 'full-back',
};

export function role(player: Pick<Player, 'number' | 'position'>): { label: string; side: Stat } {
  const n = player.number;
  return { label: LABELS[n] ?? 'forward', side: (n >= 1 && n <= 8) || (n >= 16 && n <= 20) ? 'defence' : 'attack' };
}

export function generateSquad(rng: Rng, firstId: number, name: (rng: Rng) => string): Player[] {
  const players: Player[] = [];
  let id = firstId;
  for (const { position, numbers } of SQUAD) {
    for (const number of numbers) players.push({ id: id++, name: name(rng), position, number });
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
