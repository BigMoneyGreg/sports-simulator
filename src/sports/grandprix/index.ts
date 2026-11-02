import type { SportDefinition } from '../../core/career';
import { GRAND_PRIX } from '../../core/format';
import { NATIONS } from '../football/data/nations';
import { identity, naturalTier, playerNamer, rivalAmong, nation } from '../football/names';
import { GRAND_PRIX_ORDER, GRAND_PRIX_RIVALS } from './data';
import { grandPrix as module, type RaceMatch } from './match';
import { grandPrixPresenter } from './presenter';
import { generateSquad, lineup, role } from './squad';

export const grandPrixSport: SportDefinition<RaceMatch> = {
  format: GRAND_PRIX,
  module,
  present: grandPrixPresenter,
  generateSquad: (rng, firstId, club) => generateSquad(rng, firstId, playerNamer(club.short)),
  namePlayer: (rng, club, squad) => playerNamer(club.short, squad)(rng),
  lineup,
  role,
  /** Any country can enter a new team: it takes the place of the least successful nation. */
  world(rng, count, code) {
    const mine = code ?? rng.pick(GRAND_PRIX_ORDER.slice(0, count));
    const others = GRAND_PRIX_ORDER.filter((c) => c !== mine).slice(0, count - 1);
    return { player: identity(nation(mine)), others: others.map((c) => identity(nation(c))), rival: rivalAmong(mine, others, GRAND_PRIX_RIVALS) };
  },
  // The nations with a racing history come first, most successful at the top; then every other country, A–Z, as a new team.
  nations: () => {
    const rest = NATIONS.filter((n) => !GRAND_PRIX_ORDER.includes(n.code)).sort((a, b) => a.name.localeCompare(b.name));
    return [...GRAND_PRIX_ORDER.map((code) => nation(code)), ...rest].map((n) => ({ ...identity(n), tier: naturalTier(n.code, GRAND_PRIX.leagueSize, GRAND_PRIX.leagues, GRAND_PRIX_ORDER) }));
  },
};
