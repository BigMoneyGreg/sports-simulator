import type { SportDefinition } from '../../core/career';
import { FOOTBALL } from '../../core/format';
import { NATIONS, WORLD_ORDER } from './data/nations';
import { football as module, type FootballMatch } from './match';
import { naturalTier, nationIdentity, playerNamer, world } from './names';
import { footballPresenter } from './presenter';
import { generateSquad, lineup, role } from './squad';

export const footballSport: SportDefinition<FootballMatch> = {
  format: FOOTBALL,
  module,
  present: footballPresenter,
  generateSquad: (rng, firstId, club) => generateSquad(rng, firstId, playerNamer(club.short)),
  namePlayer: (rng, club, squad) => playerNamer(club.short, squad)(rng),
  lineup,
  role,
  world,
  nations: () => NATIONS.map((n) => ({ ...nationIdentity(n), tier: naturalTier(n.code, FOOTBALL.leagueSize, FOOTBALL.leagues, WORLD_ORDER) })),
};
