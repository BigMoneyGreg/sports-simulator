export type SportId = 'football' | 'rugby' | 'cricket' | 'grandprix';
export const SPORT_IDS: readonly SportId[] = ['football', 'rugby', 'cricket', 'grandprix'];

/** The shape of a sport's world: its leagues, who moves between them, its cups and what a league place is worth. */
export interface SportFormat {
  id: SportId;
  leagues: number;
  leagueSize: number;
  /** Automatic promotion places at the top of every league below League 1. */
  promoted: number;
  /** The next four places play off for one more promotion place. */
  playoffs: boolean;
  relegated: number;
  /**
   * Starting pots by world order: each pot's ratings are shuffled among its
   * teams, so the order inside a pot changes every career. A pot straddling a
   * league line can start on either side of it.
   */
  startingPots: number[];
  /**
   * The world's ratings, by world rank, as [rank, rating] points with straight
   * lines between: smoothed from each sport's real ranking points. The top is
   * spread out and hard to catch; the bottom is close, so anyone can beat anyone.
   */
  curve: [number, number][];
  /**
   * Rating per place above or below expectation. Fewer places mean a bigger
   * value: at football's 1, reading a season barely paid in a league of eight.
   */
  performanceMultiplier: number;
  /**
   * How lopsided a new career's team plays at first, however balanced it looks.
   * AI sides lose strength to their fixed shape; a new side that doesn't plays
   * well above its rating, which in a small league means walking it. Absent in
   * football, where the head start was tuned around.
   */
  startingLean?: number;
  /** Rating for finishing 1st, 2nd, 3rd; none in League 1. */
  topBonus: number[];
  /** Rating for finishing third-bottom, second-bottom, bottom; none in the bottom league. */
  bottomBonus: number[];
  cup: {
    entrants: number;
    /** League matchdays the cup rounds follow, zero-based: spread through the season. */
    after: number[];
  };
  championship: { entrants: number; groupSize: number };
  /** A sport of races, not matches: every round is one race per league, so there are no pairings, cups or draws. */
  race?: { rounds: number; tracks: string[] };
}

export const FOOTBALL: SportFormat = {
  id: 'football',
  leagues: 5,
  leagueSize: 20,
  promoted: 2,
  playoffs: true,
  relegated: 3,
  startingPots: [8, 16, 24, 36, 44, 56, 64, 76, 84, 92, 100],
  curve: [[1, 99], [4, 92], [8, 81], [10, 76], [20, 62], [30, 48], [50, 37], [70, 22], [100, 1]],
  performanceMultiplier: 1,
  topBonus: [6, 4, 2],
  bottomBonus: [-2, -4, -6],
  // After matchdays 6, 12, … 36: the final before the last two league rounds.
  cup: { entrants: 64, after: [5, 11, 17, 23, 29, 35] },
  championship: { entrants: 40, groupSize: 5 },
};

export const RUGBY: SportFormat = {
  id: 'rugby',
  leagues: 6,
  leagueSize: 8,
  promoted: 2,
  playoffs: false,
  relegated: 2,
  startingPots: [6, 12, 20, 28, 36, 44, 48],
  curve: [[1, 99], [6, 84], [7, 81], [12, 65], [13, 62], [20, 44], [21, 41], [28, 25], [29, 23], [36, 12], [37, 11], [44, 5], [45, 4], [48, 1]],
  performanceMultiplier: 2.5,
  startingLean: 14,
  topBonus: [6, 3, 0],
  bottomBonus: [0, -3, -6],
  cup: { entrants: 32, after: [1, 4, 6, 9, 11] },
  championship: { entrants: 16, groupSize: 4 },
};

export const CRICKET: SportFormat = {
  id: 'cricket',
  leagues: 5,
  leagueSize: 6,
  promoted: 1,
  playoffs: false,
  relegated: 1,
  startingPots: [4, 8, 10, 14, 16, 20, 22, 26, 30],
  curve: [[1, 99], [2, 95], [3, 91], [4, 87], [6, 80], [7, 78], [12, 54], [13, 48], [18, 38], [19, 26], [24, 9], [25, 8], [30, 1]],
  performanceMultiplier: 4.5,
  startingLean: 14,
  topBonus: [6, 3, 0],
  bottomBonus: [0, -3, -6],
  cup: { entrants: 16, after: [1, 3, 5, 7] },
  championship: { entrants: 12, groupSize: 3 },
};

export const GRAND_PRIX: SportFormat = {
  id: 'grandprix',
  leagues: 3,
  leagueSize: 10,
  promoted: 2,
  playoffs: false,
  relegated: 2,
  startingPots: [4, 8, 12, 16, 22, 26, 30],
  curve: [[1, 99], [10, 68], [11, 64], [20, 30], [21, 28], [30, 2]],
  performanceMultiplier: 2,
  startingLean: 14,
  topBonus: [6, 3, 0],
  bottomBonus: [0, -3, -6],
  cup: { entrants: 0, after: [] },
  // One car per nation from Leagues 1 and 2, for one race.
  championship: { entrants: 20, groupSize: 20 },
  race: { rounds: 16, tracks: ['Melbourne', 'Bahrain', 'Suzuka', 'Shanghai', 'Barcelona', 'Monaco', 'Montreal', 'Silverstone', 'Spielberg', 'Budapest', 'Spa', 'Zandvoort', 'Monza', 'Singapore', 'Austin', 'Interlagos'] },
};

export const FORMATS: Record<SportId, SportFormat> = { football: FOOTBALL, rugby: RUGBY, cricket: CRICKET, grandprix: GRAND_PRIX };

export function teamCount(format: SportFormat): number {
  return format.leagues * format.leagueSize;
}
