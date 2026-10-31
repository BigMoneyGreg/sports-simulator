/**
 * The 48 nations in rugby's world, strongest first: the men's world rankings of
 * July 2026. Pots straddling a league line let a team just outside League 1
 * (Australia, say) start in it.
 */
export const RUGBY_ORDER: string[] = [
  ...['RSA', 'NZL', 'FRA', 'IRL', 'ITA', 'SCO', 'ENG', 'ARG'],
  ...['AUS', 'FIJ', 'WAL', 'JPN', 'URU', 'CHI', 'POR', 'GEO'],
  ...['ESP', 'USA', 'ROU', 'TGA', 'SAM', 'BEL', 'CAN', 'ZIM'],
  ...['NAM', 'HKG', 'ALG', 'SUI', 'NED', 'GER', 'POL', 'KEN'],
  ...['PAR', 'BRA', 'UAE', 'KOR', 'SWE', 'CZE', 'LTU', 'LUX'],
  ...['CRO', 'UKR', 'DEN', 'FIN', 'LVA', 'AND', 'MDA', 'AUT'],
];

/** Real rugby rivalries; anyone else takes their nearest neighbour in the world. */
export const RUGBY_RIVALS: Record<string, string> = {
  NZL: 'RSA', RSA: 'NZL', AUS: 'NZL', ARG: 'AUS',
  ENG: 'FRA', FRA: 'ENG', IRL: 'ENG', SCO: 'ENG', WAL: 'ENG', ITA: 'FRA',
  FIJ: 'SAM', SAM: 'TGA', TGA: 'SAM', JPN: 'KOR', KOR: 'JPN',
  GEO: 'ROU', ROU: 'GEO', ESP: 'POR', POR: 'ESP', URU: 'CHI', CHI: 'URU', USA: 'CAN', CAN: 'USA',
  NAM: 'ZIM', ZIM: 'NAM', BRA: 'PAR', PAR: 'BRA',
};
