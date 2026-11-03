import { describe, expect, it } from 'vitest';
import { allocatePoints, focusAllocation, formatOf, growWorld, newCareer, playSeason, teamSheet, type Career } from '../src/core/career';
import { cupFixtures, drawChampionship } from '../src/core/cups';
import { finishing, streakForm, streakOf } from '../src/core/finishing';
import { Game } from '../src/extension/game';
import { buildView, statusText } from '../src/extension/viewModel';
import { createMatch as createCricket, isFinished as cricketDone, step as cricketStep } from '../src/sports/cricket/match';
import { generateSquad as cricketSquad, lineup as cricketLineup } from '../src/sports/cricket/squad';
import { outcome, playMatch } from '../src/sports/football/match';
import { generateSquad, lineup } from '../src/sports/football/squad';
import { classified, createMatch as createRace, isFinished as raceDone, step as raceStep } from '../src/sports/grandprix/match';
import { createMatch as createRugby, isFinished as rugbyDone, outcome as rugbyOutcome, step as rugbyStep } from '../src/sports/rugby/match';
import { generateSquad as rugbySquad, lineup as rugbyLineup } from '../src/sports/rugby/squad';
import { rating } from '../src/core/club';
import { CRICKET_SIX, FORMATS, SPORT_IDS } from '../src/core/format';
import { ladder } from '../src/core/league';
import { climb, driftLevel, RATING_TUNING } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { SPORTS } from '../src/sports';

const seasons = (c: Career, count: number, each: (c: Career) => void = () => {}) => {
  const sport = SPORTS[c.sport];
  for (let i = 0; i < count; i++) {
    const before = c.clubs.map(rating);
    const end = playSeason(c, sport);
    allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, 'attack'));
    c.worldEnd = null;
    c.clubs.forEach((club, id) => {
      if (!club.isPlayer) club.base = club.base ?? before[id];
    });
    each(c);
  }
};

describe('the world ladder', () => {
  it.each(SPORT_IDS)('%s: runs from 99 down, always falling, wider at the top than the bottom', (id) => {
    const slots = ladder(FORMATS[id]);
    expect(slots).toHaveLength(FORMATS[id].leagues * FORMATS[id].leagueSize);
    expect(slots[0]).toBe(99);
    expect(slots[slots.length - 1]).toBeLessThanOrEqual(2);
    slots.forEach((r, i) => i && expect(r).toBeLessThan(slots[i - 1]));
    const third = Math.floor(slots.length / 3);
    expect(slots[0] - slots[third]).toBeGreaterThan(slots[slots.length - third - 1] - slots[slots.length - 1]);
  });

  it('smooths rugby\'s top: no cliff between the first few', () => {
    const slots = ladder(FORMATS.rugby);
    for (let i = 1; i < 6; i++) expect(slots[i - 1] - slots[i]).toBe(3);
  });

  it('shuffles who gets each slot within a pool from career to career', () => {
    const tops = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const c = newCareer({ rating: 10, seed, team: 'AUT' }, SPORTS.rugby);
      tops.add(c.clubs.reduce((a, b) => (rating(b) > rating(a) ? b : a)).short);
    }
    expect(tops.size).toBeGreaterThanOrEqual(4);
  });
});

describe('a nation over the years', () => {
  it('keeps the curve\'s shape for decades, rather than fading', () => {
    const c = newCareer({ rating: 50, seed: 11 }, SPORTS.rugby);
    seasons(c, 15);
    const ai = c.clubs.filter((x) => !x.isPlayer).map(rating).sort((a, b) => b - a);
    expect(ai[0]).toBeGreaterThan(90);
    expect(ai[0] - ai[12]).toBeGreaterThan(20);
    expect(ai[35] - ai[46]).toBeLessThan(25);
  });

  it('never lets an AI team move more than the swing in one summer, before the world is rebalanced', () => {
    const c = newCareer({ rating: 50, seed: 12 }, SPORTS.rugby);
    let biggest = 0;
    let before = c.clubs.map(rating);
    seasons(c, 8, (x) => {
      x.clubs.forEach((club, id) => {
        if (!club.isPlayer) biggest = Math.max(biggest, Math.abs(rating(club) - before[id]));
      });
      before = x.clubs.map(rating);
    });
    // The rebalancing and the league pull can add a little on top.
    expect(biggest).toBeLessThan(RATING_TUNING.maxSwing + 6);
  });

  it('now and then gives a nation a golden generation or a bad spell that moves its level for years', () => {
    const rng = new Rng(5);
    let eras = 0;
    let ups = 0;
    for (let n = 0; n < 400; n++) {
      const club = { attack: 50, defence: 50, level: 50, base: 50 } as Parameters<typeof driftLevel>[0];
      for (let y = 0; y < 10; y++) driftLevel(club, rng);
      if (club.era || Math.abs(club.level! - 50) > 8) {
        eras++;
        if (club.level! > 50) ups++;
      }
    }
    expect(eras).toBeGreaterThan(40);
    expect(ups).toBeGreaterThan(10);
    expect(eras - ups).toBeGreaterThan(10);
  });

  it('gives an old save\'s teams a level from where they stand', () => {
    const c = newCareer({ rating: 50, seed: 13 }, SPORTS.rugby);
    for (const club of c.clubs) {
      delete club.level;
      delete club.base;
    }
    seasons(c, 2);
    expect(c.clubs.filter((x) => !x.isPlayer).every((x) => x.level !== undefined && x.base !== undefined)).toBe(true);
  });
});

describe('the player closing on the elite', () => {
  it('keeps less of a rise the higher they are', () => {
    expect(climb(40)).toBe(1);
    expect(climb(RATING_TUNING.climbStart)).toBe(1);
    expect(climb(80)).toBeLessThan(0.6);
    expect(climb(95)).toBeCloseTo(RATING_TUNING.climbFloor);
    expect(climb(200)).toBe(RATING_TUNING.climbFloor);
  });
});

describe('who leaves in the summer', () => {
  it('a team hangs on to its top scorer more than to anyone else', () => {
    let stayed = 0;
    let topLeft = 0;
    let anyLeft = 0;
    let anyone = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const c = newCareer({ rating: 50, seed }, SPORTS.football);
      const end = playSeason(c, SPORTS.football);
      for (const change of end.turnover) {
        const club = c.clubs[change.clubId];
        const top = [...club.squad].sort((a, b) => (c.season.scorers[b.id] ?? 0) - (c.season.scorers[a.id] ?? 0))[0];
        if (change.out.includes(top.id)) topLeft++;
        else stayed++;
        anyLeft += change.out.length;
        anyone += club.squad.length;
      }
    }
    expect(topLeft / (topLeft + stayed)).toBeLessThan((anyLeft / anyone) * 0.6);
  }, 30_000);
});

describe('World Championship hosts', () => {
  const cup = () => drawChampionship(FORMATS.football, 4, Array.from({ length: 40 }, (_, i) => i), new Rng(21));

  it('picks a host from those who qualified', () => {
    const c = cup();
    expect(c.entrants).toContain(c.host);
  });

  it('the host plays at home in the group, and other matches stay neutral', () => {
    const c = cup();
    for (let stage = 0; stage < c.groups[0].days.length; stage++) {
      for (const f of cupFixtures(FORMATS.football, c, stage)) {
        if (f.home === c.host) expect(f.options.neutral).toBe(false);
        else {
          expect(f.away).not.toBe(c.host);
          expect(f.options.neutral).toBe(true);
        }
      }
    }
  });

  it('a home side in a hosted match scores more than at a neutral ground', () => {
    const rng = new Rng(4);
    const sheet = (clubId: number) => ({ clubId, attack: 60, defence: 60, lineup: lineup(generateSquad(new Rng(clubId), clubId * 100, () => 'A Name')) });
    let hosted = 0;
    let neutral = 0;
    for (let i = 0; i < 1500; i++) {
      hosted += outcome(playMatch(sheet(1), sheet(2), { neutral: false }, rng)).homeGoals;
      neutral += outcome(playMatch(sheet(1), sheet(2), { neutral: true }, rng)).homeGoals;
    }
    expect(hosted).toBeGreaterThan(neutral);
  });
});

describe('streaks', () => {
  it('reads a run of form from the last five', () => {
    expect(streakOf([])).toBe(0);
    expect(streakOf(['L', 'L', 'W', 'W', 'W', 'W', 'W'])).toBe(1);
    expect(streakOf(['W', 'L', 'D', 'L', 'L'])).toBe(-0.4);
    expect(streakForm({ streak: 1 })).toBeCloseTo(1.05);
    expect(streakForm({})).toBe(1);
  });

  it('reaches the team sheet from the table', () => {
    const c = newCareer({ rating: 50, seed: 3 }, SPORTS.football);
    const row = c.season.leagues[0].table[0];
    row.form = ['W', 'W', 'W'];
    expect(teamSheet(c, row.clubId, SPORTS.football).streak).toBe(1);
  });

  it('a team on a good run scores a little more', () => {
    const rng = new Rng(9);
    const sheet = (clubId: number, streak: number) => ({ clubId, attack: 60, defence: 60, streak, lineup: lineup(generateSquad(new Rng(clubId), clubId * 100, () => 'A Name')) });
    let hot = 0;
    let cold = 0;
    for (let i = 0; i < 2500; i++) {
      hot += outcome(playMatch(sheet(1, 1), sheet(2, 0), {}, rng)).homeGoals;
      cold += outcome(playMatch(sheet(1, -1), sheet(2, 0), {}, rng)).homeGoals;
    }
    expect(hot).toBeGreaterThan(cold);
  });
});

describe('set players', () => {
  it('a better batter in the same slot makes more runs', () => {
    const ids = Array.from({ length: 6000 }, (_, i) => i).sort((a, b) => finishing(b) - finishing(a));
    const [best, worst] = [ids[0], ids[ids.length - 1]];
    const made = (opener: number) => {
      const rng = new Rng(7);
      let runs = 0;
      for (let i = 0; i < 500; i++) {
        const squad = cricketSquad(new Rng(1), 7000, () => 'A Name');
        const line = cricketLineup(squad).map((p, at) => (at === 0 ? { ...p, id: opener } : p));
        const m = createCricket({ clubId: 1, attack: 60, defence: 60, lineup: line }, { clubId: 2, attack: 60, defence: 60, lineup: cricketLineup(cricketSquad(new Rng(2), 8000, () => 'A Name')) }, {}, rng);
        while (!cricketDone(m)) cricketStep(m, rng);
        runs += m.home.runsBy[opener] ?? 0;
      }
      return runs;
    };
    expect(made(best)).toBeGreaterThan(made(worst));
  });

  it('counts rugby points for the kickers too, adding up to the score', () => {
    const rng = new Rng(3);
    const sheet = (clubId: number) => ({ clubId, attack: 60, defence: 60, lineup: rugbyLineup(rugbySquad(new Rng(clubId), clubId * 100, () => 'A Name')) });
    let kicker = 0;
    for (let i = 0; i < 40; i++) {
      const m = createRugby(sheet(1), sheet(2), {}, rng);
      while (!rugbyDone(m)) rugbyStep(m, rng);
      const o = rugbyOutcome(m);
      expect(o.wicketTakers!.reduce((t, x) => t + x.count, 0)).toBe(o.homeGoals + o.awayGoals);
      const tries = o.goals.length;
      if (o.homeGoals + o.awayGoals > tries * 5) kicker++;
    }
    expect(kicker).toBeGreaterThan(30);
    expect(SPORTS.rugby.present.terms.secondTally?.many).toBe('Top points scorers');
  });
});

describe('Grand Prix tracks', () => {
  const field = (speeds: [number, number][]) => {
    const c = newCareer({ rating: 50, seed: 1 }, SPORTS.grandprix);
    return c.season.leagues[0].clubIds.map((id, i) => ({ ...teamSheet(c, id, SPORTS.grandprix), attack: speeds[i][0], defence: speeds[i][1], settledLean: 0, streak: 0 }));
  };
  const fastest: [number, number][] = [[90, 60], ...Array.from({ length: 9 }, (): [number, number] => [60, 60])];
  const place = (track: string) => {
    const rng = new Rng(2);
    const sheets = field(fastest);
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const m = createRace(sheets[0], sheets[1], { field: sheets, track }, rng);
      while (!raceDone(m)) raceStep(m, rng);
      const o = classified(m);
      total += o.findIndex((x) => x.clubId === sheets[0].clubId) + 1;
    }
    return total / 200;
  };

  it('Monza rewards a fast car more than Monaco does', () => {
    expect(place('Monza')).toBeLessThan(place('Monaco'));
  });

  it('every track in the season is a real calendar entry, carried on its race', () => {
    const c = newCareer({ rating: 50, seed: 3 }, SPORTS.grandprix);
    expect(c.season.schedule.map((r) => r[0].options.track)).toEqual(FORMATS.grandprix.race!.tracks);
  });

  it('it rains sometimes, more often at Spa', () => {
    const rng = new Rng(8);
    const sheets = field(fastest);
    const wet = (track: string) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (createRace(sheets[0], sheets[1], { field: sheets, track }, rng).wet) n++;
      return n;
    };
    const spa = wet('Spa');
    const monza = wet('Monza');
    expect(monza).toBeGreaterThan(0);
    expect(spa).toBeGreaterThan(monza);
  });

  it('names its leagues GP1 to GP3', () => {
    const game = new Game({ save: () => {}, changed: () => {} }, { setTimeout: () => 0, clearTimeout: () => {} });
    game.selectSport('grandprix');
    game.start({ rating: 50, seed: 8, team: 'ITA' });
    expect(statusText(game)).toMatch(/in GP\d$/);
    const v = buildView(game);
    if (v.screen !== 'game') throw new Error('expected a game');
    expect(v.match!.competition).toMatch(/^GP\d$/);
  });
});

describe('cricket growing to eight-team leagues', () => {
  /** A career as it was saved before: five leagues of six, part-way through the season. */
  const oldCareer = () => {
    const c = newCareer({ rating: 40, seed: 6, team: 'SCO' }, { ...SPORTS.cricket, format: CRICKET_SIX, world: (rng, count, code) => SPORTS.cricket.world(rng, count, code) });
    c.clubs = c.clubs.slice(0, 30);
    return c;
  };

  it('finishes a season saved in the old shape under the old rules', () => {
    const c = oldCareer();
    expect(formatOf(c)).toBe(CRICKET_SIX);
    const end = playSeason(c, SPORTS.cricket);
    expect(end.nextLeagues.map((l) => l.length)).toEqual([6, 6, 6, 6, 6]);
  });

  it('grows to four leagues of eight as the next season starts, keeping the career', () => {
    const c = oldCareer();
    const name = c.clubs[c.playerClubId].name;
    const end = playSeason(c, SPORTS.cricket);
    allocatePoints(c, focusAllocation(c.clubs[c.playerClubId], end.points, 'attack'));
    expect(growWorld(c, SPORTS.cricket)).toBe(true);
    expect(c.clubs).toHaveLength(32);
    expect(c.season.leagues.map((l) => l.clubIds.length)).toEqual([8, 8, 8, 8]);
    expect(new Set(c.season.leagues.flatMap((l) => l.clubIds)).size).toBe(32);
    expect(c.clubs[c.playerClubId].name).toBe(name);
    expect(c.history).toHaveLength(1);
    expect(formatOf(c)).toBe(FORMATS.cricket);
    // Nothing more to do once it's grown, and the season plays as normal.
    expect(growWorld(c, SPORTS.cricket)).toBe(false);
    expect(playSeason(c, SPORTS.cricket).nextLeagues.map((l) => l.length)).toEqual([8, 8, 8, 8]);
  });
});
