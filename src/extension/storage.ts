import type * as vscode from 'vscode';
import type { SavedGame } from './game';

const KEY = 'sportsSimulator.career';
const ARCHIVE_KEY = 'sportsSimulator.archive';

/** What's kept of a finished career (a full Hall of Fame comes later). */
export interface ArchivedCareer {
  club: string;
  archivedAt: string;
  seasons: number;
  history: SavedGame['career']['history'];
  records: SavedGame['career']['records'];
}

/** The career lives in global state, so it follows you across every project. */
export class Storage {
  constructor(private readonly memento: vscode.Memento) {}

  load(): SavedGame | null {
    const raw = this.memento.get<string>(KEY);
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
  save(game: SavedGame | null): Thenable<void> {
    return this.memento.update(KEY, game ? JSON.stringify(game) : undefined);
  }
}
