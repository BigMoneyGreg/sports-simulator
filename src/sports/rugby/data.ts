/**
 * The 48 nations in rugby's world, strongest first: the men's world rankings of
 * November 2026, nudged a little for history. Pots straddling a league line let a team just outside League 1
 * (Australia, say) start in it.
 */
export const RUGBY_ORDER: string[] = [
  ...['RSA', 'NZL', 'IRL', 'FRA', 'ENG', 'SCO'],
  ...['AUS', 'ARG', 'WAL', 'FIJ', 'ITA', 'JPN'],
  ...['GEO', 'POR', 'USA', 'ESP', 'ROU', 'SAM', 'TGA', 'URU'],
  ...['CHI', 'CAN', 'BEL', 'HKG', 'ZIM', 'NAM', 'NED', 'SUI'],
  ...['CZE', 'POL', 'PAR', 'BRA', 'GER', 'SWE', 'KEN', 'KOR'],
  ...['UAE', 'ALG', 'LTU', 'LUX', 'CRO', 'UKR', 'DEN', 'FIN'],
  ...['LVA', 'AND', 'MDA', 'AUT'],
];

/** Real rugby rivalries; anyone else takes their nearest neighbour in the world. */
export const RUGBY_RIVALS: Record<string, string> = {
  NZL: 'RSA', RSA: 'NZL', AUS: 'NZL', ARG: 'AUS',
  ENG: 'FRA', FRA: 'ENG', IRL: 'ENG', SCO: 'ENG', WAL: 'ENG', ITA: 'FRA',
  FIJ: 'SAM', SAM: 'TGA', TGA: 'SAM', JPN: 'KOR', KOR: 'JPN',
  GEO: 'ROU', ROU: 'GEO', ESP: 'POR', POR: 'ESP', URU: 'CHI', CHI: 'URU', USA: 'CAN', CAN: 'USA',
  NAM: 'ZIM', ZIM: 'NAM', BRA: 'PAR', PAR: 'BRA',
};
