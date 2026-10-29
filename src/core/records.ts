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
  /** All-time goals for the club, by player. */
  scorers: Record<number, { name: string; goals: number }>;
  manager: { matches: number; won: number; drawn: number; lost: number };
}

export function emptyRecords(): Records {
  return { unbeaten: { current: 0, best: 0 }, winning: { current: 0, best: 0 }, scorers: {}, manager: { matches: 0, won: 0, drawn: 0, lost: 0 } };
}

/** Records one of the player's matches. `won` decides knockout ties settled on penalties. */
export function recordMatch(r: Records, m: MatchRecord & { scorers: { id: number; name: string }[]; won?: boolean }): void {
  const diff = m.goalsFor - m.goalsAgainst;
  const result = diff > 0 ? 'W' : diff < 0 ? 'L' : 'D';
  r.manager.matches++;
  r.manager[result === 'W' ? 'won' : result === 'D' ? 'drawn' : 'lost']++;

  const record: MatchRecord = { goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, opponent: m.opponent, season: m.season };
  if (diff > 0 && (!r.biggestWin || better(record, r.biggestWin))) r.biggestWin = record;
  if (diff < 0 && (!r.heaviestDefeat || worse(record, r.heaviestDefeat))) r.heaviestDefeat = record;

  bump(r.unbeaten, result !== 'L', m.season);
  bump(r.winning, result === 'W', m.season);

  for (const s of m.scorers) {
    const entry = (r.scorers[s.id] ??= { name: s.name, goals: 0 });
    entry.goals++;
  }
}

export function recordSeasonGoals(r: Records, goals: number, season: number): void {
  if (!r.mostGoalsSeason || goals > r.mostGoalsSeason.goals) r.mostGoalsSeason = { goals, season };
}

export function topScorers(r: Records, count = 3): { name: string; goals: number }[] {
  return Object.values(r.scorers)
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
