import type { SportDefinition } from '../../core/career';
import { CRICKET } from '../../core/format';
import { FAMOUS_PLAYERS } from '../famous';
import { playerNamer, sportWorld } from '../football/names';
import { CRICKET_NAMES, CRICKET_ORDER, CRICKET_RIVALS } from './data';
import { cricket as module, type CricketMatch } from './match';
import { cricketPresenter } from './presenter';
import { generateSquad, lineup, role } from './squad';

export const cricketSport: SportDefinition<CricketMatch> = {
  format: CRICKET,
  module,
  present: cricketPresenter,
  generateSquad: (rng, firstId, club) => generateSquad(rng, firstId, playerNamer(club.short, [], FAMOUS_PLAYERS, CRICKET_NAMES[club.short])),
  namePlayer: (rng, club, squad) => playerNamer(club.short, squad, FAMOUS_PLAYERS, CRICKET_NAMES[club.short])(rng),
  lineup,
  role,
  ...sportWorld(CRICKET_ORDER, CRICKET_RIVALS, CRICKET.leagueSize, CRICKET.leagues, { IRL: 'Ireland' }),
};
