import { currentSlot, FOCUSES, formatOf, fullHistory, leagueRounds, type WorldEnd, type SeasonEnd, type Career, type Focus, type PlayerMatch, type Playoff, type SeasonRecord, type Slot } from '../core/career';
import { SPORT_IDS, type SportId } from '../core/format';
import { CUP_NAMES, nextWorldAfter, cupFixtures, cupRun, cupStages, stageLabel, stillIn, type Cup, type CupId, type CupTie } from '../core/cups';
import { better, emptyRecords, topScorers, type MatchRecord } from '../core/records';
import { FEAT_TITLES, greatest, trophies, type CareerSummary, type Feat } from '../core/honours';
import { difference, goalRanks, recordRace, recordResult, runRateAgainst, runRateFor, sortTable, zone, type Fixture, type TableRow } from '../core/league';
import { SPORTS, sportOf, type AnySport } from '../sports';
import { shortName, surname } from '../sports/football/names';
import { ordinal } from '../shared/format';
import type { CareerRowView, MatchBadge, WorldEndView, HonoursView, SportRowView, CupRunView, CupsView, CupTieView, CupView, NationOption, CabinetView, QuestionView, ClubView, FixtureView, FullTimeView, GameView, HistoryRowView, LiveMatchView, PlayoffView, RecordsView, SeasonEndView, TableView, TeamBadge, View } from '../shared/view';
import { fullTimePause } from './game';
import type { Game } from './game';

export interface ViewOptions {
  fullTimeOverlay: boolean;
  /** VS Code's display language, to suggest a country at setup. */
  language?: string;
}

export function buildView(game: Game, options: ViewOptions = { fullTimeOverlay: true }): View {
  const career = game.career;
  if (!career) {
    const { terms } = game.sport.present;
    return {
      screen: 'setup',
      setup: { sport: game.sportId, terms, leagues: game.sport.format.leagues, nations: nationOptions(game.sportId), suggested: suggestNation(options.language) },
    };
  }
  const sport = sportOf(career);
  const me = career.clubs[career.playerClubId];
  const season = career.season;
  const tier = season.leagues.find((l) => l.clubIds.includes(me.id))!.tier;
  const tables = buildTables(game);
  const myRow = tables[tier - 1].rows.find((r) => r.isPlayer)!;

  const view: GameView = {
    screen: 'game',
    sport: career.sport,
    terms: sport.present.terms,
    header: {
      club: badge(career, me.id),
      tier,
      position: myRow.pos,
      played: myRow.played,
      games: leagueRounds(season),
      form: season.playerMatches
        .filter((x) => x.kind === 'league')
        .slice(-5)
        .map((x) => {
          if (x.race) return { result: raceResult(x), label: x.race.places[0].out ? 'X' : String(x.race.places[0].place), title: placesText(x) };
          const result = matchResult(x);
          return { result, title: `${result} ${x.goalsFor}–${x.goalsAgainst} v ${shortName(career.clubs[x.opponentId])} (${x.home ? 'H' : 'A'})` };
        }),
      paused: game.paused,
      season: season.number,
      round: roundLabel(career),
    },
    match: buildMatch(game),
    tables,
    playerTier: tier,
    fixtures: buildFixtures(career, game),
    club: {
      ...badge(career, me.id),
      goals: seasonGoals(season.leagues[tier - 1].table, me.id),
      tier,
      season: season.number,
      expected: season.expected[me.id],
      rival: rivalView(career, tables),
      cabinet: cabinet(career.history),
      records: recordsView(career),
      history: [...career.history].reverse().map((r) => historyRow(r, sport)),
    },
    waiting: career.pending ? 'seasonOver' : null,
    playoffs: season.playoffs.map((p) => playoffView(career, p)),
    seasonEnd: career.pending ? buildSeasonEnd(career, tables[tier - 1]) : null,
    worldEnd: career.worldEnd?.played ? buildWorldEnd(career, career.worldEnd) : null,
    cups: buildCups(career, !!game.live),
    fullTime: options.fullTimeOverlay ? buildFullTime(game) : null,
  };
  return view;
}

const RIVAL_MATCH = 'Rival match';

function isRivalFixture(career: Career, fixture: Pick<Fixture, 'home' | 'away' | 'field'>): boolean {
  // Everyone in the league is in every race, so none of them is special.
  if (fixture.field) return false;
  return career.rival !== null && (fixture.home === career.rival || fixture.away === career.rival);
}

function buildFullTime(game: Game): FullTimeView | null {
  if (game.phase !== 'fullTime' || !game.lastMatch) return null;
  const career = game.career!;
  const sport = sportOf(career);
  const { match, fixture } = game.lastMatch;
  const name = (id: number) => {
    const ids = fixture.field ?? [fixture.home, fixture.away];
    for (const clubId of ids) {
      const p = career.clubs[clubId].squad.find((x) => x.id === id);
      if (p) return surname(p.name);
    }
    return '?';
  };
  const { note, scorers } = sport.present.fullTime(match, [shortName(career.clubs[fixture.home]), shortName(career.clubs[fixture.away])], name);
  return {
    competition: `${competition(fixture, career)}${isRivalFixture(career, fixture) ? ` · ${RIVAL_MATCH}` : ''}`,
    home: badge(career, fixture.home),
    away: badge(career, fixture.away),
    score: sport.present.score(match).filter((x, i) => x || !fixture.field || !i).join(sport.present.terms.scoreJoin),
    note,
    ...(fixture.field ? { solo: true } : {}),
    scorers,
    ms: fullTimePause(game.speed),
    key: `${career.sport}-${career.season.number}-${career.season.round}`,
  };
}

/** "26W 7D 5L", "7W 3L" in a sport without draws, or "4W 9 podiums" in a sport of races. */
function recordText(r: Pick<SeasonRecord, 'won' | 'drawn' | 'lost'>, draws = true, sport?: AnySport): string {
  if (sport?.format.race) return `${r.won}W ${r.lost} podiums`;
  return draws ? `${r.won}W ${r.drawn}D ${r.lost}L` : `${r.won}W ${r.lost}L`;
}

/** A race the player was in: W for a win, D for points, L for neither, as the form dots colour them. */
function raceResult(m: { race?: PlayerMatch['race'] }): 'W' | 'D' | 'L' {
  const best = m.race!.places[0];
  return best.place === 1 && !best.out ? 'W' : m.race!.places.some((p) => p.points > 0) ? 'D' : 'L';
}

/** "P3, P7", or "P3, DNF". */
function placesText(m: { race?: PlayerMatch['race'] }): string {
  return m.race!.places.map((p) => (p.out ? 'DNF' : `P${p.place}`)).join(', ');
}

/** W, D or L; a level score settled by a super over counts as the result it ended in. */
function matchResult(m: { goalsFor: number; goalsAgainst: number; won?: boolean }): 'W' | 'D' | 'L' {
  if (m.won !== undefined) return m.won ? 'W' : 'L';
  return m.goalsFor > m.goalsAgainst ? 'W' : m.goalsFor < m.goalsAgainst ? 'L' : 'D';
}

/** A league's name: "League 3", or "GP3" in a sport of races. */
function tierName(tier: number, sport?: AnySport): string {
  const race = sport?.present.terms.race;
  return race ? `${race.tier}${tier}` : `League ${tier}`;
}

/** One line for sharing: "Season 7 · Champions, League 3 · 26W 7D 5L · Promoted 🏆". */
export function summaryLine(r: Pick<SeasonRecord, 'season' | 'tier' | 'position' | 'won' | 'drawn' | 'lost' | 'outcome'>, draws = true, sport?: AnySport): string {
  const league = tierName(r.tier, sport);
  const place = r.position === 1 ? `Champions, ${league}` : `${ordinal(r.position)}, ${league}`;
  const tail =
    r.outcome === 'promoted' ? 'Promoted' : r.outcome === 'playoffWinner' ? 'Promoted via the play-offs' : r.outcome === 'relegated' ? 'Relegated' : r.outcome === 'playoffs' ? 'Lost in the play-offs' : '';
  return [`Season ${r.season}`, place, recordText(r, draws, sport), tail].filter(Boolean).join(' · ') + (r.position === 1 ? ' 🏆' : '');
}

const RUN_SHORT: Record<string, string> = {
  Winners: 'Won',
  Final: 'Final',
  'Semi-final': 'SF',
  'Quarter-final': 'QF',
  'Round of 16': 'R16',
  'Round of 32': 'R32',
  'Round of 64': 'R64',
  'Group stage': 'Groups',
};

function cupLine(r: Pick<SeasonRecord, 'cup' | 'championship'>): string | undefined {
  const parts = [r.cup && `Cup: ${RUN_SHORT[r.cup] ?? r.cup}`, r.championship && `WC: ${RUN_SHORT[r.championship] ?? r.championship}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** The top five of a season's tally, across every league. */
function seasonLeaders(career: Career, tally: Record<number, number> = {}, among?: number[]): SeasonEndView['leaders'][number]['rows'] {
  return career.clubs
    .filter((c) => !among || among.includes(c.id))
    .flatMap((c) => c.squad.map((p) => ({ club: c, name: p.name, count: tally[p.id] ?? 0 })))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((x) => ({ text: `${shortName(x.club)} – ${x.name} (${x.count})`, isPlayer: x.club.id === career.playerClubId }));
}

/** Long servants retire from international sport; the rest are dropped. */
const RETIRES_AFTER = 5;

/** The player's summer comings and goings: who leaves, what they play and why, and the newcomers already settled. */
function squadChanges(career: Career): SeasonEndView['squad'] {
  const change = career.pending?.turnover?.find((t) => t.clubId === career.playerClubId);
  if (!change) return { leaving: [], arriving: [] };
  const me = career.clubs[career.playerClubId];
  const sport = sportOf(career);
  const season = career.season.number;
  const leaving = change.out.map((id) => {
    const p = me.squad.find((x) => x.id === id)!;
    const seasons = season - (p.joined ?? 1) + 1;
    const tally = sport.present.tally(p, career.records?.scorers[id]?.goals ?? 0, career.records?.wicketTakers?.[id]?.goals ?? 0);
    const why = seasons >= RETIRES_AFTER ? `retires after ${seasons} seasons${tally ? `, ${tally}` : ''}` : 'dropped';
    return `${p.name} · ${sport.role(p).label} · ${why}`;
  });
  // A call-up may take a newcomer's place, so those places wait for the answer.
  const open = Object.values(career.pending?.question?.callUps ?? {}).map((c) => c.replaces);
  return { leaving, arriving: change.in.filter((p) => !open.includes(p.id)).map((p) => p.name) };
}

/** The summer's question as the player sees it, attack answer first. */
export function summerQuestion(career: Career): QuestionView {
  const q = career.pending?.question ?? { style: 'formation' };
  const questions = sportOf(career).present.questions;
  const copy: { prompt: string; titles?: Record<Focus, string> } = questions[q.style];
  return {
    prompt: copy.prompt,
    options: FOCUSES.map((focus) => {
      const person = q.people?.[focus];
      if (!person || copy.titles) return { focus, title: (copy.titles ?? questions.formation.titles)[focus] };
      return q.style === 'coach' ? { focus, title: `Appoint ${person.name}`, line: `former ${person.role}` } : { focus, title: `Call up ${person.name}`, line: person.role };
    }),
  };
}

/** The season report's line for a competition: how far you went, and who won if it wasn't you. */
function seasonCupLine(career: Career, cup: Cup): CupRunView {
  const run = cupRun(formatOf(career), cup, career.playerClubId) ?? "Didn't qualify";
  const winner = cup.winner !== undefined && cup.winner !== career.playerClubId ? ` · won by ${shortName(career.clubs[cup.winner])}` : '';
  return { name: cupName(career, cup.id), run: run + winner };
}

function historyRow(r: SeasonRecord, sport: AnySport): HistoryRowView {
  const { draws } = sport.present.terms;
  return { season: r.season, tier: r.tier, position: r.position, record: recordText(r, draws, sport), points: r.points, outcome: r.outcome, cups: cupLine(r), summary: summaryLine(r, draws, sport) };
}

function cabinet(history: SeasonRecord[]): CabinetView {
  const titles = new Map<number, number[]>();
  for (const h of history) if (h.position === 1) titles.set(h.tier, [...(titles.get(h.tier) ?? []), h.season]);
  return {
    titles: [...titles.entries()].sort((a, b) => a[0] - b[0]).map(([tier, seasons]) => ({ tier, seasons })),
    cups: history.filter((h) => h.cup === 'Winners').map((h) => h.season),
    championships: history.filter((h) => h.championship === 'Winners').map((h) => h.season),
    promotions: history.filter((h) => h.outcome === 'promoted' || h.outcome === 'playoffWinner').length,
    playoffWins: history.filter((h) => h.outcome === 'playoffWinner').length,
  };
}

function recordsView(career: Career): RecordsView {
  const r = career.records ?? emptyRecords();
  const score = (m: { goalsFor: number; goalsAgainst: number; opponent: string; season: number }) => `${m.goalsFor}–${m.goalsAgainst} v ${m.opponent} (S${m.season})`;
  const run = (x: { best: number; bestSeason?: number }, one: string, many: string) =>
    x.best ? `${x.best} ${x.best === 1 ? one : many}${x.bestSeason ? ` (S${x.bestSeason})` : ''}` : '—';
  const mg = r.manager;
  // A race has no margin to measure and no such thing as avoiding defeat.
  const race = !!formatOf(career).race;
  return {
    biggestWin: race ? undefined : r.biggestWin && score(r.biggestWin),
    heaviestDefeat: race ? undefined : r.heaviestDefeat && score(r.heaviestDefeat),
    unbeaten: race ? '0' : run(r.unbeaten, 'match', 'matches'),
    winning: run(r.winning, 'win', 'wins'),
    mostGoals: r.mostGoalsSeason && `${r.mostGoalsSeason.goals} (S${r.mostGoalsSeason.season})`,
    topScorers: topScorers(r).map((s) => `${s.name} ${s.goals}`),
    ...(r.wicketTakers ? { topWicketTakers: topScorers(r, 3, r.wicketTakers).map((s) => `${s.name} ${s.goals}`) } : {}),
    manager: {
      seasons: career.history.length,
      matches: mg.matches,
      won: mg.won,
      drawn: mg.drawn,
      lost: mg.lost,
      winPct: mg.matches ? Math.round((100 * mg.won) / mg.matches) : 0,
      titles: career.history.filter((h) => h.position === 1).length,
    },
  };
}

function playoffView(career: Career, p: Playoff): PlayoffView {
  const name = (id: number | undefined) => (id === undefined ? undefined : career.clubs[id].name);
  const score = (x: [number, number], note?: string) => `${x[0]}–${x[1]}${note ? ` ${note}` : ''}`;
  // Both legs read from the lower seed's side, as the tie is shown ("low v high").
  const legs = (tie: Playoff['semis'][number]) => {
    const out = tie.leg1 ? [score(tie.leg1)] : [];
    const second = tie.leg2;
    if (second) {
      const pens = second.penalties && `(${second.penalties[1]}–${second.penalties[0]} pens)`;
      out.push(score([second.score[1], second.score[0]], pens ?? (second.extraTime ? '(aet)' : undefined)));
    }
    return out;
  };
  return {
    tier: p.tier,
    semis: p.semis.map((tie) => ({ high: badge(career, tie.high), low: badge(career, tie.low), legs: legs(tie), winner: name(tie.winner) })),
    final: p.final && {
      home: badge(career, p.final.home),
      away: badge(career, p.final.away),
      result: p.final.score && score(p.final.score, p.final.note),
      winner: name(p.final.winner),
    },
    winner: name(p.winner),
  };
}

function seasonGoals(table: TableRow[], clubId: number): ClubView['goals'] {
  const row = table.find((r) => r.clubId === clubId)!;
  const average = table.reduce((t, r) => t + r.goalsFor, 0) / table.length;
  const ranks = goalRanks(table, clubId);
  return { scored: row.goalsFor, conceded: row.goalsAgainst, scoredRank: ranks.scored, concededRank: ranks.conceded, average: Math.round(average), played: row.played, ...scoreTexts(table, row) };
}

/** What a side has scored and conceded, and the league's averages, as shown: in cricket per over, as totals depend on who batted first. */
function scoreTexts(table: TableRow[], row: TableRow): { scoredText: string; concededText: string; avgForText: string; avgAgainstText: string } {
  const mean = (of: (r: TableRow) => number) => table.reduce((t, r) => t + of(r), 0) / table.length;
  if (row.raced || table.some((r) => r.raced)) {
    // Two cars each race, and grid places count up from the back of 20.
    const grid = (r: TableRow) => (r.played ? 21 - r.goalsFor / (2 * r.played) : 0);
    return { scoredText: grid(row).toFixed(1), concededText: String(row.goalsAgainst), avgForText: mean(grid).toFixed(1), avgAgainstText: mean((r) => r.goalsAgainst).toFixed(1) };
  }
  if (row.ballsFaced === undefined) {
    const average = String(Math.round(mean((r) => r.goalsFor)));
    return { scoredText: String(row.goalsFor), concededText: String(row.goalsAgainst), avgForText: average, avgAgainstText: average };
  }
  const rate = (x: number) => `${x.toFixed(2)} an over`;
  return { scoredText: rate(runRateFor(row)), concededText: rate(runRateAgainst(row)), avgForText: rate(mean(runRateFor)), avgAgainstText: rate(mean(runRateAgainst)) };
}

/** The difference column as shown: "+3", or a net run rate, "-0.42". */
function differenceText(row: TableRow): string {
  const d = difference(row);
  return `${d > 0 ? '+' : ''}${row.ballsFaced === undefined ? d : d.toFixed(2)}`;
}

/** How the season went against the rival, if they met. */
function rivalSeason(career: Career): { rival?: string } {
  const met = career.season.playerMatches.filter((m) => m.opponentId === career.rival).map((m) => (m.race ? (m.race.beatRival ? 'W' : 'L') : matchResult(m)));
  if (!met.length) return {};
  const count = (r: string) => met.filter((x) => x === r).length;
  const record = recordText({ won: count('W'), drawn: count('D'), lost: count('L') }, sportOf(career).present.terms.draws);
  return { rival: `${career.clubs[career.rival!].name} · ${record}` };
}

function buildSeasonEnd(career: Career, table: TableView): SeasonEndView {
  const end = career.pending!;
  const s = career.season;
  const { draws } = sportOf(career).present.terms;
  const me = career.clubs[career.playerClubId];
  const league = s.leagues[end.tier - 1];
  const row = league.table.find((r) => r.clubId === me.id)!;
  const avgFor = league.table.reduce((t, r) => t + r.goalsFor, 0) / league.table.length;
  const avgAgainst = avgFor;

  // Runs across league matches, in order.
  const races = s.playerMatches.filter((m) => m.kind === 'league' && m.race);
  const results = s.playerMatches.filter((m) => m.kind === 'league').map(matchResult);
  const longest = (ok: (r: string) => boolean) => {
    let best = 0;
    let cur = 0;
    for (const r of results) {
      cur = ok(r) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const unbeaten = longest((r) => r !== 'L');
  const wins = longest((r) => r === 'W');
  const winless = longest((r) => r !== 'W');
  const bestFinish = Math.min(...races.flatMap((m) => m.race!.places.filter((p) => !p.out).map((p) => p.place)), 99);
  const bestRun = races.length ? (bestFinish < 99 ? `Best finish: P${bestFinish}` : 'Never finished') : wins >= 3 ? `${wins} wins in a row` : `${unbeaten} unbeaten`;
  const worstRun = races.length ? `${row.goalsAgainst} retirement${row.goalsAgainst === 1 ? '' : 's'}` : winless >= 2 ? `${winless} without a win` : 'never went two without a win';

  const scorer = me.squad
    .map((p) => ({ name: p.name, goals: s.scorers[p.id] ?? 0 }))
    .sort((a, b) => b.goals - a.goals)[0];
  const bowler = s.wickets
    ? me.squad.map((p) => ({ name: p.name, wickets: s.wickets![p.id] ?? 0 })).sort((a, b) => b.wickets - a.wickets)[0]
    : undefined;

  const tierAt = (t: number) => tierName(t, sportOf(career));
  const headlines: Record<NonNullable<SeasonEndView['outcome']>, string> = {
    champion: end.tier === 1 ? `Champions of ${tierAt(1)}!` : `${tierAt(end.tier)} champions!`,
    promoted: `${end.position === 1 ? 'Champions' : 'Promoted'}! Up to ${tierAt(end.newTier)}.`,
    playoffWinner: `Play-off winners! Up to ${tierAt(end.newTier)}.`,
    playoffs: `Play-off heartbreak. ${ordinal(end.position)} in ${tierAt(end.tier)}.`,
    relegated: `Relegated to ${tierAt(end.newTier)}.`,
  };
  const headline = end.outcome ? headlines[end.outcome] : `${ordinal(end.position)} in ${tierAt(end.tier)}.`;

  const myPlayoff = s.playoffs.find((p) => p.tier === end.tier);
  return {
    season: end.season,
    tier: end.tier,
    newTier: end.newTier,
    position: end.position,
    expected: end.expected,
    outcome: end.outcome,
    headline,
    table,
    playoffs: myPlayoff && playoffView(career, myPlayoff),
    report: {
      record: recordText(row, draws, sportOf(career)),
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      avgFor: Math.round(avgFor),
      avgAgainst: Math.round(avgAgainst),
      ...scoreTexts(league.table, row),
      scoredRank: goalRanks(league.table, me.id).scored,
      concededRank: goalRanks(league.table, me.id).conceded,
      bestRun,
      worstRun,
      topScorer: scorer && scorer.goals > 0 ? `${scorer.name} (${scorer.goals})` : undefined,
      ...(bowler && bowler.wickets > 0 ? { topWickets: `${bowler.name} (${bowler.wickets})` } : {}),
      ...rivalSeason(career),
      cups: formatOf(career).race ? [] : [seasonCupLine(career, s.cup)],
    },
    leaders: [
      formatOf(career).race
        ? { label: `Drivers' championship, ${tierAt(end.tier)}`, rows: seasonLeaders(career, s.scorers, league.clubIds) }
        : { label: `${sportOf(career).present.terms.topScorers}, all leagues`, rows: seasonLeaders(career, s.scorers) },
      ...(s.wickets ? [{ label: `${sportOf(career).present.terms.secondTally?.many ?? 'Top wicket takers'}, all leagues`, rows: seasonLeaders(career, s.wickets) }] : []),
    ],
    performance: end.performance > 0 ? 'above' : end.performance < 0 ? 'below' : 'expected',
    squad: squadChanges(career),
    question: summerQuestion(career),
    summary: summaryLine({ season: end.season, tier: end.tier, position: end.position, won: row.won, drawn: row.drawn, lost: row.lost, outcome: end.outcome }, draws, sportOf(career)),
    canRetire: end.outcome === 'champion',
  };
}


function buildWorldEnd(career: Career, end: WorldEnd): WorldEndView {
  const me = career.clubs[career.playerClubId];
  const run = cupRun(formatOf(career), career.season.championship!, me.id);
  const world = cupName(career, 'championship');
  if (formatOf(career).race) {
    return { season: end.season, headline: run === 'Winners' ? `${me.name} win the ${world}!` : `${run} at the ${world}.`, winner: badge(career, end.winner), won: run === 'Winners' };
  }
  const headline =
    run === 'Winners'
      ? `World champions! ${me.name} lift the World Championship.`
      : run === 'Final'
        ? 'Runners-up at the World Championship.'
        : run === 'Group stage'
          ? 'Out in the World Championship group stage.'
          : `Knocked out of the World Championship in the ${(run ?? '').toLowerCase()}.`;
  return { season: end.season, headline, winner: badge(career, end.winner), won: run === 'Winners' };
}

/** A competition's name; a sport of races calls its big event something else. */
function cupName(career: Pick<Career, 'sport'>, id: CupId): string {
  return (id === 'championship' && SPORTS[career.sport].present.terms.race?.worldName) || CUP_NAMES[id];
}

function worldOver(career: Pick<Career, 'sport'>): string {
  return `${cupName(career, 'championship')} over`;
}

/** The short message when a World Championship starts. */
export function worldStarted(game: Game): string {
  const career = game.career!;
  const me = career.clubs[career.playerClubId];
  if (formatOf(career).race) return `${game.sport.present.terms.name}: ${me.name} line up for the ${cupName(career, 'championship')}, hosted by ${career.clubs[career.season.championship!.host ?? me.id].name}.`;
  const group = career.season.championship!.groups.find((g) => g.table.some((r) => r.clubId === me.id));
  const cup = career.season.championship!;
  const hosts = cup.host === undefined ? '' : cup.host === me.id ? ` ${me.name} are the hosts.` : ` Hosted by ${career.clubs[cup.host].name}.`;
  return `${game.sport.present.terms.name}: the World Championship begins. ${me.name} are in Group ${group!.name}.${hosts}`;
}

/** The short message when a World Championship ends. */
export function worldFinished(game: Game, end: WorldEnd): string {
  const career = game.career!;
  const name = game.sport.present.terms.name;
  if (end.played) return `${name}: ${buildWorldEnd(career, end).headline}`;
  return `${name}: ${career.clubs[end.winner].name} won the ${cupName(career, 'championship')}. Season ${career.season.number} begins.`;
}

/** Whether the game is stopped until the player does something. */
export function waitingOnPlayer(game: Game): boolean {
  return !!game.career && (!!game.career.pending || !!game.career.worldEnd?.played);
}

function rivalView(career: Career, tables: TableView[]): ClubView['rival'] {
  if (career.rival === null || career.rival === undefined) return undefined;
  const short = career.clubs[career.rival].short;
  const table = tables.find((t) => t.rows.some((r) => r.short === short))!;
  const row = table.rows.find((r) => r.short === short)!;
  const r = career.records?.rival ?? { won: 0, drawn: 0, lost: 0 };
  const played = r.won + r.drawn + r.lost;
  return {
    ...badge(career, career.rival),
    where: `${tierName(table.tier, sportOf(career))}, ${ordinal(row.pos)}`,
    record: played ? `Played ${played} · W${r.won}${sportOf(career).present.terms.draws ? ` D${r.drawn}` : ''} L${r.lost}` : 'Not played yet',
  };
}

const nationLists: Partial<Record<SportId, NationOption[]>> = {};
function nationOptions(sport: SportId): NationOption[] {
  return (nationLists[sport] ??= SPORTS[sport]
    .nations()
    .map((n) => ({ code: n.short, name: n.name, colours: n.colours, tier: n.tier }))
    // A sport of races lists its own history first, so it keeps its own order.
    .sort((a, b) => (SPORTS[sport].format.race ? 0 : a.name.localeCompare(b.name))));
}

/** VS Code display languages that point clearly to one country (plain English doesn't). */
const LANGUAGE_NATIONS: Record<string, string> = {
  'en-gb': 'ENG', de: 'GER', fr: 'FRA', es: 'ESP', it: 'ITA', 'pt-br': 'BRA', pt: 'POR', ja: 'JPN', ko: 'KOR',
  'zh-cn': 'CHN', 'zh-tw': 'TPE', pl: 'POL', tr: 'TUR', cs: 'CZE', hu: 'HUN', nl: 'NED',
};

function suggestNation(language?: string): string | undefined {
  return language ? LANGUAGE_NATIONS[language.toLowerCase()] : undefined;
}

function badge(career: Career, clubId: number): TeamBadge {
  const c = career.clubs[clubId];
  return { name: c.name, short: c.short, colours: c.colours };
}

function roundLabel(career: Career): string {
  const s = career.season;
  const slot = currentSlot(s);
  if (career.pending || !slot) return 'Season over';
  switch (slot.kind) {
    case 'league':
      return formatOf(career).race ? `Race ${slot.index + 1}/${leagueRounds(s)}` : `MD ${slot.index + 1}/${leagueRounds(s)}`;
    case 'playoff':
      return ['Play-off semi-final, 1st leg', 'Play-off semi-final, 2nd leg', 'Play-off final'][slot.stage];
    default:
      if (formatOf(career).race) return cupName(career, slot.kind);
      return `${CUP_NAMES[slot.kind]} · ${stageLabel(formatOf(career), slot.kind, cupStages(formatOf(career), slot.kind)[slot.stage])}`;
  }
}

function competition(fixture: Fixture, career: Career): string {
  switch (fixture.kind) {
    case 'cup':
    case 'championship': {
      const format = formatOf(career);
      if (format.race) return cupName(career, fixture.kind);
      const stage = cupStages(format, fixture.kind)[fixture.stage!];
      const cup = fixture.kind === 'cup' ? career.season.cup : career.season.championship!;
      const group = 'group' in stage ? cup.groups.find((g) => g.table.some((r) => r.clubId === fixture.home)) : undefined;
      return `${CUP_NAMES[fixture.kind]} · ${group ? `Group ${group.name}` : stageLabel(format, fixture.kind, stage)}`;
    }
    case 'league':
      return tierName(fixture.tier, sportOf(career));
    case 'playoffSemi1':
      return `League ${fixture.tier} play-off semi-final, 1st leg`;
    case 'playoffSemi2':
      return `League ${fixture.tier} play-off semi-final, 2nd leg`;
    case 'playoffFinal':
      return `League ${fixture.tier} play-off final`;
  }
}

const BADGES: Partial<Record<Fixture['kind'], MatchBadge>> = {
  cup: { label: 'Cup', kind: 'cup' },
  championship: { label: 'World', kind: 'world' },
  playoffSemi1: { label: 'Play-off', kind: 'playoff' },
  playoffSemi2: { label: 'Play-off', kind: 'playoff' },
  playoffFinal: { label: 'Play-off', kind: 'playoff' },
};

/** The badge for the match on show, if it isn't an ordinary league one. */
function matchBadge(game: Game): MatchBadge | undefined {
  return game.shownMatch ? BADGES[game.shownMatch.fixture.kind] : undefined;
}

/** What a badge leaves to say: "Round of 64", "Group B", "League 3 final". */
function badgeStage(fixture: Fixture, career: Career): string {
  if (fixture.field) return cupName(career, 'championship');
  return competition(fixture, career).replace(/^.* · /, '').replace(' play-off', '');
}

function buildMatch(game: Game): LiveMatchView | null {
  const shown = game.shownMatch;
  const career = game.career!;
  if (!shown) return null;
  const sport = sportOf(career);
  const { module, present } = sport;
  const { match, fixture } = shown;
  const playerName = (side: 'home' | 'away', id: number) => {
    // A race's drivers come from the whole field.
    const driver = fixture.field?.flatMap((c) => career.clubs[c].squad).find((p) => p.id === id);
    if (driver) return driver.name;
    const club = career.clubs[side === 'home' ? fixture.home : fixture.away];
    // Own goals are credited to the scoring side but the player belongs to the other.
    const other = career.clubs[side === 'home' ? fixture.away : fixture.home];
    return (club.squad.find((p) => p.id === id) ?? other.squad.find((p) => p.id === id))?.name ?? 'Unknown';
  };
  const towns: [string, string] = [shortName(career.clubs[fixture.home]), shortName(career.clubs[fixture.away])];
  const situation = present.situation?.(match, towns);
  const details = present.details?.(match, { playerName }) ?? [];
  const scorecard = present.scorecard?.(match, { playerName }, towns);
  const race = present.race?.(match, { playerName });
  const view: LiveMatchView = {
    competition: competition(fixture, career),
    ...(BADGES[fixture.kind] ? { badge: BADGES[fixture.kind], stage: badgeStage(fixture, career) } : {}),
    // Once the match is over the calendar has moved on, so its label would be the next match's.
    round: fixture.kind === 'league' && !module.isFinished(match) ? roundLabel(career) : undefined,
    homeTown: towns[0],
    awayTown: towns[1],
    rival: isRivalFixture(career, fixture),
    home: { ...badge(career, fixture.home), goals: match.home.goals, isPlayer: fixture.home === career.playerClubId },
    away: { ...badge(career, fixture.away), goals: match.away.goals, isPlayer: fixture.away === career.playerClubId },
    score: present.score(match),
    alerts: module.alerts(match),
    ...(situation ? { situation } : {}),
    ...(details.length ? { details } : {}),
    ...(scorecard ? { scorecard } : {}),
    ...(race
      ? {
          race: {
            venue: fixture.kind === 'league' ? (fixture.options.track ?? trackFor(career)) : cupName(career, 'championship'),
            ...(race.note ? { note: race.note } : {}),
            rows: race.rows.map((r) => ({ ...r, team: badge(career, r.clubId), mine: r.clubId === career.playerClubId, rival: r.clubId === career.rival })),
          },
        }
      : {}),
    clock: present.clock(match),
    finished: module.isFinished(match),
    timeline: present.timeline(match, { playerName }),
  };
  if (match.knockout && fixture.secondLeg) {
    const [h, a] = match.knockout.aggregate;
    view.aggregate = `Aggregate ${h + match.home.goals}–${a + match.away.goals}`;
  }
  if (!view.finished) {
    const me = career.clubs[career.playerClubId];
    const banned = me.squad.filter((p) => (career.suspended ?? []).includes(p.id)).map((p) => surname(p.name));
    if (banned.length && (fixture.home === me.id || fixture.away === me.id)) view.suspended = banned;
  }
  const result = view.finished ? module.outcome(match) : undefined;
  if (result?.penalties) view.penalties = `${present.terms.deciderLabel} ${result.penalties[0]}–${result.penalties[1]}`;
  return view;
}

/** League tables, with live scores from the matchday in progress folded in. */
function buildTables(game: Game): TableView[] {
  const career = game.career!;
  const live = game.live;
  const { module } = sportOf(career);
  const format = formatOf(career);
  return career.season.leagues.map((league) => {
    let table: TableRow[] = league.table;
    const before = new Map(sortTable(league.table).map((r, i) => [r.clubId, i + 1]));
    let playing = false;
    if (live) {
      table = league.table.map((r) => ({ ...r, form: [...r.form] }));
      live.fixtures.forEach((f, i) => {
        if (f.kind !== 'league' || f.tier !== league.tier) return;
        const m = live.matches[i];
        if (!module.countsLive(m)) return;
        const result = module.outcome(m);
        if (result.race) recordRace(table, result.race);
        else recordResult(table, f.home, f.away, result);
        playing = true;
      });
    }
    return {
      tier: league.tier,
      rows: sortTable(table).map((r, i) => ({
        pos: i + 1,
        short: career.clubs[r.clubId].short,
        name: career.clubs[r.clubId].name,
        town: shortName(career.clubs[r.clubId]),
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        gd: r.goalsFor - r.goalsAgainst,
        gdText: differenceText(r),
        points: r.points,
        zone: zone(format, league.tier, i + 1),
        isPlayer: r.clubId === career.playerClubId,
        isRival: r.clubId === career.rival,
        move: (playing && before.get(r.clubId)! - (i + 1)) || undefined,
      })),
      ...(format.race ? { drivers: driverRows(career, league.clubIds) } : {}),
    };
  });
}

/** A league's drivers by points this season, wins breaking ties. */
function driverRows(career: Career, clubIds: number[]): NonNullable<TableView['drivers']> {
  const s = career.season;
  const sport = sportOf(career);
  return clubIds
    .flatMap((id) => sport.lineup(career.clubs[id].squad).map((d) => ({ id: d.id, clubId: id, name: career.clubs[id].squad.find((p) => p.id === d.id)!.name })))
    .map((d) => ({ name: d.name, team: badge(career, d.clubId), points: s.scorers[d.id] ?? 0, wins: s.wins?.[d.id] ?? 0, isPlayer: d.clubId === career.playerClubId }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((d, i) => ({ pos: i + 1, ...d }));
}

/** A race saved before they carried their track: where it is from its place in the calendar. */
function trackFor(career: Career): string {
  const { tracks } = formatOf(career).race!;
  const slot = career.season.calendar[career.season.round];
  return tracks[(slot?.kind === 'league' ? slot.index : tracks.length - 1) % tracks.length];
}

const STAGE_SHORT: Record<string, string> = { 'Round of 64': '64', 'Round of 32': '32', 'Round of 16': '16', 'Quarter-final': 'QF', 'Semi-final': 'SF', Final: 'F' };

/** A short label that fits beside "MD 38" ("Cup 32", "WC QF", "PO SF1"), and the full one for hovering. */
function slotLabel(career: Career, slot: Slot): { label: string; title: string } {
  if (slot.kind === 'league' && formatOf(career).race) return { label: `R${slot.index + 1}`, title: `Race ${slot.index + 1}` };
  if (slot.kind === 'league') return { label: `MD ${slot.index + 1}`, title: `League matchday ${slot.index + 1}` };
  if (slot.kind === 'playoff') {
    return [
      { label: 'PO SF1', title: 'Play-off semi-final, 1st leg' },
      { label: 'PO SF2', title: 'Play-off semi-final, 2nd leg' },
      { label: 'PO F', title: 'Play-off final' },
    ][slot.stage];
  }
  const format = formatOf(career);
  if (format.race) return { label: 'RoN', title: cupName(career, slot.kind) };
  const stage = cupStages(format, slot.kind)[slot.stage];
  const title = `${CUP_NAMES[slot.kind]}: ${stageLabel(format, slot.kind, stage)}`;
  if ('group' in stage) return { label: `WC G${stage.group + 1}`, title };
  return { label: `${slot.kind === 'cup' ? 'Cup' : 'WC'} ${STAGE_SHORT[stageLabel(format, slot.kind, stage)]}`, title };
}

/** The player's matchdays in calendar order: every league round, plus cup and play-off matches once they're known. */
function buildFixtures(career: Career, game: Game): FixtureView[] {
  const s = career.season;
  const me = career.playerClubId;
  const played = new Map(s.playerMatches.map((m) => [m.round, m]));
  const out: FixtureView[] = [];
  s.calendar.forEach((slot, r) => {
    const current = r === s.round && !!game.live;
    if (slot.kind === 'league') {
      const f = s.schedule[slot.index].find((x) => x.home === me || x.away === me)!;
      out.push(fixtureView(career, slot, f, played.get(r), current));
      return;
    }
    const m = played.get(r);
    if (m) out.push(fixtureView(career, slot, { home: m.home ? me : m.opponentId, away: m.home ? m.opponentId : me }, m, false));
    else if (current) out.push(fixtureView(career, slot, game.live!.fixtures[game.live!.player], undefined, true));
    else if (r >= s.round && slot.kind !== 'playoff') {
      // A cup tie already drawn shows as soon as it's known.
      const cup = slot.kind === 'cup' ? s.cup : s.championship;
      const f = cup && cupFixtures(formatOf(career), cup, slot.stage).find((x) => x.home === me || x.away === me);
      if (f) out.push(fixtureView(career, slot, f, undefined, false));
    }
  });
  return out;
}

function fixtureView(career: Career, slot: Slot, f: Pick<Fixture, 'home' | 'away'>, played: Career['season']['playerMatches'][number] | undefined, current: boolean): FixtureView {
  const home = f.home === career.playerClubId;
  const opponentId = home ? f.away : f.home;
  const opponent = badge(career, opponentId);
  const { label, title } = slotLabel(career, slot);
  const { terms } = sportOf(career).present;
  const view: FixtureView = { label, labelTitle: title, kind: slot.kind, opponent, town: shortName(career.clubs[opponentId]), home, current };
  const { race } = formatOf(career);
  if (race) view.venue = slot.kind === 'league' ? race.tracks[slot.index % race.tracks.length] : cupName(career, 'championship');
  if (played?.race) {
    view.result = placesText(played);
    view.outcome = raceResult(played);
    return view;
  }
  if (played) {
    view.result = `${played.goalsFor}–${played.goalsAgainst}${played.penalties ? ` ${terms.deciderShort} (${played.penalties[0]}–${played.penalties[1]})` : played.extraTime ? ' aet' : ''}`;
    if (played.penalties) view.resultTitle = `${played.goalsFor}–${played.goalsAgainst}, ${played.won ? 'won' : 'lost'} ${played.penalties[0]}–${played.penalties[1]} ${terms.deciderLong}`;
    const won = played.won ?? played.goalsFor > played.goalsAgainst;
    const lost = played.won === false || (played.won === undefined && played.goalsFor < played.goalsAgainst);
    view.outcome = won ? 'W' : lost ? 'L' : 'D';
  }
  return view;
}

function buildCups(career: Career, live: boolean): CupsView {
  const s = career.season;
  const next = nextWorldAfter(formatOf(career), s.number);
  const who = formatOf(career).race ? 'its GP1 and GP2 qualify · one car each' : 'its Leagues 1–2 qualify';
  const upcoming = next === s.number ? `After this season · ${who}` : `Next: after Season ${next} · ${who}`;
  let championship: CupView;
  if (s.championship && s.championship.winner === undefined) championship = cupView(career, s.championship, live);
  else if (career.lastChampionship) {
    const last = cupView(career, career.lastChampionship);
    championship = { ...last, status: `Season ${career.lastChampionship.season} edition · ${last.status}`, next: upcoming };
  } else championship = { ...emptyCup(career, 'championship'), status: 'Not played yet', next: upcoming };
  if (formatOf(career).race) return { cup: null, championship };
  const cup = cupView(career, s.cup, live);
  if (!s.cup.entrants.includes(career.playerClubId)) cup.next = `Last season's top ${formatOf(career).cup.entrants} qualify`;
  return { cup, championship };
}

function emptyCup(career: Career, id: CupId): CupView {
  const pastWinners = [...career.honours[id]].reverse().map((h) => ({ season: h.season, winner: badge(career, h.winner), runnerUp: badge(career, h.runnerUp) }));
  return { id, name: cupName(career, id), status: '', groups: [], rounds: [], pastWinners };
}

/** One cup tie as shown, naming the winner when extra time or penalties settled it. */
export function cupTieView(career: Career, t: CupTie): CupTieView {
  const me = career.playerClubId;
  let decided: string | undefined;
  if (t.winner !== undefined) {
    const name = shortName(career.clubs[t.winner]);
    if (t.penalties) {
      const [w, l] = t.winner === t.home ? t.penalties : [t.penalties[1], t.penalties[0]];
      decided = `${name} win ${w}–${l} ${sportOf(career).present.terms.deciderLong}`;
    } else if (t.extraTime) decided = `${name} win after extra time`;
  }
  return {
    home: badge(career, t.home),
    away: badge(career, t.away),
    score: t.score && `${t.score[0]}–${t.score[1]}`,
    decided,
    winner: t.winner === undefined ? undefined : t.winner === t.home ? 'home' : 'away',
    mine: t.home === me || t.away === me,
  };
}

/** When the cup's next round is played: "After matchday 12", "Playing now", or "This summer" for the championship. */
function whenPlayed(career: Career, cup: Cup, live: boolean): string | undefined {
  const s = career.season;
  if (cup.id === 'championship') return live ? 'Playing now' : undefined;
  if (cup.season !== s.number) return undefined;
  const at = s.calendar.findIndex((slot, i) => i >= s.round && slot.kind === cup.id);
  if (at < 0) return undefined;
  const before = s.calendar.slice(0, at).reverse().find((slot) => slot.kind === 'league');
  if (!before || before.kind !== 'league') return undefined;
  if (at === s.round) return live ? 'Playing now' : 'Next up';
  return `After matchday ${before.index + 1}`;
}

function cupView(career: Career, cup: Cup, live = false): CupView {
  const me = career.playerClubId;
  const view = emptyCup(career, cup.id);
  view.groups = cup.groups.map((g) => ({
    name: g.name,
    rows: sortTable(g.table).map((r, i) => ({
      pos: i + 1,
      club: badge(career, r.clubId),
      town: shortName(career.clubs[r.clubId]),
      played: r.played,
      gd: r.goalsFor - r.goalsAgainst,
      gdText: differenceText(r),
      points: r.points,
      isPlayer: r.clubId === me,
      through: i < 2,
    })),
  }));
  view.rounds = [...cup.rounds].reverse().map((round) => ({
    name: round.name,
    ties: round.ties.map((t) => cupTieView(career, t)),
  }));
  if (cup.winner !== undefined) view.winner = badge(career, cup.winner);
  if (cup.host !== undefined) view.host = badge(career, cup.host);
  const run = cupRun(formatOf(career), cup, me);
  if (formatOf(career).race) {
    if (cup.host !== undefined) view.host = badge(career, cup.host);
    view.status = run === null ? "You didn't qualify." : run === 'Winners' ? `Winners! ${career.clubs[me].name} win the ${view.name}.` : cup.placed ? `Finished ${run}.` : 'On the grid.';
    view.rounds = [];
    return view;
  }
  const nextTie = cup.rounds[cup.rounds.length - 1]?.ties.find((t) => (t.home === me || t.away === me) && t.winner === undefined);
  if (run === null) view.status = "You didn't qualify.";
  else if (run === 'Winners') view.status = `Winners! ${career.clubs[me].name} lift the ${view.name}.`;
  else if (nextTie) {
    const opponent = shortName(career.clubs[nextTie.home === me ? nextTie.away : nextTie.home]);
    const hosted = cup.host !== undefined && (nextTie.home === cup.host || nextTie.away === cup.host);
    const venue = hosted ? (cup.host === me ? 'home' : 'away') : cup.id === 'championship' || run === 'Final' ? 'neutral' : nextTie.home === me ? 'home' : 'away';
    view.status = `Still in · ${run} v ${opponent} (${venue})`;
    view.next = whenPlayed(career, cup, live);
  } else if (stillIn(cup, me)) view.status = run === 'Group stage' ? 'In the group stage: the top two in each group go through.' : `Still in · ${run}`;
  else if (run === 'Final') view.status = 'Runners-up: beaten in the final.';
  else view.status = run === 'Group stage' ? 'Out in the group stage.' : `Knocked out in the ${run.toLowerCase()}.`;
  return view;
}

/** The score line shared by the status bar and the collapsed box: "SCO 1–1 RSA 59'" or "FT SCO 1–1 RSA". */
function scoreLine(game: Game, short = false): string | null {
  const career = game.career!;
  const shown = game.shownMatch;
  if (!shown) return null;
  const { match, fixture } = shown;
  const { module, present } = sportOf(career);
  const h = career.clubs[fixture.home].short;
  const a = career.clubs[fixture.away].short;
  const score = present.score(match);
  if (fixture.field) {
    const line = `${h} ${score.filter(Boolean).join(' ')}`;
    return module.isFinished(match) ? `FT ${line}` : `${line} ${present.clock(match)}`;
  }
  // Tight spaces join two totals with a dash too; a side yet to bat keeps the "v", or the dash would read as a minus.
  const join = short && score[0] && score[1] ? '–' : present.terms.scoreJoin;
  const line = `${h} ${score.join(join)} ${a}`.replace(/\s+/g, ' ');
  if (module.isFinished(match)) return `FT ${line}`;
  return `${line} ${short && present.shortClock ? present.shortClock(match) : present.clock(match)}`;
}

/** Emoji, as the status bar can't show the box's own icons and VS Code's own set has no sports. Two spaces follow them: one sits too close. */
const STATUS_ICONS: Record<SportId, string> = { football: '⚽', rugby: '🏉', cricket: '🏏', grandprix: '🏎' };

export const SEASON_OVER = 'Season over: one decision waiting';

/** Text for the status bar; `goal` while a goal in the player's match is fresh. */
export function statusText(game: Game, goal = false): string {
  const career = game.career;
  const { alert } = game.sport.present.terms;
  if (!career) return '$(trophy) Start a Sports Simulator career';
  if (career.pending) return `$(bell) ${SEASON_OVER}`;
  if (career.worldEnd?.played) return `$(bell) ${worldOver(career)}`;
  const score = scoreLine(game);
  const badge = matchBadge(game);
  // Paused between matches after a restart: nothing to show but where the career stands.
  if (!score) return `${STATUS_ICONS[game.sportId]}  ${game.paused ? '⏸ ' : ''}${standing(game)}`;
  const rival = game.shownMatch && isRivalFixture(career, game.shownMatch.fixture) ? '⚔ ' : '';
  return `${STATUS_ICONS[game.sportId]}  ${rival}${game.paused ? '⏸ ' : ''}${badge ? `${badge.label}: ` : ''}${goal && !score.startsWith('FT') ? `${alert} ` : ''}${score}${badge ? '' : ` · ${standing(game)}`}`;
}

/** Where the player's club stands in its league table before the matchday in progress. */
function leaguePlace(career: Career): { tier: number; position: number; played: number } {
  const league = career.season.leagues.find((l) => l.clubIds.includes(career.playerClubId))!;
  const table = sortTable(league.table);
  const position = table.findIndex((r) => r.clubId === career.playerClubId) + 1;
  return { tier: league.tier, position, played: table[position - 1].played };
}

/** The status bar's hover: the essentials of the box without opening it (Markdown). */
export function statusTooltip(game: Game): string {
  if (!game.career) return 'Sports Simulator: pick your country and start a career.';
  return [...careerLines(game), 'Click to open'].join('\n\n');
}

function careerLines(game: Game): string[] {
  const career = game.career!;
  const me = career.clubs[career.playerClubId];
  const place = leaguePlace(career);
  const lines = [`**${me.name}** · ${tierName(place.tier, sportOf(career))}, ${ordinal(place.position)} · ${place.played}/${leagueRounds(career.season)} played`];
  if (career.pending) lines.push(SEASON_OVER);
  else if (career.worldEnd?.played) lines.push(worldOver(career));
  else {
    lines.push(`Expected to finish ${ordinal(career.season.expected[me.id])}`);
    const shown = game.shownMatch;
    if (shown) lines.push(`${competition(shown.fixture, career)}${isRivalFixture(career, shown.fixture) ? ` · ${RIVAL_MATCH}` : ''}: ${scoreLine(game)}${game.paused ? ' (paused)' : ''}`);
  }
  return lines;
}

/** The league week being played, or the last one played while a cup match or a break is on. */
function leagueWeek(game: Game): number {
  const played = leaguePlace(game.career!).played;
  const live = game.live;
  return live && live.fixtures[live.player].kind === 'league' ? played + 1 : played;
}

/** Shown beside the box's title while it's collapsed, and on a minimised row: "3rd Wk 7/38 · SCO 1–1 RSA 59'". */
export function collapsedText(game: Game): string | undefined {
  const career = game.career;
  if (!career) return undefined;
  if (career.pending) return 'Season over';
  if (career.worldEnd?.played) return worldOver(career);
  const badge = matchBadge(game);
  if (badge) return `${badge.label} · ${rowLine(game)}`;
  const place = `${ordinal(leaguePlace(career).position)} Wk ${Math.max(1, leagueWeek(game))}/${leagueRounds(career.season)}`;
  const score = scoreLine(game, true);
  return score ? `${place} · ${score}` : place;
}

/** A minimised row's line, which has the room for a badge beside it: a tournament says where it's got to, and league place would only mislead. */
function rowLine(game: Game): string {
  const badge = matchBadge(game);
  if (!badge) return collapsedText(game)!;
  const score = scoreLine(game, true)!;
  return badge.kind === 'world' ? `${badgeStage(game.shownMatch!.fixture, game.career!)} · ${score}` : score;
}

/** "Wk 7/14 · 2nd in L3". */
function standing(game: Game): string {
  const career = game.career!;
  const { position, tier } = leaguePlace(career);
  return `Wk ${Math.max(1, leagueWeek(game))}/${leagueRounds(career.season)} · ${ordinal(position)} in ${game.sport.present.terms.race?.tier ?? 'L'}${tier}`;
}

/** The status bar's line for one of several careers: "🏉  Rugby: Wk 7/14 · 2nd in L3". */
function standingText(game: Game): string {
  const name = game.sport.present.terms.name;
  if (game.career!.pending) return `$(bell) ${name}: season over`;
  if (game.career!.worldEnd?.played) return `$(bell) ${name}: ${worldOver(game.career!)}`;
  const badge = matchBadge(game);
  const place = badge?.kind === 'world' ? badgeStage(game.shownMatch!.fixture, game.career!) : standing(game);
  return `${STATUS_ICONS[game.sportId]}  ${name}: ${game.paused ? '⏸ ' : ''}${badge ? `${badge.label} · ` : ''}${place}`;
}

/** The sports ticked in the settings. Unticking every one would leave an empty box, so that counts as all of them. */
export function enabledSports(setting: Partial<Record<SportId, boolean>> | undefined): SportId[] {
  const on = SPORT_IDS.filter((id) => setting?.[id] !== false);
  return on.length ? on : [...SPORT_IDS];
}

/** How the player's match stands for big moments, so a minimised row can flash like the open one. */
function playerMoments(game: Game): Pick<SportRowView, 'moments'> {
  const shown = game.shownMatch;
  if (!shown) return {};
  const { match, fixture } = shown;
  const [home, away] = game.sport.module.alerts(match);
  const atHome = fixture.home === game.career!.playerClubId;
  return { moments: { match: `${game.career!.season.number}-${fixture.kind}-${fixture.home}-${fixture.away}`, mine: atHome ? home : away, theirs: atHome ? away : home } };
}

/** Each sport's row in the box's list. */
export function sportRows(games: Game[]): SportRowView[] {
  return games.map((game) => {
    const career = game.career;
    const row = { id: game.sportId, name: game.sport.present.terms.name, paused: game.paused, waiting: !!career?.pending };
    if (!career) return { ...row, paused: false };
    const stopped = waitingOnPlayer(game);
    const line = stopped ? collapsedText(game)! : rowLine(game);
    const badge = stopped ? undefined : matchBadge(game);
    const world = !career.pending && (currentSlot(career.season)?.kind === 'championship' || game.shownMatch?.fixture.kind === 'championship' || !!career.worldEnd);
    const progress = career.pending ? 1 : leaguePlace(career).played / leagueRounds(career.season);
    return { ...row, club: career.clubs[career.playerClubId].name, waiting: stopped, ...(career.worldEnd?.played ? { waitingLine: `${worldOver(career)}: see how it went` } : {}), ...(world ? { world } : {}), line: game.paused && !stopped ? `⏸ ${line}` : line, ...(badge ? { badge } : {}), ...playerMoments(game), progress };
  });
}

/** The sport the corner follows: the one last opened, or if that has no career, the first that does. */
export function statusGame(games: Game[], followed: SportId): Game {
  // The one last opened may since have been hidden in the settings.
  const chosen = games.find((g) => g.sportId === followed) ?? games[0];
  return chosen.career ? chosen : (games.find((g) => g.career) ?? chosen);
}

export const STATUS_CYCLE_MS = 5000;

/** The sport the status bar shows now: with several careers it takes each in turn, and worked out from the time, every window agrees. */
export function cycledSport(games: Game[], followed: SportId, now = Date.now()): SportId {
  const stops = games.filter((g) => g.career);
  return stops.length > 1 ? stops[Math.floor(now / STATUS_CYCLE_MS) % stops.length].sportId : followed;
}

/** The short message when a season ends: the result, and that a decision is waiting. */
export function seasonFinished(game: Game, end: SeasonEnd): string {
  const league = tierName(end.tier, game.sport);
  const place = end.position === 1 ? `champions of ${league}` : `${ordinal(end.position)} in ${league}`;
  const tails: Partial<Record<NonNullable<SeasonEnd['outcome']>, string>> = { promoted: ', promoted', playoffWinner: ', promoted', relegated: ', relegated', playoffs: ', lost in the play-offs' };
  return `${game.sport.present.terms.name} season ${end.season} finished: ${place}${(end.outcome && tails[end.outcome]) ?? ''}. Decision waiting.`;
}

/** A running career, in the form the honours rules read. */
export function careerSummary(game: Game): CareerSummary | null {
  const c = game.career;
  return c && { club: c.clubs[c.playerClubId].name, sport: game.sportId, history: fullHistory(c), records: c.records };
}

const sportName = (sport: SportId) => SPORTS[sport].present.terms.name;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function careerRow(c: CareerSummary, live: boolean): CareerRowView {
  const t = trophies(c);
  const won = [t.worlds && plural(t.worlds, 'world title'), t.titles && plural(t.titles, `${tierName(1, SPORTS[c.sport])} title`), t.cups && plural(t.cups, 'Nations Cup')].filter(Boolean);
  const summary = won.length ? won.join(' · ') : t.best ? `Best: ${ordinal(t.best.position)} in ${tierName(t.best.tier, SPORTS[c.sport])}` : 'First season';
  return { club: c.club, sport: c.sport, sportName: sportName(c.sport), seasons: c.history.length, summary, live };
}

/** The best of every career in one sport; nothing to list until a record exists. */
function sportRecords(sport: SportId, careers: CareerSummary[]): HonoursView['records'][number] {
  const { terms } = SPORTS[sport].present;
  const mine = careers.filter((c) => c.sport === sport && c.records);
  const rows: { label: string; value: string }[] = [];
  let win: { match: MatchRecord; club: string } | undefined;
  for (const c of mine) {
    const m = c.records!.biggestWin;
    if (m && (!win || better(m, win.match))) win = { match: m, club: c.club };
  }
  const race = !!SPORTS[sport].format.race;
  if (win && !race) rows.push({ label: 'Biggest win', value: `${win.club} ${win.match.goalsFor}–${win.match.goalsAgainst} v ${win.match.opponent}` });
  const longest = (label: string, of: (c: CareerSummary) => number, one: string, many: string) => {
    const best = mine.reduce<CareerSummary | undefined>((b, c) => (of(c) > (b ? of(b) : 0) ? c : b), undefined);
    if (best) rows.push({ label, value: `${best.club}, ${plural(of(best), one, many)}` });
  };
  if (!race) longest('Unbeaten run', (c) => c.records!.unbeaten.best, 'match', 'matches');
  longest('Winning run', (c) => c.records!.winning.best, 'win', 'wins');
  const top = (label: string, tally: (c: CareerSummary) => Record<number, { name: string; goals: number }> | undefined) => {
    const all = mine.flatMap((c) => topScorers(c.records!, 1, tally(c) ?? {}).map((s) => ({ ...s, club: c.club })));
    const best = all.reduce<(typeof all)[number] | undefined>((b, s) => (!b || s.goals > b.goals ? s : b), undefined);
    if (best) rows.push({ label, value: `${best.name} (${best.club}), ${best.goals}` });
  };
  top(terms.topScorer, (c) => c.records!.scorers);
  top(terms.secondTally?.one ?? 'Top wicket taker', (c) => c.records!.wicketTakers);
  return { sport, name: terms.name, rows };
}

/** The Honours page: what's been earned, and how every career, running or ended, compares. */
export function buildHonours(live: CareerSummary[], past: CareerSummary[], feats: Feat[]): HonoursView {
  const everyone = [...live, ...past];
  const ranked = greatest(everyone).slice(0, 5);
  return {
    screen: 'honours',
    feats: feats.map((f) => ({ title: FEAT_TITLES[f.id], detail: f.detail })),
    greatest: everyone.length > 1 ? ranked.map((c) => careerRow(c, live.includes(c))) : [],
    records: SPORT_IDS.map((sport) => sportRecords(sport, everyone)).filter((r) => r.rows.length),
    past: [...past].reverse().map((c) => careerRow(c, false)),
  };
}

/** The Honours row's line; null until there's anything to look at: an honour, an ended career or a finished season. */
export function honoursLine(games: Game[], pastCareers: number, feats: number): string | null {
  const parts = [feats && plural(feats, 'honour'), pastCareers && plural(pastCareers, 'past career')].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return games.some((g) => g.career && (g.career.history.length || g.career.pending)) ? 'Records and greatest teams' : null;
}

/** The status bar and collapsed box: the live score of a lone career, or where the sport `showing` stands among several, a bell if another is waiting on the player, and every career on hover. The collapsed box stays on the sport followed. */
/** `live`: `showing` is the sport whose match is on, so its score shows even with several careers. */
export function boxStatus(games: Game[], followed: SportId, goal = false, showing = followed, live = false): { text: string | null; tooltip: string; description?: string; sport: SportId } {
  const game = statusGame(games, showing);
  const careers = games.filter((g) => g.career);
  const name = (g: Game) => g.sport.present.terms.name;
  const waitingElsewhere = careers.some((g) => g !== game && waitingOnPlayer(g));
  let text = careers.length > 1 && !live ? standingText(game) : statusText(game, goal);
  if (waitingElsewhere) text = text ? `${text} $(bell)` : `$(bell) ${SEASON_OVER}`;
  const tooltip = careers.length > 1 ? `${careers.map((g) => `${name(g)}: ${careerLines(g).join('\n\n')}`).join('\n\n---\n\n')}\n\nClick to open` : statusTooltip(game);
  return { text, tooltip, description: collapsedText(statusGame(games, followed)), sport: game.sportId };
}

/** Spots a goal in the player's match between updates, so the status bar can call it out for a few seconds. */
export class GoalWatch {
  static readonly MS = 4000;
  private key = '';
  private goals = 0;
  private until = 0;

  /** True while a goal in the player's match is fresh. */
  check(game: Game, now = Date.now()): boolean {
    const shown = game.live && game.shownMatch;
    if (!shown) return false;
    const { match, fixture } = shown;
    const key = `${game.career!.season.number}-${game.career!.season.round}-${fixture.home}-${fixture.away}`;
    const [home, away] = game.sport.module.alerts(match);
    const goals = home + away;
    if (key === this.key && goals > this.goals) this.until = now + GoalWatch.MS;
    if (key !== this.key) this.until = 0;
    this.key = key;
    this.goals = goals;
    return now < this.until;
  }
}

