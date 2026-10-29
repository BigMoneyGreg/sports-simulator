// Messages and view snapshots shared by the extension host and the webview.
// The webview only displays what it is sent; all game logic stays in the host.

export type Duration = '30s' | '2m' | '5m';
export const DURATIONS: Duration[] = ['30s', '2m', '5m'];
export const DURATION_LABELS: Record<Duration, string> = { '30s': '30 sec', '2m': '2 min', '5m': '5 min' };
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Focus = 'attack' | 'balanced' | 'defence';
export type Style = 'attacking' | 'balanced' | 'defensive';
export type Zone = 'champion' | 'promotion' | 'playoff' | 'relegation' | null;

export interface TeamBadge {
  name: string;
  short: string;
  /** Two or three flag colours. */
  colours: string[];
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
  /** After a shootout, e.g. "Pens 4–2" (home first). */
  penalties?: string;
  timeline: TimelineView[];
}

export interface FullTimeView {
  /** e.g. "League 3" or "Nations Cup · Round of 64". */
  competition: string;
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
  /** How far the player went in each competition that season. */
  cups: CupRunView[];
  summary: string;
}

export interface CabinetView {
  titles: { tier: number; seasons: number[] }[];
  cups: number[];
  championships: number[];
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
  isRival: boolean;
  /** Places gained (+) or lost (−) since kick-off, while matches are live. */
  move?: number;
}

export interface TableView {
  tier: number;
  rows: TableRowView[];
}

export interface FixtureView {
  /** Short: "MD 7", "C32", "WCQF". */
  label: string;
  /** The label in full, on hover. */
  labelTitle?: string;
  kind: 'league' | 'playoff' | 'cup' | 'championship';
  /** Opponent's name for tight spaces. */
  town: string;
  opponent: TeamBadge;
  home: boolean;
  result?: string;
  /** The full result on hover, e.g. "1–1, won 4–1 on penalties". */
  resultTitle?: string;
  outcome?: 'W' | 'D' | 'L';
  current: boolean;
}

export interface ClubView {
  name: string;
  short: string;
  colours: string[];
  /** This season's goals against the league average, the only clue to where the drain hit. */
  goals: { scored: number; conceded: number; average: number; played: number };
  tier: number;
  difficulty: Difficulty;
  season: number;
  expected: number;
  /** The rival, where it is now ("League 1, 3rd") and the record against it ("Played 6 · W3 D1 L2"). */
  rival?: TeamBadge & { where: string; record: string };
  cabinet: CabinetView;
  records: RecordsView;
  history: HistoryRowView[];
}

export interface HeaderView {
  club: TeamBadge;
  tier: number;
  position: number;
  /** League games played and in the season, e.g. 7 of 38. */
  played: number;
  games: number;
  /** Last five league results, oldest first, with a hover line like "W 2–0 v Hengate (H)". */
  form: { result: 'W' | 'D' | 'L'; title: string }[];
  paused: boolean;
  season: number;
  round: string;
  duration: Duration;
  /** Speeds the header button cycles through. */
  durations: Duration[];
}

export interface NationOption {
  code: string;
  name: string;
  colours: string[];
  /** The league it starts in by default. */
  tier: number;
  /** Among the biggest football nations, listed first. */
  popular: boolean;
}

export interface SetupView {
  /** Every playable nation, A–Z. */
  nations: NationOption[];
  /** Picked to start with, from VS Code's display language. */
  suggested?: string;
  duration: Duration;
  durations: Duration[];
}

export interface PlayoffTieView {
  high: TeamBadge;
  low: TeamBadge;
  /** Leg scores in order, each with the lower seed's goals first, as the tie reads ("low v high"). */
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
    cups: CupRunView[];
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
  cups: CupsView;
  fullTime: FullTimeView | null;
}

/** How far the player went in a competition, e.g. Nations Cup: Quarter-final. */
export interface CupRunView {
  name: string;
  run: string;
}

export interface CupTieView {
  home: TeamBadge;
  away: TeamBadge;
  /** Once played, the left-hand team's goals first. */
  score?: string;
  /** How a close tie was settled, naming the winner: "Brazil win 3–1 on penalties". */
  decided?: string;
  winner?: 'home' | 'away';
  mine: boolean;
}

export interface CupGroupView {
  name: string;
  rows: { pos: number; club: TeamBadge; town: string; played: number; gd: number; points: number; isPlayer: boolean; through: boolean }[];
}

export interface CupView {
  id: 'cup' | 'championship';
  name: string;
  /** Where the player stands, in a sentence. */
  status: string;
  /** What comes next, when it isn't on now. */
  next?: string;
  groups: CupGroupView[];
  /** Knockout rounds drawn so far, latest first. */
  rounds: { name: string; ties: CupTieView[] }[];
  winner?: TeamBadge;
  pastWinners: { season: number; winner: TeamBadge; runnerUp: TeamBadge }[];
}

export interface CupsView {
  cup: CupView;
  championship: CupView;
}

export type View = { screen: 'setup'; setup: SetupView } | GameView;

export type ToHost =
  | { type: 'ready' }
  | { type: 'startCareer'; team: string; league: number; difficulty: Difficulty; duration: Duration; style: Style }
  | { type: 'togglePause' }
  | { type: 'setDuration'; duration: Duration }
  | { type: 'chooseFocus'; focus: Focus }
  | { type: 'copy'; text: string }
  | { type: 'newCareer' }
  | { type: 'resetCareer' };

export type ToWebview = { type: 'view'; view: View };
