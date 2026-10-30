import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { SavedGame } from './game';
import type { Lock, LockStore } from './ownership';

/** Where saves lived before they moved to a file; read once to carry old careers over. */
const LEGACY_KEY = 'sportsSimulator.career';
const ARCHIVE_KEY = 'sportsSimulator.archive';

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

  constructor(
    dir: string,
    private readonly memento: vscode.Memento,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.savePath = path.join(dir, 'career.json');
    this.lockPath = path.join(dir, 'clock.json');
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
