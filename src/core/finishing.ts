// Who finishes the chances a team makes. A team's set scorers are its set
// scorers because of their role and their own hidden finishing; a team doing
// well feeds them, and one doing badly gets its scores from all over.

/** How evenly a team at the very bottom shares its scores: 0 would be all alike, 1 is by role alone. */
const FLATTEST = 0.4;
/** How far hidden finishing moves a player, as a spread of logarithms: most sit within about a third either way. */
const FINISHING_SPREAD = 0.3;
/** Games into a league season before the table counts in full. Until then, the team's strength stands in for it. */
const TABLE_SETTLED = 6;

/** A player's hidden finishing, the same every time: worked out from their id, so saves don't change. */
export function finishing(playerId: number): number {
  const hash = (salt: number) => {
    let h = Math.imul(playerId + salt, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    return ((h ^ (h >>> 13)) >>> 0) / 2 ** 32;
  };
  return Math.exp(FINISHING_SPREAD * Math.sqrt(-2 * Math.log(hash(1) + 1e-9)) * Math.cos(2 * Math.PI * hash(2)));
}

/**
 * How likely this player is to finish a chance, against teammates.
 * `standing` runs from 0 at the bottom of the league to 1 at the top. A role
 * that hardly ever scores (a goalkeeper) stays that way however the team is doing.
 */
export function finishWeight(roleWeight: number, playerId: number, standing = 1): number {
  const sharing = FLATTEST + (1 - FLATTEST) * standing;
  return (roleWeight < 0.1 ? roleWeight : roleWeight ** sharing) * finishing(playerId);
}

/** Where a team stands, 0 to 1: its league place and points difference, with its strength standing in early on. */
export function leagueStanding(sorted: { clubId: number; played: number; goalsFor: number; goalsAgainst: number }[], clubId: number, strengths: (id: number) => number): number {
  const last = sorted.length - 1;
  const me = sorted.find((r) => r.clubId === clubId);
  if (!me || last < 1) return 0.5;
  const difference = (r: { goalsFor: number; goalsAgainst: number }) => r.goalsFor - r.goalsAgainst;
  const above = (better: (r: (typeof sorted)[number]) => boolean) => 1 - sorted.filter(better).length / last;
  const strength = above((r) => strengths(r.clubId) > strengths(clubId));
  const table = (above((r) => sorted.indexOf(r) < sorted.indexOf(me)) + above((r) => difference(r) > difference(me))) / 2;
  const settled = Math.min(1, me.played / TABLE_SETTLED);
  return settled * table + (1 - settled) * strength;
}
