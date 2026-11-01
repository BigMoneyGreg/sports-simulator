import type { SportPresenter } from '../../core/sport';
import { matchClock, timeline } from './commentary';
import { outcome, type FootballMatch, type SideKey } from './match';

export const footballPresenter: SportPresenter<FootballMatch> = {
  terms: {
    name: 'Football',
    attack: 'Attack',
    defence: 'Defence',
    clueScored: 'for goals scored',
    clueConceded: 'for goals conceded',
    diffShort: 'GD',
    diffLong: 'Goal difference',
    draws: true,
    scoreJoin: '–',
    alert: 'GOAL!',
    eventName: 'Goal',
    noEventsYet: 'No goals yet.',
    topScorer: 'Top scorer',
    topScorers: 'Top scorers',
    mostInSeason: 'Most goals in a season',
    deciderShort: 'p',
    deciderLong: 'on penalties',
    deciderLabel: 'Pens',
    howTo: [
      "Every summer some players retire or are dropped, and the squad loses strength, more at one end of the pitch than the other. Who's leaving shows where most of it went; your season shows where you were already short.",
      "Whatever the question, one answer strengthens the attack and the other the defence. Let one side fall too far behind and opponents exploit it, and at the top there's less room for a weak side.",
    ],
    seasonLabels: { '30s': 'Season ~25 min', '2m': 'Season ~1½ hr', '5m': 'Season ~3¾ hr' },
  },
  questions: {
    callUp: { prompt: 'Retirements leave gaps. Who gets the call?' },
    coach: { prompt: 'Your assistant has moved on. Who do you bring in?' },
    formation: { prompt: 'Time for a new shape?', titles: { attack: 'Three up front', defence: 'A back five' } },
    training: { prompt: 'What does the summer camp work on?', titles: { attack: 'Finishing', defence: 'Defending' } },
  },
  durations: ['30s', '2m', '5m'],
  clock: matchClock,
  timeline,
  score: (m) => [String(m.home.goals), String(m.away.goals)],
  fullTime(m, _names, name) {
    const goals = m.events.flatMap((e) => (e.type === 'goal' ? [e] : []));
    const list = (side: SideKey) =>
      goals
        .filter((g) => g.side === side)
        .map((g) => `${name(g.playerId)} ${g.minute}${g.added ? `+${g.added}` : ''}'${g.ownGoal ? ' og' : ''}`)
        .join(', ');
    const o = outcome(m);
    return {
      note: o.penalties ? `${o.penalties[0]}–${o.penalties[1]} on penalties` : o.extraTime ? 'after extra time' : undefined,
      scorers: [list('home'), list('away')].filter(Boolean).join(' · '),
    };
  },
  tally: (_player, scored) => (scored ? `${scored} goal${scored === 1 ? '' : 's'}` : undefined),
};
