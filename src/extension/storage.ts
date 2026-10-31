import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { SPORT_IDS, type SportId } from '../core/format';
import type { Feat } from '../core/honours';
import type { SavedGame } from './game';
import type { Lock, LockStore } from './ownership';

/** Where saves lived before they moved to a file; read once to carry old careers over. */
const LEGACY_KEY = 'sportsSimulator.career';
const ARCHIVE_KEY = 'sportsSimulator.archive';
/** Set once careers that were waiting from before sports ran together have been paused. */
const WAITING_PAUSED_KEY = 'sportsSimulator.waitingPaused';
const FEATS_KEY = 'sportsSimulator.feats';

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
    const raw = readFile(this.savePath(sport)) ?? (sport === 'football' ? this.memento.get<string>(LEGACY_KEY) : undefined);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SavedGame;
    } catch {
      return null;
    }
  }

  /** Ended careers, oldest first. Careers archived before there were other sports have no sport: they're football. */
  archives(): ArchivedCareer[] {
    return this.memento.get<ArchivedCareer[]>(ARCHIVE_KEY, []).map((c) => ({ ...c, sport: c.sport ?? 'football', history: c.history ?? [] }));
  }

  feats(): Feat[] {
    return this.memento.get<Feat[]>(FEATS_KEY, []);
  }

  addFeats(feats: Feat[]): void {
    void this.memento.update(FEATS_KEY, [...this.feats(), ...feats]);
  }

  archive(entry: ArchivedCareer): Thenable<void> {
    const list = this.memento.get<ArchivedCareer[]>(ARCHIVE_KEY, []);
    return this.memento.update(ARCHIVE_KEY, [...list, entry]);
  }

  /** Serialised straight away, so later changes to the live objects can't leak into the save. */
  save(game: SavedGame | null, sport: SportId = this.activeSport()): void {
    if (game) writeFile(this.savePath(sport), JSON.stringify(game));
    else fs.rmSync(this.savePath(sport), { force: true });
    // Only football's own save replaces its old copy: another sport saving first must not lose it.
    if (sport === 'football' && this.memento.get(LEGACY_KEY) !== undefined) void this.memento.update(LEGACY_KEY, undefined);
  }

  /**
   * Careers used to stop when the player switched sport. Now they all run, so
   * the ones left waiting are paused once, to start again when the player says.
   */
  pauseWaitingCareers(): void {
    if (this.memento.get(WAITING_PAUSED_KEY)) return;
    void this.memento.update(WAITING_PAUSED_KEY, true);
    const active = this.activeSport();
    for (const sport of SPORT_IDS) {
      const saved = sport === active ? null : this.load(sport);
      if (saved && !saved.paused) this.save({ ...saved, paused: true }, sport);
    }
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
