/**
 * The 30 nations in Grand Prix racing's world, most successful first: world
 * titles, then race wins, as of 2026. England, Scotland and the rest of Britain
 * race apart here, as they do in the game's other sports.
 */
export const GRAND_PRIX_ORDER: string[] = [
  ...['ENG', 'GER', 'BRA', 'FIN', 'AUT', 'FRA', 'NED', 'AUS', 'ESP', 'SCO'],
  ...['ITA', 'ARG', 'USA', 'CAN', 'NZL', 'MEX', 'BEL', 'SWE', 'SUI', 'RSA'],
  ...['POL', 'JPN', 'COL', 'DEN', 'NIR', 'IRL', 'THA', 'VEN', 'CHN', 'HUN'],
];

/** Real rivalries, on and off the track; anyone else takes their nearest neighbour in the world. */
export const GRAND_PRIX_RIVALS: Record<string, string> = {
  ENG: 'GER', GER: 'ENG', BRA: 'ARG', ARG: 'BRA', FIN: 'SWE', SWE: 'FIN', AUT: 'GER', FRA: 'ITA', ITA: 'FRA',
  NED: 'BEL', BEL: 'NED', AUS: 'NZL', NZL: 'AUS', ESP: 'ITA', SCO: 'ENG', USA: 'CAN', CAN: 'USA', MEX: 'USA',
};
