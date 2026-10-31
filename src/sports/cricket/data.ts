import type { NamePoolKey } from '../football/data/names';

/**
 * The 30 nations in cricket's world, strongest first: the men's T20 rankings of
 * October 2026. Pots straddling a league line let a team just outside a league
 * (the West Indies, say) start in it.
 */
export const CRICKET_ORDER: string[] = [
  ...['ENG', 'IND', 'AUS', 'NZL', 'RSA', 'PAK'],
  ...['WIN', 'BAN', 'SRI', 'AFG', 'IRL', 'ZIM'],
  ...['USA', 'NEP', 'NED', 'NAM', 'SCO', 'UAE'],
  ...['OMA', 'CAN', 'UGA', 'PNG', 'ITA', 'HKG'],
  ...['MAS', 'KUW', 'ESP', 'QAT', 'JER', 'BHR'],
];

/** Cricket's South Asian sides, whose names fans will know, each get their own pool rather than one shared across the region. */
export const CRICKET_NAMES: Record<string, NamePoolKey> = { IND: 'indian', PAK: 'pakistani', BAN: 'bangladeshi', SRI: 'sriLankan', NEP: 'nepali' };

/** Real cricket rivalries; anyone else takes their nearest neighbour in the world. */
export const CRICKET_RIVALS: Record<string, string> = {
  IND: 'PAK', PAK: 'IND', AUS: 'ENG', ENG: 'AUS', NZL: 'AUS', RSA: 'AUS', WIN: 'ENG',
  BAN: 'IND', SRI: 'IND', AFG: 'PAK', IRL: 'SCO', SCO: 'IRL', ZIM: 'RSA', NED: 'IRL',
  UAE: 'OMA', OMA: 'UAE', USA: 'CAN', CAN: 'USA', NEP: 'UAE', KUW: 'BHR', BHR: 'KUW', QAT: 'BHR',
  KEN: 'UGA', UGA: 'NAM', NAM: 'ZIM',
};
