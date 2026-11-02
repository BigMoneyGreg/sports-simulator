import { describe, expect, it } from 'vitest';
import { finishing, finishWeight, leagueStanding } from '../src/core/finishing';
import { Rng } from '../src/core/rng';
import { outcome, playMatch } from '../src/sports/football/match';
import { generateSquad, lineup } from '../src/sports/football/squad';

const row = (clubId: number, goalsFor: number, goalsAgainst: number, played = 10) => ({ clubId, played, goalsFor, goalsAgainst });

describe('who finishes the chances', () => {
  it('gives a player the same hidden finishing every time, and it varies from player to player', () => {
    expect(finishing(7)).toBe(finishing(7));
    const all = Array.from({ length: 2000 }, (_, id) => finishing(id));
    const logs = all.map(Math.log);
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.max(...all)).toBeGreaterThan(1.5);
    expect(Math.min(...all)).toBeLessThan(0.67);
  });

  it('a team doing well leans on its set scorers more than one doing badly', () => {
    const lean = (standing: number) => finishWeight(7, 1, standing) / finishWeight(1, 1, standing);
    expect(lean(1)).toBeGreaterThan(lean(0));
    expect(lean(0)).toBeGreaterThan(1);
  });

  it('a goalkeeper stays a rarity even at the bottom', () => {
    expect(finishWeight(0.02, 1, 0)).toBe(finishWeight(0.02, 1, 1));
    expect(finishWeight(0.02, 1, 0)).toBeLessThan(finishWeight(1, 1, 0) / 10);
  });

  it('a league standing follows the table and points difference', () => {
    const sorted = [row(0, 300, 100), row(1, 200, 200), row(2, 100, 300)];
    const same = () => 50;
    expect(leagueStanding(sorted, 0, same)).toBe(1);
    expect(leagueStanding(sorted, 1, same)).toBe(0.5);
    expect(leagueStanding(sorted, 2, same)).toBe(0);
  });

  it('before anyone has played, a standing is the team\'s strength', () => {
    const sorted = [row(0, 0, 0, 0), row(1, 0, 0, 0), row(2, 0, 0, 0)];
    expect(leagueStanding(sorted, 2, (id) => id)).toBe(1);
    expect(leagueStanding(sorted, 0, (id) => id)).toBe(0);
  });

  it('a team outside any table sits in the middle', () => {
    expect(leagueStanding([row(0, 1, 1)], 9, () => 1)).toBe(0.5);
  });

  it('strikers and wingers score most in a real match, and a saved sheet without numbers still plays', () => {
    const tally: Record<number, number> = {};
    const squad = generateSquad(new Rng(1), 1, () => 'x');
    const byId = new Map(squad.map((p) => [p.id, p.number]));
    const sheet = { clubId: 0, attack: 70, defence: 70, standing: 1, lineup: lineup(squad) };
    const old = { clubId: 1, attack: 70, defence: 70, lineup: lineup(generateSquad(new Rng(2), 100, () => 'y')).map(({ id, position }) => ({ id, position })) };
    const rng = new Rng(3);
    for (let i = 0; i < 300; i++) {
      for (const g of outcome(playMatch(sheet, old, {}, rng)).goals) {
        const number = byId.get(g.playerId);
        if (number && !g.ownGoal) tally[number] = (tally[number] ?? 0) + 1;
      }
    }
    expect(tally[9]).toBeGreaterThan(tally[10]);
    expect(tally[10]).toBeGreaterThan(tally[7]);
    expect(tally[7]).toBeGreaterThan(tally[6]);
    expect(tally[1] ?? 0).toBeLessThan(5);
  });
});
