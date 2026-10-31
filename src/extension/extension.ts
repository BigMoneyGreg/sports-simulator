import * as vscode from 'vscode';
import { fullHistory } from '../core/career';
import { SPORT_IDS, type SportId } from '../core/format';
import { startRating } from '../core/league';
import { Rng } from '../core/rng';
import { ordinal } from '../shared/format';
import { newFeats, FEAT_TITLES, type CareerSummary } from '../core/honours';
import { DURATIONS, type Duration, type PanelId, type ToHost } from '../shared/view';
import { Game } from './game';
import { Ownership, POLL_MS } from './ownership';
import { SidebarProvider } from './sidebar';
import { StatusBar } from './statusBar';
import { Storage, type LiveStatus } from './storage';
import { anotherDecisionWaiting, boxStatus, buildHonours, buildView, careerSummary, honoursLine, GoalWatch, leaversLine, SEASON_OVER, seasonClue, sportRows, statusGame, summerQuestion } from './viewModel';

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
  storage.pauseWaitingCareers();
  /** The sport the corner follows: the one last opened, kept for next time. */
  let followed = storage.activeSport();
  /** The one thing fully open in the box, if any. Each window has its own. */
  let open: PanelId | null = followed;
  let lastLive = '';
  const goals = Object.fromEntries(SPORT_IDS.map((id) => [id, new GoalWatch()])) as Record<SportId, GoalWatch>;
  /**
   * The status bar and collapsed-box text. The window running the game works
   * it out and shares it through a small file; the other windows show that
   * while it's fresh, and otherwise what their copy of the saves says.
   */
  const outside = (): LiveStatus => {
    if (owner.owning) {
      const shown = statusGame(all(), followed);
      // Every sport's watch keeps up, so going back to one doesn't call out a goal from earlier.
      const fresh = all().map((g) => goals[g.sportId].check(g));
      const live = { at: Date.now(), ...boxStatus(all(), followed, fresh[all().indexOf(shown)]) };
      const key = JSON.stringify({ ...live, at: 0 });
      if (key !== lastLive) {
        lastLive = key;
        storage.writeLive(live);
      }
      return live;
    }
    const shared = storage.readLive();
    if (shared && Date.now() - shared.at < LIVE_FRESH_MS) return shared;
    return { at: 0, ...boxStatus(all(), followed) };
  };

  /** `from`: the sport that changed. A minimised sport's tick only needs the rows, not the open sport's whole view again. */
  const refresh = (from?: SportId) => {
    if (sidebar.visible) {
      const full = !from || from === open;
      const view = full ? { view: openView() } : {};
      sidebar.post({ type: 'view', rows: sportRows(all()), honours: honoursLine(all(), storage.archives().length, storage.feats().length), open, ...view });
    }
    const live = outside();
    const decisions = all().filter((g) => g.career?.pending).length;
    // Starting a career and the summer choice show even with the score turned off: they're waiting on the player.
    const waiting = !all().some((g) => g.career) || decisions > 0;
    statusBar.update(config().get('statusBarScore', true) || waiting ? live.text : null, live.tooltip);
    sidebar.setInfo(live.description, decisions ? { value: decisions, tooltip: decisions === 1 ? SEASON_OVER : `${decisions} seasons over: decisions waiting` } : undefined);
  };

  function openView() {
    if (open === 'honours') return buildHonours(liveCareers(), storage.archives(), storage.feats());
    return open && buildView(games[open], { fullTimeOverlay: config().get('fullTimeOverlay', true), language: vscode.env.language });
  }

  function liveCareers(): CareerSummary[] {
    return all().flatMap((g) => {
      const c = careerSummary(g);
      return c ? [{ ...c, honoursFrom: storage.honoursFrom(g.sportId) }] : [];
    });
  }

  /** A rare moment, so it gets a notification of its own, and it's kept even if the careers later end. */
  function checkHonours(): void {
    const label = (sport: SportId) => games[sport].sport.present.terms.name;
    const earned = newFeats(liveCareers(), storage.archives(), storage.feats(), new Date().toISOString(), label);
    if (!earned.length) return;
    storage.addFeats(earned);
    for (const f of earned) void vscode.window.showInformationMessage(`Honour earned: ${FEAT_TITLES[f.id]}. ${f.detail}`);
    refresh();
  }

  function newGame(sport: SportId): Game {
    const game: Game = new Game({
      // Only the window running the game writes the shared saves.
      save: (g) => {
        if (owner.owning) storage.save(g, sport);
      },
      changed: () => refresh(sport),
      seasonOver: (end) => {
        checkHonours();
        if ((sidebar.visible && open === sport) || anotherDecisionWaiting(all(), sport)) return;
        // The one notification: the result, the clues (goal ranks and who's leaving) and the summer's question.
        const career = game.career!;
        const question = summerQuestion(career);
        const leavers = leaversLine(career);
        void vscode.window
          .showInformationMessage(
            `${game.sport.present.terms.name} season ${end.season} over: ${ordinal(end.position)} in League ${end.tier}. ${seasonClue(career, end.tier)}${leavers ? ` ${leavers}` : ''} ${question.prompt}`,
            ...question.options.map((o) => o.title),
            'Open',
          )
          .then((choice) => {
            if (!choice) return;
            const answer = question.options.find((o) => o.title === choice);
            if (!answer) {
              openPanel(sport);
              void vscode.commands.executeCommand('sportsSimulator.open');
            } else owner.whenOwner(() => game.career?.pending?.season === end.season && game.chooseFocus(answer.focus));
          });
      },
      unreadable: (old) => {
        // Kept whole as a backup, and its history archived like a finished career, before the player starts again.
        storage.backup(old, sport);
        try {
          const c = old.career;
          const history = c.history ?? [];
          void storage.archive({ club: c.clubs[c.playerClubId].name, sport, archivedAt: new Date().toISOString(), seasons: history.length, history, records: c.records });
        } catch {
          // Too different to read; the backup still has it all.
        }
        void vscode.window.showInformationMessage(
          `Sports Simulator was updated and your ${game.sport.present.terms.name.toLowerCase()} career couldn't carry over. Its history and a full backup have been kept. Start a new career in the Sports Simulator box.`,
        );
      },
    });
    game.selectSport(sport);
    game.setDuration(duration());
    return game;
  }

  // Every sport has its own game, with its own clock and save.
  const games = Object.fromEntries(SPORT_IDS.map((id) => [id, newGame(id)])) as Record<SportId, Game>;
  function all(): Game[] {
    return SPORT_IDS.map((id) => games[id]);
  }
  // Shown straight away; the clocks only run once this window owns the game.
  for (const game of all()) game.load(storage.load(game.sportId), false);

  const owner = new Ownership(`${process.pid}-${Math.random().toString(36).slice(2)}`, storage, {
    start: () => {
      followed = storage.activeSport();
      for (const game of all()) game.load(storage.load(game.sportId));
      checkHonours();
      refresh();
    },
    stop: () => {
      for (const game of all()) game.shutdown();
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
        if (!SPORT_IDS.includes(message.sport)) return;
        const game = games[message.sport];
        const sport = game.sport;
        if (!sport.nations().some((n) => n.short === message.team)) return;
        const { team, league } = message;
        owner.whenOwner(() => {
          if (game.career) return;
          if (DURATIONS.includes(message.duration)) {
            game.setDuration(message.duration);
            // The next new career starts from the same length.
            void config().update('matchDuration', message.duration, vscode.ConfigurationTarget.Global);
          }
          const seed = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0;
          const tier = Math.min(sport.format.leagues, Math.max(1, Math.round(league)));
          // Somewhere in the league, weighted towards mid-table, attack and defence level: the summers shape it from there.
          const rating = startRating(sport.format, tier, new Rng(seed ^ 0x9e3779b9));
          // One standard game: every career gets the tuning measured as 'medium'.
          game.start({ rating, difficulty: 'medium', team, seed });
        });
        return;
      }
      case 'togglePause':
        owner.whenOwner(() => games[message.sport].togglePause());
        return;
      case 'setDuration':
        if (DURATIONS.includes(message.duration)) owner.whenOwner(() => games[message.sport].setDuration(message.duration));
        refresh();
        return;
      case 'openPanel':
        openPanel(message.panel);
        return;
      case 'copy':
        void vscode.env.clipboard.writeText(message.text).then(() => vscode.window.setStatusBarMessage('Sports Simulator: summary copied', 2000));
        return;
      case 'endCareer':
        endCareer(message.sport);
        return;
      case 'resetCareer':
        owner.whenOwner(() => clearCareer(games[message.sport]));
        return;
      case 'resetHonours':
        resetHonours();
        return;
      case 'chooseFocus': {
        const { focus } = message;
        owner.whenOwner(() => games[message.sport].chooseFocus(focus));
        return;
      }
    }
  }

  /** Changes what's open in the box, and with an open sport, what the corner follows. Nothing stops: every career carries on. */
  function openPanel(panel: PanelId | null): void {
    open = panel;
    if (panel && panel !== 'honours' && panel !== followed) {
      followed = panel;
      storage.setActiveSport(panel);
    }
    refresh();
  }

  /** The sport the commands act on: the one open, or else the one the corner shows. */
  function currentGame(): Game {
    return open && open !== 'honours' && games[open].career ? games[open] : statusGame(all(), followed);
  }

  /** The box has already asked. Keeps the career in Past careers. */
  function endCareer(sport: SportId): void {
    const game = games[sport];
    owner.whenOwner(() => {
      const c = game.career;
      if (!c) return;
      const history = fullHistory(c);
      void storage.archive({ club: c.clubs[c.playerClubId].name, sport, archivedAt: new Date().toISOString(), seasons: history.length, history, records: c.records, honoursFrom: storage.honoursFrom(sport) });
      clearCareer(game);
    });
  }

  function clearCareer(game: Game): void {
    storage.clearHonoursFrom(game.sportId);
    game.reset();
    game.setDuration(duration());
  }

  /** The box has already asked, in red, twice. Running careers carry on, but what they've already won can't earn an honour again. */
  function resetHonours(): void {
    owner.whenOwner(() => {
      storage.resetHonours(Object.fromEntries(all().flatMap((g) => (g.career ? [[g.sportId, fullHistory(g.career).length]] : []))));
      if (open === 'honours' && !honoursLine(all(), 0, 0)) open = null;
      refresh();
    });
  }

  const followedSaves = new Map<SportId, number>();
  const poll = setInterval(() => {
    owner.poll();
    followed = storage.activeSport();
    if (owner.owning) return;
    // Another window runs the game: follow its saves, so this window's box keeps up with goals and full time.
    for (const game of all()) {
      const at = storage.savedAt(game.sportId);
      if (at !== (followedSaves.get(game.sportId) ?? 0)) {
        followedSaves.set(game.sportId, at);
        game.load(storage.load(game.sportId), false);
      }
    }
    refresh();
  }, POLL_MS);

  context.subscriptions.push(
    statusBar,
    { dispose: () => clearInterval(poll) },
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
    vscode.commands.registerCommand('sportsSimulator.open', () => vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`)),
    vscode.commands.registerCommand('sportsSimulator.switchSport', async () => {
      const items = sportRows(all()).map((r) => ({ id: r.id, label: r.name, description: r.club ? `${r.club} · ${r.line ?? ''}` : 'Start a career' }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Which sport? The others carry on.' });
      if (!picked) return;
      openPanel(picked.id);
      void vscode.commands.executeCommand('sportsSimulator.open');
    }),
    vscode.commands.registerCommand('sportsSimulator.togglePause', () => owner.whenOwner(() => currentGame().togglePause())),
    // The window you're working in runs the game; the others stand by.
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) owner.claim();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // The setting is the length new careers start from; a career under way keeps its own.
      if (e.affectsConfiguration('sportsSimulator.matchDuration')) for (const game of all()) if (!game.career) game.setDuration(duration());
      if (e.affectsConfiguration('sportsSimulator')) refresh();
    }),
  );
  owner.activate(vscode.window.state.focused);
  refresh();

  // First install: open the box once, so it's clear where the game lives.
  if (!all().some((g) => g.career) && !context.globalState.get('sportsSimulator.welcomed')) {
    void context.globalState.update('sportsSimulator.welcomed', true);
    void vscode.commands.executeCommand('sportsSimulator.open');
  }
}

/** VS Code is closing: stop the clock exactly where it is, save, and free the game for the next window. */
export function deactivate(): void {
  ownership?.release();
}
