// Which VS Code window runs the game. Every window shares one save, so only
// one may run the clock: the one the player last focused. No VS Code imports:
// the lock store and clock are injected, so two windows can be simulated in tests.

/** Kept beside the save: who runs the clock, and whether the last owner has saved and let go. */
export interface Lock {
  owner: string | null;
  ready?: boolean;
}

export interface LockStore {
  read(): Lock;
  write(lock: Lock): void;
}

export interface OwnerHost {
  /** Load the latest save and run the clock. */
  start(): void;
  /** Stop the clock and save where it is. */
  stop(): void;
}

/** How long a new owner waits for the old one to save and let go (it may have crashed). */
export const HANDOVER_TIMEOUT_MS = 3000;
/** How often the owner checks it still owns the clock, and a new owner checks for the handover. */
export const POLL_MS = 1000;

export class Ownership {
  owning = false;
  private waitingSince: number | null = null;
  /** Player actions that arrived before this window took over. */
  private pending: (() => void)[] = [];

  constructor(
    readonly id: string,
    private readonly store: LockStore,
    private readonly host: OwnerHost,
    private readonly now: () => number = Date.now,
  ) {}

  /** Activation: the focused window takes over; an unfocused one only if nobody runs the game. */
  activate(focused: boolean): void {
    if (focused || !this.store.read().owner) this.claim();
  }

  /** This window wants the clock (it was focused, or the player did something here). */
  claim(): void {
    if (this.owning || this.waitingSince !== null) return;
    const lock = this.store.read();
    if (!lock.owner) {
      this.store.write({ owner: this.id, ready: true });
      this.take();
      return;
    }
    // Another window is running it: ask it to save and let go.
    this.store.write({ owner: this.id, ready: false });
    this.waitingSince = this.now();
  }

  /** Runs every POLL_MS. */
  poll(): void {
    const lock = this.store.read();
    if (!this.owning && this.waitingSince === null) {
      // The window running the game has closed: carry on here rather than wait to be focused.
      if (!lock.owner) this.claim();
      return;
    }
    if (this.owning) {
      if (lock.owner === this.id) return;
      // Another window took over: save, stop, and tell it the save is ready.
      this.host.stop();
      this.owning = false;
      if (lock.owner && this.store.read().owner === lock.owner) this.store.write({ owner: lock.owner, ready: true });
      return;
    }
    if (lock.owner !== this.id) {
      // A third window claimed it in the meantime.
      this.waitingSince = null;
      this.pending = [];
      return;
    }
    if (lock.ready || this.now() - this.waitingSince! >= HANDOVER_TIMEOUT_MS) {
      if (!lock.ready) this.store.write({ owner: this.id, ready: true });
      this.take();
    }
  }

  /** Runs a player action here once this window owns the game, taking over first if needed. */
  whenOwner(action: () => void): void {
    if (this.owning) {
      action();
      return;
    }
    this.pending.push(action);
    this.claim();
  }

  /** VS Code is closing: save and leave the game free for the next window. */
  release(): void {
    if (!this.owning) return;
    this.host.stop();
    this.owning = false;
    if (this.store.read().owner === this.id) this.store.write({ owner: null });
  }

  private take(): void {
    this.waitingSince = null;
    this.owning = true;
    this.host.start();
    const actions = this.pending;
    this.pending = [];
    actions.forEach((a) => a());
  }
}
