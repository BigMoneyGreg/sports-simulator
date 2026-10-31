import { currentSlot, FOCUSES, leagueRounds, type Career, type Focus, type Playoff, type QuestionStyle, type SeasonRecord, type Slot } from '../core/career';
import { CHAMPIONSHIP_EVERY, CUP_NAMES, cupFixtures, cupRun, cupStages, stageLabel, stillIn, type Cup, type CupId, type CupTie } from '../core/cups';
import { emptyRecords, topScorers } from '../core/records';
import { goalRanks, LEAGUE_COUNT, LEAGUE_SIZE, recordResult, sortTable, zone, type Fixture, type TableRow } from '../core/league';
import { matchClock, timeline } from '../sports/football/commentary';
import { outcome, type SideKey } from '../sports/football/match';
import { NATIONS } from '../sports/football/data/nations';
import { naturalTier, shortName, surname } from '../sports/football/names';
import { role } from '../sports/football/squad';
import { ordinal } from '../shared/format';
import { DURATIONS, type Duration } from '../shared/view';
import type { CupRunView, CupsView, CupTieView, CupView, NationOption, CabinetView, QuestionView, ClubView, FixtureView, FullTimeView, GameView, HistoryRowView, LiveMatchView, PlayoffView, RecordsView, SeasonEndView, TableView, TeamBadge, View } from '../shared/view';
import { fullTimePause } from './game';
import type { Game } from './game';

export interface ViewOptions {
  fullTimeOverlay: boolean;
  durations?: Duration[];
  /** VS Code's display language, to suggest a country at setup. */
  language?: string;
}

export function buildView(game: Game, options: ViewOptions = { fullTimeOverlay: true }): View {
  const career = game.career;
  if (!career) {
    return {
      screen: 'setup',
      setup: { nations: nationOptions(), suggested: suggestNation(options.language), duration: game.duration, durations: options.durations ?? DURATIONS },
    };
  }
  const me = career.clubs[career.playerClubId];
  const season = career.season;
  const tier = season.leagues.find((l) => l.clubIds.includes(me.id))!.tier;
  const tables = buildTables(game);
  const myRow = tables[tier - 1].rows.find((r) => r.isPlayer)!;

  const view: GameView = {
    screen: 'game',
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
          const result = x.goalsFor > x.goalsAgainst ? 'W' : x.goalsFor < x.goalsAgainst ? 'L' : 'D';
          return { result, title: `${result} ${x.goalsFor}–${x.goalsAgainst} v ${shortName(career.clubs[x.opponentId])} (${x.home ? 'H' : 'A'})` };
        }),
      paused: game.paused,
      season: season.number,
      round: roundLabel(career),
      duration: game.duration,
      durations: options.durations ?? DURATIONS,
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
      history: [...career.history].reverse().map(historyRow),
    },
    waiting: career.pending ? 'seasonOver' : null,
    playoffs: season.playoffs.map((p) => playoffView(career, p)),
    seasonEnd: career.pending ? buildSeasonEnd(career, tables[tier - 1]) : null,
    cups: buildCups(career, !!game.live),
    fullTime: options.fullTimeOverlay ? buildFullTime(game) : null,
  };
  return view;
}

function buildFullTime(game: Game): FullTimeView | null {
  if (game.phase !== 'fullTime' || !game.lastMatch) return null;
  const career = game.career!;
  const { match, fixture } = game.lastMatch;
  const goals = match.events.flatMap((e) => (e.type === 'goal' ? [e] : []));
  const name = (id: number) => {
    const ids = [fixture.home, fixture.away];
    for (const clubId of ids) {
      const p = career.clubs[clubId].squad.find((x) => x.id === id);
      if (p) return surname(p.name);
    }
    return '?';
  };
  const list = (side: SideKey) =>
    goals
      .filter((g) => g.side === side)
      .map((g) => `${name(g.playerId)} ${g.minute}${g.added ? `+${g.added}` : ''}'${g.ownGoal ? ' og' : ''}`)
      .join(', ');
  const home = list('home');
  const away = list('away');
  const o = outcome(match);
  return {
    competition: competition(fixture, career),
    home: { ...badge(career, fixture.home), goals: match.home.goals },
    away: { ...badge(career, fixture.away), goals: match.away.goals },
    note: o.penalties ? `${o.penalties[0]}–${o.penalties[1]} on penalties` : o.extraTime ? 'after extra time' : undefined,
    scorers: [home, away].filter(Boolean).join(' · '),
    ms: fullTimePause(game.duration),
    key: `${career.season.number}-${career.season.round}`,
  };
}

/** One line for sharing: "Season 7 · Champions, League 3 · 26W 7D 5L · Promoted 🏆". */
export function summaryLine(r: Pick<SeasonRecord, 'season' | 'tier' | 'position' | 'won' | 'drawn' | 'lost' | 'outcome'>): string {
  const place = r.position === 1 ? `Champions, League ${r.tier}` : `${ordinal(r.position)}, League ${r.tier}`;
  const tail =
    r.outcome === 'promoted' ? 'Promoted' : r.outcome === 'playoffWinner' ? 'Promoted via the play-offs' : r.outcome === 'relegated' ? 'Relegated' : r.outcome === 'playoffs' ? 'Lost in the play-offs' : '';
  return [`Season ${r.season}`, place, `${r.won}W ${r.drawn}D ${r.lost}L`, tail].filter(Boolean).join(' · ') + (r.position === 1 ? ' 🏆' : '');
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

/** Long servants retire from international football; the rest are dropped. */
const RETIRES_AFTER = 5;

/** The player's summer comings and goings: who leaves, what they play and why, and the newcomers already settled. */
function squadChanges(career: Career): SeasonEndView['squad'] {
  const change = career.pending?.turnover?.find((t) => t.clubId === career.playerClubId);
  if (!change) return { leaving: [], arriving: [] };
  const me = career.clubs[career.playerClubId];
  const season = career.season.number;
  const leaving = change.out.map((id) => {
    const p = me.squad.find((x) => x.id === id)!;
    const seasons = season - (p.joined ?? 1) + 1;
    const goals = career.records?.scorers[id]?.goals ?? 0;
    const why = seasons >= RETIRES_AFTER ? `retires after ${seasons} seasons${goals ? `, ${goals} goal${goals === 1 ? '' : 's'}` : ''}` : 'dropped';
    return `${p.name} · ${role(p).label} · ${why}`;
  });
  // A call-up may take a newcomer's place, so those places wait for the answer.
  const open = Object.values(career.pending?.question?.callUps ?? {}).map((c) => c.replaces);
  return { leaving, arriving: change.in.filter((p) => !open.includes(p.id)).map((p) => p.name) };
}

const QUESTION_COPY: Record<QuestionStyle, { prompt: string; titles?: Record<Focus, string> }> = {
  callUp: { prompt: 'Retirements leave gaps. Who gets the call?' },
  coach: { prompt: 'Your assistant has moved on. Who do you bring in?' },
  formation: { prompt: 'Time for a new shape?', titles: { attack: 'Three up front', defence: 'A back five' } },
  training: { prompt: 'What does the summer camp work on?', titles: { attack: 'Finishing', defence: 'Defending' } },
};

/** The summer's question as the player sees it, attack answer first. */
export function summerQuestion(career: Career): QuestionView {
  const q = career.pending?.question ?? { style: 'formation' };
  const copy = QUESTION_COPY[q.style];
  return {
    prompt: copy.prompt,
    options: FOCUSES.map((focus) => {
      const person = q.people?.[focus];
      if (!person || copy.titles) return { focus, title: (copy.titles ?? QUESTION_COPY.formation.titles!)[focus] };
      return q.style === 'coach' ? { focus, title: `Appoint ${person.name}`, line: `former ${person.role}` } : { focus, title: `Call up ${person.name}`, line: person.role };
    }),
  };
}

/** For the notification: "Finlay Ross (striker) and 2 others leave." */
export function leaversLine(career: Career): string | undefined {
  const change = career.pending?.turnover?.find((t) => t.clubId === career.playerClubId);
  const first = change && career.clubs[career.playerClubId].squad.find((p) => p.id === change.out[0]);
  if (!change || !first) return undefined;
  const others = change.out.length - 1;
  return `${first.name} (${role(first).label})${others ? ` and ${others} other${others === 1 ? '' : 's'}` : ''} ${others ? 'leave' : 'leaves'}.`;
}

/** The season report's line for a competition: how far you went, and who won if it wasn't you. */
function seasonCupLine(career: Career, cup: Cup): CupRunView {
  const run = cupRun(cup, career.playerClubId) ?? "Didn't qualify";
  const winner = cup.winner !== undefined && cup.winner !== career.playerClubId ? ` · won by ${shortName(career.clubs[cup.winner])}` : '';
  return { name: CUP_NAMES[cup.id], run: run + winner };
}

function historyRow(r: SeasonRecord): HistoryRowView {
  return { season: r.season, tier: r.tier, position: r.position, record: `${r.won}W ${r.drawn}D ${r.lost}L`, points: r.points, outcome: r.outcome, cups: cupLine(r), summary: summaryLine(r) };
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
  return {
    biggestWin: r.biggestWin && score(r.biggestWin),
    heaviestDefeat: r.heaviestDefeat && score(r.heaviestDefeat),
    unbeaten: run(r.unbeaten, 'match', 'matches'),
    winning: run(r.winning, 'win', 'wins'),
    mostGoals: r.mostGoalsSeason && `${r.mostGoalsSeason.goals} (S${r.mostGoalsSeason.season})`,
    topScorers: topScorers(r).map((s) => `${s.name} ${s.goals}`),
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
  return { scored: row.goalsFor, conceded: row.goalsAgainst, scoredRank: ranks.scored, concededRank: ranks.conceded, average: Math.round(average), played: row.played };
}

function buildSeasonEnd(career: Career, table: TableView): SeasonEndView {
  const end = career.pending!;
  const s = career.season;
  const me = career.clubs[career.playerClubId];
  const league = s.leagues[end.tier - 1];
  const row = league.table.find((r) => r.clubId === me.id)!;
  const avgFor = league.table.reduce((t, r) => t + r.goalsFor, 0) / league.table.length;
  const avgAgainst = avgFor;

  // Runs across league matches, in order.
  const results = s.playerMatches.filter((m) => m.kind === 'league').map((m) => (m.goalsFor > m.goalsAgainst ? 'W' : m.goalsFor === m.goalsAgainst ? 'D' : 'L'));
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
  const bestRun = wins >= 3 ? `${wins} wins in a row` : `${unbeaten} unbeaten`;
  const worstRun = winless >= 2 ? `${winless} without a win` : 'never went two without a win';

  const scorer = me.squad
    .map((p) => ({ name: p.name, goals: s.scorers[p.id] ?? 0 }))
    .sort((a, b) => b.goals - a.goals)[0];


  const headlines: Record<NonNullable<SeasonEndView['outcome']>, string> = {
    champion: end.tier === 1 ? 'Champions of League 1!' : `League ${end.tier} champions!`,
    promoted: `${end.position === 1 ? 'Champions' : 'Promoted'}! Up to League ${end.newTier}.`,
    playoffWinner: `Play-off winners! Up to League ${end.newTier}.`,
    playoffs: `Play-off heartbreak. ${ordinal(end.position)} in League ${end.tier}.`,
    relegated: `Relegated to League ${end.newTier}.`,
  };
  const headline = end.outcome ? headlines[end.outcome] : `${ordinal(end.position)} in League ${end.tier}.`;

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
      record: `${row.won}W ${row.drawn}D ${row.lost}L`,
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      avgFor: Math.round(avgFor),
      avgAgainst: Math.round(avgAgainst),
      scoredRank: goalRanks(league.table, me.id).scored,
      concededRank: goalRanks(league.table, me.id).conceded,
      bestRun,
      worstRun,
      topScorer: scorer && scorer.goals > 0 ? `${scorer.name} (${scorer.goals})` : undefined,
      cups: [s.cup, s.championship].flatMap((cup) => (cup ? [seasonCupLine(career, cup)] : [])),
    },
    performance: end.performance > 0 ? 'above' : end.performance < 0 ? 'below' : 'expected',
    squad: squadChanges(career),
    question: summerQuestion(career),
    summary: summaryLine({ season: end.season, tier: end.tier, position: end.position, won: row.won, drawn: row.drawn, lost: row.lost, outcome: end.outcome }),
    canRetire: end.outcome === 'champion',
  };
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
    where: `League ${table.tier}, ${ordinal(row.pos)}`,
    record: played ? `Played ${played} · W${r.won} D${r.drawn} L${r.lost}` : 'Not played yet',
  };
}

let nationList: NationOption[] | undefined;
function nationOptions(): NationOption[] {
  nationList ??= NATIONS.map((n) => ({
    code: n.code,
    name: n.name,
    colours: n.colours,
    tier: naturalTier(n.code, LEAGUE_SIZE, LEAGUE_COUNT),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return nationList;
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
      return `MD ${slot.index + 1}/${leagueRounds(s)}`;
    case 'playoff':
      return ['Play-off semi-final, 1st leg', 'Play-off semi-final, 2nd leg', 'Play-off final'][slot.stage];
    default:
      return `${CUP_NAMES[slot.kind]} · ${stageLabel(slot.kind, cupStages(slot.kind)[slot.stage])}`;
  }
}

function competition(fixture: Fixture, career: Career): string {
  switch (fixture.kind) {
    case 'cup':
    case 'championship': {
      const stage = cupStages(fixture.kind)[fixture.stage!];
      const cup = fixture.kind === 'cup' ? career.season.cup : career.season.championship!;
      const group = 'group' in stage ? cup.groups.find((g) => g.table.some((r) => r.clubId === fixture.home)) : undefined;
      return `${CUP_NAMES[fixture.kind]} · ${group ? `Group ${group.name}` : stageLabel(fixture.kind, stage)}`;
    }
    case 'league':
      return `League ${fixture.tier}`;
    case 'playoffSemi1':
      return `League ${fixture.tier} play-off semi-final, 1st leg`;
    case 'playoffSemi2':
      return `League ${fixture.tier} play-off semi-final, 2nd leg`;
    case 'playoffFinal':
      return `League ${fixture.tier} play-off final`;
  }
}

function buildMatch(game: Game): LiveMatchView | null {
  const shown = game.shownMatch;
  const career = game.career!;
  if (!shown) return null;
  const { match, fixture } = shown;
  const playerName = (side: SideKey, id: number) => {
    const club = career.clubs[side === 'home' ? fixture.home : fixture.away];
    // Own goals are credited to the scoring side but the player belongs to the other.
    const other = career.clubs[side === 'home' ? fixture.away : fixture.home];
    return (club.squad.find((p) => p.id === id) ?? other.squad.find((p) => p.id === id))?.name ?? 'Unknown';
  };
  const view: LiveMatchView = {
    competition: competition(fixture, career),
    round: fixture.kind === 'league' ? roundLabel(career) : undefined,
    homeTown: shortName(career.clubs[fixture.home]),
    awayTown: shortName(career.clubs[fixture.away]),
    home: { ...badge(career, fixture.home), goals: match.home.goals, isPlayer: fixture.home === career.playerClubId },
    away: { ...badge(career, fixture.away), goals: match.away.goals, isPlayer: fixture.away === career.playerClubId },
    clock: matchClock(match),
    finished: match.period === 'done',
    timeline: timeline(match, { playerName }),
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
  const result = view.finished ? outcome(match) : undefined;
  if (result?.penalties) view.penalties = `Pens ${result.penalties[0]}–${result.penalties[1]}`;
  return view;
}

/** League tables, with live scores from the matchday in progress folded in. */
function buildTables(game: Game): TableView[] {
  const career = game.career!;
  const live = game.live;
  return career.season.leagues.map((league) => {
    let table: TableRow[] = league.table;
    const before = new Map(sortTable(league.table).map((r, i) => [r.clubId, i + 1]));
    let playing = false;
    if (live) {
      table = league.table.map((r) => ({ ...r, form: [...r.form] }));
      live.fixtures.forEach((f, i) => {
        if (f.kind !== 'league' || f.tier !== league.tier) return;
        const m = live.matches[i];
        if (m.minute === 0) return;
        recordResult(table, f.home, f.away, outcome(m));
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
        points: r.points,
        zone: zone(league.tier, i + 1),
        isPlayer: r.clubId === career.playerClubId,
        isRival: r.clubId === career.rival,
        move: (playing && before.get(r.clubId)! - (i + 1)) || undefined,
      })),
    };
  });
}

const STAGE_SHORT: Record<string, string> = { 'Round of 64': '64', 'Round of 32': '32', 'Round of 16': '16', 'Quarter-final': 'QF', 'Semi-final': 'SF', Final: 'F' };

/** A short label that fits beside "MD 38" ("C32", "WCQF", "PO SF1"), and the full one for hovering. */
function slotLabel(slot: Slot): { label: string; title: string } {
  if (slot.kind === 'league') return { label: `MD ${slot.index + 1}`, title: `League matchday ${slot.index + 1}` };
  if (slot.kind === 'playoff') {
    return [
      { label: 'PO SF1', title: 'Play-off semi-final, 1st leg' },
      { label: 'PO SF2', title: 'Play-off semi-final, 2nd leg' },
      { label: 'PO F', title: 'Play-off final' },
    ][slot.stage];
  }
  const stage = cupStages(slot.kind)[slot.stage];
  const title = `${CUP_NAMES[slot.kind]}: ${stageLabel(slot.kind, stage)}`;
  if ('group' in stage) return { label: `WC G${stage.group + 1}`, title };
  return { label: `${slot.kind === 'cup' ? 'C' : 'WC'}${STAGE_SHORT[stageLabel(slot.kind, stage)]}`, title };
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
      const f = cup && cupFixtures(cup, slot.stage).find((x) => x.home === me || x.away === me);
      if (f) out.push(fixtureView(career, slot, f, undefined, false));
    }
  });
  return out;
}

function fixtureView(career: Career, slot: Slot, f: Pick<Fixture, 'home' | 'away'>, played: Career['season']['playerMatches'][number] | undefined, current: boolean): FixtureView {
  const home = f.home === career.playerClubId;
  const opponentId = home ? f.away : f.home;
  const opponent = badge(career, opponentId);
  const { label, title } = slotLabel(slot);
  const view: FixtureView = { label, labelTitle: title, kind: slot.kind, opponent, town: shortName(career.clubs[opponentId]), home, current };
  if (played) {
    view.result = `${played.goalsFor}–${played.goalsAgainst}${played.penalties ? ` p (${played.penalties[0]}–${played.penalties[1]})` : played.extraTime ? ' aet' : ''}`;
    if (played.penalties) view.resultTitle = `${played.goalsFor}–${played.goalsAgainst}, ${played.won ? 'won' : 'lost'} ${played.penalties[0]}–${played.penalties[1]} on penalties`;
    const won = played.won ?? played.goalsFor > played.goalsAgainst;
    const lost = played.won === false || (played.won === undefined && played.goalsFor < played.goalsAgainst);
    view.outcome = won ? 'W' : lost ? 'L' : 'D';
  }
  return view;
}

function buildCups(career: Career, live: boolean): CupsView {
  const s = career.season;
  const next = Math.ceil(s.number / CHAMPIONSHIP_EVERY) * CHAMPIONSHIP_EVERY;
  const upcoming = next === s.number ? 'This summer · Leagues 1–2 qualify when the league season ends' : `Next: summer of Season ${next} · Leagues 1–2 qualify`;
  let championship: CupView;
  if (s.championship) championship = cupView(career, s.championship, live);
  else if (career.lastChampionship) {
    const last = cupView(career, career.lastChampionship);
    championship = { ...last, status: `Season ${career.lastChampionship.season} edition · ${last.status}`, next: upcoming };
  } else championship = { ...emptyCup(career, 'championship'), status: 'Not played yet', next: upcoming };
  const cup = cupView(career, s.cup, live);
  if (!s.cup.entrants.includes(career.playerClubId)) cup.next = "Last season's top 64 qualify";
  return { cup, championship };
}

function emptyCup(career: Career, id: CupId): CupView {
  const pastWinners = [...career.honours[id]].reverse().map((h) => ({ season: h.season, winner: badge(career, h.winner), runnerUp: badge(career, h.runnerUp) }));
  return { id, name: CUP_NAMES[id], status: '', groups: [], rounds: [], pastWinners };
}

/** One cup tie as shown, naming the winner when extra time or penalties settled it. */
export function cupTieView(career: Career, t: CupTie): CupTieView {
  const me = career.playerClubId;
  let decided: string | undefined;
  if (t.winner !== undefined) {
    const name = shortName(career.clubs[t.winner]);
    if (t.penalties) {
      const [w, l] = t.winner === t.home ? t.penalties : [t.penalties[1], t.penalties[0]];
      decided = `${name} win ${w}–${l} on penalties`;
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
  if (cup.season !== s.number) return undefined;
  const at = s.calendar.findIndex((slot, i) => i >= s.round && slot.kind === cup.id);
  if (at < 0) return undefined;
  const before = s.calendar.slice(0, at).reverse().find((slot) => slot.kind === 'league');
  if (cup.id === 'championship' || !before || before.kind !== 'league') return 'This summer, after the league season';
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
  const run = cupRun(cup, me);
  const nextTie = cup.rounds[cup.rounds.length - 1]?.ties.find((t) => (t.home === me || t.away === me) && t.winner === undefined);
  if (run === null) view.status = "You didn't qualify.";
  else if (run === 'Winners') view.status = `Winners! ${career.clubs[me].name} lift the ${CUP_NAMES[cup.id]}.`;
  else if (nextTie) {
    const opponent = shortName(career.clubs[nextTie.home === me ? nextTie.away : nextTie.home]);
    const venue = cup.id === 'championship' || run === 'Final' ? 'neutral' : nextTie.home === me ? 'home' : 'away';
    view.status = `Still in · ${run} v ${opponent} (${venue})`;
    view.next = whenPlayed(career, cup, live);
  } else if (stillIn(cup, me)) view.status = run === 'Group stage' ? 'In the group stage: the top two in each group go through.' : `Still in · ${run}`;
  else if (run === 'Final') view.status = 'Runners-up: beaten in the final.';
  else view.status = run === 'Group stage' ? 'Out in the group stage.' : `Knocked out in the ${run.toLowerCase()}.`;
  return view;
}

/** The score line shared by the status bar and the collapsed box: "SCO 1–1 RSA 59'" or "FT SCO 1–1 RSA". */
function scoreLine(game: Game): string | null {
  const career = game.career!;
  const shown = game.shownMatch;
  if (!shown) return null;
  const { match, fixture } = shown;
  const h = career.clubs[fixture.home].short;
  const a = career.clubs[fixture.away].short;
  if (match.period === 'done') return `FT ${h} ${match.home.goals}–${match.away.goals} ${a}`;
  return `${h} ${match.home.goals}–${match.away.goals} ${a} ${matchClock(match)}`;
}

export const SEASON_OVER = 'Season over: one decision waiting';

/** Text for the status bar; `goal` while a goal in the player's match is fresh. */
export function statusText(game: Game, goal = false): string | null {
  const career = game.career;
  if (!career) return '⚽ Start a career';
  if (career.pending) return `$(bell) ${SEASON_OVER}`;
  const score = scoreLine(game);
  if (!score) return null;
  return `⚽ ${game.paused ? '⏸ ' : ''}${goal && !score.startsWith('FT') ? 'GOAL! ' : ''}${score}`;
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
  const career = game.career;
  if (!career) return 'Sports Simulator: pick your country and start a career.';
  const me = career.clubs[career.playerClubId];
  const place = leaguePlace(career);
  const lines = [`**${me.name}** · League ${place.tier}, ${ordinal(place.position)} · ${place.played}/${leagueRounds(career.season)} played`];
  if (career.pending) lines.push(SEASON_OVER);
  else {
    lines.push(`Expected to finish ${ordinal(career.season.expected[me.id])}`);
    const shown = game.shownMatch;
    if (shown) lines.push(`${competition(shown.fixture, career)}: ${scoreLine(game)}${game.paused ? ' (paused)' : ''}`);
  }
  lines.push('Click to open');
  return lines.join('\n\n');
}

/** Shown beside the box's title while it's collapsed: "3rd · SCO 1–1 RSA 59'". */
export function collapsedText(game: Game): string | undefined {
  const career = game.career;
  if (!career) return undefined;
  if (career.pending) return 'Season over';
  const place = ordinal(leaguePlace(career).position);
  const score = scoreLine(game);
  return score ? `${place} · ${score}` : place;
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
    const goals = match.home.goals + match.away.goals;
    if (key === this.key && goals > this.goals) this.until = now + GoalWatch.MS;
    if (key !== this.key) this.until = 0;
    this.key = key;
    this.goals = goals;
    return now < this.until;
  }
}

