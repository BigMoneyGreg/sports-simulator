import type { SportDefinition } from '../../core/career';
import { football as module, type FootballMatch } from './match';
import { clubIdentities, playerNamer, shortCode } from './names';
import { generateSquad, lineup } from './squad';

export const footballSport: SportDefinition<FootballMatch> = {
  module,
  generateSquad: (rng, firstId) => generateSquad(rng, firstId, playerNamer()),
  lineup,
  clubIdentities,
  shortCode,
};
