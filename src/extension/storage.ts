import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { SPORT_IDS, type SportId } from '../core/format';
import type { Feat } from '../core/honours';
import type { SavedGame } from './game';
import type { Lock, LockStore } from './ownership';

const ARCHIVE_KEY = 'sportsSimulator.archive';
const FEATS_KEY = 'sportsSimulator.feats';
const HONOURS_FROM_KEY = 'sportsSimulator.honoursFrom';

/** What the status bar and the collapsed box show, as worked out by the window running the game. */
export interface LiveStatus {
  /** When it was written: a window only trusts it while it's fresh. */
  at: number;
  text: string | null;
  tooltip: string;
  description?: string;
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
  ) {
    fs.mkdirSync(dir, { recursive: true });
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
    writeFile(this.sportPath, sport);
  }

  /** Football keeps the file name it has always had. */
  private savePath(sport: SportId = this.activeSport()): string {
    return path.join(this.dir, sport === 'football' ? 'career.json' : `career.${sport}.json`);
  }

  load(sport: SportId = this.activeSport()): SavedGame | null {
    const raw = readFile(this.savePath(sport));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SavedGame;
    } catch {
      return null;
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
    if (game) writeFile(this.savePath(sport), JSON.stringify(game));
    else fs.rmSync(this.savePath(sport), { force: true });
  }

  /** Moves a save this version can't read out of the way, whole, as `career.v<version>.json`. */
  backup(game: SavedGame, sport: SportId = this.activeSport()): void {
    writeFile(path.join(this.dir, sport === 'football' ? `career.v${game.version}.json` : `career.${sport}.v${game.version}.json`), JSON.stringify(game));
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
    writeFile(this.livePath, JSON.stringify(live));
  }

  readLive(): LiveStatus | null {
    try {
      return JSON.parse(readFile(this.livePath) ?? '') as LiveStatus;
    } catch {
      return null;
    }
  }

  read(): Lock {
    try {
      return JSON.parse(readFile(this.lockPath) ?? '') as Lock;
    } catch {
      return { owner: null };
    }
  }

  write(lock: Lock): void {
    writeFile(this.lockPath, JSON.stringify(lock));
  }
}

function readFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Written whole, then renamed into place, so a crash never leaves half a save. */
function writeFile(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
