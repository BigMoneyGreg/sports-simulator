import type { FootballMatch, SideKey } from './match';
import { surname } from './names';

/** One line of the match report: a goal, a card, or a break in play. */
export interface TimelineItem {
  clock: string;
  kind: 'goal' | 'yellow' | 'red' | 'break';
  side?: SideKey;
  text: string;
  /** Running score after a goal, e.g. "2–1". */
  score?: string;
}

export interface TimelineContext {
  playerName(side: SideKey, playerId: number): string;
}

export function clock(minute: number, added: number): string {
  return added > 0 ? `${minute}+${added}'` : `${minute}'`;
}

/**
 * The match as a report: goals, cards and the whistles, oldest first. Chances
 * and other chatter are left out so it reads like a real match summary.
 */
export function timeline(m: FootballMatch, ctx: TimelineContext): TimelineItem[] {
  const items: TimelineItem[] = [];
  const other = (side: SideKey): SideKey => (side === 'home' ? 'away' : 'home');
  const name = (side: SideKey, id: number) => surname(ctx.playerName(side, id));
  const score = (s: [number, number]) => `${s[0]}–${s[1]}`;
  for (const e of m.events) {
    const at = clock(e.minute, e.added);
    switch (e.type) {
      case 'goal':
        items.push({
          clock: at,
          kind: 'goal',
          side: e.side,
          text: e.ownGoal ? `${name(other(e.side), e.playerId)} (og)` : name(e.side, e.playerId),
          score: score(e.score),
        });
        break;
      case 'yellow':
        items.push({ clock: at, kind: 'yellow', side: e.side, text: name(e.side, e.playerId) });
        break;
      case 'red':
        items.push({ clock: at, kind: 'red', side: e.side, text: `${name(e.side, e.playerId)}${e.secondYellow ? ' (2nd yellow)' : ''}` });
        break;
      case 'halftime':
        items.push({ clock: 'HT', kind: 'break', text: score(e.score) });
        break;
      case 'extraTime':
        items.push({ clock: '90', kind: 'break', text: 'Extra time' });
        break;
      case 'penalties': {
        const winner: SideKey = e.score[0] > e.score[1] ? 'home' : 'away';
        items.push({ clock: 'Pens', kind: 'break', side: winner, text: `${score(e.score)} on penalties` });
        break;
      }
      case 'fulltime':
        items.push({ clock: 'FT', kind: 'break', text: score(e.score) });
        break;
    }
  }
  return items;
}

/** The match clock as shown in the header and status bar. */
export function matchClock(m: FootballMatch): string {
  if (m.period === 'done') return m.penalties ? 'FT (pens)' : 'FT';
  const last = m.events[m.events.length - 1];
  if (last?.type === 'halftime' && m.minute === 45 && m.added === 0) return 'HT';
  if (m.minute === 0) return "0'";
  return clock(m.minute, m.added);
}
