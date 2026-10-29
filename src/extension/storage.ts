import type * as vscode from 'vscode';
import type { SavedGame } from './game';

const KEY = 'sideline.career';

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

  /** Serialised straight away, so later changes to the live objects can't leak into the save. */
  save(game: SavedGame | null): Thenable<void> {
    return this.memento.update(KEY, game ? JSON.stringify(game) : undefined);
  }
}
