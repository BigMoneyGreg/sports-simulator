import type { SportPresenter, TimelineItem } from '../../core/sport';
import { ordinal } from '../../shared/format';
import { surname } from '../football/names';
import { TRACK_TRAITS } from './data';
import { classified, type RaceMatch } from './match';

const place = (m: RaceMatch, clubId: number): string[] =>
  classified(m)
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.clubId === clubId)
    .map(({ c, i }) => (c.out ? 'DNF' : `P${i + 1}`));

export const grandPrixPresenter: SportPresenter<RaceMatch> = {
  terms: {
    name: 'Grand Prix',
    attack: 'Speed',
    defence: 'Reliability',
    clueScored: 'for grid position',
    clueConceded: 'for fewest retirements',
    diffShort: 'DNF',
    diffLong: 'Retirements',
    draws: false,
    scoreJoin: ' ',
    alert: 'OVERTAKE!',
    eventName: 'Overtake',
    noEventsYet: 'Lights out soon.',
    topScorer: 'Top points scorer',
    topScorers: 'Top points scorers',
    mostInSeason: 'Most points in a season',
    deciderShort: '',
    deciderLong: '',
    deciderLabel: '',
    howTo: [
      "Every summer some of the team move on, and the car loses ground, more in speed or in reliability. Who's leaving shows where most of it went: drivers and designers for speed, mechanics and engineers for reliability. Your season shows where you were already short.",
      "Whatever the question, one answer strengthens the car's speed and the other its reliability. A fast car that keeps stopping scores nothing, and a car that always finishes can still be too slow.",
    ],
    seasonLabels: { '90s': 'Season ~25 min', '5m': 'Season ~1½ hr', '15m': 'Season ~4 hr', '30m': 'Season ~8 hr' },
    race: { tier: 'GP', matchTab: 'Race', lostShort: 'Pod', lostLong: 'Podiums', scored: 'Average grid', conceded: 'Retirements', matches: 'races', worldName: 'Race of Nations' },
  },
  questions: {
    callUp: { prompt: 'People are moving on. Who do you bring in?' },
    coach: { prompt: 'Your team principal has left. Who takes over?' },
    formation: { prompt: "What does next year's car chase?", titles: { attack: 'Raw speed', defence: 'Bulletproof reliability' } },
    training: { prompt: 'Where does the winter budget go?', titles: { attack: 'Wind tunnel time', defence: 'Engine testing' } },
  },
  durations: ['90s', '5m', '15m', '30m'],
  clock: (m) => (m.lap >= m.laps ? 'FT' : m.lap === 0 ? 'Grid' : `L${m.lap}/${m.laps}`),
  timeline(m, ctx) {
    const items: TimelineItem[] = [];
    const name = (id: number) => surname(ctx.playerName('home', id));
    const at = (lap: number) => (lap ? `L${lap}` : 'Start');
    const line = (clock: string, text: string, kind: TimelineItem['kind'] = 'break') => items.push({ clock, kind, text });
    for (const e of m.events) {
      switch (e.type) {
        case 'start':
          line('Start', 'Lights out');
          break;
        case 'rain':
          line('Start', 'Rain on the track');
          break;
        case 'overtake':
          line(at(e.lap), `${name(e.driverId)} up to ${ordinal(e.place)}`);
          break;
        case 'lost':
          line(at(e.lap), `${name(e.driverId)} down to ${ordinal(e.place)}`);
          break;
        case 'pit':
          line(at(e.lap), `${name(e.driverId)} pits`);
          break;
        case 'out':
          line(at(e.lap), `${name(e.driverId)} out: ${e.why}`);
          break;
        case 'lead':
          line(at(e.lap), `${name(e.driverId)} takes the lead`);
          break;
        case 'safetyCar':
          line(at(e.lap), 'Safety car');
          break;
        case 'green':
          line(at(e.lap), 'Back to racing');
          break;
        case 'finish':
          line('FT', `${name(e.driverId)} wins`);
          break;
      }
    }
    return items;
  },
  score(m) {
    const [one, two] = place(m, m.home.clubId);
    return [one ?? '', two ?? ''];
  },
  situation: (m) => [m.wet ? 'Wet race' : '', m.safetyCar > 0 ? 'Safety car' : ''].filter(Boolean).join(' · ') || undefined,
  race(m, ctx) {
    const order = classified(m);
    const first = order[0];
    return {
      note: TRACK_TRAITS[m.track ?? '']?.note,
      rows: order.map((c, i) => ({
        place: i + 1,
        clubId: c.clubId,
        driver: surname(ctx.playerName('home', c.driverId)),
        gap: c.out ? 'Out' : i === 0 ? (m.lap >= m.laps ? 'Winner' : 'Leader') : `+${(c.time - first.time).toFixed(1)}`,
        moved: c.moved,
        out: !!c.out,
        pit: c.pitting,
      })),
    };
  },
  fullTime(m, _names, name) {
    const winner = classified(m)[0];
    return { note: undefined, scorers: `Won by ${name(winner.driverId)}` };
  },
  tally: (player, scored) => (player.position === 'DRV' || player.position === 'RES' ? (scored ? `${scored} points` : undefined) : undefined),
};
