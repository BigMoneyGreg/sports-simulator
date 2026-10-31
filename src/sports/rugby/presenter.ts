import type { SportPresenter, TimelineItem } from '../../core/sport';
import { surname } from '../football/names';
import { outcome, type RugbyMatch, type SideKey } from './match';

export const rugbyPresenter: SportPresenter<RugbyMatch> = {
  terms: {
    name: 'Rugby',
    icon: '🏉',
    attack: 'Attack',
    defence: 'Defence',
    clueScored: 'for points scored',
    clueConceded: 'for points conceded',
    scoredWord: 'Scored',
    concededWord: 'conceded',
    diffShort: 'PD',
    diffLong: 'Points difference',
    draws: true,
    scoreJoin: '–',
    alert: 'TRY!',
    eventName: 'Try',
    noEventsYet: 'No scores yet.',
    topScorer: 'Top try scorer',
    topScorers: 'Top try scorers',
    mostInSeason: 'Most points in a season',
    deciderShort: 'k',
    deciderLong: 'in a kicking contest',
    deciderLabel: 'Kicks',
    howTo: [
      "Every summer some players retire or are dropped, and the squad loses strength, more among the backs or the forwards. Who's leaving shows where most of it went; your season shows where you were already short.",
      "Whatever the question, one answer strengthens the attack and the other the defence. Let one side fall too far behind and opponents exploit it, and at the top there's less room for a weak side.",
    ],
    seasonLabels: { '1m': 'Season 20 min', '2m': 'Season 35 min', '5m': 'Season 1½ hr' },
  },
  questions: {
    callUp: { prompt: 'Retirements leave gaps. Who gets the call?' },
    coach: { prompt: 'Your assistant has moved on. Who do you bring in?' },
    formation: { prompt: 'Time for a new game plan?', titles: { attack: 'Run it wide', defence: 'Tighten up' } },
    training: { prompt: 'What does the summer camp work on?', titles: { attack: 'Attack moves', defence: 'Defensive drills' } },
  },
  durations: ['1m', '2m', '5m'],
  clock(m) {
    if (m.period === 'done') return m.penalties ? 'FT (kicks)' : 'FT';
    const last = m.events[m.events.length - 1];
    if (last?.type === 'halftime' && m.minute === 40) return 'HT';
    return `${m.minute}'`;
  },
  timeline(m, ctx) {
    const items: TimelineItem[] = [];
    const name = (side: SideKey, id: number) => surname(ctx.playerName(side, id));
    const score = (s: [number, number]) => `${s[0]}–${s[1]}`;
    for (const e of m.events) {
      const at = `${e.minute}'`;
      switch (e.type) {
        case 'try':
          items.push({ clock: at, kind: 'goal', side: e.side, text: `${name(e.side, e.playerId)} try${e.converted ? ', converted' : ''}`, score: score(e.score) });
          break;
        case 'penalty':
          items.push({ clock: at, kind: 'minor', side: e.side, text: `${name(e.side, e.playerId)} penalty`, score: score(e.score) });
          break;
        case 'dropGoal':
          items.push({ clock: at, kind: 'minor', side: e.side, text: `${name(e.side, e.playerId)} drop goal`, score: score(e.score) });
          break;
        case 'yellow':
          items.push({ clock: at, kind: 'yellow', side: e.side, text: `${name(e.side, e.playerId)} (sin bin)` });
          break;
        case 'red':
          items.push({ clock: at, kind: 'red', side: e.side, text: name(e.side, e.playerId) });
          break;
        case 'halftime':
          items.push({ clock: 'HT', kind: 'break', text: score(e.score) });
          break;
        case 'extraTime':
          items.push({ clock: '80', kind: 'break', text: 'Extra time' });
          break;
        case 'kickingContest':
          items.push({ clock: 'Kicks', kind: 'break', side: e.score[0] > e.score[1] ? 'home' : 'away', text: `${score(e.score)} in the kicking contest` });
          break;
        case 'fulltime':
          items.push({ clock: 'FT', kind: 'break', text: score(e.score) });
          break;
      }
    }
    return items;
  },
  score: (m) => [String(m.home.goals), String(m.away.goals)],
  fullTime(m, _names, name) {
    const tries = (side: SideKey) => {
      const count = new Map<number, number>();
      for (const e of m.events) if (e.type === 'try' && e.side === side) count.set(e.playerId, (count.get(e.playerId) ?? 0) + 1);
      return [...count].map(([id, n]) => `${name(id)}${n > 1 ? ` ${n}` : ''}`).join(', ');
    };
    const o = outcome(m);
    const list = [tries('home'), tries('away')].filter(Boolean).join(' · ');
    return {
      note: o.penalties ? `${o.penalties[0]}–${o.penalties[1]} in the kicking contest` : o.extraTime ? 'after extra time' : undefined,
      scorers: list ? `Tries: ${list}` : '',
    };
  },
  tally: (_player, scored) => (scored ? `${scored} tr${scored === 1 ? 'y' : 'ies'}` : undefined),
};
