import * as vscode from 'vscode';
import { fullHistory } from '../core/career';
import { goalRanks, startRating } from '../core/league';
import { Rng } from '../core/rng';
import { isNation } from '../sports/football/names';
import { ordinal } from '../shared/format';
import { DURATIONS, type Duration, type ToHost } from '../shared/view';
import { Game } from './game';
import { Ownership, POLL_MS } from './ownership';
import { SidebarProvider } from './sidebar';
import { StatusBar } from './statusBar';
import { Storage, type LiveStatus } from './storage';
import { buildView, collapsedText, GoalWatch, leaversLine, SEASON_OVER, statusText, statusTooltip, summerQuestion } from './viewModel';

let ownership: Ownership | undefined;

/** How long another window's shared status text counts as current (it's rewritten every match-minute while a match is on). */
const LIVE_FRESH_MS = 30_000;

export function activate(context: vscode.ExtensionContext): void {
  const storage = new Storage(context.globalStorageUri.fsPath, context.globalState);
  const statusBar = new StatusBar();

  const config = () => vscode.workspace.getConfiguration('sportsSimulator');
  const duration = (): Duration => {
    const value = config().get<string>('matchDuration', '2m');
    return (DURATIONS as string[]).includes(value) ? (value as Duration) : '2m';
  };

  const sidebar = new SidebarProvider(context.extensionUri, (message) => handle(message));
  const durations: Duration[] = DURATIONS;

  const goals = new GoalWatch();
  let lastLive = '';
  /**
   * The status bar and collapsed-box text. The window running the game works
   * it out and shares it through a small file; the other windows show that
   * while it's fresh, and otherwise what their copy of the save says.
   */
  const outside = (): LiveStatus => {
    if (owner.owning) {
      const live = { at: Date.now(), text: statusText(game, goals.check(game)), tooltip: statusTooltip(game), description: collapsedText(game) };
      const key = JSON.stringify({ ...live, at: 0 });
      if (key !== lastLive) {
        lastLive = key;
        storage.writeLive(live);
      }
      return live;
    }
    const shared = storage.readLive();
    if (shared && Date.now() - shared.at < LIVE_FRESH_MS) return shared;
    return { at: 0, text: statusText(game), tooltip: statusTooltip(game), description: collapsedText(game) };
  };

  const refresh = () => {
    if (sidebar.visible) sidebar.post({ type: 'view', view: buildView(game, { fullTimeOverlay: config().get('fullTimeOverlay', true), durations, language: vscode.env.language }) });
    const live = outside();
    // Starting a career and the summer choice show even with the score turned off: they're waiting on the player.
    const waiting = !game.career || !!game.career.pending;
    statusBar.update(config().get('statusBarScore', true) || waiting ? live.text : null, live.tooltip);
    sidebar.setInfo(live.description, game.career?.pending ? { value: 1, tooltip: SEASON_OVER } : undefined);
  };

  const game = new Game({
    // Only the window running the game writes the shared save.
    save: (g) => {
      if (owner.owning) storage.save(g);
    },
    changed: refresh,
    seasonOver: (end) => {
      if (sidebar.visible) return;
      // The one notification: the result, the clues (goal ranks and who's leaving) and the summer's question.
      const career = game.career!;
      const table = career.season.leagues[end.tier - 1].table;
      const me = table.find((r) => r.clubId === career.playerClubId)!;
      const ranks = goalRanks(table, me.clubId);
      const question = summerQuestion(career);
      const leavers = leaversLine(career);
      void vscode.window
        .showInformationMessage(
          `Season ${end.season} over: ${ordinal(end.position)} in League ${end.tier}. Scored ${me.goalsFor} (${ordinal(ranks.scored)}), conceded ${me.goalsAgainst} (${ordinal(ranks.conceded)}).${leavers ? ` ${leavers}` : ''} ${question.prompt}`,
          ...question.options.map((o) => o.title),
          'Open',
        )
        .then((choice) => {
          if (!choice) return;
          const answer = question.options.find((o) => o.title === choice);
          if (!answer) void vscode.commands.executeCommand('sportsSimulator.open');
          else owner.whenOwner(() => game.career?.pending?.season === end.season && game.chooseFocus(answer.focus));
        });
    },
    unreadable: (old) => {
      // Kept whole as a backup, and its history archived like a finished career, before the player starts again.
      storage.backup(old);
      try {
        const c = old.career;
        const history = c.history ?? [];
        void storage.archive({ club: c.clubs[c.playerClubId].name, archivedAt: new Date().toISOString(), seasons: history.length, history, records: c.records });
      } catch {
        // Too different to read; the backup still has it all.
      }
      void vscode.window.showInformationMessage(
        "Sports Simulator was updated and your career couldn't carry over. Its history and a full backup have been kept. Start a new career in the Sports Simulator box.",
      );
    },
  });
  game.duration = duration();
  // Shown straight away; the clock only runs once this window owns the game.
  game.load(storage.load(), false);

  const owner = new Ownership(`${process.pid}-${Math.random().toString(36).slice(2)}`, storage, {
    start: () => {
      game.load(storage.load());
      refresh();
    },
    stop: () => {
      game.shutdown();
      refresh();
    },
  });
  ownership = owner;

  function handle(message: ToHost): void {
    switch (message.type) {
      case 'ready':
        refresh();
        return;
      case 'startCareer': {
        if (!isNation(message.team)) return;
        const { team, league } = message;
        setDuration(message.duration);
        owner.whenOwner(() => {
          const seed = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0;
          const tier = Math.min(5, Math.max(1, Math.round(league)));
          // Somewhere in the league, weighted towards mid-table, attack and defence level: the summers shape it from there.
          const rating = startRating(tier, new Rng(seed ^ 0x9e3779b9));
          // One standard game: every career gets the tuning measured as 'medium'.
          game.start({ rating, difficulty: 'medium', team, seed });
        });
        return;
      }
      case 'togglePause':
        owner.whenOwner(() => game.togglePause());
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
      case 'chooseFocus': {
        const { focus } = message;
        owner.whenOwner(() => game.chooseFocus(focus));
        return;
      }
    }
  }

  function setDuration(d: Duration): void {
    if (!durations.includes(d)) return;
    game.setDuration(d);
    void config().update('matchDuration', d, vscode.ConfigurationTarget.Global);
  }

  async function newCareer(): Promise<void> {
    const answer = await vscode.window.showInformationMessage('Start a new career? This one will be archived with its history and records.', { modal: true }, 'New career');
    if (answer !== 'New career') return;
    owner.whenOwner(() => {
      const c = game.career;
      if (!c) return;
      const history = fullHistory(c);
      void storage.archive({ club: c.clubs[c.playerClubId].name, archivedAt: new Date().toISOString(), seasons: history.length, history, records: c.records });
      game.reset();
    });
  }

  let followedSave = 0;
  const poll = setInterval(() => {
    owner.poll();
    if (owner.owning) return;
    // Another window runs the game: follow its save, so this window's box keeps up with goals and full time.
    const at = storage.savedAt();
    if (at !== followedSave) {
      followedSave = at;
      game.load(storage.load(), false);
    }
    refresh();
  }, POLL_MS);

  context.subscriptions.push(
    statusBar,
    { dispose: () => clearInterval(poll) },
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
    vscode.commands.registerCommand('sportsSimulator.open', () => vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`)),
    vscode.commands.registerCommand('sportsSimulator.togglePause', () => owner.whenOwner(() => game.togglePause())),
    vscode.commands.registerCommand('sportsSimulator.resetCareer', async () => {
      const answer = await vscode.window.showWarningMessage('Reset your Sports Simulator career? Your history and trophies will be lost.', { modal: true }, 'Reset career');
      if (answer === 'Reset career') owner.whenOwner(() => game.reset());
    }),
    // The window you're working in runs the game; the others stand by.
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) owner.claim();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sportsSimulator.matchDuration')) game.setDuration(duration());
      if (e.affectsConfiguration('sportsSimulator')) refresh();
    }),
  );
  owner.activate(vscode.window.state.focused);
  refresh();

  // First install: open the box once, so it's clear where the game lives.
  if (!game.career && !context.globalState.get('sportsSimulator.welcomed')) {
    void context.globalState.update('sportsSimulator.welcomed', true);
    void vscode.commands.executeCommand('sportsSimulator.open');
  }
}

/** VS Code is closing: stop the clock exactly where it is, save, and free the game for the next window. */
export function deactivate(): void {
  ownership?.release();
}
