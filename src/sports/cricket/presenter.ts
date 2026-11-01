import type { InningsCard, SportPresenter, TimelineItem } from '../../core/sport';
import { surname } from '../football/names';
import { battersIn, overLabel, resultLine, TUNING, type CricketMatch, type Dismissal, type Side, type SideKey } from './match';

/** "156/4", or "130" when all out. */
function runs(s: Side): string {
  return s.wickets >= 10 ? String(s.goals) : `${s.goals}/${s.wickets}`;
}

/** A side's total as shown; empty until it has batted. */
function total(m: CricketMatch, key: SideKey): string {
  const yetToBat = m[key].balls === 0 && !(m.batting === key && m.period !== 'break');
  return yetToBat ? '' : runs(m[key]);
}

/** "c Ross b Singh", "b Singh", "lbw b Singh", "run out". */
function dismissal(d: Dismissal, name: (id: number) => string): string {
  if (d.how === 'run out') return 'run out';
  const bowler = `b ${name(d.bowler)}`;
  if (d.how === 'c') return d.fielder === undefined ? `c ${bowler}` : `c ${name(d.fielder)} ${bowler}`;
  return d.how === 'lbw' ? `lbw ${bowler}` : bowler;
}

function inningsCard(m: CricketMatch, key: SideKey, team: string, ctx: { playerName(side: SideKey, id: number): string }): InningsCard {
  const side = m[key];
  const otherKey: SideKey = key === 'home' ? 'away' : 'home';
  const fielding = m[otherKey];
  const name = (s: SideKey, id: number) => surname(ctx.playerName(s, id));
  const live = m.batting === key && (m.period === 'first' || m.period === 'second');
  const lineup = side.sheet.lineup;
  const inAt = battersIn(side);
  return {
    team,
    total: runs(side),
    overs: overLabel(side.balls),
    live,
    batters: lineup.slice(0, inAt).map(({ id }, i) => {
      const out = side.outs?.[id];
      return {
        name: name(key, id),
        how: out ? dismissal(out, (x) => name(otherKey, x)) : live ? 'batting' : 'not out',
        runs: side.runsBy[id] ?? 0,
        balls: side.ballsBy?.[id] ?? 0,
        out: !!out,
        striker: live && i === m.striker,
      };
    }),
    yetToBat: lineup.slice(inAt).map(({ id }) => name(key, id)),
    bowlers: Object.entries(fielding.bowled ?? {}).map(([id, f]) => ({ name: name(otherKey, Number(id)), overs: overLabel(f.balls), runs: f.runs, wickets: fielding.wicketsBy[Number(id)] ?? 0 })),
  };
}

export const cricketPresenter: SportPresenter<CricketMatch> = {
  terms: {
    name: 'Cricket',
    attack: 'Batting',
    defence: 'Bowling',
    clueScored: 'for runs an over',
    clueConceded: 'for runs conceded an over',
    diffShort: 'NRR',
    diffLong: 'Net run rate',
    draws: false,
    scoreJoin: ' v ',
    alert: 'WICKET!',
    eventName: 'Wicket',
    noEventsYet: 'No wickets yet.',
    topScorer: 'Top run scorer',
    topScorers: 'Top run scorers',
    mostInSeason: 'Most runs in a season',
    deciderShort: 'SO',
    deciderLong: 'in the super over',
    deciderLabel: 'Super over',
    howTo: [
      "Every summer some players retire or are dropped, and the squad loses strength, more in the batting or the bowling. Who's leaving shows where most of it went; your season shows where you were already short.",
      "Whatever the question, one answer strengthens the batting and the other the bowling. Let one fall too far behind and opponents exploit it, and at the top there's less room for a weak side.",
    ],
  },
  questions: {
    callUp: { prompt: 'Retirements leave gaps. Who gets the call?' },
    coach: { prompt: 'Your assistant has moved on. Who do you bring in?' },
    formation: { prompt: 'Time to change the balance of the side?', titles: { attack: 'An extra batter', defence: 'An extra bowler' } },
    training: { prompt: 'What does the summer camp work on?', titles: { attack: 'Power hitting', defence: 'Death bowling' } },
  },
  matchSeconds: { '25m': 130, '90m': 500, '4h': 1240, '8h': 2460 },
  clock(m) {
    if (m.period === 'done') return m.penalties ? 'FT (SO)' : 'FT';
    if (m.period === 'break') return 'Innings break';
    if (m.period === 'superOver') return 'Super over';
    return `Ov ${overLabel(m[m.batting].balls)}`;
  },
  shortClock(m) {
    if (m.period === 'break') return 'break';
    if (m.period === 'superOver') return 'SO';
    return overLabel(m[m.batting].balls);
  },
  timeline(m, ctx) {
    const items: TimelineItem[] = [];
    const name = (side: SideKey, id: number) => surname(ctx.playerName(side, id));
    const out = (side: SideKey): SideKey => (side === 'home' ? 'away' : 'home');
    for (const e of m.events) {
      switch (e.type) {
        case 'wicket': {
          const batter = name(out(e.side), e.batter);
          const bowler = name(e.side, e.bowler);
          const how = e.how === 'run out' ? 'run out' : e.how === 'lbw' ? `lbw ${bowler}` : `${e.how} ${bowler}`;
          items.push({ clock: e.over, kind: 'goal', side: e.side, text: `${batter} ${how}, ${e.runs}`, score: e.score });
          break;
        }
        case 'milestone':
          items.push({ clock: e.over, kind: 'minor', side: e.side, text: `${name(e.side, e.playerId)} ${e.runs}` });
          break;
        case 'inningsBreak':
          items.push({ clock: 'Inns', kind: 'break', text: e.text });
          break;
        case 'superOver':
          items.push({ clock: 'SO', kind: 'break', text: `Super over ${e.score[0]}–${e.score[1]}${e.decided ? '' : ', level again'}` });
          break;
        case 'result':
          items.push({ clock: 'FT', kind: 'break', text: `${runs(m.home)} v ${runs(m.away)}` });
          break;
      }
    }
    return items;
  },
  score: (m) => [total(m, 'home'), total(m, 'away')],
  situation(m, names) {
    const index = (key: SideKey) => (key === 'home' ? 0 : 1);
    if (m.period === 'done') return resultLine(m, names);
    if (m.period === 'superOver') return 'Tied: super over';
    if (m.period === 'break') return `${names[index(m.batting === 'home' ? 'away' : 'home')]} need ${m.target} to win`;
    const side = m[m.batting];
    if (m.target !== undefined) return `${names[index(m.batting)]} need ${m.target - side.goals} from ${TUNING.overs * 6 - side.balls} balls`;
    const toss = m.events[0];
    if (side.balls === 0 && toss?.type === 'toss') return `${names[index(toss.winner)]} won the toss and chose to ${toss.bat ? 'bat' : 'bowl'}`;
    return `${names[index(m.batting)]} batting first · ${((side.goals * 6) / Math.max(1, side.balls)).toFixed(1)} an over`;
  },
  details(m) {
    if ((m.period !== 'first' && m.period !== 'second') || !m.thisOver?.length) return [];
    return [`This over: ${m.thisOver.map((b) => (b === '0' ? '·' : b)).join(' ')}`];
  },
  scorecard(m, ctx, teams) {
    const second: SideKey = m.first === 'home' ? 'away' : 'home';
    const card = (key: SideKey) => inningsCard(m, key, teams[key === 'home' ? 0 : 1], ctx);
    return m.period === 'first' ? [card(m.first)] : m.period === 'break' ? [card(m.first)] : [card(second), card(m.first)];
  },
  fullTime(m, names, name) {
    const best = (tally: Record<number, number>) => Object.entries(tally).reduce<[string, number] | null>((b, [id, n]) => (!b || n > b[1] ? [id, n] : b), null);
    const star = (s: Side) => {
      const bat = best(s.runsBy);
      const bowl = best(s.wicketsBy);
      return [bat && `${name(Number(bat[0]))} ${bat[1]}`, bowl && `${name(Number(bowl[0]))} ${bowl[1]} wkt${bowl[1] === 1 ? '' : 's'}`].filter(Boolean).join(', ');
    };
    return { note: resultLine(m, names), scorers: [star(m.home), star(m.away)].filter(Boolean).join(' · ') };
  },
  tally(player, scored, wickets) {
    const bowler = player.number >= 9;
    const n = bowler ? wickets : scored;
    if (!n) return undefined;
    return bowler ? `${n} wicket${n === 1 ? '' : 's'}` : `${n.toLocaleString('en-GB')} run${n === 1 ? '' : 's'}`;
  },
};
