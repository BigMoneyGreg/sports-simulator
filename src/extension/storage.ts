import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { SPORT_IDS, type SportId } from '../core/format';
import type { Feat } from '../core/honours';
import type { SeasonLength } from '../shared/view';
import type { SavedGame } from './game';
import type { Lock, LockStore } from './ownership';

const ARCHIVE_KEY = 'sportsSimulator.archive';
const FEATS_KEY = 'sportsSimulator.feats';
const HONOURS_FROM_KEY = 'sportsSimulator.honoursFrom';
/** The length the last career was started at, for the next new one. */
const LAST_DURATION_KEY = 'sportsSimulator.lastDuration';

/** What the player should hear about when the disk lets the game down. */
export interface StorageProblems {
  writeFailed?(error: unknown): void;
  /** A save that isn't valid JSON, set aside under this file name. */
  damagedSave?(sport: SportId, kept: string): void;
}

/** What the status bar and the collapsed box show, as worked out by the window running the game. */
export interface LiveStatus {
  /** When it was written: a window only trusts it while it's fresh. */
  at: number;
  text: string | null;
  tooltip: string;
  description?: string;
  /** The sport on show, which a click on the status bar opens. */
  sport?: SportId;
}

/** What's kept of a finished career. */
export interface ArchivedCareer {
  club: string;
  sport: SportId;
  archivedAt: string;
  seasons: number;
  history: SavedGame['career']['history'];
  records: SavedGame['career']['records'];
  /** See `honoursFrom`: the seasons before this one can't earn honours. */
  honoursFrom?: number;
}

/**
 * Careers live in the extension's global storage folder, one per sport, so
 * they follow you across every project. Files rather than global state: every
 * window reads the latest save straight from disk when it takes over the game.
 */
export class Storage implements LockStore {
  private readonly dir: string;
  private readonly sportPath: string;
  private readonly lockPath: string;
  private readonly livePath: string;

  constructor(
    dir: string,
    private readonly memento: vscode.Memento,
    private readonly problems: StorageProblems = {},
  ) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      problems.writeFailed?.(error);
    }
    this.dir = dir;
    this.sportPath = path.join(dir, 'sport.json');
    this.lockPath = path.join(dir, 'clock.json');
    this.livePath = path.join(dir, 'live.json');
  }

  /** The sport the status bar follows: the one last opened in the box. */
  activeSport(): SportId {
    const sport = readFile(this.sportPath)?.trim() as SportId | undefined;
    return sport && SPORT_IDS.includes(sport) ? sport : 'football';
  }

  setActiveSport(sport: SportId): void {
    this.put(this.sportPath, sport);
  }

  /** Football keeps the file name it has always had. */
  private savePath(sport: SportId = this.activeSport()): string {
    return path.join(this.dir, sport === 'football' ? 'career.json' : `career.${sport}.json`);
  }

  load(sport: SportId = this.activeSport()): SavedGame | null {
    const raw = readFile(this.savePath(sport));
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw) as SavedGame | null;
      if (saved && typeof saved === 'object') return saved;
    } catch {
      // Damaged, like anything else that isn't a save.
    }
    this.setAside(sport);
    return null;
  }

  /** Left where it was, a damaged save would look like no career and be deleted. It's kept, as it may be rescued by hand. */
  private setAside(sport: SportId): void {
    const file = this.savePath(sport);
    const kept = `${path.basename(file, '.json')}.damaged-${Date.now()}.json`;
    try {
      fs.renameSync(file, path.join(this.dir, kept));
      this.problems.damagedSave?.(sport, kept);
    } catch (error) {
      this.problems.writeFailed?.(error);
    }
  }

  /** Ended careers, oldest first. */
  archives(): ArchivedCareer[] {
    return this.memento.get<ArchivedCareer[]>(ARCHIVE_KEY, []);
  }

  feats(): Feat[] {
    return this.memento.get<Feat[]>(FEATS_KEY, []);
  }

  addFeats(feats: Feat[]): void {
    void this.memento.update(FEATS_KEY, [...this.feats(), ...feats]);
  }

  /** For each running career, the season honours count from since the player last reset them. */
  honoursFrom(sport: SportId): number | undefined {
    return this.memento.get<Partial<Record<SportId, number>>>(HONOURS_FROM_KEY, {})[sport];
  }

  /** That sport's career has gone: the next one starts with a clean slate. */
  clearHonoursFrom(sport: SportId): void {
    const { [sport]: _, ...rest } = this.memento.get<Partial<Record<SportId, number>>>(HONOURS_FROM_KEY, {});
    void this.memento.update(HONOURS_FROM_KEY, rest);
  }

  /** Deletes honours and past careers. Running careers carry on, earning honours only from the seasons still to come. */
  resetHonours(seasonsPlayed: Partial<Record<SportId, number>>): void {
    void this.memento.update(FEATS_KEY, []);
    void this.memento.update(ARCHIVE_KEY, []);
    void this.memento.update(HONOURS_FROM_KEY, seasonsPlayed);
  }

  archive(entry: ArchivedCareer): Thenable<void> {
    const list = this.memento.get<ArchivedCareer[]>(ARCHIVE_KEY, []);
    return this.memento.update(ARCHIVE_KEY, [...list, entry]);
  }

  /** Serialised straight away, so later changes to the live objects can't leak into the save. */
  save(game: SavedGame | null, sport: SportId = this.activeSport()): void {
    if (game) this.put(this.savePath(sport), JSON.stringify(game));
    else {
      try {
        fs.rmSync(this.savePath(sport), { force: true });
      } catch (error) {
        this.problems.writeFailed?.(error);
      }
    }
  }

  /** Moves a save this version can't read out of the way, whole, as `career.v<version>.json`. */
  backup(game: SavedGame, sport: SportId = this.activeSport()): void {
    this.put(path.join(this.dir, sport === 'football' ? `career.v${game.version}.json` : `career.${sport}.v${game.version}.json`), JSON.stringify(game));
    this.save(null, sport);
  }

  /** When the save last changed on disk (0 if there's none), so other windows can follow it. */
  savedAt(sport: SportId = this.activeSport()): number {
    try {
      return fs.statSync(this.savePath(sport)).mtimeMs;
    } catch {
      return 0;
    }
  }

  /** The running window's status bar and collapsed-box text, for the other windows to show. */
  writeLive(live: LiveStatus): void {
    this.put(this.livePath, JSON.stringify(live));
  }

  readLive(): LiveStatus | null {
    try {
      return JSON.parse(readFile(this.livePath) ?? '') as LiveStatus;
    } catch {
      return null;
    }
  }

  lastDuration(): SeasonLength | undefined {
    return this.memento.get<SeasonLength>(LAST_DURATION_KEY);
  }

  setLastDuration(duration: SeasonLength | undefined): void {
    void this.memento.update(LAST_DURATION_KEY, duration);
  }

  read(): Lock {
    try {
      return JSON.parse(readFile(this.lockPath) ?? '') as Lock;
    } catch {
      return { owner: null };
    }
  }

  write(lock: Lock): void {
    this.put(this.lockPath, JSON.stringify(lock));
  }

  /** Written whole, then renamed into place, so a crash never leaves half a save. Never throws: the game plays on and saves again soon. */
  private put(file: string, text: string): void {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, text);
      renameSoon(tmp, file);
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      this.problems.writeFailed?.(error);
    }
  }
}

function readFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

const RENAME_TRIES = 5;
const RENAME_WAIT_MS = 20;

/** On Windows a rename fails while another window or a virus scanner has the file open, which passes in moments. */
function renameSoon(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const busy = ['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');
      if (!busy || attempt === RENAME_TRIES) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}
