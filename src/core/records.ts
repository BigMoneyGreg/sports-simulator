// Career records, kept up to date as matches are played (past seasons' match
// lists aren't stored, so runs and scorers are tracked incrementally).

export interface MatchRecord {
  goalsFor: number;
  goalsAgainst: number;
  opponent: string;
  season: number;
}

export interface Records {
  biggestWin?: MatchRecord;
  heaviestDefeat?: MatchRecord;
  unbeaten: { current: number; best: number; bestSeason?: number };
  winning: { current: number; best: number; bestSeason?: number };
  mostGoalsSeason?: { goals: number; season: number };
  /** All-time goals for the club, by player (tries in rugby, runs in cricket). */
  scorers: Record<number, { name: string; goals: number }>;
  /** Cricket: all-time wickets, by player. */
  wicketTakers?: Record<number, { name: string; goals: number }>;
  manager: { matches: number; won: number; drawn: number; lost: number };
  /** All-time record against the rival; a shootout counts as a draw, as in real records. */
  rival: { won: number; drawn: number; lost: number };
}

export function emptyRecords(): Records {
  return {
    unbeaten: { current: 0, best: 0 },
    winning: { current: 0, best: 0 },
    scorers: {},
    manager: { matches: 0, won: 0, drawn: 0, lost: 0 },
    rival: { won: 0, drawn: 0, lost: 0 },
  };
}

/** Records one of the player's matches. `won` decides knockout ties settled on penalties. */
export function recordMatch(r: Records, m: MatchRecord & { scorers: { id: number; name: string; count?: number }[]; wickets?: { id: number; name: string; count: number }[]; won?: boolean; settled?: boolean; rival?: boolean }): void {
  const diff = m.goalsFor - m.goalsAgainst;
  // `settled`: the sport has no draws, so a tie that was played off counts as the win or loss it ended in.
  const result = m.settled ? (m.won ? 'W' : 'L') : diff > 0 ? 'W' : diff < 0 ? 'L' : 'D';
  const key = result === 'W' ? 'won' : result === 'D' ? 'drawn' : 'lost';
  r.manager.matches++;
  r.manager[key]++;
  if (m.rival) r.rival[key]++;

  const record: MatchRecord = { goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, opponent: m.opponent, season: m.season };
  if (result === 'W' && diff > 0 && (!r.biggestWin || better(record, r.biggestWin))) r.biggestWin = record;
  if (result === 'L' && diff < 0 && (!r.heaviestDefeat || worse(record, r.heaviestDefeat))) r.heaviestDefeat = record;

  bump(r.unbeaten, result !== 'L', m.season);
  bump(r.winning, result === 'W', m.season);

  for (const s of m.scorers) {
    const entry = (r.scorers[s.id] ??= { name: s.name, goals: 0 });
    entry.goals += s.count ?? 1;
  }
  for (const w of m.wickets ?? []) {
    const entry = ((r.wicketTakers ??= {})[w.id] ??= { name: w.name, goals: 0 });
    entry.goals += w.count;
  }
}

export function recordSeasonGoals(r: Records, goals: number, season: number): void {
  if (!r.mostGoalsSeason || goals > r.mostGoalsSeason.goals) r.mostGoalsSeason = { goals, season };
}

export function topScorers(r: Records, count = 3, tally: Records['scorers'] = r.scorers): { name: string; goals: number }[] {
  return Object.values(tally)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, count);
}

function bump(run: Records['unbeaten'], continues: boolean, season: number): void {
  run.current = continues ? run.current + 1 : 0;
  if (run.current > run.best) {
    run.best = run.current;
    run.bestSeason = season;
  }
}

/** Bigger margin wins; on equal margins, more goals scored. */
function better(a: MatchRecord, b: MatchRecord): boolean {
  const da = a.goalsFor - a.goalsAgainst;
  const db = b.goalsFor - b.goalsAgainst;
  return da > db || (da === db && a.goalsFor > b.goalsFor);
}

function worse(a: MatchRecord, b: MatchRecord): boolean {
  const da = a.goalsAgainst - a.goalsFor;
  const db = b.goalsAgainst - b.goalsFor;
  return da > db || (da === db && a.goalsAgainst > b.goalsAgainst);
}
