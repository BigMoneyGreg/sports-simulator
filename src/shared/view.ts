// Messages and view snapshots shared by the extension host and the webview.
// The webview only displays what it is sent; all game logic stays in the host.

import type { SportId } from '../core/format';
import type { InningsCard, SportTerms } from '../core/sport';

/** How long a season takes, the same choices in every sport; each sport works out its own match length from it. */
export type SeasonLength = '25m' | '90m' | '4h' | '8h';
export const SEASON_LENGTHS: SeasonLength[] = ['25m', '90m', '4h', '8h'];
export const SEASON_LABELS: Record<SeasonLength, string> = { '25m': '~25 min', '90m': '~1½ hr', '4h': '~4 hr', '8h': '~8 hr' };
export type Focus = 'attack' | 'defence';
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
  kind: 'goal' | 'minor' | 'yellow' | 'red' | 'break';
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
  /** Each side's score as shown: "2", "24", "156/4" (empty until a cricket side bats). */
  score: [string, string];
  /** The player is up against the career's rival. */
  rival: boolean;
  /** How many big moments went each side's way, for the flash: goals, tries, wickets taken. */
  alerts: [number, number];
  /** Under the scoreboard: "Need 34 from 18 balls". */
  situation?: string;
  /** Smaller lines under that: this over. */
  details?: string[];
  clock: string;
  finished: boolean;
  aggregate?: string;
  /** After a shootout, e.g. "Pens 4–2" (home first). */
  penalties?: string;
  /** The player's men banned for this match, e.g. "Ross". */
  suspended?: string[];
  timeline: TimelineView[];
  /** Shown instead of the timeline in a sport that has one, latest innings first. */
  scorecard?: InningsCard[];
}

export interface FullTimeView {
  /** e.g. "League 3" or "Nations Cup · Round of 64". */
  competition: string;
  home: TeamBadge;
  away: TeamBadge;
  /** "2–1", "156/8 v 142/9". */
  score: string;
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
  /** How far the player went in the cups that season, in one short line: "Cup: R64 · WC: Groups". */
  cups?: string;
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
  /** Cricket. */
  topWicketTakers?: string[];
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
  /** The difference column as shown: "+3", "-0.42". */
  gdText: string;
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
  /** Short: "MD 7", "Cup 32", "WC QF". */
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
  /** Ranks: 1 = most scored, fewest conceded. The texts read "44" or, in cricket, "8.23 an over". */
  goals: { scored: number; conceded: number; scoredRank: number; concededRank: number; average: number; played: number; scoredText: string; concededText: string; avgForText: string; avgAgainstText: string };
  tier: number;
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
  duration: SeasonLength;
  /** Speeds the header button cycles through. */
}

/** One sport in the box's list: the least worth knowing while it's minimised. */
export interface SportRowView {
  id: SportId;
  name: string;
  /** The country this sport's career is with; none until one starts. */
  club?: string;
  /** "3rd Wk 7/38 · SCO 1–1 RSA 59'". */
  line?: string;
  /** How far through the league season, from 0 to 1. */
  progress?: number;
  paused: boolean;
  /** The summer's decision is waiting. */
  waiting: boolean;
}

export interface NationOption {
  code: string;
  name: string;
  colours: string[];
  /** The league it starts in by default. */
  tier: number;
}

export interface SetupView {
  sport: SportId;
  terms: SportTerms;
  /** How many leagues this sport's world has. */
  leagues: number;
  /** Every playable nation, A–Z. */
  nations: NationOption[];
  /** Picked to start with, from VS Code's display language. */
  suggested?: string;
  duration: SeasonLength;
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

export interface QuestionView {
  /** e.g. "Retirements leave gaps. Who gets the call?" */
  prompt: string;
  options: { focus: Focus; title: string; line?: string }[];
}

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
    /** As shown: "44" or, in cricket, "8.23 an over". */
    scoredText: string;
    concededText: string;
    avgForText: string;
    avgAgainstText: string;
    /** Where the season ranked in the league: the clue to which side dropped off. */
    scoredRank: number;
    concededRank: number;
    bestRun: string;
    worstRun: string;
    topScorer?: string;
    topWickets?: string;
    /** This season against the rival, if they met: "England · 1W 1D 0L". */
    rival?: string;
    cups: CupRunView[];
  };
  /** How the finish compared with expectation; the summer's points themselves stay in the host. */
  performance: 'above' | 'expected' | 'below';
  /** The squad's summer changes: "Finlay Ross · striker · retires after 9 seasons, 142 goals" leaving, new names arriving. */
  squad: { leaving: string[]; arriving: string[] };
  /** The summer's one question; one answer rebuilds the attack, the other the defence. */
  question: QuestionView;
  summary: string;
  /** Won League 1: offer to start a new career instead of carrying on. */
  canRetire: boolean;
}

export interface GameView {
  screen: 'game';
  sport: SportId;
  terms: SportTerms;
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
  rows: { pos: number; club: TeamBadge; town: string; played: number; gd: number; gdText: string; points: number; isPlayer: boolean; through: boolean }[];
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

/** What's kept across every career and sport. Only what exists so far is listed. */
export interface HonoursView {
  screen: 'honours';
  feats: { title: string; detail: string }[];
  /** Best first; only once there's more than one career to compare. */
  greatest: CareerRowView[];
  /** The best of all careers, sport by sport. */
  records: { sport: SportId; name: string; rows: { label: string; value: string }[] }[];
  /** Ended careers, latest first. */
  past: CareerRowView[];
}

export interface CareerRowView {
  club: string;
  sport: SportId;
  sportName: string;
  seasons: number;
  /** "2 world titles · 1 League 1 title", or the best finish if there are none: "Best: 3rd in League 2". */
  summary: string;
  /** Still being played. */
  live: boolean;
}

export type View = { screen: 'setup'; setup: SetupView } | GameView | HonoursView;

/** What can open in the box's list: a sport, or the honours everything adds up to. */
export type PanelId = SportId | 'honours';

export type ToHost =
  | { type: 'ready' }
  | { type: 'startCareer'; sport: SportId; team: string; league: number; duration: SeasonLength }
  | { type: 'togglePause'; sport: SportId }
  | { type: 'setDuration'; sport: SportId; duration: SeasonLength }
  /** Opens this in the list, closing whichever was open; null minimises them all. */
  | { type: 'openPanel'; panel: PanelId | null }
  | { type: 'chooseFocus'; sport: SportId; focus: Focus }
  | { type: 'copy'; text: string }
  /** Ends it, keeping it in Past careers. */
  | { type: 'endCareer'; sport: SportId }
  /** Deletes it, as if it was never played. */
  | { type: 'resetCareer'; sport: SportId }
  | { type: 'resetHonours' }
  /** Asks which sports, and whether Honours, show in the box. */
  | { type: 'chooseSports' };

/**
 * Every sport's row, and the full view of what's open; without `view`, only a
 * minimised sport changed. `honours` is the Honours row's line, with no row until there's something to show.
 */
export type ToWebview = { type: 'view'; rows: SportRowView[]; honours: string | null; open: PanelId | null; view?: View | null };
