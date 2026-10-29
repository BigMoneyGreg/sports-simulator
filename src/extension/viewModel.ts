import { leagueRounds, type Career } from '../core/career';
import { rating } from '../core/club';
import { recordResult, sortTable, zone, type Fixture, type TableRow } from '../core/league';
import { commentary, matchClock } from '../sports/football/commentary';
import { outcome, type SideKey } from '../sports/football/match';
import { surname, townName } from '../sports/football/names';
import type { FixtureView, GameView, LiveMatchView, TableView, TeamBadge, View } from '../shared/view';
import type { Game } from './game';

const COMMENTARY_LINES = 40;

export function buildView(game: Game, suggestedName: () => string): View {
  const career = game.career;
  if (!career) return { screen: 'setup', setup: { suggestedName: suggestedName(), duration: game.duration } };
  const me = career.clubs[career.playerClubId];
  const season = career.season;
  const tier = season.leagues.find((l) => l.clubIds.includes(me.id))!.tier;
  const tables = buildTables(game);
  const myRow = tables[tier - 1].rows.find((r) => r.isPlayer)!;
  const myTable = season.leagues[tier - 1].table.find((r) => r.clubId === me.id)!;

  const view: GameView = {
    screen: 'game',
    header: {
      club: badge(career, me.id),
      tier,
      position: myRow.pos,
      form: myTable.form.slice(-5),
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
      rating: Math.round(rating(me)),
      stats: { attack: Math.round(me.attack), defence: Math.round(me.defence), chemistry: Math.round(me.chemistry) },
      tier,
      difficulty: career.difficulty,
      season: season.number,
      expected: season.expected[me.id],
    },
    waiting: career.pending ? 'seasonOver' : null,
  };
  return view;
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
  const mySide: SideKey = fixture.home === career.playerClubId ? 'home' : 'away';
  const lines = commentary(match, { teamName: (s) => career.clubs[s === 'home' ? fixture.home : fixture.away].name, playerName }, game.duration === '30s');
  const scorers = { home: [] as string[], away: [] as string[] };
  for (const e of match.events) {
    if (e.type !== 'goal') continue;
    const owner = e.ownGoal ? (e.side === 'home' ? 'away' : 'home') : e.side;
    const name = surname(playerName(owner, e.playerId));
    scorers[e.side].push(`${name} ${e.minute}${e.added ? `+${e.added}` : ''}'${e.ownGoal ? ' (og)' : ''}`);
  }
  const view: LiveMatchView = {
    competition: competition(fixture),
    home: { ...badge(career, fixture.home), goals: match.home.goals, isPlayer: fixture.home === career.playerClubId },
    away: { ...badge(career, fixture.away), goals: match.away.goals, isPlayer: fixture.away === career.playerClubId },
    clock: matchClock(match),
    finished: match.period === 'done',
    commentary: lines.slice(-COMMENTARY_LINES).reverse().map((l) => ({ clock: l.clock, text: l.text, kind: l.kind, mine: l.side === mySide })),
    scorers,
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
    const playing = new Set<number>();
    if (live) {
      table = league.table.map((r) => ({ ...r, form: [...r.form] }));
      live.fixtures.forEach((f, i) => {
        if (f.kind !== 'league' || f.tier !== league.tier) return;
        const m = live.matches[i];
        if (m.minute === 0) return;
        recordResult(table, f.home, f.away, outcome(m));
        playing.add(f.home).add(f.away);
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
        live: playing.has(r.clubId) || undefined,
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
  const view: FixtureView = { label, opponent: badge(career, home ? f.away : f.home), home, current };
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
  if (career.pending) return '$(bell) Season over — allocate points';
  const shown = game.shownMatch;
  if (!shown) return null;
  const { match, fixture } = shown;
  const h = career.clubs[fixture.home].short;
  const a = career.clubs[fixture.away].short;
  const pause = game.paused ? '⏸ ' : '';
  if (match.period === 'done') return `⚽ ${pause}FT ${h} ${match.home.goals}–${match.away.goals} ${a}`;
  return `⚽ ${pause}${h} ${match.home.goals}–${match.away.goals} ${a} ${matchClock(match)}`;
}

