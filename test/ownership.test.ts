import { footballSport } from '../src/sports/football';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game, tickMs, type SavedGame } from '../src/extension/game';
import { HANDOVER_TIMEOUT_MS, Ownership, POLL_MS, type Lock } from '../src/extension/ownership';

const minute = tickMs(footballSport, '2m');

/** VS Code windows sharing one save and one lock, as they share the global storage folder. */
function world() {
  const disk = { save: null as string | null, lock: { owner: null } as Lock };
  const store = { read: () => ({ ...disk.lock }), write: (l: Lock) => void (disk.lock = { ...l }) };
  const windows: { game: Game; owner: Ownership; poll: ReturnType<typeof setInterval> }[] = [];
  const open = (id: string, focused: boolean) => {
    const game: Game = new Game({ save: (g) => owner.owning && (disk.save = g && JSON.stringify(g)), changed: () => {} });
    const load = () => (disk.save ? (JSON.parse(disk.save) as SavedGame) : null);
    game.load(load(), false);
    const owner: Ownership = new Ownership(id, store, { start: () => game.load(load()), stop: () => game.shutdown() });
    const w = { game, owner, poll: setInterval(() => owner.poll(), POLL_MS) };
    windows.push(w);
    owner.activate(focused);
    return w;
  };
  return { disk, open, windows };
}

describe('one game across several windows', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a lone window runs the game straight away, even when it is not focused', () => {
    const { open } = world();
    const a = open('a', false);
    expect(a.owner.owning).toBe(true);
    a.owner.whenOwner(() => a.game.start({ rating: 50, seed: 1 }));
    vi.advanceTimersByTime(minute * 10);
    expect(a.game.shownMatch!.match.minute).toBe(10);
  });

  it('a second, unfocused window only shows the game', () => {
    const { open } = world();
    const a = open('a', true);
    a.game.start({ rating: 50, seed: 2 });
    const b = open('b', false);
    expect(b.owner.owning).toBe(false);
    vi.advanceTimersByTime(minute * 10);
    expect(b.game.shownMatch!.match.minute).toBe(0);
    expect(a.game.shownMatch!.match.minute).toBe(10);
  });

  it('hands the game over on focus: the old window saves and stops, the new one carries on from that minute', () => {
    const { open, disk } = world();
    const a = open('a', true);
    a.game.start({ rating: 50, seed: 3 });
    const b = open('b', false);
    vi.advanceTimersByTime(minute * 30);

    b.owner.claim();
    // Until the handover, only A runs.
    expect(b.owner.owning).toBe(false);
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(a.owner.owning).toBe(false);
    expect(b.owner.owning).toBe(true);
    const handedOver = a.game.shownMatch!.match.minute;
    expect(JSON.parse(disk.save!).live.matches[0].minute).toBe(handedOver);

    vi.advanceTimersByTime(minute * 10);
    expect(a.game.shownMatch!.match.minute).toBe(handedOver);
    expect(b.game.shownMatch!.match.minute).toBeGreaterThanOrEqual(handedOver + 9);
  });

  it('a summer choice made in one window survives, because the other has stopped writing', () => {
    const { open, disk } = world();
    const a = open('a', true);
    a.game.duration = '30s';
    a.game.start({ rating: 50, seed: 4 });
    const b = open('b', false);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(a.game.phase).toBe('seasonOver');

    // The player answers in window B: it takes over first, then applies the choice.
    b.owner.whenOwner(() => b.game.chooseFocus('attack'));
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(b.game.career!.season.number).toBe(2);
    vi.advanceTimersByTime(minute * 20);
    expect(JSON.parse(disk.save!).career.season.number).toBe(2);
    expect(a.game.career!.season.number).toBe(1);
  });

  it('takes over after a timeout when the old owner closed without letting go', () => {
    const { open, disk } = world();
    const a = open('a', true);
    a.game.start({ rating: 50, seed: 5 });
    vi.advanceTimersByTime(minute * 5);
    // Window A crashes: its clock and poll stop, and the lock still names it.
    a.game.shutdown();
    clearInterval(a.poll);
    const b = open('b', true);
    expect(b.owner.owning).toBe(false);
    vi.advanceTimersByTime(HANDOVER_TIMEOUT_MS + POLL_MS);
    expect(b.owner.owning).toBe(true);
    expect(disk.lock).toEqual({ owner: 'b', ready: true });
    expect(b.game.shownMatch!.match.minute).toBeGreaterThanOrEqual(5);
  });

  it('closing the running window frees the game for the next one at once', () => {
    const { open, disk } = world();
    const a = open('a', true);
    a.game.start({ rating: 50, seed: 6 });
    vi.advanceTimersByTime(minute * 7);
    a.owner.release();
    clearInterval(a.poll);
    expect(disk.lock.owner).toBeNull();
    const b = open('b', false);
    expect(b.owner.owning).toBe(true);
    expect(b.game.shownMatch!.match.minute).toBe(7);
  });

  it('when a third window claims during a handover, the last one focused wins', () => {
    const { open } = world();
    const a = open('a', true);
    a.game.start({ rating: 50, seed: 7 });
    const b = open('b', false);
    const c = open('c', false);
    const done = vi.fn();
    b.owner.whenOwner(done);
    c.owner.claim();
    vi.advanceTimersByTime(POLL_MS * 3);
    expect([a, b, c].map((w) => w.owner.owning)).toEqual([false, false, true]);
    expect(done).not.toHaveBeenCalled();
  });
});
