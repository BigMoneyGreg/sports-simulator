import { AI_STYLES, clamp, MAX_STAT, rating, shiftRating, STATS, statsFor, type Club, type Stat, type Style } from './club';
import {
  doubleRoundRobin,
  potShuffle,
  emptyTable,
  LEAGUE_COUNT,
  LEAGUE_SIZE,
  PROMOTED_AUTOMATICALLY,
  RELEGATED,
  recordResult,
  sortTable,
  type Fixture,
  type RoundKind,
  type TableRow,
} from './league';
import { applyDecline, bandPull, expectedPositions, normalise, positionBonus, RATING_TUNING, seasonGain, totalRating, type Difficulty } from './ratings';
import { emptyRecords, recordMatch, recordSeasonGoals, type Records } from './records';
import { Rng } from './rng';
import type { GoalRecord, MatchOutcome, Player, SportModule, TeamSheet } from './sport';

export const CAREER_VERSION = 3;
export const CLUB_COUNT = LEAGUE_COUNT * LEAGUE_SIZE;
export const PLAYER_CLUB_ID = 0;

export interface ClubIdentity {
  name: string;
  short: string;
  /** For tight spaces when the name is long. */
  shortName?: string;
  colours: string[];
}

/** Everything sport-specific the shared core needs. */
export interface SportDefinition<M = unknown> {
  module: SportModule<M>;
  generateSquad(rng: Rng, firstId: number, club: ClubIdentity): Player[];
  lineup(squad: Player[]): TeamSheet['lineup'];
  /**
   * The world for a career: the player's team (`code`, or a random one) and
   * the other `count - 1` teams, strongest first.
   */
  world(rng: Rng, count: number, code?: string): { player: ClubIdentity; others: ClubIdentity[] };
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
  leg2?: { score: [number, number]; note?: string };
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

export interface Season {
  number: number;
  leagues: LeagueSeason[];
  /** Expected finishing position for every club, by rating rank at the start of the season. */
  expected: Record<number, number>;
  ratingAtStart: Record<number, number>;
  schedule: Fixture[][];
  /** Index of the next round to play: league rounds, then up to three play-off rounds. */
  round: number;
  playoffs: Playoff[];
  playerMatches: PlayerMatch[];
  /** Goals per player this season (own goals excluded). */
  scorers: Record<number, number>;
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
  promoted: Record<number, number[]>;
  relegated: Record<number, number[]>;
  playoffWinners: Record<number, number>;
}

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
  ratingStart: number;
  ratingEnd: number;
}

export interface Career {
  version: number;
  rng: number;
  difficulty: Difficulty;
  playerClubId: number;
  /** Sum of all club ratings; fixed for the whole career. */
  totalRating: number;
  clubs: Club[];
  season: Season;
  /** Set when the season is over and the player has points to allocate. */
  pending: SeasonEnd | null;
  history: SeasonRecord[];
  records: Records;
  /** The rival club in the player's league, shown on the Club tab. */
  rival: number | null;
}

// ---------------------------------------------------------------------------
// New career

export function newCareer(options: CareerOptions, sport: SportDefinition): Career {
  const chosen = Math.round(options.rating);
  if (chosen < 0 || chosen > MAX_STAT) throw new Error(`rating must be 0–99, got ${options.rating}`);
  const rng = new Rng(options.seed);
  const world = sport.world(rng, CLUB_COUNT, options.team);
  const identities = [world.player, ...world.others];

  const remaining = Array.from({ length: CLUB_COUNT }, (_, i) => CLUB_COUNT - 1 - i).filter((r) => r !== chosen);
  const aiRatings = potShuffle(remaining, rng);
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
  const leagues = Array.from({ length: LEAGUE_COUNT }, (_, t) => byRating.slice(t * LEAGUE_SIZE, (t + 1) * LEAGUE_SIZE).map((c) => c.id));

  const career: Career = {
    version: CAREER_VERSION,
    rng: 0,
    difficulty: options.difficulty,
    playerClubId: PLAYER_CLUB_ID,
    totalRating: totalRating(clubs),
    clubs,
    season: newSeason(1, leagues, clubs, rng),
    pending: null,
    history: [],
    records: emptyRecords(),
    rival: null,
  };
  career.rival = pickRival(career);
  career.rng = rng.state;
  return career;
}

/** Keeps the rival while you share a league; otherwise the closest-rated club in your new one. */
export function pickRival(career: Career): number | null {
  const league = career.season.leagues.find((l) => l.clubIds.includes(career.playerClubId));
  if (!league) return null;
  if (career.rival !== null && career.rival !== undefined && league.clubIds.includes(career.rival)) return career.rival;
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

function newSeason(number: number, leagues: number[][], clubs: Club[], rng: Rng): Season {
  const expected: Record<number, number> = {};
  const ratingAtStart: Record<number, number> = {};
  const schedule: Fixture[][] = Array.from({ length: (LEAGUE_SIZE - 1) * 2 }, () => []);
  const leagueSeasons = leagues.map((clubIds, t) => {
    const tier = t + 1;
    for (const [id, pos] of expectedPositions(clubIds.map((id) => clubs[id]))) expected[id] = pos;
    doubleRoundRobin(clubIds, rng).forEach((round, r) => {
      for (const [home, away] of round) schedule[r].push({ tier, home, away, kind: 'league', options: {} });
    });
    return { tier, clubIds: [...clubIds], table: emptyTable(clubIds) };
  });
  for (const c of clubs) ratingAtStart[c.id] = rating(c);
  return { number, leagues: leagueSeasons, expected, ratingAtStart, schedule, round: 0, playoffs: [], playerMatches: [], scorers: {} };
}

// ---------------------------------------------------------------------------
// Rounds

export function leagueRounds(season: Season): number {
  return season.schedule.length;
}

/** The fixtures of the next round, or null when the season is over. */
export function nextRound(career: Career): Fixture[] | null {
  const s = career.season;
  if (career.pending) return null;
  if (s.round < s.schedule.length) return s.schedule[s.round];
  const stage = s.round - s.schedule.length;
  if (stage === 0) return s.playoffs.length ? s.playoffs.flatMap((p) => p.semis.map((tie) => semiFixture(p.tier, tie, 1))) : null;
  if (stage === 1) return s.playoffs.flatMap((p) => p.semis.map((tie) => semiFixture(p.tier, tie, 2)));
  if (stage === 2) {
    return s.playoffs.map((p) => ({
      tier: p.tier,
      home: p.final!.home,
      away: p.final!.away,
      kind: 'playoffFinal' as const,
      options: { neutral: true, knockout: { aggregate: [0, 0] as [number, number] } },
    }));
  }
  return null;
}

function semiFixture(tier: number, tie: PlayoffTie, leg: 1 | 2): Fixture {
  if (leg === 1) return { tier, home: tie.low, away: tie.high, kind: 'playoffSemi1', options: {} };
  const [low, high] = tie.leg1!;
  return { tier, home: tie.high, away: tie.low, kind: 'playoffSemi2', options: { knockout: { aggregate: [high, low] } } };
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
  return { clubId, attack: c.attack, defence: c.defence, lineup: sport.lineup(c.squad) };
}

export interface RoundResult {
  fixture: Fixture;
  outcome: MatchOutcome;
}

/** Records a finished round's results and moves the season on. */
export function completeRound(career: Career, results: RoundResult[]): void {
  const s = career.season;
  for (const { fixture, outcome } of results) {
    for (const g of outcome.goals) if (!g.ownGoal) s.scorers[g.playerId] = (s.scorers[g.playerId] ?? 0) + 1;
    if (fixture.kind === 'league') recordResult(s.leagues[fixture.tier - 1].table, fixture.home, fixture.away, outcome);
    else recordPlayoff(s, fixture, outcome);
    if (fixture.home === career.playerClubId || fixture.away === career.playerClubId) {
      const record = playerMatch(career, s.round, fixture, outcome);
      s.playerMatches.push(record);
      const me = career.clubs[career.playerClubId];
      recordMatch((career.records ??= emptyRecords()), {
        goalsFor: record.goalsFor,
        goalsAgainst: record.goalsAgainst,
        opponent: career.clubs[record.opponentId].name,
        season: s.number,
        won: record.won,
        scorers: record.goals
          .filter((g) => g.for && !g.ownGoal)
          .map((g) => ({ id: g.playerId, name: me.squad.find((p) => p.id === g.playerId)?.name ?? 'Unknown' })),
      });
    }
  }
  s.round++;
  if (s.round === s.schedule.length) s.playoffs = drawPlayoffs(s);
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
    tie.leg2 = { score: [outcome.homeGoals, outcome.awayGoals], note: knockoutNote(outcome) };
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
export function endSeason(career: Career): SeasonEnd {
  if (career.pending) return career.pending;
  if (!isSeasonOver(career)) throw new Error('season is not over');
  const s = career.season;
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
    if (tier > 1) promoted[tier] = [...table.slice(0, PROMOTED_AUTOMATICALLY).map((r) => r.clubId), playoffWinners[tier]];
    if (tier < LEAGUE_COUNT) relegated[tier] = table.slice(LEAGUE_SIZE - RELEGATED).map((r) => r.clubId);
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
    const tier = tierOf[club.id];
    const gain = seasonGain(tier, s.expected[club.id], position[club.id], rating(club), rng.normal(0, RATING_TUNING.aiNoise));
    const promotedNow = newTierOf[club.id] < tier;
    const boost = promotedNow ? RATING_TUNING.promotedBoost : 0;
    Object.assign(club, statsFor(clamp(rating(club) - RATING_TUNING.decline + gain + boost, 0, MAX_STAT), club.style));
    bandPull(club, newTierOf[club.id]);
  }

  // Player club: decline now; the gain comes back as points to allocate.
  const me = career.clubs[career.playerClubId];
  const tier = tierOf[me.id];
  const pos = position[me.id];
  const boost = RATING_TUNING.difficultyBoost[career.difficulty];
  const gain = seasonGain(tier, s.expected[me.id], pos, rating(me), boost);
  const before = rating(me);
  const declineByStat = applyDecline(me, rng);
  const decline = before - rating(me);
  let points = Math.round(gain * RATING_TUNING.pointsPerRating);
  if (points < 0) {
    shiftRating(me, points / RATING_TUNING.pointsPerRating);
    points = 0;
  }
  points = Math.min(points, allocationCapacity(me));

  career.rng = rng.state;
  career.pending = {
    season: s.number,
    tier,
    position: pos,
    expected: s.expected[me.id],
    performance: s.expected[me.id] - pos,
    bonus: positionBonus(tier, pos),
    boost,
    decline,
    declineByStat,
    points,
    outcome: seasonOutcome(tier, pos, s.playoffs, me.id),
    newTier: newTierOf[me.id],
    nextLeagues,
    promoted,
    relegated,
    playoffWinners,
  };
  return career.pending;
}

function seasonOutcome(tier: number, pos: number, playoffs: Playoff[], id: number): SeasonOutcome {
  if (tier === 1 && pos === 1) return 'champion';
  if (tier > 1 && pos <= PROMOTED_AUTOMATICALLY) return 'promoted';
  const p = playoffs.find((x) => x.tier === tier);
  if (p?.winner === id) return 'playoffWinner';
  if (p?.semis.some((t) => t.high === id || t.low === id)) return 'playoffs';
  if (tier < LEAGUE_COUNT && pos > LEAGUE_SIZE - RELEGATED) return 'relegated';
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

/** The player's one summer decision: which side to strengthen. */
export type Focus = 'attack' | 'balanced' | 'defence';
export const FOCUSES: readonly Focus[] = ['attack', 'balanced', 'defence'];

/** Splits the points for a focus: `focusShare` towards the chosen side, or 50/50. */
export function focusAllocation(club: Club, points: number, focus: Focus): Record<Stat, number> {
  const share = RATING_TUNING.focusShare;
  const weights = focus === 'balanced' ? { attack: 1, defence: 1 } : focus === 'attack' ? { attack: share, defence: 1 - share } : { attack: 1 - share, defence: share };
  return fillAllocation(club, points, weights);
}

/** Spends the summer's points on a focus and starts the next season. */
export function chooseFocus(career: Career, focus: Focus): void {
  if (!career.pending) throw new Error('no points to allocate');
  allocatePoints(career, focusAllocation(career.clubs[career.playerClubId], career.pending.points, focus));
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
    throw new Error('each stat takes a whole number of points and stays at 99 or below');
  }
  if (spent !== pending.points) throw new Error(`allocate exactly ${pending.points} points, got ${spent}`);
  for (const s of STATS) me[s] += allocation[s];

  normalise(career.clubs, career.totalRating);
  const record = seasonRecord(career, pending);
  career.history.push(record);
  recordSeasonGoals((career.records ??= emptyRecords()), record.goalsFor, record.season);

  const rng = new Rng(career.rng);
  career.season = newSeason(pending.season + 1, pending.nextLeagues, career.clubs, rng);
  career.rival = pickRival(career);
  career.rng = rng.state;
  career.pending = null;
}

/** The career's history including a just-finished season still awaiting allocation. */
export function fullHistory(career: Career): SeasonRecord[] {
  return career.pending ? [...career.history, seasonRecord(career, career.pending)] : career.history;
}

function seasonRecord(career: Career, pending: SeasonEnd): SeasonRecord {
  const s = career.season;
  const me = career.clubs[career.playerClubId];
  const row = s.leagues[pending.tier - 1].table.find((r) => r.clubId === me.id)!;
  const top = me.squad
    .map((p) => ({ playerId: p.id, name: p.name, goals: s.scorers[p.id] ?? 0 }))
    .sort((a, b) => b.goals - a.goals)[0];
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
    ratingStart: s.ratingAtStart[me.id],
    ratingEnd: rating(me),
  };
}

/** Plays out the rest of the season instantly and closes it. */
export function playSeason(career: Career, sport: SportDefinition): SeasonEnd {
  while (nextRound(career)) playRound(career, sport);
  return endSeason(career);
}
