/**
 * The 30 nations in Grand Prix racing's world, ten to a league, most successful
 * first: world titles, race wins and a nation's place in the sport's history. England, Scotland and the rest of Britain
 * race apart here, as they do in the game's other sports.
 */
export const GRAND_PRIX_ORDER: string[] = [
  ...['ENG', 'GER', 'ITA', 'BRA', 'FRA', 'FIN', 'AUT', 'NED', 'ESP', 'AUS'],
  ...['SCO', 'ARG', 'USA', 'CAN', 'NZL', 'MEX', 'BEL', 'SWE', 'SUI', 'RSA'],
  ...['POL', 'JPN', 'COL', 'DEN', 'NIR', 'IRL', 'THA', 'VEN', 'CHN', 'HUN'],
];

/** What each track rewards: speed, the driver and how hard it is on the car, each against an average of 1, and its chance of rain. */
export const TRACK_TRAITS: Record<string, { speed?: number; driver?: number; wear?: number; rain?: number; note?: string }> = {
  Monza: { speed: 1.5, note: 'a track for raw speed' },
  Spa: { speed: 1.25, rain: 0.35, note: 'fast, and often wet' },
  Silverstone: { speed: 1.15, rain: 0.25, note: 'fast, and often wet' },
  Monaco: { speed: 0.6, driver: 1.7, note: 'a driver\'s track' },
  Budapest: { speed: 0.8, driver: 1.3, note: 'tight and twisty' },
  Suzuka: { driver: 1.3, rain: 0.2, note: 'a driver\'s track' },
  Singapore: { wear: 1.7, note: 'brutal on the car' },
  Bahrain: { wear: 1.4, note: 'hard on the car' },
  Interlagos: { rain: 0.35, driver: 1.2, note: 'rain is never far away' },
  Melbourne: { wear: 1.2 },
};

/** Real rivalries, on and off the track; anyone else takes their nearest neighbour in the world. */
export const GRAND_PRIX_RIVALS: Record<string, string> = {
  ENG: 'GER', GER: 'ENG', BRA: 'ARG', ARG: 'BRA', FIN: 'SWE', SWE: 'FIN', AUT: 'GER', FRA: 'ITA', ITA: 'FRA',
  NED: 'BEL', BEL: 'NED', AUS: 'NZL', NZL: 'AUS', ESP: 'ITA', SCO: 'ENG', USA: 'CAN', CAN: 'USA', MEX: 'USA',
};
