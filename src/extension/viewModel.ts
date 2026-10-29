import { FOCUSES, focusAllocation, leagueRounds, type Career, type Playoff, type SeasonRecord } from '../core/career';
import { emptyRecords, topScorers } from '../core/records';
import { recordResult, sortTable, zone, type Fixture, type TableRow } from '../core/league';
import { matchClock, timeline } from '../sports/football/commentary';
import { outcome, type SideKey } from '../sports/football/match';
import { surname, townName } from '../sports/football/names';
import { DURATIONS, type Duration } from '../shared/view';
import type { CabinetView, ClubView, FixtureView, FullTimeView, GameView, HistoryRowView, LiveMatchView, PlayoffView, RecordsView, SeasonEndView, TableView, TeamBadge, View } from '../shared/view';
import { fullTimePause } from './game';
import type { Game } from './game';

export interface ViewOptions {
  fullTimeOverlay: boolean;
  durations?: Duration[];
}

export function buildView(game: Game, suggestedName: () => string, options: ViewOptions = { fullTimeOverlay: true }): View {
  const career = game.career;
  if (!career) {
    return { screen: 'setup', setup: { suggestedName: suggestedName(), duration: game.duration, durations: options.durations ?? DURATIONS } };
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
          return { result, title: `${result} ${x.goalsFor}–${x.goalsAgainst} v ${townName(career.clubs[x.opponentId].name)} (${x.home ? 'H' : 'A'})` };
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
      difficulty: career.difficulty,
      season: season.number,
      expected: season.expected[me.id],
      rival: career.rival !== null && career.rival !== undefined ? badge(career, career.rival) : undefined,
      cabinet: cabinet(career.history),
      records: recordsView(career),
      history: [...career.history].reverse().map(historyRow),
    },
    waiting: career.pending ? 'seasonOver' : null,
    playoffs: season.playoffs.map((p) => playoffView(career, p)),
    seasonEnd: career.pending ? buildSeasonEnd(career, tables[tier - 1]) : null,
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

function historyRow(r: SeasonRecord): HistoryRowView {
  return { season: r.season, tier: r.tier, position: r.position, record: `${r.won}W ${r.drawn}D ${r.lost}L`, points: r.points, outcome: r.outcome, summary: summaryLine(r) };
}

function cabinet(history: SeasonRecord[]): CabinetView {
  const titles = new Map<number, number[]>();
  for (const h of history) if (h.position === 1) titles.set(h.tier, [...(titles.get(h.tier) ?? []), h.season]);
  return {
    titles: [...titles.entries()].sort((a, b) => a[0] - b[0]).map(([tier, seasons]) => ({ tier, seasons })),
    promotions: history.filter((h) => h.outcome === 'promoted' || h.outcome === 'playoffWinner').length,
    playoffWins: history.filter((h) => h.outcome === 'playoffWinner').length,
  };
}

function recordsView(career: Career): RecordsView {
  const r = career.records ?? emptyRecords();
  const score = (m: { goalsFor: number; goalsAgainst: number; opponent: string; season: number }) => `${m.goalsFor}–${m.goalsAgainst} v ${m.opponent} (S${m.season})`;
  const run = (x: { best: number; bestSeason?: number }, what: string) => (x.best ? `${x.best} ${what}${x.bestSeason ? ` (S${x.bestSeason})` : ''}` : '—');
  const mg = r.manager;
  return {
    biggestWin: r.biggestWin && score(r.biggestWin),
    heaviestDefeat: r.heaviestDefeat && score(r.heaviestDefeat),
    unbeaten: run(r.unbeaten, 'matches'),
    winning: run(r.winning, 'wins'),
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
  const legs = (tie: Playoff['semis'][number]) => [tie.leg1 && score(tie.leg1), tie.leg2 && score(tie.leg2.score, tie.leg2.note)].filter((x): x is string => !!x);
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
  return { scored: row.goalsFor, conceded: row.goalsAgainst, average: Math.round(average), played: row.played };
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
      perGame: Math.round(((row.goalsFor + row.goalsAgainst) / row.played) * 10) / 10,
      leaguePerGame: Math.round(((2 * avgFor) / row.played) * 10) / 10,
      bestRun,
      worstRun,
      topScorer: scorer && scorer.goals > 0 ? `${scorer.name} (${scorer.goals})` : undefined,
    },
    points: { total: end.points, base: 10, performance: end.performance, bonus: end.bonus, boosted: end.boost > 0 },
    options: FOCUSES.map((focus) => ({ focus, ...focusAllocation(me, end.points, focus) })),
    summary: summaryLine({ season: end.season, tier: end.tier, position: end.position, won: row.won, drawn: row.drawn, lost: row.lost, outcome: end.outcome }),
    canRetire: end.outcome === 'champion',
  };
}

function ordinal(n: number): string {
  const sfx = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (sfx[(v - 20) % 10] ?? sfx[v] ?? sfx[0]);
}

function badge(career: Career, clubId: number): TeamBadge {
  const c = career.clubs[clubId];
  return { name: c.name, short: c.short, colours: c.colours };
}

function roundLabel(career: Career): string {
  const s = career.season;
  if (career.pending) return 'Season over';
  const league = leagueRounds(s);
  if (s.round < league) return `MD ${s.round + 1}/${league}`;
  return ['Play-off semi-final, 1st leg', 'Play-off semi-final, 2nd leg', 'Play-off final'][s.round - league] ?? 'Play-offs';
}

function competition(fixture: Fixture): string {
  switch (fixture.kind) {
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
    competition: competition(fixture),
    round: fixture.kind === 'league' ? roundLabel(career) : undefined,
    homeTown: townName(career.clubs[fixture.home].name),
    awayTown: townName(career.clubs[fixture.away].name),
    home: { ...badge(career, fixture.home), goals: match.home.goals, isPlayer: fixture.home === career.playerClubId },
    away: { ...badge(career, fixture.away), goals: match.away.goals, isPlayer: fixture.away === career.playerClubId },
    clock: matchClock(match),
    finished: match.period === 'done',
    timeline: timeline(match, { playerName }),
  };
  if (match.knockout && fixture.kind === 'playoffSemi2') {
    const [h, a] = match.knockout.aggregate;
    view.aggregate = `Aggregate ${h + match.home.goals}–${a + match.away.goals}`;
  }
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
        town: townName(career.clubs[r.clubId].name),
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        gd: r.goalsFor - r.goalsAgainst,
        points: r.points,
        zone: zone(league.tier, i + 1),
        isPlayer: r.clubId === career.playerClubId,
        move: (playing && before.get(r.clubId)! - (i + 1)) || undefined,
      })),
    };
  });
}

function buildFixtures(career: Career, game: Game): FixtureView[] {
  const s = career.season;
  const me = career.playerClubId;
  const played = new Map(s.playerMatches.map((m) => [m.round, m]));
  const out: FixtureView[] = [];
  s.schedule.forEach((round, r) => {
    const f = round.find((x) => x.home === me || x.away === me)!;
    out.push(fixtureView(career, `MD ${r + 1}`, f, played.get(r), r === s.round && !!game.live));
  });
  // Play-off rounds the player is in, played or in progress.
  for (const m of s.playerMatches.filter((x) => x.kind !== 'league')) {
    const label = { playoffSemi1: 'SF 1st leg', playoffSemi2: 'SF 2nd leg', playoffFinal: 'Final', league: '' }[m.kind];
    out.push(fixtureView(career, label, { home: m.home ? me : m.opponentId, away: m.home ? m.opponentId : me }, m, false));
  }
  if (game.live && s.round >= s.schedule.length) {
    const f = game.live.fixtures[game.live.player];
    const label = { playoffSemi1: 'SF 1st leg', playoffSemi2: 'SF 2nd leg', playoffFinal: 'Final', league: '' }[f.kind];
    out.push(fixtureView(career, label, f, undefined, true));
  }
  return out;
}

function fixtureView(career: Career, label: string, f: Pick<Fixture, 'home' | 'away'>, played: Career['season']['playerMatches'][number] | undefined, current: boolean): FixtureView {
  const home = f.home === career.playerClubId;
  const opponent = badge(career, home ? f.away : f.home);
  const view: FixtureView = { label, opponent, town: townName(opponent.name), home, current };
  if (played) {
    view.result = `${played.goalsFor}–${played.goalsAgainst}${played.penalties ? ` (${played.penalties[0]}–${played.penalties[1]} p)` : ''}`;
    const won = played.won ?? played.goalsFor > played.goalsAgainst;
    const lost = played.won === false || (played.won === undefined && played.goalsFor < played.goalsAgainst);
    view.outcome = won ? 'W' : lost ? 'L' : 'D';
  }
  return view;
}

/** Text for the status bar. */
export function statusText(game: Game): string | null {
  const career = game.career;
  if (!career) return null;
  if (career.pending) return '$(bell) Season over — choose your summer focus';
  const shown = game.shownMatch;
  if (!shown) return null;
  const { match, fixture } = shown;
  const h = career.clubs[fixture.home].short;
  const a = career.clubs[fixture.away].short;
  const pause = game.paused ? '⏸ ' : '';
  if (match.period === 'done') return `⚽ ${pause}FT ${h} ${match.home.goals}–${match.away.goals} ${a}`;
  return `⚽ ${pause}${h} ${match.home.goals}–${match.away.goals} ${a} ${matchClock(match)}`;
}

