// Messages and view snapshots shared by the extension host and the webview.
// The webview only displays what it is sent; all game logic stays in the host.

export type Duration = '30s' | '1m' | '2m' | '5m';
export const DURATIONS: Duration[] = ['30s', '1m', '2m', '5m'];
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StatKey = 'attack' | 'defence' | 'chemistry';
export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

export interface TeamBadge {
  name: string;
  short: string;
  colours: [string, string];
}

export interface CommentaryView {
  clock: string;
  text: string;
  kind: 'goal' | 'card' | 'red' | 'chance' | 'whistle' | 'info';
  mine?: boolean;
}

export interface LiveMatchView {
  competition: string;
  home: TeamBadge & { goals: number; isPlayer: boolean };
  away: TeamBadge & { goals: number; isPlayer: boolean };
  clock: string;
  finished: boolean;
  aggregate?: string;
  commentary: CommentaryView[];
  scorers: { home: string[]; away: string[] };
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
  rating: number;
  stats: Record<StatKey, number>;
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
}

export interface SetupView {
  suggestedName: string;
  duration: Duration;
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
    bestRun: string;
    worstRun: string;
    topScorer?: string;
    verdict: string;
  };
  decline: { byStat: Record<StatKey, number>; ratingBefore: number; ratingAfter: number; hardest: StatKey };
  points: { total: number; base: number; performance: number; bonus: number; boosted: boolean };
  /** Stats after the decline (unrounded) and how many points each can still take. */
  stats: Record<StatKey, number>;
  room: Record<StatKey, number>;
  tolerance: number;
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
  | { type: 'startCareer'; rating: number; difficulty: Difficulty; duration: Duration; name: string; split?: Record<StatKey, number> }
  | { type: 'suggestName' }
  | { type: 'togglePause' }
  | { type: 'setDuration'; duration: Duration }
  | { type: 'allocate'; allocation: Record<StatKey, number> }
  | { type: 'copy'; text: string }
  | { type: 'newCareer' }
  | { type: 'resetCareer' };

export type ToWebview = { type: 'view'; view: View } | { type: 'suggestedName'; name: string };
