export type SportId = 'football' | 'rugby' | 'cricket';
export const SPORT_IDS: readonly SportId[] = ['football', 'rugby', 'cricket'];

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
   * Rating per place above or below expectation. Fewer places mean a bigger
   * value: at football's 1, reading a season barely paid in a league of eight.
   */
  performanceMultiplier: number;
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
}

export const FOOTBALL: SportFormat = {
  id: 'football',
  leagues: 5,
  leagueSize: 20,
  promoted: 2,
  playoffs: true,
  relegated: 3,
  startingPots: [8, 16, 24, 36, 44, 56, 64, 76, 84, 92, 100],
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
  startingPots: [6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 48],
  performanceMultiplier: 2.5,
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
  performanceMultiplier: 3.5,
  topBonus: [6, 3, 0],
  bottomBonus: [0, -3, -6],
  cup: { entrants: 16, after: [1, 3, 5, 7] },
  championship: { entrants: 12, groupSize: 3 },
};

export const FORMATS: Record<SportId, SportFormat> = { football: FOOTBALL, rugby: RUGBY, cricket: CRICKET };

export function teamCount(format: SportFormat): number {
  return format.leagues * format.leagueSize;
}
