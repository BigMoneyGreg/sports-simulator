// Messages and view snapshots shared by the extension host and the webview.
// The webview only displays what it is sent; all game logic stays in the host.

export type Duration = '30s' | '2m' | '5m';
export const DURATIONS: Duration[] = ['30s', '2m', '5m'];
export const DURATION_LABELS: Record<Duration, string> = { '30s': '30 sec', '2m': '2 min', '5m': '5 min' };
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StatKey = 'attack' | 'defence';
export type Focus = 'attack' | 'balanced' | 'defence';
export type Style = 'attacking' | 'balanced' | 'defensive';
export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

/**
 * Badge colours the player picks from at setup. The main colour also tints the
 * header, so it leaves out black and white (lost on dark or light themes).
 */
export const BADGE_MAIN: [hex: string, label: string][] = [
  ['#c8102e', 'Red'],
  ['#003399', 'Blue'],
  ['#6cabdd', 'Sky blue'],
  ['#00843d', 'Green'],
  ['#fdb913', 'Amber'],
  ['#7a263a', 'Claret'],
];
export const BADGE_SECOND: [hex: string, label: string][] = [
  ['#ffffff', 'White'],
  ['#111111', 'Black'],
  ['#1c2c5b', 'Navy'],
  ['#6cabdd', 'Sky blue'],
  ['#fdb913', 'Amber'],
  ['#c8102e', 'Red'],
  ['#a7a9ac', 'Silver'],
  ['#f47b20', 'Orange'],
  ['#00843d', 'Green'],
];
/** Pairs that are the same colour or too close to tell apart. */
const BADGE_CLASHES: Record<string, string[]> = {
  '#c8102e': ['#c8102e', '#f47b20', '#00843d'],
  '#003399': ['#1c2c5b'],
  '#6cabdd': ['#6cabdd'],
  '#00843d': ['#c8102e', '#00843d'],
  '#fdb913': ['#fdb913', '#ffffff', '#f47b20'],
  '#7a263a': ['#c8102e', '#111111'],
};
const SECOND_SHOWN = 6;

export function badgeAllowed(main: string, second: string): boolean {
  return (
    BADGE_MAIN.some(([c]) => c === main) && BADGE_SECOND.some(([c]) => c === second) && !(BADGE_CLASHES[main] ?? []).includes(second)
  );
}

/** The second colours offered with a main colour: always six, clashes left out rather than greyed. */
export function secondOptions(main: string): [hex: string, label: string][] {
  return BADGE_SECOND.filter(([c]) => badgeAllowed(main, c)).slice(0, SECOND_SHOWN);
}

export interface TeamBadge {
  name: string;
  short: string;
  colours: [string, string];
}

/** One line of the match report. */
export interface TimelineView {
  clock: string;
  kind: 'goal' | 'yellow' | 'red' | 'break';
  side?: 'home' | 'away';
  text: string;
  score?: string;
}

export interface LiveMatchView {
  competition: string;
  /** e.g. "MD 7/38" for league matches. */
  round?: string;
  /** Town names for the scoreboard. */
  homeTown: string;
  awayTown: string;
  home: TeamBadge & { goals: number; isPlayer: boolean };
  away: TeamBadge & { goals: number; isPlayer: boolean };
  clock: string;
  finished: boolean;
  aggregate?: string;
  timeline: TimelineView[];
  derby: boolean;
}

export interface FullTimeView {
  home: TeamBadge & { goals: number };
  away: TeamBadge & { goals: number };
  note?: string;
  scorers: string;
  /** How long the card stays up, in ms. */
  ms: number;
  /** Changes for every new full time, so the card animates once per match. */
  key: string;
}

export interface HistoryRowView {
  season: number;
  tier: number;
  position: number;
  record: string;
  points: number;
  outcome: SeasonOutcome;
  summary: string;
}

export interface CabinetView {
  titles: { tier: number; seasons: number[] }[];
  promotions: number;
  playoffWins: number;
}

export interface RecordsView {
  biggestWin?: string;
  heaviestDefeat?: string;
  unbeaten: string;
  winning: string;
  mostGoals?: string;
  topScorers: string[];
  manager: { seasons: number; matches: number; won: number; drawn: number; lost: number; winPct: number; titles: number };
}

export interface TableRowView {
  pos: number;
  short: string;
  name: string;
  /** Name without the club suffix, for the narrow table. */
  town: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gd: number;
  points: number;
  zone: Zone;
  isPlayer: boolean;
  /** Playing right now (live table). */
  live?: boolean;
}

export interface TableView {
  tier: number;
  rows: TableRowView[];
}

export interface FixtureView {
  label: string;
  /** Opponent's name without the club suffix. */
  town: string;
  derby?: boolean;
  opponent: TeamBadge;
  home: boolean;
  result?: string;
  outcome?: 'W' | 'D' | 'L';
  current: boolean;
}

export interface ClubView {
  name: string;
  short: string;
  colours: [string, string];
  /** This season's goals against the league average, the only clue to where the drain hit. */
  goals: { scored: number; conceded: number; average: number; played: number };
  tier: number;
  difficulty: Difficulty;
  season: number;
  expected: number;
  rival?: TeamBadge;
  cabinet: CabinetView;
  records: RecordsView;
  history: HistoryRowView[];
}

export interface HeaderView {
  club: TeamBadge;
  tier: number;
  position: number;
  form: ('W' | 'D' | 'L')[];
  paused: boolean;
  season: number;
  round: string;
  duration: Duration;
  /** Speeds the header button cycles through. */
  durations: Duration[];
}

export interface SetupView {
  suggestedName: string;
  duration: Duration;
  durations: Duration[];
}

export interface PlayoffTieView {
  high: TeamBadge;
  low: TeamBadge;
  /** Leg scores, lower seed's home leg first, each as "home–away". */
  legs: string[];
  winner?: string;
}

export interface PlayoffView {
  tier: number;
  semis: PlayoffTieView[];
  final?: { home: TeamBadge; away: TeamBadge; result?: string; winner?: string };
  winner?: string;
}

export type SeasonOutcome = 'champion' | 'promoted' | 'playoffWinner' | 'playoffs' | 'relegated' | null;

export interface SeasonEndView {
  season: number;
  tier: number;
  newTier: number;
  position: number;
  expected: number;
  outcome: SeasonOutcome;
  headline: string;
  table: TableView;
  playoffs?: PlayoffView;
  report: {
    record: string;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    avgFor: number;
    avgAgainst: number;
    /** Goals per game in the club's matches (both teams), against the league's. */
    perGame: number;
    leaguePerGame: number;
    bestRun: string;
    worstRun: string;
    topScorer?: string;
  };
  points: { total: number; base: number; performance: number; bonus: number; boosted: boolean };
  /** The three summer choices and how each would split the points. */
  options: { focus: Focus; attack: number; defence: number }[];
  summary: string;
  /** Won League 1: offer to start a new career instead of carrying on. */
  canRetire: boolean;
}

export interface GameView {
  screen: 'game';
  header: HeaderView;
  match: LiveMatchView | null;
  tables: TableView[];
  playerTier: number;
  fixtures: FixtureView[];
  club: ClubView;
  waiting: 'seasonOver' | null;
  playoffs: PlayoffView[];
  seasonEnd: SeasonEndView | null;
  fullTime: FullTimeView | null;
}

export type View = { screen: 'setup'; setup: SetupView } | GameView;

export type ToHost =
  | { type: 'ready' }
  | { type: 'startCareer'; league: number; difficulty: Difficulty; duration: Duration; style: Style; name: string; colours: [string, string] }
  | { type: 'suggestName' }
  | { type: 'togglePause' }
  | { type: 'setDuration'; duration: Duration }
  | { type: 'chooseFocus'; focus: Focus }
  | { type: 'copy'; text: string }
  | { type: 'newCareer' }
  | { type: 'resetCareer' };

export type ToWebview = { type: 'view'; view: View } | { type: 'suggestedName'; name: string };
