/**
 * Renders the real webview bundle outside VS Code with sample game states,
 * for eyeballing the UI and taking screenshots.
 *
 *   npm run build && npx tsx tools/preview.ts [--light]
 *   open dist/preview/index.html?screen=match
 *
 * Screens: setup, match, table, fixtures, club, fullTime, seasonOver, clubLater.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fillAllocation } from '../src/core/career';
import { Game, type Scheduler } from '../src/extension/game';
import { buildView } from '../src/extension/viewModel';
import type { View } from '../src/shared/view';

const root = resolve(process.cwd());
const out = join(root, 'dist', 'preview');
mkdirSync(out, { recursive: true });

// A scheduler we drive by hand: run() fires the pending timer.
let pending: (() => void) | null = null;
const manual: Scheduler = {
  setTimeout: (fn) => ((pending = fn), 1),
  clearTimeout: () => (pending = null),
};
const run = (n = 1) => {
  for (let i = 0; i < n && pending; i++) {
    const fn = pending;
    pending = null;
    fn();
  }
};

const game = new Game({ save: () => {}, changed: () => {} }, manual);
// Read through a function so TypeScript doesn't narrow the phase across calls that change it.
const phase = () => game.phase;
const views: Record<string, { view: View; tab?: string }> = {};
views.setup = { view: buildView(game, () => 'Wexstead Rovers') };

game.start({ rating: 55, difficulty: 'medium', seed: 11, clubName: 'Wexstead Rovers' });
// Play a few matchdays, then stop mid-match.
for (let md = 0; md < 6; md++) {
  while (phase() === 'live') run();
  run();
}
run(64);
const live = buildView(game, () => '');
views.match = { view: live, tab: 'match' };
views.table = { view: live, tab: 'table' };
views.fixtures = { view: live, tab: 'fixtures' };
views.club = { view: live, tab: 'club' };

while (phase() === 'live') run();
views.fullTime = { view: buildView(game, () => ''), tab: 'match' };

while (phase() !== 'seasonOver') run();
views.seasonOver = { view: buildView(game, () => ''), tab: 'match' };

// A few seasons in, for the club tab's history and records.
for (let season = 0; season < 3; season++) {
  const c = game.career!;
  game.allocate(fillAllocation(c.clubs[c.playerClubId], c.pending!.points, { attack: 1, defence: 1 }));
  while (phase() !== 'seasonOver') run();
}
{
  const c = game.career!;
  game.allocate(fillAllocation(c.clubs[c.playerClubId], c.pending!.points, { attack: 1, defence: 1 }));
  for (let md = 0; md < 3; md++) {
    while (phase() === 'live') run();
    run();
  }
}
views.clubLater = { view: buildView(game, () => ''), tab: 'club' };
writeFileSync(join(out, 'views.js'), `window.__views = ${JSON.stringify(views)};`);

const dark = {
  foreground: '#cccccc',
  background: '#181818',
  descriptionForeground: '#9d9d9d',
  'panel-border': '#2b2b2b',
  'button-background': '#0078d4',
  'button-foreground': '#ffffff',
  'button-hoverBackground': '#026ec1',
  'input-background': '#313131',
  'input-foreground': '#cccccc',
  'input-border': '#3c3c3c',
  focusBorder: '#0078d4',
  'textLink-foreground': '#4daafc',
  'list-inactiveSelectionBackground': '#37373d',
  'toolbar-hoverBackground': '#5a5d5e50',
  errorForeground: '#f85149',
  'textBlockQuote-background': '#2b2b2b',
};
const light = {
  ...dark,
  foreground: '#3b3b3b',
  background: '#f8f8f8',
  descriptionForeground: '#717171',
  'panel-border': '#e5e5e5',
  'input-background': '#ffffff',
  'input-foreground': '#3b3b3b',
  'input-border': '#cecece',
  'textLink-foreground': '#005fb8',
  'list-inactiveSelectionBackground': '#e4e6f1',
  'textBlockQuote-background': '#f2f2f2',
};
const theme = process.argv.includes('--light') ? light : dark;
const vars = Object.entries(theme)
  .map(([k, v]) => `--vscode-${k}: ${v};`)
  .join(' ');

writeFileSync(
  join(out, 'index.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html { ${vars} --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif; --vscode-font-size: 13px; background: ${theme.background}; } body { width: 280px; } .ft-card { animation: none !important; } .ft-layer { width: 284px; right: auto; }</style>
<link rel="stylesheet" href="../../media/sidebar.css"></head>
<body><div id="app"></div>
<script src="views.js"></script>
<script>
  const screen = new URLSearchParams(location.search).get('screen') || 'match';
  const entry = window.__views[screen];
  window.acquireVsCodeApi = () => ({ postMessage() {}, getState: () => ({ tab: entry.tab || 'match' }), setState() {} });
</script>
<script src="../webview.js"></script>
<script>window.postMessage({ type: 'view', view: entry.view }, '*');</script>
</body></html>`,
);
console.log(`Wrote ${join(out, 'index.html')} (${Object.keys(views).join(', ')})`);
