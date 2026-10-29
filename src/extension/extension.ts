import * as vscode from 'vscode';
import { fullHistory } from '../core/career';
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

  const config = () => vscode.workspace.getConfiguration('sportsSimulator');
  const duration = (): Duration => {
    const value = config().get<string>('matchDuration', '2m');
    return (DURATIONS as string[]).includes(value) ? (value as Duration) : '2m';
  };

  const sidebar = new SidebarProvider(context.extensionUri, (message) => handle(message));
  // Running from source (F5) adds a 10-second speed for testing; it's never written to settings.
  const devMode = context.extensionMode === vscode.ExtensionMode.Development;
  const durations: Duration[] = devMode ? ['10s', ...DURATIONS] : DURATIONS;

  const refresh = () => {
    sidebar.post({ type: 'view', view: buildView(game!, () => suggestedName, { fullTimeOverlay: config().get('fullTimeOverlay', true), durations }) });
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
        .showInformationMessage(`Season ${end.season} over — ${pos} in League ${end.tier}. Allocate your points`, 'Open Sports Simulator')
        .then((choice) => {
          if (choice) void vscode.commands.executeCommand('sportsSimulator.open');
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
        setDuration(message.duration);
        game!.start({ rating: message.rating, difficulty: message.difficulty, split: message.split, clubName: name, seed: (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0 });
        return;
      }
      case 'togglePause':
        game!.togglePause();
        return;
      case 'setDuration':
        setDuration(message.duration);
        refresh();
        return;
      case 'copy':
        void vscode.env.clipboard.writeText(message.text).then(() => vscode.window.setStatusBarMessage('Sports Simulator: summary copied', 2000));
        return;
      case 'newCareer':
        void newCareer();
        return;
      case 'resetCareer':
        void vscode.commands.executeCommand('sportsSimulator.resetCareer');
        return;
      case 'allocate':
        try {
          game!.allocate(message.allocation);
        } catch (err) {
          // The webview enforces the rules; a stale or invalid allocation just re-sends the view.
          console.warn('Sports Simulator: allocation rejected', err);
          refresh();
        }
        return;
    }
  }

  function setDuration(d: Duration): void {
    if (!durations.includes(d)) return;
    game!.setDuration(d);
    if (DURATIONS.includes(d)) void config().update('matchDuration', d, vscode.ConfigurationTarget.Global);
  }

  async function newCareer(): Promise<void> {
    const answer = await vscode.window.showInformationMessage('Start a new career? This one will be archived with its history and records.', { modal: true }, 'New career');
    if (answer !== 'New career' || !game!.career) return;
    const c = game!.career;
    const history = fullHistory(c);
    await storage!.archive({ club: c.clubs[c.playerClubId].name, archivedAt: new Date().toISOString(), seasons: history.length, history, records: c.records });
    game!.reset();
  }

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
    vscode.commands.registerCommand('sportsSimulator.open', () => vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`)),
    vscode.commands.registerCommand('sportsSimulator.togglePause', () => game!.togglePause()),
    vscode.commands.registerCommand('sportsSimulator.resetCareer', async () => {
      const answer = await vscode.window.showWarningMessage('Reset your Sports Simulator career? Your club, history and trophies will be lost.', { modal: true }, 'Reset career');
      if (answer === 'Reset career') game!.reset();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sportsSimulator.matchDuration')) game!.setDuration(duration());
      if (e.affectsConfiguration('sportsSimulator')) refresh();
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
