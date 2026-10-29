import * as vscode from 'vscode';
import { fullHistory } from '../core/career';
import { goalRanks } from '../core/league';
import { startRating } from '../core/league';
import { Rng } from '../core/rng';
import { isNation } from '../sports/football/names';
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

  const config = () => vscode.workspace.getConfiguration('sportsSimulator');
  const duration = (): Duration => {
    const value = config().get<string>('matchDuration', '2m');
    return (DURATIONS as string[]).includes(value) ? (value as Duration) : '2m';
  };

  const sidebar = new SidebarProvider(context.extensionUri, (message) => handle(message));
  const durations: Duration[] = DURATIONS;

  const refresh = () => {
    sidebar.post({ type: 'view', view: buildView(game!, { fullTimeOverlay: config().get('fullTimeOverlay', true), durations, language: vscode.env.language }) });
    const text = statusText(game!);
    const seasonOver = !!game!.career?.pending;
    statusBar.update(config().get('statusBarScore', true) || seasonOver ? text : null);
  };

  game = new Game({
    save: (g) => void storage!.save(g),
    changed: refresh,
    seasonOver: (end) => {
      if (sidebar.visible) return;
      // The one notification: the result, the clue (where scoring and conceding ranked) and the summer choice.
      const table = game!.career!.season.leagues[end.tier - 1].table;
      const me = table.find((r) => r.clubId === game!.career!.playerClubId)!;
      const ranks = goalRanks(table, me.clubId);
      const choices = { 'Rebuild attack': 'attack', 'Rebuild defence': 'defence' } as const;
      void vscode.window
        .showInformationMessage(
          `Season ${end.season} over: ${ordinal(end.position)} in League ${end.tier}. Scored ${me.goalsFor} (${ordinal(ranks.scored)} in the league), conceded ${me.goalsAgainst} (${ordinal(ranks.conceded)}). Which side do you rebuild?`,
          ...Object.keys(choices),
          'Open',
        )
        .then((choice) => {
          if (!choice) return;
          if (choice === 'Open') void vscode.commands.executeCommand('sportsSimulator.open');
          else if (game!.career?.pending?.season === end.season) game!.chooseFocus(choices[choice as keyof typeof choices]);
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
      case 'startCareer': {
        if (!isNation(message.team)) return;
        setDuration(message.duration);
        const seed = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0;
        const tier = Math.min(5, Math.max(1, Math.round(message.league)));
        // Somewhere in the league, weighted towards mid-table, attack and defence level: the summers shape it from there.
        const rating = startRating(tier, new Rng(seed ^ 0x9e3779b9));
        game!.start({ rating, difficulty: message.difficulty, team: message.team, seed });
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
      case 'chooseFocus':
        game!.chooseFocus(message.focus);
        return;
    }
  }

  function setDuration(d: Duration): void {
    if (!durations.includes(d)) return;
    game!.setDuration(d);
    void config().update('matchDuration', d, vscode.ConfigurationTarget.Global);
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
      const answer = await vscode.window.showWarningMessage('Reset your Sports Simulator career? Your history and trophies will be lost.', { modal: true }, 'Reset career');
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
