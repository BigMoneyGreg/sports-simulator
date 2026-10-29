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

export interface GameView {
  screen: 'game';
  header: HeaderView;
  match: LiveMatchView | null;
  tables: TableView[];
  playerTier: number;
  fixtures: FixtureView[];
  club: ClubView;
  waiting: 'seasonOver' | null;
}

export type View = { screen: 'setup'; setup: SetupView } | GameView;

export type ToHost =
  | { type: 'ready' }
  | { type: 'startCareer'; rating: number; difficulty: Difficulty; duration: Duration; name: string; split?: Record<StatKey, number> }
  | { type: 'suggestName' }
  | { type: 'togglePause' }
  | { type: 'setDuration'; duration: Duration };

export type ToWebview = { type: 'view'; view: View } | { type: 'suggestedName'; name: string };
