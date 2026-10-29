import type { SportDefinition } from '../../core/career';
import { football as module, type FootballMatch } from './match';
import { playerNamer, world } from './names';
import { generateSquad, lineup } from './squad';

export const footballSport: SportDefinition<FootballMatch> = {
  module,
  generateSquad: (rng, firstId, club) => generateSquad(rng, firstId, playerNamer(club.short)),
  namePlayer: (rng, club, squad) => playerNamer(club.short, squad)(rng),
  lineup,
  world,
};
