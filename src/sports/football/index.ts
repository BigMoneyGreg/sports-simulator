import type { ClubIdentity, SportDefinition } from '../../core/career';
import type { Rng } from '../../core/rng';
import { football as module, type FootballMatch } from './match';
import { generateSquad, lineup } from './squad';

// Placeholder identities until the curated fictional clubs land (M4).
function clubIdentities(_rng: Rng, count: number): ClubIdentity[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Club ${i}`,
    short: `C${String(i).padStart(2, '0')}`,
    colours: ['#888888', '#ffffff'],
  }));
}

export const footballSport: SportDefinition<FootballMatch> = {
  module,
  generateSquad: (rng, firstId) => generateSquad(rng, firstId, () => 'Player'),
  lineup,
  clubIdentities,
};
