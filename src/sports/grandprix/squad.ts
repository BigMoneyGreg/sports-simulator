import type { Stat } from '../../core/club';
import type { Rng } from '../../core/rng';
import type { Player, TeamSheet } from '../../core/sport';

/** A team: two race drivers, a reserve, and the people who build and run the cars. */
const TEAM: { number: number; position: string; label: string; side: Stat }[] = [
  { number: 1, position: 'DRV', label: 'lead driver', side: 'attack' },
  { number: 2, position: 'DRV', label: 'second driver', side: 'attack' },
  { number: 3, position: 'RES', label: 'reserve driver', side: 'attack' },
  { number: 4, position: 'TECH', label: 'technical director', side: 'attack' },
  { number: 5, position: 'AERO', label: 'aerodynamicist', side: 'attack' },
  { number: 6, position: 'MECH', label: 'chief mechanic', side: 'defence' },
  { number: 7, position: 'RELY', label: 'reliability engineer', side: 'defence' },
  { number: 8, position: 'PIT', label: 'pit crew chief', side: 'defence' },
];

export function role(player: Pick<Player, 'number' | 'position'>): { label: string; side: Stat } {
  const member = TEAM.find((t) => t.number === player.number);
  return member ? { label: member.label, side: member.side } : { label: 'engineer', side: 'defence' };
}

export function generateSquad(rng: Rng, firstId: number, name: (rng: Rng) => string): Player[] {
  return TEAM.map((t, i) => ({ id: firstId + i, name: name(rng), position: t.position, number: t.number }));
}

/** The two race drivers. Nobody is ever banned, so there's no stepping in. */
export function lineup(squad: Player[]): TeamSheet['lineup'] {
  return squad.filter((p) => p.position === 'DRV').map((p) => ({ id: p.id, position: p.position, number: p.number }));
}
