import { describe, expect, it } from 'vitest';
import { chooseFocus, newCareer, playSeason, type Career, type Focus } from '../src/core/career';
import { Game } from '../src/extension/game';
import { buildView, summerQuestion } from '../src/extension/viewModel';
import { footballSport } from '../src/sports/football';
import { role } from '../src/sports/football/squad';
import { effectiveStats } from '../src/sports/football/match';
import { RATING_TUNING } from '../src/core/ratings';

/** Plays summers, answering each with `pick`, and hands every summer to `look` before it's answered. */
function summers(seed: number, count: number, look: (c: Career) => void, pick: (c: Career) => Focus = () => 'attack'): Career {
  const c = newCareer({ rating: 50, seed }, footballSport);
  for (let i = 0; i < count; i++) {
    playSeason(c, footballSport);
    look(c);
    chooseFocus(c, pick(c));
  }
  return c;
}

const leavers = (c: Career) => {
  const change = c.pending!.turnover.find((t) => t.clubId === c.playerClubId)!;
  return change.out.map((id) => c.clubs[c.playerClubId].squad.find((p) => p.id === id)!);
};

describe('the summer question', () => {
  it("draws the player's leavers mostly from the end of the pitch that lost most", () => {
    const attackLeavers = { attackHit: [] as number[], defenceHit: [] as number[] };
    for (const seed of [1, 2]) {
      summers(seed, 15, (c) => {
        const d = c.pending!.declineByStat;
        const share = d.attack / (d.attack + d.defence);
        const out = leavers(c);
        const fromAttack = out.filter((p) => role(p).side === 'attack').length / out.length;
        if (share > 0.65) attackLeavers.attackHit.push(fromAttack);
        if (share < 0.35) attackLeavers.defenceHit.push(fromAttack);
      });
    }
    const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    expect(attackLeavers.attackHit.length).toBeGreaterThan(5);
    expect(attackLeavers.defenceHit.length).toBeGreaterThan(5);
    expect(avg(attackLeavers.attackHit)).toBeGreaterThan(0.7);
    expect(avg(attackLeavers.defenceHit)).toBeLessThan(0.3);
  }, 30_000);

  it('never asks the same style twice running, and calls players up most often', () => {
    const styles: string[] = [];
    summers(4, 40, (c) => styles.push(c.pending!.question!.style));
    for (let i = 1; i < styles.length; i++) expect(styles[i]).not.toBe(styles[i - 1]);
    const count = (s: string) => styles.filter((x) => x === s).length;
    for (const s of ['coach', 'formation', 'training']) {
      expect(count(s)).toBeGreaterThan(0);
      expect(count('callUp')).toBeGreaterThan(count(s));
    }
  }, 30_000);

  it('a call-up joins the squad at his end of the pitch; the other candidate never does', () => {
    let checked = 0;
    summers(
      5,
      12,
      (c) => {
        const q = c.pending!.question!;
        if (q.style !== 'callUp') return;
        expect(role(q.callUps!.attack.player).side).toBe('attack');
        expect(role(q.callUps!.defence.player).side).toBe('defence');
        const { attack, defence } = q.callUps!;
        chooseFocus(c, 'defence');
        const squad = c.clubs[c.playerClubId].squad;
        expect(squad.map((p) => p.id)).toContain(defence.player.id);
        expect(squad.map((p) => p.id)).not.toContain(attack.player.id);
        expect(squad).toHaveLength(18);
        expect(new Set(squad.map((p) => p.number)).size).toBe(18);
        checked++;
        playSeason(c, footballSport);
      },
      () => 'attack',
    );
    expect(checked).toBeGreaterThan(1);
  });

  it('a new coach played at the end of the pitch his answer rebuilds', () => {
    let checked = 0;
    summers(6, 16, (c) => {
      const q = c.pending!.question!;
      if (q.style !== 'coach') return;
      const sideOf = (label: string) => role(c.clubs[c.playerClubId].squad.find((p) => role(p).label === label)!).side;
      expect(sideOf(q.people!.attack.role)).toBe('attack');
      expect(sideOf(q.people!.defence.role)).toBe('defence');
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('shows each style with its own prompt and answers', () => {
    const seen = new Map<string, ReturnType<typeof summerQuestion>>();
    summers(7, 12, (c) => seen.set(c.pending!.question!.style, summerQuestion(c)));
    expect(seen.get('callUp')).toMatchObject({ prompt: 'Retirements leave gaps. Who gets the call?' });
    expect(seen.get('callUp')!.options[0]).toMatchObject({ title: expect.stringMatching(/^Call up /), line: expect.stringMatching(/striker|winger|attacking midfielder/) });
    expect(seen.get('coach')!.options[1]).toMatchObject({ title: expect.stringMatching(/^Appoint /), line: expect.stringMatching(/^former (goalkeeper|full-back|centre-back|defensive midfielder)$/) });
    expect(seen.get('formation')!.options.map((o) => o.title)).toEqual(['Three up front', 'A back five']);
    expect(seen.get('training')!.options.map((o) => o.title)).toEqual(['Finishing', 'Defending']);
  }, 30_000);

  it('lists leavers with what they play, retiring long servants and dropping the rest', () => {
    const game = new Game({ save: () => {}, changed: () => {} });
    game.start({ rating: 50, seed: 8, team: 'SCO' });
    playSeason(game.career!, footballSport);
    const v = buildView(game);
    if (v.screen !== 'game' || !v.seasonEnd) throw new Error('expected the summer screen');
    // After one season nobody has served long enough to retire.
    for (const line of v.seasonEnd.squad.leaving) expect(line).toMatch(/^.+ · (goalkeeper|full-back|centre-back|defensive midfielder|winger|attacking midfielder|striker) · dropped$/);
  });

  it('still asks a question for a save from before questions existed', () => {
    const c = newCareer({ rating: 50, seed: 9 }, footballSport);
    playSeason(c, footballSport);
    delete c.pending!.question;
    expect(summerQuestion(c).options.map((o) => o.title)).toEqual(['Three up front', 'A back five']);
    chooseFocus(c, 'attack');
    expect(c.history).toHaveLength(1);
  });

  it('settles into a new shape over a few summers, and the penalty follows the settled shape', () => {
    expect(RATING_TUNING.leanSettling).toBe(0.5);
    const c = newCareer({ rating: 50, seed: 11 }, footballSport);
    const lean = () => c.clubs[c.playerClubId].attack - c.clubs[c.playerClubId].defence;
    playSeason(c, footballSport);
    chooseFocus(c, 'attack');
    // The first summer starts from the real shape.
    const first = c.clubs[c.playerClubId].settledLean!;
    expect(first).toBeCloseTo(lean());
    playSeason(c, footballSport);
    chooseFocus(c, 'defence');
    // After that, half the way each summer.
    expect(c.clubs[c.playerClubId].settledLean!).toBeCloseTo(first + 0.5 * (lean() - first));
    // A side that's just become lopsided is penalised for its settled lean, not yet the full one.
    const lopsided = { attack: 130, defence: 100 };
    expect(effectiveStats({ ...lopsided, settledLean: 10 }).attack).toBeGreaterThan(effectiveStats(lopsided).attack);
  });
});
