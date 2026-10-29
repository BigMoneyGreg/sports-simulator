import * as vscode from 'vscode';
import { Rng } from '../core/rng';
import { suggestClubName } from '../sports/football/names';
import { DURATIONS, type Duration, type ToHost } from '../shared/view';
import { Game } from './game';
import { SidebarProvider } from './sidebar';
import { StatusBar } from './statusBar';
import { Storage } from './storage';
import { buildView, statusText } from './viewModel';

let game: Game | undefined;
let storage: Storage | undefined;

export function activate(context: vscode.ExtensionContext): void {
  storage = new Storage(context.globalState);
  const statusBar = new StatusBar();
  const nameRng = new Rng(Date.now() >>> 0);
  let suggestedName = suggestClubName(nameRng);

  const config = () => vscode.workspace.getConfiguration('sideline');
  const duration = (): Duration => {
    const value = config().get<string>('matchDuration', '2m');
    return (DURATIONS as string[]).includes(value) ? (value as Duration) : '2m';
  };

  const sidebar = new SidebarProvider(context.extensionUri, (message) => handle(message));

  const refresh = () => {
    sidebar.post({ type: 'view', view: buildView(game!, () => suggestedName) });
    const text = statusText(game!);
    const seasonOver = !!game!.career?.pending;
    statusBar.update(config().get('statusBarScore', true) || seasonOver ? text : null);
  };

  game = new Game({
    save: (g) => void storage!.save(g),
    changed: refresh,
    seasonOver: (end) => {
      if (sidebar.visible) return;
      const pos = ordinal(end.position);
      void vscode.window
        .showInformationMessage(`Season ${end.season} over — ${pos} in League ${end.tier}. Allocate your points`, 'Open Sideline')
        .then((choice) => {
          if (choice) void vscode.commands.executeCommand('sideline.open');
        });
    },
  });
  game.duration = duration();
  game.load(storage.load());

  function handle(message: ToHost): void {
    switch (message.type) {
      case 'ready':
        refresh();
        return;
      case 'suggestName':
        suggestedName = suggestClubName(nameRng);
        sidebar.post({ type: 'suggestedName', name: suggestedName });
        return;
      case 'startCareer': {
        const name = message.name.trim().slice(0, 40) || suggestedName;
        void config().update('matchDuration', message.duration, vscode.ConfigurationTarget.Global);
        game!.duration = message.duration;
        game!.start({ rating: message.rating, difficulty: message.difficulty, split: message.split, clubName: name, seed: (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0 });
        return;
      }
      case 'togglePause':
        game!.togglePause();
        return;
      case 'setDuration':
        void config().update('matchDuration', message.duration, vscode.ConfigurationTarget.Global);
        return;
      case 'allocate':
        try {
          game!.allocate(message.allocation);
        } catch (err) {
          // The webview enforces the rules; a stale or invalid allocation just re-sends the view.
          console.warn('Sideline: allocation rejected', err);
          refresh();
        }
        return;
    }
  }

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
    vscode.commands.registerCommand('sideline.open', () => vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`)),
    vscode.commands.registerCommand('sideline.togglePause', () => game!.togglePause()),
    vscode.commands.registerCommand('sideline.resetCareer', async () => {
      const answer = await vscode.window.showWarningMessage('Reset your Sideline career? Your club, history and trophies will be lost.', { modal: true }, 'Reset career');
      if (answer === 'Reset career') game!.reset();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sideline.matchDuration')) game!.setDuration(duration());
      if (e.affectsConfiguration('sideline')) refresh();
    }),
  );
  refresh();
}

/** VS Code is closing: stop the clock exactly where it is and save. */
export function deactivate(): Thenable<void> | undefined {
  if (!game || !storage) return undefined;
  game.shutdown();
  return storage.save(game.snapshot());
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
