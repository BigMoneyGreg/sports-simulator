// Messages and view snapshots shared by the extension host and the webview.
// The webview only displays what it is sent; all game logic stays in the host.

/** '10s' is a testing speed, only offered when running from source (F5). */
export type Duration = '10s' | '30s' | '1m' | '2m' | '5m';
export const DURATIONS: Duration[] = ['30s', '1m', '2m', '5m'];
export const DURATION_LABELS: Record<Duration, string> = { '10s': '10s', '30s': '30s', '1m': '1 min', '2m': '2 min', '5m': '5 min' };
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StatKey = 'attack' | 'defence';
export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

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
  rating: number;
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
  /** How far attack and defence can lean apart for free. */
  tolerance: number;
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
    bestRun: string;
    worstRun: string;
    topScorer?: string;
  };
  /** Only the overall drop is shown; how it split between attack and defence stays hidden. */
  decline: { ratingBefore: number; ratingAfter: number };
  points: { total: number; base: number; performance: number; bonus: number; boosted: boolean };
  /** How many points each stat can still take before 99. */
  room: Record<StatKey, number>;
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
