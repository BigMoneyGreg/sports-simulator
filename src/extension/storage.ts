import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { SavedGame } from './game';
import type { Lock, LockStore } from './ownership';

/** Where saves lived before they moved to a file; read once to carry old careers over. */
const LEGACY_KEY = 'sportsSimulator.career';
const ARCHIVE_KEY = 'sportsSimulator.archive';

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
  archivedAt: string;
  seasons: number;
  history: SavedGame['career']['history'];
  records: SavedGame['career']['records'];
}

/**
 * The career lives in the extension's global storage folder, so it follows you
 * across every project. A file rather than global state: every window reads
 * the latest save straight from disk when it takes over the game.
 */
export class Storage implements LockStore {
  private readonly savePath: string;
  private readonly lockPath: string;
  private readonly livePath: string;

  constructor(
    dir: string,
    private readonly memento: vscode.Memento,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.savePath = path.join(dir, 'career.json');
    this.lockPath = path.join(dir, 'clock.json');
    this.livePath = path.join(dir, 'live.json');
  }

  load(): SavedGame | null {
    const raw = readFile(this.savePath) ?? this.memento.get<string>(LEGACY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SavedGame;
    } catch {
      return null;
    }
  }

  archive(entry: ArchivedCareer): Thenable<void> {
    const list = this.memento.get<ArchivedCareer[]>(ARCHIVE_KEY, []);
    return this.memento.update(ARCHIVE_KEY, [...list, entry]);
  }

  /** Serialised straight away, so later changes to the live objects can't leak into the save. */
  save(game: SavedGame | null): void {
    if (game) writeFile(this.savePath, JSON.stringify(game));
    else fs.rmSync(this.savePath, { force: true });
    if (this.memento.get(LEGACY_KEY) !== undefined) void this.memento.update(LEGACY_KEY, undefined);
  }

  /** Moves a save this version can't read out of the way, whole, as `career.v<version>.json`. */
  backup(game: SavedGame): void {
    writeFile(path.join(path.dirname(this.savePath), `career.v${game.version}.json`), JSON.stringify(game));
    this.save(null);
  }

  /** When the save last changed on disk (0 if there's none), so other windows can follow it. */
  savedAt(): number {
    try {
      return fs.statSync(this.savePath).mtimeMs;
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
