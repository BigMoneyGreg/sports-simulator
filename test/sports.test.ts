import { describe, expect, it } from 'vitest';
import { allocatePoints, chooseFocus, endSeason, focusAllocation, newCareer, nextRound, playRound, teamSheet, type Career } from '../src/core/career';
import { rating } from '../src/core/club';
import { cupStages } from '../src/core/cups';
import { CRICKET, FOOTBALL, FORMATS, RUGBY, SPORT_IDS, teamCount, type SportId } from '../src/core/format';
import { band, emptyTable, goalRanks, recordResult, sortTable, startRating, zone } from '../src/core/league';
import { totalRating } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import type { TeamSheet } from '../src/core/sport';
import { fitDuration, Game, tickMs, type SavedGame, type Scheduler } from '../src/extension/game';
import { boxStatus, buildView, collapsedText, cycledSport, enabledSports, GoalWatch, seasonFinished, sportRows, statusGame, statusText, summerQuestion } from '../src/extension/viewModel';
import { SPORTS } from '../src/sports';
import { CRICKET_ORDER, CRICKET_RIVALS } from '../src/sports/cricket/data';
import { createMatch as createCricket, isFinished as cricketDone, outcome as cricketOutcome, step as cricketStep, TUNING as CRICKET_TUNING, type CricketMatch } from '../src/sports/cricket/match';
import { FAMOUS_PLAYERS } from '../src/sports/famous';
import { nation } from '../src/sports/football/names';
import { RUGBY_ORDER, RUGBY_RIVALS } from '../src/sports/rugby/data';
import { createMatch as createRugby, isFinished as rugbyDone, leaguePoints, outcome as rugbyOutcome, step as rugbyStep, type RugbyMatch } from '../src/sports/rugby/match';
import type { GameView } from '../src/shared/view';

const NEW_SPORTS = ['rugby', 'cricket'] as const;

function sheet(sportId: 'rugby' | 'cricket', clubId: number, value: number): TeamSheet {
  const sport = SPORTS[sportId];
  const squad = sport.generateSquad(new Rng(clubId + 1), clubId * 100, { name: 'England', short: 'ENG', colours: [] });
  return { clubId, attack: value, defence: value, lineup: sport.lineup(squad) };
}

function playRugby(seed: number, home = 50, away = 50, options = {}): RugbyMatch {
  const rng = new Rng(seed);
  const m = createRugby(sheet('rugby', 1, home), sheet('rugby', 2, away), options, rng);
  while (!rugbyDone(m)) rugbyStep(m, rng);
  return m;
}

function playCricket(seed: number, home = 50, away = 50, options = {}): CricketMatch {
  const rng = new Rng(seed);
  const m = createCricket(sheet('cricket', 1, home), sheet('cricket', 2, away), options, rng);
  while (!cricketDone(m)) cricketStep(m, rng);
  return m;
}

describe('formats', () => {
  it.each(SPORT_IDS)('%s: the world, pots, cups and calendar fit together', (id) => {
    const f = FORMATS[id];
    expect(f.startingPots[f.startingPots.length - 1]).toBe(teamCount(f));
    expect(f.startingPots.every((end, i) => i === 0 || end > f.startingPots[i - 1])).toBe(true);
    // Every league line falls inside a pot, so teams near it can start either side.
    for (let line = f.leagueSize; line < teamCount(f); line += f.leagueSize) expect(f.startingPots, `line ${line}`).not.toContain(line);
    expect(f.cup.entrants).toBeLessThanOrEqual(teamCount(f));
    expect(Math.log2(f.cup.entrants) % 1).toBe(0);
    // One cup round for each slot in the calendar, all inside the league season.
    expect(cupStages(f, 'cup')).toHaveLength(f.cup.after.length);
    expect(Math.max(...f.cup.after)).toBeLessThan((f.leagueSize - 1) * 2);
    // Leagues 1 and 2 are the championship.
    expect(f.championship.entrants).toBeLessThanOrEqual(f.leagueSize * 2);
    expect(f.championship.entrants % f.championship.groupSize).toBe(0);
    // Nobody can be both promoted and relegated, or both in a play-off and relegated.
    const playoffPlaces = f.playoffs ? 4 : 0;
    expect(f.promoted + playoffPlaces + f.relegated).toBeLessThanOrEqual(f.leagueSize);
  });

  it('keeps football exactly as it was', () => {
    expect(FOOTBALL).toMatchObject({ leagues: 5, leagueSize: 20, promoted: 2, playoffs: true, relegated: 3, performanceMultiplier: 1 });
    expect(band(FOOTBALL, 1)).toEqual({ min: 80, max: 99 });
    expect(band(FOOTBALL, 5)).toEqual({ min: 0, max: 19 });
    expect(cupStages(FOOTBALL, 'championship')).toHaveLength(9);
    expect(SPORTS.football.present.durations).toEqual(['30s', '2m', '5m', '10m']);
  });

  it('marks the zones of each sport', () => {
    expect(zone(RUGBY, 2, 2)).toBe('promotion');
    expect(zone(RUGBY, 2, 3)).toBe(null);
    expect(zone(RUGBY, 2, 7)).toBe('relegation');
    expect(zone(RUGBY, 6, 8)).toBe(null);
    expect(zone(CRICKET, 2, 1)).toBe('promotion');
    expect(zone(CRICKET, 2, 2)).toBe(null);
    expect(zone(CRICKET, 2, 6)).toBe('relegation');
    expect(zone(CRICKET, 1, 1)).toBe('champion');
  });

  it.each(SPORT_IDS)('%s: a career starts in the league picked, whichever it is', (id) => {
    const f = FORMATS[id];
    for (let tier = 1; tier <= f.leagues; tier++) {
      for (let seed = 1; seed <= 25; seed++) {
        const c = newCareer({ rating: startRating(f, tier, new Rng(seed * 97)), seed }, SPORTS[id]);
        expect(c.season.leagues.find((l) => l.clubIds.includes(c.playerClubId))!.tier, `league ${tier}, seed ${seed}`).toBe(tier);
      }
    }
  });

  it.each([RUGBY, CRICKET])('starts careers inside the chosen league, whatever the league', (f) => {
    const rng = new Rng(3);
    for (let tier = 1; tier <= f.leagues; tier++) {
      for (let i = 0; i < 40; i++) {
        const r = startRating(f, tier, rng);
        const { min, max } = band(f, tier);
        expect(r).toBeGreaterThanOrEqual(Math.floor(min));
        expect(r).toBeLessThanOrEqual(Math.ceil(max));
      }
    }
  });
});

describe('world data', () => {
  const worlds = [
    ['rugby', RUGBY_ORDER, RUGBY_RIVALS, 48],
    ['cricket', CRICKET_ORDER, CRICKET_RIVALS, 30],
  ] as const;

  it.each(worlds)('%s: a world of distinct real nations with real rivals', (_id, order, rivals, count) => {
    expect(order).toHaveLength(count);
    expect(new Set(order).size).toBe(count);
    for (const code of order) expect(nation(code).name, code).toBeTruthy();
    for (const [code, rival] of Object.entries(rivals)) {
      expect(code, code).not.toBe(rival);
      expect(nation(rival).name, rival).toBeTruthy();
    }
  });

  it('calls the all-island side Ireland, and leaves football alone', () => {
    expect(SPORTS.rugby.nations().find((n) => n.short === 'IRL')?.name).toBe('Ireland');
    expect(SPORTS.cricket.nations().find((n) => n.short === 'IRL')?.name).toBe('Ireland');
    expect(SPORTS.football.nations().find((n) => n.short === 'IRL')?.name).toBe('Republic of Ireland');
  });

  it('only offers West Indies and Jersey where they play', () => {
    expect(SPORTS.cricket.nations().some((n) => n.short === 'WIN')).toBe(true);
    expect(SPORTS.football.nations().some((n) => n.short === 'WIN')).toBe(false);
    expect(SPORTS.rugby.nations().some((n) => n.short === 'JER')).toBe(false);
  });

  it.each(NEW_SPORTS)('%s: every world gets a rival, and the real one where it has one', (id) => {
    const c = newCareer({ rating: 50, seed: 1, team: 'ENG' }, SPORTS[id]);
    expect(c.rival).not.toBeNull();
    expect(c.clubs[c.rival!].short).toBe(id === 'rugby' ? 'FRA' : 'AUS');
    for (const code of SPORTS[id].nations().map((n) => n.short)) {
      const career = newCareer({ rating: 50, seed: 2, team: code }, SPORTS[id]);
      expect(career.rival, code).not.toBeNull();
    }
  });
});

describe('first seasons', () => {
  it.each(NEW_SPORTS)('%s: a new career starts carrying the same shape penalty as an AI side', (id) => {
    const c = newCareer({ rating: 50, seed: 3 }, SPORTS[id]);
    expect(c.clubs[0].attack).toBe(c.clubs[0].defence);
    expect(c.clubs[0].settledLean).toBe(14);
  });

  it('leaves football as it was', () => {
    expect(newCareer({ rating: 50, seed: 3 }, SPORTS.football).clubs[0].settledLean).toBeUndefined();
  });
});

describe('fictional players', () => {
  it.each(NEW_SPORTS)('%s never names a real star, however many squads it draws', (id) => {
    const sport = SPORTS[id];
    const rng = new Rng(77);
    for (const n of sport.nations()) {
      const identity = { name: n.name, short: n.short, colours: n.colours };
      for (let i = 0; i < 25; i++) {
        for (const p of sport.generateSquad(rng, 0, identity)) expect(FAMOUS_PLAYERS.has(p.name), p.name).toBe(false);
      }
    }
  });
});

describe('rugby', () => {
  it('scores 5 for a try, 2 more if converted, and 3 for a penalty or drop goal', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = playRugby(seed);
      const points = (side: 'home' | 'away') =>
        m.events.reduce((t, e) => {
          if (e.type === 'try' && e.side === side) return t + (e.converted ? 7 : 5);
          if ((e.type === 'penalty' || e.type === 'dropGoal') && e.side === side) return t + 3;
          return t;
        }, 0);
      expect(points('home')).toBe(m.home.goals);
      expect(points('away')).toBe(m.away.goals);
    }
  });

  it('awards league points: 4 win, 2 draw, a bonus for four tries and for losing by 7 or less', () => {
    expect(leaguePoints({ goals: 30, tries: 4 }, { goals: 10, tries: 1 })).toEqual([5, 0]);
    expect(leaguePoints({ goals: 20, tries: 2 }, { goals: 15, tries: 1 })).toEqual([4, 1]);
    expect(leaguePoints({ goals: 20, tries: 2 }, { goals: 13, tries: 1 })).toEqual([4, 1]);
    expect(leaguePoints({ goals: 20, tries: 2 }, { goals: 12, tries: 1 })).toEqual([4, 0]);
    expect(leaguePoints({ goals: 20, tries: 4 }, { goals: 20, tries: 2 })).toEqual([3, 2]);
    expect(leaguePoints({ goals: 28, tries: 3 }, { goals: 26, tries: 4 })).toEqual([4, 2]);
  });

  it('puts those points in the table, with a draw column and points difference', () => {
    const table = emptyTable([1, 2]);
    recordResult(table, 1, 2, rugbyOutcome(playRugby(5)));
    const total = table[0].points + table[1].points;
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(7);
  });

  it('settles every knockout, through extra time and a kicking contest', () => {
    let contests = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const m = playRugby(seed, 50, 50, { knockout: { aggregate: [0, 0] }, neutral: true });
      const o = rugbyOutcome(m);
      expect(o.winner).toBeDefined();
      if (o.penalties) {
        contests++;
        expect(o.penalties[0]).not.toBe(o.penalties[1]);
        expect(o.extraTime).toBe(true);
        expect(m.home.goals).toBe(m.away.goals);
        expect(o.winner).toBe(o.penalties[0] > o.penalties[1] ? 'home' : 'away');
      } else expect(o.winner).toBe(m.home.goals > m.away.goals ? 'home' : 'away');
    }
    expect(contests).toBeGreaterThan(0);
  });

  it('brings sin-binned players back after ten minutes', () => {
    let cards = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(seed);
      const m = createRugby(sheet('rugby', 1, 50), sheet('rugby', 2, 50), {}, rng);
      while (!rugbyDone(m)) {
        const before = m.home.binned.length + m.away.binned.length;
        rugbyStep(m, rng);
        if (m.home.binned.length + m.away.binned.length > before) cards++;
        for (const { back } of [...m.home.binned, ...m.away.binned]) {
          expect(back).toBeGreaterThanOrEqual(m.minute);
          expect(back - m.minute).toBeLessThanOrEqual(10);
        }
      }
    }
    expect(cards).toBeGreaterThan(0);
  });

  it('sends a player off for a second yellow, and nobody off the field scores', () => {
    let seconds = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const rng = new Rng(seed);
      const m = createRugby(sheet('rugby', 1, 50), sheet('rugby', 2, 50), {}, rng);
      while (!rugbyDone(m)) {
        const seen = m.events.length;
        rugbyStep(m, rng);
        for (const e of m.events.slice(seen)) {
          if (e.type === 'red' && m[e.side].yellows.includes(e.playerId)) seconds++;
          if (e.type === 'yellow') expect(m[e.side].yellows.filter((id) => id === e.playerId)).toHaveLength(1);
          if (e.type === 'try') {
            // Only those already off before this minute count: a card later in the same minute is no contradiction.
            const sentBefore = m.events.slice(0, seen).some((x) => x.type === 'red' && x.playerId === e.playerId);
            expect(sentBefore).toBe(false);
            expect(m[e.side].binned.some((b) => b.id === e.playerId && b.back - 10 < e.minute)).toBe(false);
          }
        }
      }
    }
    expect(seconds).toBeGreaterThan(0);
  });

  it('makes the stronger side win most, but never always', () => {
    let wins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const m = playRugby(seed, 60, 50);
      if (m.home.goals > m.away.goals) wins++;
    }
    expect(wins / 300).toBeGreaterThan(0.75);
    expect(wins / 300).toBeLessThan(0.98);
  });
});

describe('cricket', () => {
  it('plays two legal innings', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const m = playCricket(seed);
      for (const s of [m.home, m.away]) {
        expect(s.balls).toBeLessThanOrEqual(CRICKET_TUNING.overs * 6);
        expect(s.wickets).toBeLessThanOrEqual(10);
        expect(Object.values(s.runsBy).reduce((t, r) => t + r, 0)).toBe(s.goals);
      }
    }
  });

  it('ends the chase when the target is reached, without batting on', () => {
    let chases = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const m = playCricket(seed);
      const chaser = m.first === 'home' ? m.away : m.home;
      const setter = m.first === 'home' ? m.home : m.away;
      if (chaser.goals > setter.goals && !m.penalties) {
        chases++;
        // The winning shot can only overshoot by what a six adds.
        expect(chaser.goals - setter.goals).toBeLessThanOrEqual(6);
      }
    }
    expect(chases).toBeGreaterThan(0);
  });

  it('moves one ball at a time, showing this over', () => {
    const rng = new Rng(4);
    const m = createCricket(sheet('cricket', 1, 50), sheet('cricket', 2, 50), {}, rng);
    const ctx = { playerName: (_side: 'home' | 'away', id: number) => `Test Player${id}` };
    for (let ball = 1; ball <= 8; ball++) {
      cricketStep(m, rng);
      expect(m[m.batting].balls).toBe(ball);
    }
    expect(m.thisOver).toHaveLength(2);
    const details = SPORTS.cricket.present.details!(m, ctx);
    expect(details).toEqual([expect.stringMatching(/^This over: /)]);
    expect(SPORTS.cricket.present.clock(m)).toBe('Ov 1.2');
  });

  it('gets out sooner and scores slower further down the order', () => {
    const faced = Array(11).fill(0);
    const runs = Array(11).fill(0);
    const outs = Array(11).fill(0);
    const rng = new Rng(9);
    for (let g = 0; g < 1500; g++) {
      const m = createCricket(sheet('cricket', 1, 50), sheet('cricket', 2, 50), {}, rng);
      while (m.period !== 'done') {
        const side = m[m.batting];
        const at = m.striker;
        const [balls, wickets, scored, playing] = [side.balls, side.wickets, side.goals, m.period === 'first' || m.period === 'second'];
        cricketStep(m, rng);
        if (!playing || side.balls === balls) continue;
        faced[at]++;
        runs[at] += side.goals - scored;
        if (side.wickets > wickets) outs[at]++;
      }
    }
    const average = (from: number, to: number) => runs.slice(from, to).reduce((a, b) => a + b, 0) / outs.slice(from, to).reduce((a, b) => a + b, 0);
    const outRate = (from: number, to: number) => outs.slice(from, to).reduce((a, b) => a + b, 0) / faced.slice(from, to).reduce((a, b) => a + b, 0);
    expect(average(0, 3)).toBeGreaterThan(average(3, 7) * 1.2);
    expect(average(3, 7)).toBeGreaterThan(average(7, 11) * 2);
    expect(outRate(7, 11)).toBeGreaterThan(outRate(3, 7) * 1.8);
    expect(outRate(3, 7)).toBeGreaterThan(outRate(0, 3) * 1.2);
  });

  it('keeps a real scorecard: who is out and how, who is in, and the bowling', () => {
    const rng = new Rng(4);
    const m = createCricket(sheet('cricket', 1, 50), sheet('cricket', 2, 50), {}, rng);
    const ctx = { playerName: (_side: 'home' | 'away', id: number) => `Test P${id}` };
    const card = () => SPORTS.cricket.present.scorecard!(m, ctx, ['Home', 'Away']);
    expect(card()).toHaveLength(1);
    while (m.period === 'first') cricketStep(m, rng);
    const [first] = card();
    const side = m[m.first];
    expect(first.total).toBe(side.wickets >= 10 ? String(side.goals) : `${side.goals}/${side.wickets}`);
    expect(first.batters).toHaveLength(Math.min(11, 2 + side.wickets));
    expect(first.batters.reduce((t, b) => t + b.runs, 0)).toBe(side.goals);
    expect(first.batters.reduce((t, b) => t + b.balls, 0)).toBe(side.balls);
    expect(first.batters.filter((b) => b.out)).toHaveLength(side.wickets);
    expect(first.batters.filter((b) => !b.out).every((b) => b.how === 'not out')).toBe(true);
    expect(first.batters.filter((b) => b.out).every((b) => /^(c \S+ )?b \S+$|^lbw b \S+$|^run out$/.test(b.how.replace(/Test /g, '')))).toBe(true);
    expect(first.yetToBat).toHaveLength(11 - first.batters.length);
    expect(first.bowlers.reduce((t, b) => t + b.runs, 0)).toBe(side.goals);
    while (m.period !== 'second') cricketStep(m, rng);
    cricketStep(m, rng);
    const [now, earlier] = card();
    expect(now.live).toBe(true);
    expect(earlier).toMatchObject({ live: false, total: first.total });
    expect(now.batters.filter((b) => b.striker)).toHaveLength(1);
    expect(now.batters.filter((b) => !b.out).every((b) => b.how === 'batting')).toBe(true);
  });

  it('shows no next round on a league match that has just finished', () => {
    const clock = manual();
    const game = new Game({ save: () => {}, changed: () => {} }, clock.scheduler);
    game.selectSport('cricket');
    game.start({ rating: 55, seed: 31, team: 'SRI' });
    while (game.phase !== 'fullTime') clock.run(1);
    const view = buildView(game);
    expect(view.screen === 'game' && view.match!.round).toBeUndefined();
  });

  it('keeps the minimised line short, in the status bar\'s full form only where there\'s room', () => {
    const clock = manual();
    const game = new Game({ save: () => {}, changed: () => {} }, clock.scheduler);
    game.selectSport('cricket');
    game.start({ rating: 55, seed: 31, team: 'SRI' });
    clock.run(10);
    expect(collapsedText(game)).toMatch(/^\d+\w\w Wk 1\/\d+ · [A-Z]{3} v \d+\/\d [A-Z]{3} \d+\.\d$|^\d+\w\w Wk 1\/\d+ · [A-Z]{3} \d+\/\d v [A-Z]{3} \d+\.\d$/);
    expect(statusText(game)).toMatch(/Ov \d+\.\d · Wk /);
    while (game.live?.matches[game.live.player].period !== 'second') clock.run(1);
    clock.run(3);
    expect(collapsedText(game)).toMatch(/[A-Z]{3} \d+(\/\d)?–\d+\/\d [A-Z]{3} \d+\.\d$/);
  });

  it('copes with a match saved before there was a scorecard', () => {
    const rng = new Rng(5);
    const m = createCricket(sheet('cricket', 1, 50), sheet('cricket', 2, 50), {}, rng);
    for (const key of ['home', 'away'] as const) {
      delete m[key].ballsBy;
      delete m[key].outs;
      delete m[key].bowled;
    }
    const ctx = { playerName: (_side: 'home' | 'away', id: number) => `Test P${id}` };
    expect(SPORTS.cricket.present.scorecard!(m, ctx, ['Home', 'Away'])[0].bowlers).toEqual([]);
    while (m.period !== 'done') cricketStep(m, rng);
    expect(SPORTS.cricket.present.scorecard!(m, ctx, ['Home', 'Away'])).toHaveLength(2);
  });

  it('always has a winner, a tie going to a super over', () => {
    let superOvers = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const o = cricketOutcome(playCricket(seed));
      expect(o.winner).toBeDefined();
      expect(o.points).toEqual(o.winner === 'home' ? [2, 0] : [0, 2]);
      if (o.homeGoals === o.awayGoals) {
        superOvers++;
        expect(o.penalties).toBeDefined();
        expect(o.penalties![0]).not.toBe(o.penalties![1]);
      } else expect(o.penalties).toBeUndefined();
    }
    expect(superOvers).toBeGreaterThan(0);
  });

  it('never records a draw, even for a tied match', () => {
    const table = emptyTable([1, 2]);
    recordResult(table, 1, 2, { homeGoals: 150, awayGoals: 150, goals: [], winner: 'away', points: [0, 2], balls: [120, 120], penalties: [8, 12] });
    expect(table.map((r) => [r.won, r.drawn, r.lost, r.points])).toEqual([
      [0, 0, 1, 0],
      [1, 0, 0, 2],
    ]);
  });

  it('breaks ties on net run rate, counting a side bowled out as its full 20 overs', () => {
    const table = emptyTable([1, 2, 3]);
    // Side 1 wins despite being bowled out for 100 (20 overs, 5 an over); side 2 makes the same 100 in 15 overs and wins too.
    recordResult(table, 1, 3, { homeGoals: 100, awayGoals: 90, goals: [], winner: 'home', points: [2, 0], balls: [120, 120] });
    recordResult(table, 2, 3, { homeGoals: 100, awayGoals: 99, goals: [], winner: 'home', points: [2, 0], balls: [90, 120] });
    expect(sortTable(table).map((r) => r.clubId)).toEqual([2, 1, 3]);
    // And the engine does count a side bowled out as its full 20 overs.
    let bowledOut = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const m = playCricket(seed, 40, 60);
      const o = cricketOutcome(m);
      if (m.home.wickets === 10) {
        bowledOut++;
        expect(o.balls![0]).toBe(120);
      } else expect(o.balls![0]).toBe(m.home.balls);
    }
    expect(bowledOut).toBeGreaterThan(0);
  });

  it('shows a side all out as just its runs', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const m = playCricket(seed, 40, 60);
      const [home] = SPORTS.cricket.present.score(m);
      expect(home).toBe(m.home.wickets === 10 ? String(m.home.goals) : `${m.home.goals}/${m.home.wickets}`);
    }
  });

  it('ranks the summer clue on run rate, so a quick chase counts in full', () => {
    const rows = emptyTable([1, 2]);
    // Side 1 chases 120 down in 10 overs, 12 an over; side 2 makes 119 from all its 20 overs, 6 an over.
    recordResult(rows, 1, 2, { homeGoals: 120, awayGoals: 119, goals: [], winner: 'home', points: [2, 0], balls: [60, 120] });
    const ranks = goalRanks(rows, 1);
    expect(ranks).toEqual({ scored: 1, conceded: 1 });
    expect(goalRanks(rows, 2)).toEqual({ scored: 2, conceded: 2 });
  });

  it('makes the stronger side win most, but never always', () => {
    let wins = 0;
    for (let seed = 1; seed <= 300; seed++) if (cricketOutcome(playCricket(seed, 62, 50)).winner === 'home') wins++;
    expect(wins / 300).toBeGreaterThan(0.65);
    expect(wins / 300).toBeLessThan(0.98);
  });

  it('counts run rates in the table and sorts by them', () => {
    const rows = emptyTable([1, 2, 3]);
    recordResult(rows, 1, 3, { homeGoals: 150, awayGoals: 100, goals: [], winner: 'home', points: [2, 0], balls: [120, 120] });
    recordResult(rows, 2, 3, { homeGoals: 121, awayGoals: 120, goals: [], winner: 'home', points: [2, 0], balls: [120, 120] });
    expect(sortTable(rows).map((r) => r.clubId)).toEqual([1, 2, 3]);
  });
});

describe.each(NEW_SPORTS)('%s careers', (id) => {
  const sport = SPORTS[id];
  const f = sport.format;

  function playYears(career: Career, years: number, each?: (c: Career) => void): void {
    for (let y = 0; y < years; y++) {
      while (nextRound(career)) playRound(career, sport);
      endSeason(career, sport);
      each?.(career);
      chooseFocus(career, y % 2 ? 'attack' : 'defence');
    }
  }

  it('spreads the world across 0–99, not just 0 to the team count', () => {
    const c = newCareer({ rating: 50, seed: 4 }, sport);
    const ai = c.clubs.filter((x) => !x.isPlayer).map(rating);
    expect(c.clubs).toHaveLength(teamCount(f));
    expect(Math.max(...ai)).toBeGreaterThan(90);
    expect(Math.min(...ai)).toBeLessThan(5);
    expect(c.season.leagues).toHaveLength(f.leagues);
    for (const l of c.season.leagues) expect(l.clubIds).toHaveLength(f.leagueSize);
  });

  it('keeps every league whole and every team in exactly one, season after season', () => {
    const c = newCareer({ rating: 40, seed: 5 }, sport);
    playYears(c, 9, (career) => {
      const end = career.pending!;
      for (const league of end.nextLeagues) expect(league).toHaveLength(f.leagueSize);
      expect(new Set(end.nextLeagues.flat()).size).toBe(teamCount(f));
      for (const [tier, ids] of Object.entries(end.promoted)) if (+tier > 1) expect(ids).toHaveLength(f.promoted);
      for (const ids of Object.values(end.relegated)) expect(ids).toHaveLength(f.relegated);
    });
  });

  it('has no play-offs, and finishes both cups', () => {
    const c = newCareer({ rating: 40, seed: 6 }, sport);
    let championships = 0;
    playYears(c, 9, (career) => {
      const s = career.season;
      expect(s.calendar.some((x) => x.kind === 'playoff')).toBe(false);
      expect(s.playoffs).toEqual([]);
      expect(s.cup.winner).toBeDefined();
      if (s.number > 1 && s.number % 4 === 1) {
        championships++;
        expect(s.championship?.winner).toBeDefined();
        expect(s.championship?.entrants).toHaveLength(f.championship.entrants);
      } else expect(s.championship).toBeNull();
    });
    expect(championships).toBe(2);
    expect(c.honours.cup).toHaveLength(9);
    expect(c.honours.championship).toHaveLength(2);
  });

  it('keeps the AI total fixed, whatever the player gains', () => {
    const c = newCareer({ rating: 40, seed: 7 }, sport);
    const before = c.totalRating;
    playYears(c, 6);
    expect(totalRating(c.clubs.filter((x) => !x.isPlayer))).toBeCloseTo(before, 6);
  });

  it('draws leavers from each side, and asks a question with one answer for each', () => {
    const c = newCareer({ rating: 40, seed: 8, team: 'ENG' }, sport);
    const seen = new Set<string>();
    playYears(c, 8, (career) => {
      const q = summerQuestion(career);
      seen.add(q.prompt);
      expect(q.options.map((o) => o.focus)).toEqual(['attack', 'defence']);
      for (const o of q.options) expect(o.title.length).toBeGreaterThan(0);
      const change = career.pending!.turnover.find((t) => t.clubId === career.playerClubId)!;
      expect(change.out.length).toBeGreaterThanOrEqual(2);
      expect(new Set(career.clubs[0].squad.map((p) => p.id)).size).toBe(career.clubs[0].squad.length);
    });
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('gives both sides of the game players, so call-ups and coaches always have a side to name', () => {
    const squad = sport.generateSquad(new Rng(1), 0, { name: 'England', short: 'ENG', colours: [] });
    expect(squad.some((p) => sport.role(p).side === 'attack')).toBe(true);
    expect(squad.some((p) => sport.role(p).side === 'defence')).toBe(true);
    for (const p of squad) expect(sport.role(p).label).toBeTruthy();
    expect(sport.lineup(squad).length).toBe(id === 'rugby' ? 15 : 11);
  });

  it('fields a full side in every fixture', () => {
    const c = newCareer({ rating: 40, seed: 9 }, sport);
    const f0 = nextRound(c)![0];
    expect(teamSheet(c, f0.home, sport).lineup.length).toBe(id === 'rugby' ? 15 : 11);
  });
});

/** A scheduler driven by hand: run() fires the pending timer. */
function manual() {
  let pending: (() => void) | null = null;
  const scheduler: Scheduler = { setTimeout: (fn) => ((pending = fn), 1), clearTimeout: () => (pending = null) };
  return {
    scheduler,
    run(n = 1) {
      for (let i = 0; i < n && pending; i++) {
        const fn = pending;
        pending = null;
        fn();
      }
    },
  };
}

describe.each(NEW_SPORTS)('%s in the game', (id) => {
  function startGame() {
    const clock = manual();
    const saves: (SavedGame | null)[] = [];
    const game = new Game({ save: (g) => saves.push(g && JSON.parse(JSON.stringify(g))), changed: () => {} }, clock.scheduler);
    game.selectSport(id);
    game.setDuration(SPORTS[id].present.durations[0]);
    game.start({ rating: 55, seed: 21, team: 'ENG' });
    return { game, clock, saves };
  }
  const live = (game: Game) => buildView(game) as GameView;

  it('plays whole seasons through the clock and shows every stage', () => {
    const { game, clock } = startGame();
    expect(game.career!.sport).toBe(id);
    const phase = () => game.phase as string;
    clock.run(10);
    const during = live(game);
    expect(during.sport).toBe(id);
    expect(during.match).not.toBeNull();
    expect(during.match!.score).toHaveLength(2);
    expect(during.header.durations).toEqual(SPORTS[id].present.durations);
    expect(statusText(game)).toMatch(/^(🏉|🏏) {2}/);
    expect(collapsedText(game)).toBeTruthy();
    while (phase() === 'live') clock.run();
    expect(phase()).toBe('fullTime');
    const ft = live(game).fullTime!;
    expect(ft.score).toBeTruthy();
    for (let i = 0; i < 30000 && phase() !== 'seasonOver'; i++) clock.run();
    expect(phase()).toBe('seasonOver');
    const end = live(game).seasonEnd!;
    expect(end.report.scoredText).toBeTruthy();
    expect(end.question.options).toHaveLength(2);
    game.chooseFocus('attack');
    expect(game.career!.season.number).toBe(2);
    expect(phase()).toBe('live');
  });

  it('never talks about goals', () => {
    const { game, clock } = startGame();
    const texts: string[] = [];
    const words = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v);
      else if (Array.isArray(v)) v.forEach(words);
      else if (v && typeof v === 'object') Object.values(v).forEach(words);
    };
    for (let i = 0; i < 30000 && (game.phase as string) !== 'seasonOver'; i++) {
      clock.run();
      if (i % 100 === 0) words(buildView(game));
    }
    words(buildView(game));
    // The list of sports names football on purpose; `goal` here is the timeline's own code for a sport's main event.
    for (const t of texts.filter((x) => !['Football', 'goal'].includes(x))) expect(t).not.toMatch(/(?<!drop )\bgoals?\b|⚽|penalties|striker|midfielder/i);
  });

  it('calls out its own big moment in the status bar', () => {
    const { game, clock } = startGame();
    const watch = new GoalWatch();
    const now = Date.now();
    watch.check(game, now);
    let flagged = false;
    for (let i = 0; i < 500 && !flagged; i++) {
      clock.run();
      if (game.phase !== 'live') continue;
      flagged = watch.check(game, now + 1);
    }
    expect(flagged).toBe(true);
    expect(statusText(game, true)).toContain(SPORTS[id].present.terms.alert);
  });

  it('survives a save and load mid-match', () => {
    const { game, clock, saves } = startGame();
    clock.run(25);
    const snapshot = JSON.parse(JSON.stringify(game.snapshot())) as SavedGame;
    expect(saves.length).toBeGreaterThan(0);
    const other = manual();
    const again = new Game({ save: () => {}, changed: () => {} }, other.scheduler);
    again.load(snapshot);
    expect(again.sportId).toBe(id);
    expect(again.phase).toBe('live');
    for (let i = 0; i < 3000 && (again.phase as string) === 'live'; i++) other.run();
    expect(again.phase).toBe('fullTime');
  });
});

describe('match lengths', () => {
  it('offers each sport its own, fitting a length it doesn\'t have to the next longer', () => {
    expect(SPORTS.rugby.present.durations).toEqual(['90s', '5m', '15m', '30m']);
    expect(SPORTS.cricket.present.durations).toEqual(['2m', '10m', '20m', '40m']);
    expect(fitDuration(SPORTS.cricket, '30s')).toBe('2m');
    expect(fitDuration(SPORTS.cricket, '90s')).toBe('2m');
    expect(fitDuration(SPORTS.rugby, '30s')).toBe('90s');
    expect(fitDuration(SPORTS.football, '40m')).toBe('10m');
    expect(fitDuration(SPORTS.rugby, '1m' as never)).toBe('90s');
    expect(fitDuration(SPORTS.football, '5m')).toBe('5m');
  });

  it('runs a tick by the sport\'s own clock', () => {
    expect(tickMs(SPORTS.football, '2m')).toBeCloseTo(120000 / 90);
    expect(tickMs(SPORTS.rugby, '90s')).toBeCloseTo(90000 / 80);
    expect(tickMs(SPORTS.cricket, '2m')).toBe(500);
  });

  it('labels every length a sport offers with a season time', () => {
    for (const id of SPORT_IDS) for (const d of SPORTS[id].present.durations) expect(SPORTS[id].present.terms.seasonLabels[d], `${id} ${d}`).toBeTruthy();
  });
});

describe('sports in the save', () => {
  it('calls out a match against the rival, and reports the season against it', () => {
    const clock = manual();
    const game = new Game({ save: () => {}, changed: () => {} }, clock.scheduler);
    game.selectSport('rugby');
    game.start({ rating: 55, seed: 31, team: 'WAL' });
    const career = game.career!;
    // Next door in the league, so they meet this season.
    const league = career.season.leagues.find((l) => l.clubIds.includes(career.playerClubId))!;
    career.rival = league.clubIds.find((id) => id !== career.playerClubId)!;
    let calledOut = false;
    let others = false;
    while (game.phase !== 'seasonOver') {
      clock.run(1);
      const view = game.career && buildView(game);
      if (game.phase !== 'live' || view?.screen !== 'game' || !view.match) continue;
      const against = game.shownMatch!.fixture.home === career.rival || game.shownMatch!.fixture.away === career.rival;
      expect(view.match.rival).toBe(against);
      expect(statusText(game)!.includes('⚔')).toBe(against);
      if (against) calledOut = true;
      else others = true;
    }
    expect(calledOut && others).toBe(true);
    const end = buildView(game);
    const report = end.screen === 'game' ? end.seasonEnd!.report : null;
    expect(report!.rival).toMatch(new RegExp(`^${career.clubs[career.rival!].name} · \\d+W( \\d+D)? \\d+L$`));
  });

  it('keeps each career\'s match length in its save', () => {
    const saves: SavedGame[] = [];
    const clock = manual();
    const game = new Game({ save: (g) => void (g && saves.push(JSON.parse(JSON.stringify(g)))), changed: () => {} }, clock.scheduler);
    game.selectSport('rugby');
    game.start({ rating: 55, seed: 31, team: 'WAL' });
    game.setDuration('5m');
    const saved = saves[saves.length - 1];
    expect(saved.duration).toBe('5m');
    const again = new Game({ save: () => {}, changed: () => {} }, clock.scheduler);
    again.setDuration('15m');
    again.load(saved, false);
    expect(again.duration).toBe('5m');
    // An older save has none, and takes the default.
    const { duration: _, ...older } = saved;
    again.setDuration('15m');
    again.load(null, false);
    again.load(older, false);
    expect(again.duration).toBe('15m');
  });

  describe('several sports at once', () => {
    const setUp = (sports: SportId[] = ['football', 'rugby', 'cricket']) => {
      const clocks = new Map<SportId, ReturnType<typeof manual>>();
      const saved = new Map<SportId, number>();
      const games = sports.map((id) => {
        const clock = manual();
        clocks.set(id, clock);
        const game = new Game({ save: () => void saved.set(id, (saved.get(id) ?? 0) + 1), changed: () => {} }, clock.scheduler);
        game.selectSport(id);
        return game;
      });
      const game = (id: SportId) => games.find((g) => g.sportId === id)!;
      return { games, game, clocks, saved };
    };
    const start = (g: Game, team: string, seed = 5) => g.start({ rating: 55, seed, team });

    it('runs each career on its own clock, and pausing or ending one leaves the others alone', () => {
      const { game, clocks } = setUp();
      start(game('football'), 'SCO');
      start(game('rugby'), 'WAL');
      clocks.get('football')!.run(5);
      clocks.get('rugby')!.run(5);
      game('rugby').togglePause();
      expect(game('football').paused).toBe(false);
      const clockAt = statusText(game('football'));
      clocks.get('football')!.run(5);
      expect(statusText(game('football'))).not.toBe(clockAt);
      game('football').reset();
      expect(game('football').career).toBeNull();
      expect(game('rugby').career).not.toBeNull();
      expect(game('cricket').career).toBeNull();
    });

    it('gives a minimised sport one line, or none until it starts', () => {
      const { games, game, clocks } = setUp();
      start(game('football'), 'SCO');
      game('football').togglePause();
      start(game('rugby'), 'WAL');
      clocks.get('rugby')!.run(3);
      const [football, rugby, cricket] = sportRows(games);
      expect(football).toMatchObject({ id: 'football', name: 'Football', club: 'Scotland', paused: true, waiting: false });
      expect(rugby.line).toMatch(/^\d+(st|nd|rd|th) Wk \d+\/14 · /);
      expect(rugby.progress).toBe(0);
      expect(cricket).toEqual({ id: 'cricket', name: 'Cricket', paused: false, waiting: false });
    });

    it('marks a sport whose summer decision is waiting, and the others play on', () => {
      const { games, game, clocks } = setUp();
      start(game('rugby'), 'WAL');
      start(game('cricket'), 'SRI');
      const rugby = game('rugby');
      while (rugby.phase !== 'seasonOver') clocks.get('rugby')!.run(1);
      expect(sportRows(games)[1]).toMatchObject({ waiting: true, line: 'Season over', progress: 1 });
      expect(game('cricket').phase).not.toBe('seasonOver');
      clocks.get('cricket')!.run(3);
      expect(game('cricket').phase).toBe('live');
      const status = boxStatus(games, 'cricket');
      expect(status.text).toMatch(/\$\(bell\)$/);
      expect(boxStatus(games, 'rugby').text).toBe('$(bell) Rugby: season over');
      expect(seasonFinished(rugby, { ...rugby.career!.pending!, season: 3, position: 2, tier: 3, outcome: 'promoted' })).toBe('Rugby season 3 finished: 2nd in League 3, promoted. Decision waiting.');
      expect(seasonFinished(rugby, { ...rugby.career!.pending!, season: 4, position: 1, tier: 1, outcome: 'champion' })).toBe('Rugby season 4 finished: champions of League 1. Decision waiting.');
      expect(seasonFinished(rugby, { ...rugby.career!.pending!, season: 5, position: 5, tier: 2, outcome: null })).toBe('Rugby season 5 finished: 5th in League 2. Decision waiting.');
    });

    it('follows the sport last opened, or the first with a career if that has none', () => {
      const { games, game, clocks } = setUp();
      expect(boxStatus(games, 'rugby').text).toBe('$(trophy) Start a Sports Simulator career');
      start(game('cricket'), 'SRI');
      clocks.get('cricket')!.run(2);
      expect(statusGame(games, 'rugby')).toBe(game('cricket'));
      start(game('rugby'), 'WAL');
      expect(statusGame(games, 'rugby')).toBe(game('rugby'));
    });

    it('gives a lone career its live score, and several their sport, week and place', () => {
      const { games, game, clocks } = setUp();
      start(game('rugby'), 'WAL');
      clocks.get('rugby')!.run(3);
      expect(boxStatus(games, 'rugby').text).not.toMatch(/Rugby/);
      expect(boxStatus(games, 'rugby', true).text).toMatch(/TRY!/);
      start(game('cricket'), 'SRI');
      clocks.get('cricket')!.run(3);
      expect(boxStatus(games, 'rugby').text).toMatch(/^🏉  Rugby: Wk \d+\/14 · \d+(st|nd|rd|th) in L\d$/);
      expect(boxStatus(games, 'cricket', true).text).toMatch(/^🏏  Cricket: Wk \d+\/\d+ · \d+(st|nd|rd|th) in L\d$/);
    });

    it('shows only the sports ticked in the settings, or all of them if none is', () => {
      expect(enabledSports(undefined)).toEqual(['football', 'rugby', 'cricket']);
      expect(enabledSports({ football: false, cricket: false })).toEqual(['rugby']);
      expect(enabledSports({ football: false, rugby: false, cricket: false })).toEqual(['football', 'rugby', 'cricket']);
    });

    it('leaves a hidden sport out of the corner: no name, no bell, and it stops being followed', () => {
      const { game, clocks } = setUp();
      start(game('rugby'), 'WAL');
      start(game('cricket'), 'SRI');
      clocks.get('cricket')!.run(3);
      const rugby = game('rugby');
      while (rugby.phase !== 'seasonOver') clocks.get('rugby')!.run(1);
      const status = boxStatus([game('cricket')], 'rugby');
      expect(statusGame([game('cricket')], 'rugby')).toBe(game('cricket'));
      expect(status.text).not.toMatch(/Cricket|bell/);
      expect(status.tooltip).not.toMatch(/Wales/);
    });

    it('takes the status bar through every career, five seconds each, leaving the collapsed box where it was', () => {
      const { games, game, clocks } = setUp();
      start(game('football'), 'SCO');
      expect(cycledSport(games, 'rugby', 0)).toBe('rugby');
      start(game('rugby'), 'WAL');
      start(game('cricket'), 'SRI');
      game('cricket').togglePause();
      for (const id of ['football', 'rugby'] as const) clocks.get(id)!.run(3);
      expect([0, 4999, 5000, 10000, 15000].map((t) => cycledSport(games, 'football', t))).toEqual(['football', 'football', 'rugby', 'cricket', 'football']);
      const status = boxStatus(games, 'football', false, 'rugby');
      expect(status.text).toMatch(/^🏉  Rugby: /);
      expect(status.description).toBe(boxStatus(games, 'football').description);
      expect(boxStatus(games, 'football', false, 'cricket').text).toMatch(/^🏏  Cricket: ⏸ Wk /);
    });

    it('marks cup matches everywhere outside the box, without a league place beside them', () => {
      const { games, game, clocks } = setUp(['football']);
      start(game('football'), 'SCO');
      const g = game('football');
      while (g.shownMatch?.fixture.kind !== 'cup') clocks.get('football')!.run(1);
      expect(statusText(g)).toMatch(/^⚽ {2}(⚔ )?Cup: /);
      expect(statusText(g)).not.toMatch(/Wk/);
      expect(collapsedText(g)).toMatch(/^Cup · /);
      const [row] = sportRows(games);
      expect(row.badge).toEqual({ label: 'Cup', kind: 'cup' });
      expect(row.line).not.toMatch(/Wk|Cup/);
      const view = buildView(g);
      expect(view.screen === 'game' && view.match!.badge?.kind).toBe('cup');
      expect(view.screen === 'game' && view.match!.stage).toMatch(/^Round of/);
    });

    it('tells a minimised row about big moments for and against the player', () => {
      const { games, game, clocks } = setUp(['rugby']);
      start(game('rugby'), 'WAL');
      const g = game('rugby');
      const before = sportRows(games)[0].moments!;
      expect(before).toMatchObject({ mine: 0, theirs: 0 });
      while (g.phase === 'live') clocks.get('rugby')!.run(1);
      const { fixture, match } = g.shownMatch!;
      const [home, away] = g.sport.module.alerts(match);
      const atHome = fixture.home === g.career!.playerClubId;
      expect(sportRows(games)[0].moments).toEqual({ match: before.match, mine: atHome ? home : away, theirs: atHome ? away : home });
    });

    it('says which sport is on show, for the status bar click', () => {
      const { games, game } = setUp();
      start(game('football'), 'SCO');
      start(game('rugby'), 'WAL');
      expect(boxStatus(games, 'football', false, 'rugby').sport).toBe('rugby');
      expect(boxStatus(games, 'cricket').sport).toBe('football');
    });

    it('lists every career on hover', () => {
      const { games, game } = setUp();
      start(game('football'), 'SCO');
      expect(boxStatus(games, 'football').tooltip).toMatch(/^\*\*Scotland\*\*/);
      start(game('rugby'), 'WAL');
      const { tooltip } = boxStatus(games, 'football');
      expect(tooltip).toMatch(/Football: \*\*Scotland\*\*/);
      expect(tooltip).toMatch(/Rugby: \*\*Wales\*\*/);
      expect(tooltip.match(/Click to open/g)).toHaveLength(1);
    });
  });

  it('keeps a career in its own sport after switching away and back', () => {
    const clock = manual();
    const game = new Game({ save: () => {}, changed: () => {} }, clock.scheduler);
    game.selectSport('rugby');
    game.start({ rating: 55, seed: 31, team: 'WAL' });
    clock.run(15);
    const rugbySave = JSON.parse(JSON.stringify(game.snapshot())) as SavedGame;
    game.shutdown();
    game.selectSport('cricket');
    game.load(null);
    const setup = buildView(game);
    expect(setup.screen === 'setup' && setup.setup.sport).toBe('cricket');
    expect(setup.screen === 'setup' && setup.setup.leagues).toBe(5);
    expect(setup.screen === 'setup' && setup.setup.nations).toHaveLength(30);
    expect(game.duration).toBe('10m');
    game.load(rugbySave);
    expect(game.sportId).toBe('rugby');
    expect(game.career!.clubs[0].name).toBe('Wales');
    expect(game.phase).toBe('live');
    expect(rugbySave.career.season.leagues).toHaveLength(6);
  });
});

it('gives focusAllocation the same rules in every sport', () => {
  for (const id of SPORT_IDS) {
    const c = newCareer({ rating: 40, seed: 12 }, SPORTS[id]);
    while (nextRound(c)) playRound(c, SPORTS[id]);
    endSeason(c, SPORTS[id]);
    const points = c.pending!.points;
    const a = focusAllocation(c.clubs[0], points, 'attack');
    expect(a.attack + a.defence).toBe(points);
    allocatePoints(c, a);
    expect(c.season.number).toBe(2);
  }
});
