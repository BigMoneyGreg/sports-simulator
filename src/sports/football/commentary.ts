import type { FootballMatch, MatchEvent, SideKey } from './match';
import { surname } from './names';

export interface CommentaryLine {
  clock: string;
  text: string;
  kind: 'goal' | 'card' | 'red' | 'chance' | 'whistle' | 'info';
  side?: SideKey;
}

export interface CommentaryContext {
  teamName(side: SideKey): string;
  playerName(side: SideKey, playerId: number): string;
}

export function clock(minute: number, added: number): string {
  return added > 0 ? `${minute}+${added}'` : `${minute}'`;
}

/** Picks a phrasing deterministically, so the same event always reads the same. */
function vary(options: string[], seed: number): string {
  return options[Math.abs(seed) % options.length];
}

function lineFor(e: MatchEvent, index: number, m: FootballMatch, ctx: CommentaryContext): CommentaryLine | null {
  const at = clock(e.minute, e.added);
  const seed = index * 31 + e.minute * 7 + e.added;
  const team = (side: SideKey) => ctx.teamName(side);
  const other = (side: SideKey): SideKey => (side === 'home' ? 'away' : 'home');
  const player = (side: SideKey, id: number) => surname(ctx.playerName(side, id));
  const score = (s: [number, number]) => `${team('home')} ${s[0]}–${s[1]} ${team('away')}`;

  switch (e.type) {
    case 'kickoff':
      return { clock: "0'", kind: 'whistle', text: vary([`We're under way: ${team('home')} v ${team('away')}.`, `Kick-off! ${team('home')} host ${team('away')}.`], seed) };
    case 'goal': {
      if (e.ownGoal) {
        const unlucky = player(other(e.side), e.playerId);
        return { clock: at, kind: 'goal', side: e.side, text: `OWN GOAL! ${unlucky} turns it into their own net. ${e.score[0]}–${e.score[1]}.` };
      }
      const who = player(e.side, e.playerId);
      const text = vary(
        [
          `GOAL! ${who} scores for ${team(e.side)}. ${e.score[0]}–${e.score[1]}.`,
          `GOAL! ${who} finds the bottom corner. ${e.score[0]}–${e.score[1]}.`,
          `GOAL! ${who} heads it in for ${team(e.side)}! ${e.score[0]}–${e.score[1]}.`,
          `GOAL! ${who} with a fine finish. ${e.score[0]}–${e.score[1]}.`,
        ],
        seed,
      );
      return { clock: at, kind: 'goal', side: e.side, text };
    }
    case 'chance': {
      const who = player(e.side, e.playerId);
      const text = {
        saved: vary([`${who} forces a save from the ${team(other(e.side))} keeper.`, `Good stop! ${who}'s effort is pushed away.`], seed),
        wide: vary([`${who} drags a shot wide.`, `${who} fires over the bar.`], seed),
        post: `${who} hits the woodwork!`,
        blocked: vary([`${who}'s shot is blocked.`, `${who} lets fly, but it's charged down.`], seed),
      }[e.result];
      return { clock: at, kind: 'chance', side: e.side, text };
    }
    case 'yellow':
      return { clock: at, kind: 'card', side: e.side, text: `Yellow card: ${player(e.side, e.playerId)} (${team(e.side)}).` };
    case 'red': {
      const who = player(e.side, e.playerId);
      const text = e.secondYellow ? `Second yellow for ${who}! ${team(e.side)} are down to ten.` : `RED CARD! ${who} is sent off.`;
      return { clock: at, kind: 'red', side: e.side, text };
    }
    case 'addedTime':
      return { clock: at, kind: 'info', text: `${e.amount} minute${e.amount === 1 ? '' : 's'} added on.` };
    case 'halftime':
      return { clock: 'HT', kind: 'whistle', text: `Half-time: ${score(e.score)}.` };
    case 'extraTime':
      return { clock: at, kind: 'whistle', text: 'All square. We go to extra time.' };
    case 'extraTimeHalftime':
      return { clock: 'ET', kind: 'whistle', text: `Half-time in extra time: ${score(e.score)}.` };
    case 'penalties': {
      const kicks = e.kicks.map((k) => `${surname(ctx.playerName(k.side, k.playerId))} ${k.scored ? '✓' : '✗'}`).join(', ');
      const winner = e.score[0] > e.score[1] ? 'home' : 'away';
      return { clock: 'PENS', kind: 'goal', side: winner, text: `${team(winner)} win ${Math.max(...e.score)}–${Math.min(...e.score)} on penalties. ${kicks}.` };
    }
    case 'fulltime':
      if (m.penalties) return null;
      return { clock: 'FT', kind: 'whistle', text: `Full-time: ${score(e.score)}.` };
  }
}

/**
 * The commentary feed for a match, oldest first. With `keyOnly` (30-second
 * matches) only goals, cards and whistles are kept so it stays readable.
 */
export function commentary(m: FootballMatch, ctx: CommentaryContext, keyOnly = false): CommentaryLine[] {
  const lines: CommentaryLine[] = [];
  m.events.forEach((e, i) => {
    if (keyOnly && (e.type === 'chance' || e.type === 'addedTime')) return;
    const line = lineFor(e, i, m, ctx);
    if (line) lines.push(line);
  });
  return lines;
}

/** The match clock as shown in the header and status bar. */
export function matchClock(m: FootballMatch): string {
  if (m.period === 'done') return m.penalties ? 'FT (pens)' : 'FT';
  const last = m.events[m.events.length - 1];
  if (last?.type === 'halftime' && m.minute === 45 && m.added === 0) return 'HT';
  if (m.minute === 0) return "0'";
  return clock(m.minute, m.added);
}
