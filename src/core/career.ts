import { AI_STYLES, clamp, MAX_STAT, MIN_STAT, rating, shiftRating, STATS, statsFor, type Club, type Stat, type Style } from './club';
import { FORMATS, teamCount, type SportFormat, type SportId } from './format';
import {
  doubleRoundRobin,
  potShuffle,
  emptyTable,
  recordResult,
  sortTable,
  type Fixture,
  type RoundKind,
  type TableRow,
} from './league';
import { applyDecline, bandPull, expectedPositions, normalise, positionBonus, RATING_TUNING, seasonGain, totalRating, type Difficulty } from './ratings';
import { CHAMPIONSHIP_EVERY, cupFixtures, cupRun, cupStages, drawChampionship, drawCup, recordCupResult, type Cup, type CupId } from './cups';
import { emptyRecords, recordMatch, recordSeasonGoals, type Records } from './records';
import { Rng } from './rng';
import type { GoalRecord, MatchOutcome, Player, SportModule, SportPresenter, TeamSheet } from './sport';

export const CAREER_VERSION = 8;
export const PLAYER_CLUB_ID = 0;

/** The format of the sport this career is in. */
export function formatOf(career: Pick<Career, 'sport'>): SportFormat {
  return FORMATS[career.sport];
}

export interface ClubIdentity {
  name: string;
  short: string;
  /** For tight spaces when the name is long. */
  shortName?: string;
  colours: string[];
}

/** Everything sport-specific the shared core needs. */
export interface SportDefinition<M = unknown> {
  format: SportFormat;
  module: SportModule<M>;
  present: SportPresenter<M>;
  generateSquad(rng: Rng, firstId: number, club: ClubIdentity): Player[];
  /** A new player's name for a club, not repeating a surname already in its squad. */
  namePlayer(rng: Rng, club: ClubIdentity, squad: Player[]): string;
  lineup(squad: Player[], unavailable?: ReadonlySet<number>): TeamSheet['lineup'];
  /** What a player plays ("striker") and which end of the pitch: summer leavers follow the side that lost most. */
  role(player: Pick<Player, 'number' | 'position'>): { label: string; side: Stat };
  /**
   * The world for a career: the player's team (`code`, or a random one), the
   * other `count - 1` teams, strongest first, and the short code of the
   * player's rival.
   */
  world(rng: Rng, count: number, code?: string): { player: ClubIdentity; others: ClubIdentity[]; rival?: string };
  /** The countries a player can choose, and the league each usually starts in. */
  nations(): (ClubIdentity & { tier: number })[];
}

export interface CareerOptions {
  rating: number;
  difficulty: Difficulty;
  /** Defaults to an even split. Must average to `rating`. */
  split?: Record<Stat, number>;
  /** The player's team; random if left out. */
  team?: string;
  seed: number;
}

export interface LeagueSeason {
  tier: number;
  clubIds: number[];
  table: TableRow[];
}

export interface PlayoffTie {
  /** Better-placed club: hosts the second leg. */
  high: number;
  low: number;
  /** First-leg score at the lower seed's ground: [low, high]. */
  leg1?: [number, number];
  /** Second-leg score at the higher seed's ground: [high, low], with any extra time or penalties. */
  leg2?: { score: [number, number]; penalties?: [number, number]; extraTime?: boolean };
  winner?: number;
}

export interface Playoff {
  tier: number;
  semis: [PlayoffTie, PlayoffTie];
  final?: { home: number; away: number; score?: [number, number]; note?: string; winner?: number };
  winner?: number;
}

export interface PlayerMatch {
  round: number;
  kind: RoundKind;
  opponentId: number;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** Goals from the player club's point of view: `for` is true for goals counting for it. */
  goals: (Omit<GoalRecord, 'side'> & { for: boolean })[];
  penalties?: [number, number];
  extraTime?: boolean;
  won?: boolean;
}

/** One matchday of the season. */
export type Slot = { kind: 'league'; index: number } | { kind: 'playoff'; stage: number } | { kind: CupId; stage: number };

export interface Season {
  number: number;
  leagues: LeagueSeason[];
  /** Expected finishing position for every club, by rating rank at the start of the season. */
  expected: Record<number, number>;
  ratingAtStart: Record<number, number>;
  schedule: Fixture[][];
  /** Every matchday in order: league rounds with cup rounds between them, the play-offs, then any World Championship. */
  calendar: Slot[];
  /** Index into `calendar` of the next matchday. */
  round: number;
  playoffs: Playoff[];
  cup: Cup;
  /** Drawn once the league season ends, in championship years. */
  championship: Cup | null;
  playerMatches: PlayerMatch[];
  /** Goals per player this season (own goals excluded). */
  scorers: Record<number, number>;
  /** Cricket: wickets per player this season. */
  wickets?: Record<number, number>;
}

export interface CupWinner {
  season: number;
  winner: number;
  runnerUp: number;
}

export type SeasonOutcome = 'champion' | 'promoted' | 'playoffWinner' | 'playoffs' | 'relegated' | null;

export interface SeasonEnd {
  season: number;
  tier: number;
  position: number;
  expected: number;
  performance: number;
  bonus: number;
  boost: number;
  /** Rating lost to the decline. */
  decline: number;
  declineByStat: Record<Stat, number>;
  /** Points to allocate across attack and defence. */
  points: number;
  outcome: SeasonOutcome;
  newTier: number;
  /** Club ids per league for next season, League 1 first. */
  nextLeagues: number[][];
  /** Every club in final standing order, League 1 first: next season's cup seeding. */
  standing: number[];
  promoted: Record<number, number[]>;
  relegated: Record<number, number[]>;
  playoffWinners: Record<number, number>;
  /** This summer's squad changes, every club: who leaves and who replaces them (applied as the next season starts). */
  turnover: SquadChange[];
  /** The summer's one question; missing in saves from before it was asked. */
  question?: SummerQuestion;
}

/**
 * Different ways of asking the same summer decision: one answer always
 * rebuilds the attack, the other the defence.
 */
export type QuestionStyle = 'callUp' | 'coach' | 'formation' | 'training';

export interface SummerQuestion {
  style: QuestionStyle;
  /** Call-ups and coach: who each answer names and what they play (or played). */
  people?: Record<Focus, { name: string; role: string }>;
  /** Call-ups: the player joining for each answer, and the squad place he takes. */
  callUps?: Record<Focus, { player: Player; replaces: number }>;
}

/** How often each style is drawn; call-ups twice as often, as the one that brings a new face. */
const QUESTION_WEIGHTS: Record<QuestionStyle, number> = { callUp: 2, coach: 1, formation: 1, training: 1 };

export interface SquadChange {
  clubId: number;
  out: number[];
  in: Player[];
}

/** Players leaving each club each summer, and AI clubs changing style (a new manager). */
const TURNOVER = { min: 2, max: 4, styleChange: 0.1 };

export interface SeasonRecord {
  season: number;
  tier: number;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  outcome: SeasonOutcome;
  topScorer?: { playerId: number; name: string; goals: number };
  topWickets?: { playerId: number; name: string; goals: number };
  /** How far the player went: "Winners", "Final", …, or absent if not in it. */
  cup?: string;
  championship?: string;
  ratingStart: number;
  ratingEnd: number;
}

export interface Career {
  version: number;
  sport: SportId;
  rng: number;
  difficulty: Difficulty;
  playerClubId: number;
  /** Sum of the AI clubs' ratings; fixed for the whole career. The player sits outside it. */
  totalRating: number;
  clubs: Club[];
  season: Season;
  /** Set when the season is over and the player has points to allocate. */
  pending: SeasonEnd | null;
  history: SeasonRecord[];
  records: Records;
  /** Past winners of each competition. */
  honours: { cup: CupWinner[]; championship: CupWinner[] };
  /** The most recent World Championship, kept to look back on until the next one. */
  lastChampionship: Cup | null;
  /** Players sent off, who miss their club's next match. */
  suspended: number[];
  /** Id for the next new player. */
  nextPlayerId: number;
  /** Last summer's question style, so the same one isn't asked twice running. */
  lastQuestion?: QuestionStyle;
  /** The player's rival for the whole career, shown on the Team tab. */
  rival: number | null;
}

// ---------------------------------------------------------------------------
// New career

export function newCareer(options: CareerOptions, sport: SportDefinition): Career {
  const chosen = Math.round(options.rating);
  if (chosen < 0 || chosen > 99) throw new Error(`starting rating must be 0–99, got ${options.rating}`);
  const rng = new Rng(options.seed);
  const format = sport.format;
  const count = teamCount(format);
  const world = sport.world(rng, count, options.team);
  const identities = [world.player, ...world.others];

  // One team on each rating, spread evenly across 0–99; the player takes the place of the nearest.
  const ladder = Array.from({ length: count }, (_, i) => ((count - 1 - i) * 100) / count);
  const taken = ladder.reduce((best, r, i) => (Math.abs(r - chosen) < Math.abs(ladder[best] - chosen) ? i : best), 0);
  const aiRatings = potShuffle(format, ladder.filter((_, i) => i !== taken), rng);
  const clubs: Club[] = identities.map((identity, id) => {
    const isPlayer = id === PLAYER_CLUB_ID;
    const style: Style = isPlayer ? 'balanced' : rng.pick(AI_STYLES);
    const stats = isPlayer ? playerStats(chosen, options.split) : statsFor(aiRatings[id - 1], style);
    return {
      id,
      ...identity,
      style,
      ...stats,
      squad: sport.generateSquad(rng, id * 100, identity),
      isPlayer,
    };
  });

  const byRating = [...clubs].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
  const leagues = Array.from({ length: format.leagues }, (_, t) => byRating.slice(t * format.leagueSize, (t + 1) * format.leagueSize).map((c) => c.id));

  const career: Career = {
    version: CAREER_VERSION,
    sport: format.id,
    rng: 0,
    difficulty: options.difficulty,
    playerClubId: PLAYER_CLUB_ID,
    totalRating: totalRating(clubs.filter((c) => !c.isPlayer)),
    clubs,
    season: newSeason(format, 1, leagues, byRating.map((c) => c.id), clubs, rng),
    pending: null,
    history: [],
    records: emptyRecords(),
    honours: { cup: [], championship: [] },
    lastChampionship: null,
    suspended: [],
    nextPlayerId: count * 100,
    rival: null,
  };
  career.rival = clubs.find((c) => !c.isPlayer && c.short === world.rival)?.id ?? closestInLeague(career);
  career.rng = rng.state;
  return career;
}

/** Stand-in rival when the sport doesn't name one: the closest-rated club in the starting league. */
function closestInLeague(career: Career): number | null {
  const league = career.season.leagues.find((l) => l.clubIds.includes(career.playerClubId));
  if (!league) return null;
  const mine = rating(career.clubs[career.playerClubId]);
  const others = league.clubIds.filter((id) => id !== career.playerClubId);
  return others.sort((a, b) => Math.abs(rating(career.clubs[a]) - mine) - Math.abs(rating(career.clubs[b]) - mine) || a - b)[0] ?? null;
}

function playerStats(value: number, split?: Record<Stat, number>): Record<Stat, number> {
  if (!split) return { attack: value, defence: value };
  const sum = STATS.reduce((t, s) => t + split[s], 0);
  if (STATS.some((s) => split[s] < 0 || split[s] > MAX_STAT) || sum !== value * STATS.length) {
    throw new Error(`stat split must be 0–99 each and average ${value}`);
  }
  return { ...split };
}

function newSeason(format: SportFormat, number: number, leagues: number[][], standing: number[], clubs: Club[], rng: Rng): Season {
  const expected: Record<number, number> = {};
  const ratingAtStart: Record<number, number> = {};
  const schedule: Fixture[][] = Array.from({ length: (format.leagueSize - 1) * 2 }, () => []);
  const leagueSeasons = leagues.map((clubIds, t) => {
    const tier = t + 1;
    for (const [id, pos] of expectedPositions(clubIds.map((id) => clubs[id]))) expected[id] = pos;
    doubleRoundRobin(clubIds, rng).forEach((round, r) => {
      for (const [home, away] of round) schedule[r].push({ tier, home, away, kind: 'league', options: {} });
    });
    return { tier, clubIds: [...clubIds], table: emptyTable(clubIds) };
  });
  for (const c of clubs) ratingAtStart[c.id] = rating(c);
  const calendar: Slot[] = [];
  schedule.forEach((_, index) => {
    calendar.push({ kind: 'league', index });
    format.cup.after.forEach((after, stage) => after === index && calendar.push({ kind: 'cup', stage }));
  });
  if (format.playoffs) for (let stage = 0; stage < 3; stage++) calendar.push({ kind: 'playoff', stage });
  if (number % CHAMPIONSHIP_EVERY === 0) cupStages(format, 'championship').forEach((_, stage) => calendar.push({ kind: 'championship', stage }));
  return {
    number,
    leagues: leagueSeasons,
    expected,
    ratingAtStart,
    schedule,
    calendar,
    round: 0,
    playoffs: [],
    cup: drawCup(format, number, standing.slice(0, format.cup.entrants), rng),
    championship: null,
    playerMatches: [],
    scorers: {},
  };
}

// ---------------------------------------------------------------------------
// Rounds

export function leagueRounds(season: Season): number {
  return season.schedule.length;
}

/** The matchday about to be played, or null when the season is over. */
export function currentSlot(season: Season): Slot | null {
  return season.calendar[season.round] ?? null;
}

/** The fixtures of the next round, or null when the season is over. */
export function nextRound(career: Career): Fixture[] | null {
  const s = career.season;
  const slot = currentSlot(s);
  const format = formatOf(career);
  if (career.pending || !slot) return null;
  switch (slot.kind) {
    case 'league':
      return s.schedule[slot.index];
    case 'cup':
      return cupFixtures(format, s.cup, slot.stage);
    case 'championship':
      return cupFixtures(format, s.championship!, slot.stage);
    case 'playoff':
      if (slot.stage === 0) return s.playoffs.flatMap((p) => p.semis.map((tie) => semiFixture(p.tier, tie, 1)));
      if (slot.stage === 1) return s.playoffs.flatMap((p) => p.semis.map((tie) => semiFixture(p.tier, tie, 2)));
      return s.playoffs.map((p) => ({
        tier: p.tier,
        home: p.final!.home,
        away: p.final!.away,
        kind: 'playoffFinal' as const,
        options: { neutral: true, knockout: { aggregate: [0, 0] as [number, number] } },
      }));
  }
}

function semiFixture(tier: number, tie: PlayoffTie, leg: 1 | 2): Fixture {
  if (leg === 1) return { tier, home: tie.low, away: tie.high, kind: 'playoffSemi1', options: {} };
  const [low, high] = tie.leg1!;
  return { tier, home: tie.high, away: tie.low, kind: 'playoffSemi2', secondLeg: true, options: { knockout: { aggregate: [high, low] } } };
}

export function isSeasonOver(career: Career): boolean {
  return !career.pending && nextRound(career) === null;
}

/** Whether the player's club plays in the given round. */
export function playerInRound(career: Career, fixtures: Fixture[]): Fixture | undefined {
  return fixtures.find((f) => f.home === career.playerClubId || f.away === career.playerClubId);
}

export function teamSheet(career: Career, clubId: number, sport: SportDefinition): TeamSheet {
  const c = career.clubs[clubId];
  return { clubId, attack: c.attack, defence: c.defence, settledLean: c.settledLean, lineup: sport.lineup(c.squad, new Set(career.suspended)) };
}

export interface RoundResult {
  fixture: Fixture;
  outcome: MatchOutcome;
}

/** Records a finished round's results and moves the season on. */
export function completeRound(career: Career, results: RoundResult[]): void {
  const s = career.season;
  const format = formatOf(career);
  const rng = new Rng(career.rng);
  // A ban is served once the club has played; this round's red cards start new ones.
  const played = new Set(results.flatMap(({ fixture }) => [fixture.home, fixture.away]));
  const servedBy = (id: number) => played.has(career.clubs.findIndex((c) => c.squad.some((p) => p.id === id)));
  career.suspended = (career.suspended ?? []).filter((id) => !servedBy(id));
  for (const { fixture, outcome } of results) {
    for (const red of outcome.sentOff ?? []) career.suspended.push(red.playerId);
    for (const g of outcome.goals) if (!g.ownGoal) s.scorers[g.playerId] = (s.scorers[g.playerId] ?? 0) + (g.count ?? 1);
    for (const w of outcome.wicketTakers ?? []) (s.wickets ??= {})[w.playerId] = (s.wickets[w.playerId] ?? 0) + w.count;
    if (fixture.kind === 'league') recordResult(s.leagues[fixture.tier - 1].table, fixture.home, fixture.away, outcome);
    else if (fixture.kind === 'cup') recordCupResult(format, s.cup, fixture, outcome, rng);
    else if (fixture.kind === 'championship') recordCupResult(format, s.championship!, fixture, outcome, rng);
    else recordPlayoff(s, fixture, outcome);
    if (fixture.home === career.playerClubId || fixture.away === career.playerClubId) {
      const record = playerMatch(career, s.round, fixture, outcome);
      s.playerMatches.push(record);
      const me = career.clubs[career.playerClubId];
      recordMatch((career.records ??= emptyRecords()), {
        goalsFor: record.goalsFor,
        goalsAgainst: record.goalsAgainst,
        opponent: career.clubs[record.opponentId].shortName ?? career.clubs[record.opponentId].name,
        season: s.number,
        won: record.won,
        // Only cricket settles every level score.
        settled: outcome.balls !== undefined,
        rival: record.opponentId === career.rival,
        scorers: record.goals
          .filter((g) => g.for && !g.ownGoal)
          .map((g) => ({ id: g.playerId, name: me.squad.find((p) => p.id === g.playerId)?.name ?? 'Unknown', ...(g.count ? { count: g.count } : {}) })),
        ...(outcome.wicketTakers
          ? { wickets: outcome.wicketTakers.flatMap((w) => {
              const p = me.squad.find((x) => x.id === w.playerId);
              return p ? [{ id: p.id, name: p.name, count: w.count }] : [];
            }) }
          : {}),
      });
    }
  }
  const done = currentSlot(s);
  s.round++;
  if (done?.kind === 'league' && done.index === s.schedule.length - 1) {
    s.playoffs = format.playoffs ? drawPlayoffs(s) : [];
    if (s.calendar.some((slot) => slot.kind === 'championship')) {
      const top = s.leagues.slice(0, 2).flatMap((l) => sortTable(l.table).map((r) => r.clubId));
      s.championship = drawChampionship(format, s.number, top.slice(0, format.championship.entrants), rng);
    }
  }
  career.rng = rng.state;
}

function playerMatch(career: Career, round: number, fixture: Fixture, outcome: MatchOutcome): PlayerMatch {
  const home = fixture.home === career.playerClubId;
  const mySide = home ? 'home' : 'away';
  const record: PlayerMatch = {
    round,
    kind: fixture.kind,
    opponentId: home ? fixture.away : fixture.home,
    home,
    goalsFor: home ? outcome.homeGoals : outcome.awayGoals,
    goalsAgainst: home ? outcome.awayGoals : outcome.homeGoals,
    goals: outcome.goals.map(({ side, ...g }) => ({ ...g, for: side === mySide })),
  };
  if (outcome.penalties) record.penalties = home ? outcome.penalties : [outcome.penalties[1], outcome.penalties[0]];
  if (outcome.extraTime) record.extraTime = true;
  if (outcome.winner) record.won = outcome.winner === mySide;
  return record;
}

function drawPlayoffs(s: Season): Playoff[] {
  return s.leagues
    .filter((l) => l.tier > 1)
    .map((l) => {
      const [third, fourth, fifth, sixth] = sortTable(l.table).slice(2, 6).map((r) => r.clubId);
      return { tier: l.tier, semis: [{ high: third, low: sixth }, { high: fourth, low: fifth }] };
    });
}

function recordPlayoff(s: Season, fixture: Fixture, outcome: MatchOutcome): void {
  const p = s.playoffs.find((x) => x.tier === fixture.tier)!;
  if (fixture.kind === 'playoffFinal') {
    p.final!.score = [outcome.homeGoals, outcome.awayGoals];
    p.final!.note = knockoutNote(outcome);
    p.final!.winner = outcome.winner === 'home' ? fixture.home : fixture.away;
    p.winner = p.final!.winner;
    return;
  }
  const tie = p.semis.find((t) => t.high === fixture.home || t.high === fixture.away)!;
  if (fixture.kind === 'playoffSemi1') {
    tie.leg1 = [outcome.homeGoals, outcome.awayGoals];
  } else {
    tie.leg2 = { score: [outcome.homeGoals, outcome.awayGoals] };
    if (outcome.penalties) tie.leg2.penalties = outcome.penalties;
    if (outcome.extraTime) tie.leg2.extraTime = true;
    tie.winner = outcome.winner === 'home' ? fixture.home : fixture.away;
    if (p.semis.every((t) => t.winner !== undefined)) {
      // The better-placed semi-final winner is the nominal home side at the neutral final.
      const [a, b] = p.semis.map((t) => t.winner!);
      const pos = (id: number) => sortTable(s.leagues[p.tier - 1].table).findIndex((r) => r.clubId === id);
      p.final = pos(a) < pos(b) ? { home: a, away: b } : { home: b, away: a };
    }
  }
}

function knockoutNote(outcome: MatchOutcome): string | undefined {
  if (outcome.penalties) return `(${outcome.penalties[0]}–${outcome.penalties[1]} pens)`;
  if (outcome.extraTime) return '(aet)';
  return undefined;
}

/** Plays the next round instantly (AI-only rounds, balance tool, tests). */
export function playRound<M>(career: Career, sport: SportDefinition<M>): RoundResult[] {
  const fixtures = nextRound(career);
  if (!fixtures) return [];
  const rng = new Rng(career.rng);
  const results = fixtures.map((fixture) => {
    const m = sport.module.createMatch(teamSheet(career, fixture.home, sport), teamSheet(career, fixture.away, sport), fixture.options, rng);
    while (!sport.module.isFinished(m)) sport.module.step(m, rng);
    return { fixture, outcome: sport.module.outcome(m) };
  });
  career.rng = rng.state;
  completeRound(career, results);
  return results;
}

// ---------------------------------------------------------------------------
// End of season

/**
 * Closes the season: works out positions, promotion and relegation, applies
 * the decline and gains to AI clubs, applies the decline to the player's club
 * and works out the points they have to allocate. The game then waits for
 * `allocatePoints`.
 */
export function endSeason(career: Career, sport: SportDefinition): SeasonEnd {
  if (career.pending) return career.pending;
  if (!isSeasonOver(career)) throw new Error('season is not over');
  const s = career.season;
  const format = formatOf(career);
  const rng = new Rng(career.rng);

  const finalTables = s.leagues.map((l) => sortTable(l.table));
  const position: Record<number, number> = {};
  const tierOf: Record<number, number> = {};
  finalTables.forEach((table, t) => table.forEach((row, i) => ((position[row.clubId] = i + 1), (tierOf[row.clubId] = t + 1))));

  const promoted: Record<number, number[]> = {};
  const relegated: Record<number, number[]> = {};
  const playoffWinners: Record<number, number> = {};
  for (const p of s.playoffs) playoffWinners[p.tier] = p.winner!;
  finalTables.forEach((table, t) => {
    const tier = t + 1;
    if (tier > 1) promoted[tier] = [...table.slice(0, format.promoted).map((r) => r.clubId), ...(format.playoffs ? [playoffWinners[tier]] : [])];
    if (tier < format.leagues) relegated[tier] = table.slice(format.leagueSize - format.relegated).map((r) => r.clubId);
  });
  const nextLeagues = finalTables.map((table, t) => {
    const tier = t + 1;
    const stay = table.map((r) => r.clubId).filter((id) => !promoted[tier]?.includes(id) && !relegated[tier]?.includes(id));
    return [...stay, ...(promoted[tier + 1] ?? []), ...(relegated[tier - 1] ?? [])];
  });
  const newTierOf: Record<number, number> = {};
  nextLeagues.forEach((ids, t) => ids.forEach((id) => (newTierOf[id] = t + 1)));

  // AI clubs: decline and gain, rebuilt in their style's shape, then pulled towards their new league's band.
  for (const club of career.clubs) {
    if (club.isPlayer) continue;
    if (rng.next() < TURNOVER.styleChange) club.style = club.style === 'attacking' ? 'defensive' : 'attacking';
    const tier = tierOf[club.id];
    const gain = seasonGain(format, tier, s.expected[club.id], position[club.id], rating(club), rng.normal(0, RATING_TUNING.aiNoise));
    const promotedNow = newTierOf[club.id] < tier;
    const boost = promotedNow ? RATING_TUNING.promotedBoost : 0;
    Object.assign(club, statsFor(clamp(rating(club) - RATING_TUNING.decline + gain + boost, MIN_STAT, MAX_STAT), club.style));
    bandPull(format, club, newTierOf[club.id]);
  }

  // Player club: decline now; the gain comes back as points to allocate.
  const me = career.clubs[career.playerClubId];
  const tier = tierOf[me.id];
  const pos = position[me.id];
  const reigning = career.history[career.history.length - 1]?.outcome === 'champion';
  const boost = (reigning ? RATING_TUNING.championBoost : RATING_TUNING.difficultyBoost)[career.difficulty];
  const gain = seasonGain(format, tier, s.expected[me.id], pos, rating(me), boost, true);
  const before = rating(me);
  const declineByStat = applyDecline(me, RATING_TUNING.decline, rng);
  const decline = before - rating(me);
  let points = Math.round(gain * RATING_TUNING.pointsPerRating);
  if (points < 0) {
    shiftRating(me, points / RATING_TUNING.pointsPerRating);
    points = 0;
  }
  points = Math.min(points, allocationCapacity(me));

  // The player's leavers come mostly from the end of the pitch that lost most: the summer's clue.
  const attackShare = declineByStat.attack / Math.max(1e-9, declineByStat.attack + declineByStat.defence);
  const turnover = career.clubs.map((club) => planTurnover(career, club, sport, rng, club.isPlayer ? attackShare : undefined));
  const question = planQuestion(career, turnover[me.id], sport, rng);

  career.rng = rng.state;
  career.pending = {
    season: s.number,
    tier,
    position: pos,
    expected: s.expected[me.id],
    performance: s.expected[me.id] - pos,
    bonus: positionBonus(format, tier, pos),
    boost,
    decline,
    declineByStat,
    points,
    outcome: seasonOutcome(format, tier, pos, s.playoffs, me.id),
    newTier: newTierOf[me.id],
    nextLeagues,
    standing: finalTables.flatMap((table) => table.map((r) => r.clubId)),
    promoted,
    relegated,
    playoffWinners,
    turnover,
    question,
  };
  career.lastQuestion = question.style;
  career.rng = rng.state;
  return career.pending;
}

/**
 * Who leaves a club this summer (long servants are likeliest to go) and who
 * comes in, same positions and shirts. With `attackShare`, that share of the
 * leavers (give or take) comes from the attacking end.
 */
function planTurnover(career: Career, club: Club, sport: SportDefinition, rng: Rng, attackShare?: number): SquadChange {
  const season = career.season.number;
  const count = rng.int(TURNOVER.min, TURNOVER.max);
  const fromAttack = attackShare === undefined ? null : clamp(Math.round(count * attackShare + (rng.next() - 0.5) * 0.6), 0, count);
  const candidates = [...club.squad];
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const side: Stat | null = fromAttack === null ? null : i < fromAttack ? 'attack' : 'defence';
    const pool = side ? candidates.filter((p) => sport.role(p).side === side) : candidates;
    const leaver = rng.weighted(pool.length ? pool : candidates, (p) => season - (p.joined ?? 1) + 1);
    out.push(leaver);
    candidates.splice(candidates.indexOf(leaver), 1);
  }
  const staying = club.squad.filter((p) => !out.includes(p));
  const incoming: Player[] = [];
  for (const leaver of out) {
    const name = sport.namePlayer(rng, club, [...staying, ...incoming]);
    incoming.push({ id: career.nextPlayerId++, name, position: leaver.position, number: leaver.number, joined: season + 1 });
  }
  return { clubId: club.id, out: out.map((p) => p.id), in: incoming };
}

/** Draws the summer's question (not last summer's style) and, for call-ups and a new coach, the people in it. */
function planQuestion(career: Career, change: SquadChange, sport: SportDefinition, rng: Rng): SummerQuestion {
  const styles = (Object.keys(QUESTION_WEIGHTS) as QuestionStyle[]).filter((s) => s !== career.lastQuestion);
  const style = rng.weighted(styles, (s) => QUESTION_WEIGHTS[s]);
  const club = career.clubs[career.playerClubId];
  const taken = [...club.squad, ...change.in];
  const name = () => {
    const n = sport.namePlayer(rng, club, taken);
    taken.push({ id: -1, name: n, position: '', number: 0 });
    return n;
  };
  if (style === 'coach') {
    const played = (side: Stat) => rng.pick(club.squad.filter((p) => sport.role(p).side === side)).number;
    const people = {} as Record<Focus, { name: string; role: string }>;
    for (const focus of FOCUSES) people[focus] = { name: name(), role: sport.role({ number: played(focus), position: '' }).label };
    return { style, people };
  }
  if (style !== 'callUp') return { style };

  const season = career.season.number;
  const people = {} as Record<Focus, { name: string; role: string }>;
  const callUps = {} as Record<Focus, { player: Player; replaces: number }>;
  for (const focus of FOCUSES) {
    // He takes the place of a newcomer at his end of the pitch if there is one, or else of its longest servant.
    const slot = change.out.findIndex((id) => sport.role(club.squad.find((p) => p.id === id)!).side === focus);
    const staying = club.squad.filter((p) => !change.out.includes(p.id) && sport.role(p).side === focus);
    const place = slot >= 0 ? change.in[slot] : staying.reduce((a, b) => ((a.joined ?? 1) <= (b.joined ?? 1) ? a : b));
    const player: Player = { id: career.nextPlayerId++, name: name(), position: place.position, number: place.number, joined: season + 1 };
    callUps[focus] = { player, replaces: place.id };
    people[focus] = { name: player.name, role: sport.role(player).label };
  }
  return { style, people, callUps };
}

function seasonOutcome(format: SportFormat, tier: number, pos: number, playoffs: Playoff[], id: number): SeasonOutcome {
  if (tier === 1 && pos === 1) return 'champion';
  if (tier > 1 && pos <= format.promoted) return 'promoted';
  const p = playoffs.find((x) => x.tier === tier);
  if (p?.winner === id) return 'playoffWinner';
  if (p?.semis.some((t) => t.high === id || t.low === id)) return 'playoffs';
  if (tier < format.leagues && pos > format.leagueSize - format.relegated) return 'relegated';
  return null;
}

/** Whole stat points the club can still take before every stat hits 99. */
export function allocationCapacity(club: Club): number {
  return STATS.reduce((t, s) => t + Math.max(0, Math.floor(MAX_STAT - club[s] + 1e-9)), 0);
}

/**
 * Splits `points` across stats in proportion to `weights`, in whole points,
 * never taking a stat above 99. Overflow goes to the next most-wanted stat.
 */
export function fillAllocation(club: Club, points: number, weights: Record<Stat, number>): Record<Stat, number> {
  const room = (s: Stat) => Math.max(0, Math.floor(MAX_STAT - club[s] + 1e-9));
  const total = STATS.reduce((t, s) => t + Math.max(0, weights[s]), 0) || 1;
  const out = { attack: 0, defence: 0 };
  let left = points;
  for (const s of STATS) {
    out[s] = Math.min(room(s), Math.floor((points * Math.max(0, weights[s])) / total));
    left -= out[s];
  }
  const order = [...STATS].sort((a, b) => weights[b] - weights[a]);
  while (left > 0 && order.some((s) => out[s] < room(s))) {
    for (const s of order) {
      if (left > 0 && out[s] < room(s)) {
        out[s]++;
        left--;
      }
    }
  }
  return out;
}

/** The player's one summer decision: which side to rebuild after the decline. There's no safe middle. */
export type Focus = 'attack' | 'defence';
export const FOCUSES: readonly Focus[] = ['attack', 'defence'];

/** Splits the points for a focus: `focusShare` to the side being rebuilt, the rest to the other. */
export function focusAllocation(club: Club, points: number, focus: Focus): Record<Stat, number> {
  const share = RATING_TUNING.focusShare;
  const weights = focus === 'attack' ? { attack: share, defence: 1 - share } : { attack: 1 - share, defence: share };
  return fillAllocation(club, points, weights);
}

/** Answers the summer's question (a call-up joins the squad), spends the points on that side and starts the next season. */
export function chooseFocus(career: Career, focus: Focus): void {
  const pending = career.pending;
  if (!pending) throw new Error('no points to allocate');
  const callUp = pending.question?.callUps?.[focus];
  const change = pending.turnover.find((t) => t.clubId === career.playerClubId);
  if (callUp && change) {
    const newcomer = change.in.findIndex((p) => p.id === callUp.replaces);
    if (newcomer >= 0) change.in[newcomer] = callUp.player;
    else {
      change.out.push(callUp.replaces);
      change.in.push(callUp.player);
    }
  }
  allocatePoints(career, focusAllocation(career.clubs[career.playerClubId], pending.points, focus));
}

/**
 * Applies the player's allocation, rebalances the AI so the total rating is
 * unchanged, records the season and starts the next one.
 */
export function allocatePoints(career: Career, allocation: Record<Stat, number>): void {
  const pending = career.pending;
  if (!pending) throw new Error('no points to allocate');
  const me = career.clubs[career.playerClubId];
  const spent = STATS.reduce((t, s) => t + allocation[s], 0);
  if (STATS.some((s) => !Number.isInteger(allocation[s]) || allocation[s] < 0 || me[s] + allocation[s] > MAX_STAT + 1e-9)) {
    throw new Error(`each stat takes a whole number of points and stays at ${MAX_STAT} or below`);
  }
  if (spent !== pending.points) throw new Error(`allocate exactly ${pending.points} points, got ${spent}`);
  for (const s of STATS) me[s] += allocation[s];
  // The team settles into its new shape gradually (AI clubs keep a fixed shape, so only the player's moves).
  const lean = me.attack - me.defence;
  me.settledLean = me.settledLean === undefined ? lean : me.settledLean + RATING_TUNING.leanSettling * (lean - me.settledLean);

  normalise(career.clubs, career.totalRating);
  const record = seasonRecord(career, pending);
  career.history.push(record);
  recordSeasonGoals((career.records ??= emptyRecords()), record.goalsFor, record.season);

  for (const cup of [career.season.cup, career.season.championship]) {
    if (cup?.winner === undefined) continue;
    const final = cup.rounds[cup.rounds.length - 1].ties[0];
    career.honours[cup.id].push({ season: cup.season, winner: cup.winner, runnerUp: final.home === cup.winner ? final.away : final.home });
  }
  if (career.season.championship) career.lastChampionship = career.season.championship;

  const rng = new Rng(career.rng);
  for (const change of pending.turnover ?? []) {
    const club = career.clubs[change.clubId];
    club.squad = club.squad.map((p) => {
      const at = change.out.indexOf(p.id);
      return at < 0 ? p : change.in[at];
    });
  }
  career.suspended = [];

  career.season = newSeason(formatOf(career), pending.season + 1, pending.nextLeagues, pending.standing, career.clubs, rng);
  career.rng = rng.state;
  career.pending = null;
}

/** The career's history including a just-finished season still awaiting allocation. */
export function fullHistory(career: Career): SeasonRecord[] {
  return career.pending ? [...career.history, seasonRecord(career, career.pending)] : career.history;
}

function seasonRecord(career: Career, pending: SeasonEnd): SeasonRecord {
  const s = career.season;
  const format = formatOf(career);
  const me = career.clubs[career.playerClubId];
  const row = s.leagues[pending.tier - 1].table.find((r) => r.clubId === me.id)!;
  const top = me.squad
    .map((p) => ({ playerId: p.id, name: p.name, goals: s.scorers[p.id] ?? 0 }))
    .sort((a, b) => b.goals - a.goals)[0];
  const bowler = s.wickets
    ? me.squad.map((p) => ({ playerId: p.id, name: p.name, goals: s.wickets![p.id] ?? 0 })).sort((a, b) => b.goals - a.goals)[0]
    : undefined;
  return {
    season: s.number,
    tier: pending.tier,
    position: pending.position,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    points: row.points,
    outcome: pending.outcome,
    topScorer: top && top.goals > 0 ? top : undefined,
    ...(bowler && bowler.goals > 0 ? { topWickets: bowler } : {}),
    cup: cupRun(format, s.cup, me.id) ?? undefined,
    championship: (s.championship && cupRun(format, s.championship, me.id)) ?? undefined,
    ratingStart: s.ratingAtStart[me.id],
    ratingEnd: rating(me),
  };
}

/** Plays out the rest of the season instantly and closes it. */
export function playSeason(career: Career, sport: SportDefinition): SeasonEnd {
  while (nextRound(career)) playRound(career, sport);
  return endSeason(career, sport);
}
