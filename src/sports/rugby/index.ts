import type { SportDefinition } from '../../core/career';
import { RUGBY } from '../../core/format';
import { FAMOUS_PLAYERS } from '../famous';
import { playerNamer, sportWorld } from '../football/names';
import { RUGBY_ORDER, RUGBY_RIVALS } from './data';
import { rugby as module, type RugbyMatch } from './match';
import { rugbyPresenter } from './presenter';
import { generateSquad, lineup, role } from './squad';

export const rugbySport: SportDefinition<RugbyMatch> = {
  format: RUGBY,
  module,
  present: rugbyPresenter,
  generateSquad: (rng, firstId, club) => generateSquad(rng, firstId, playerNamer(club.short, [], FAMOUS_PLAYERS)),
  namePlayer: (rng, club, squad) => playerNamer(club.short, squad, FAMOUS_PLAYERS)(rng),
  lineup,
  role,
  ...sportWorld(RUGBY_ORDER, RUGBY_RIVALS, RUGBY.leagueSize, RUGBY.leagues, { IRL: 'Ireland' }),
};
