/**
 * Renders the real webview bundle outside VS Code with sample game states,
 * for eyeballing the UI and taking screenshots.
 *
 *   npm run build && npx tsx tools/preview.ts [--light | --contrast]
 *   open dist/preview/index.html?screen=match
 *
 * Screens: list (every sport minimised), setup, match, table, fixtures, club, cups, fullTime, seasonOver, championship, clubLater, championshipLater,
 * and the same for the other sports with a prefix, such as rugby_match or cricket_seasonOver.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chooseFocus, newCareer, playSeason } from '../src/core/career';
import { Game, SAVE_VERSION, type Scheduler } from '../src/extension/game';
import { SPORTS } from '../src/sports';
import { buildHonours, buildView, careerSummary, honoursLine, sportRows } from '../src/extension/viewModel';
import type { SportRowView, View } from '../src/shared/view';

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
const views: Record<string, { view: View | null; tab?: string; cup?: string; rows?: SportRowView[]; open?: string | null }> = {};
const sampleRows: Partial<Record<string, SportRowView>> = {};
const later: Partial<Record<string, Game>> = {};
views.setup = { view: buildView(game) };

game.start({ rating: 55, seed: 11, team: 'SCO' });
// Play a few matchdays, then stop mid-match.
for (let md = 0; md < 6; md++) {
  while (phase() === 'live') run();
  run();
}
run(64);
const live = buildView(game);
views.match = { view: live, tab: 'match' };
views.table = { view: live, tab: 'table' };
views.fixtures = { view: live, tab: 'fixtures' };
views.club = { view: live, tab: 'club' };
views.cups = { view: live, tab: 'cups' };

while (phase() === 'live') run();
sampleRows.football = sportRows([game])[0];
views.fullTime = { view: buildView(game), tab: 'match' };

while (phase() !== 'seasonOver') run();
views.seasonOver = { view: buildView(game), tab: 'match' };

// A few seasons in, for the club tab's history and records.
for (let season = 0; season < 3; season++) {
  game.chooseFocus(season % 2 ? 'attack' : 'defence');
  while (phase() !== 'seasonOver') run();
}
// After season 4's summer, the World Championship, if the side made it.
{
  game.chooseFocus('attack');
  views.championship = { view: buildView(game), tab: game.shownMatch?.fixture.kind === 'championship' ? 'match' : 'cups', cup: 'championship' };
  for (let md = 0; md < 3; md++) {
    while (phase() === 'live') run();
    run();
  }
}
views.clubLater = { view: buildView(game), tab: 'club' };
views.championshipLater = { view: buildView(game), tab: 'cups', cup: 'championship' };
// The other sports, through the same screens.
for (const [sport, team, seed] of [['rugby', 'WAL', 7], ['cricket', 'SRI', 7]] as const) {
  const g = new Game({ save: () => {}, changed: () => {} }, manual);
  const at = () => g.phase;
  g.selectSport(sport);
  g.load(null);
  views[`${sport}_setup`] = { view: buildView(g) };
  if (sport === 'rugby') sampleRows.rugbyNone = sportRows([g])[0];
  g.start({ rating: 55, seed, team });
  for (let md = 0; md < 4; md++) {
    while (at() === 'live') run();
    run();
  }
  run(sport === 'rugby' ? 55 : 28);
  const now = buildView(g);
  views[`${sport}_match`] = { view: now, tab: 'match' };
  views[`${sport}_table`] = { view: now, tab: 'table' };
  views[`${sport}_fixtures`] = { view: now, tab: 'fixtures' };
  views[`${sport}_cups`] = { view: now, tab: 'cups' };
  if (sport === 'rugby') sampleRows.rugby = sportRows([g])[0];
  while (at() === 'live') run();
  views[`${sport}_fullTime`] = { view: buildView(g), tab: 'match' };
  while (at() !== 'seasonOver') run();
  views[`${sport}_seasonOver`] = { view: buildView(g), tab: 'match' };
  if (sport === 'cricket') sampleRows.cricketWaiting = sportRows([g])[0];
  for (let season = 0; season < 3; season++) {
    g.chooseFocus(season % 2 ? 'attack' : 'defence');
    while (at() !== 'seasonOver') run();
  }
  g.chooseFocus('attack');
  views[`${sport}_championship`] = { view: buildView(g), tab: 'cups', cup: 'championship' };
  run(3);
  views[`${sport}_club`] = { view: buildView(g), tab: 'club' };
  views[`${sport}_championshipLater`] = { view: buildView(g), tab: 'cups', cup: 'championship' };
  later[sport] = g;
}
// A side good enough for the World Championship, in it and then out of it.
{
  const c = newCareer({ rating: 95, seed: 40, team: 'BRA' }, SPORTS.football);
  for (let season = 0; season < 4; season++) {
    playSeason(c, SPORTS.football);
    chooseFocus(c, 'attack');
  }
  const g = new Game({ save: () => {}, changed: () => {} }, manual);
  g.load(JSON.parse(JSON.stringify({ version: SAVE_VERSION, career: c, live: null, paused: false, duration: '2m' })));
  run(40);
  views.world = { view: buildView(g), tab: 'match' };
  while (g.phase !== 'worldOver') run();
  views.worldEnd = { view: buildView(g), tab: 'match' };
}
// Every screen sits in the list: its own sport open, the others minimised.
const { football, rugby, rugbyNone, cricketWaiting } = sampleRows as Record<string, SportRowView>;
for (const entry of Object.values(views)) {
  const v = entry.view as Exclude<View, { screen: 'honours' }>;
  const sport = v.screen === 'setup' ? v.setup.sport : v.sport;
  entry.open = sport;
  entry.rows = [football, sport === 'rugby' && v.screen === 'setup' ? rugbyNone : rugby, cricketWaiting];
}
views.list = { view: null, open: null, rows: [{ ...football, paused: true }, rugbyNone, cricketWaiting] };
// Honours: the football career still running, the other two ended, one honour earned.
const summary = (g: Game) => careerSummary(g)!;
const past = [summary(later.rugby!), summary(later.cricket!)];
const feats = [{ id: 'twoWorld' as const, at: '2026-10-31T00:00:00Z', detail: 'Football with Scotland · Rugby with Wales' }];
views.honours = { view: buildHonours([summary(game)], past, feats), open: 'honours', rows: [football, rugbyNone, cricketWaiting] };
const line = honoursLine([game], past.length, feats.length);
for (const entry of Object.values(views)) (entry as { honours?: string | null }).honours = line;
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
  'sideBar-background': '#181818',
  'editorWidget-background': '#202020',
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
  'sideBar-background': '#f8f8f8',
  'editorWidget-background': '#f8f8f8',
  'editorWidget-foreground': '#3b3b3b',
};
const highContrast: Record<string, string> = {
  background: '#000000',
  foreground: '#ffffff',
  descriptionForeground: '#ffffff',
  focusBorder: '#f38518',
  contrastBorder: '#6fc3df',
  contrastActiveBorder: '#f38518',
  'button-background': '#000000',
  'button-foreground': '#ffffff',
  'editor-background': '#000000',
  'input-background': '#000000',
  'input-foreground': '#ffffff',
  'input-border': '#6fc3df',
  'textLink-foreground': '#21a6ff',
  'list-activeSelectionBackground': '#000000',
  'list-activeSelectionForeground': '#ffffff',
  'editorWidget-background': '#000000',
  'editorWidget-foreground': '#ffffff',
};
const theme = process.argv.includes('--light') ? light : process.argv.includes('--contrast') ? highContrast : dark;
const vars = Object.entries(theme)
  .map(([k, v]) => `--vscode-${k}: ${v};`)
  .join(' ');

writeFileSync(
  join(out, 'index.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html { ${vars} --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif; --vscode-font-size: 13px; background: ${theme.background}; } body { width: 280px; } .ft-card { animation: none !important; } .ft-layer { width: 284px; right: auto; }</style>
<link rel="stylesheet" href="../../media/sidebar.css"></head>
<body${theme === light ? ' class="vscode-light"' : theme === highContrast ? ' class="vscode-high-contrast"' : ''}><div id="app"></div>
<script src="views.js"></script>
<script>
  const screen = new URLSearchParams(location.search).get('screen') || 'match';
  const entry = window.__views[screen];
  if (new URLSearchParams(location.search).has('fit')) addEventListener('DOMContentLoaded', () => { document.body.style.width = 'auto'; });
  window.acquireVsCodeApi = () => ({ postMessage() {}, getState: () => ({ tab: entry.tab || 'match', cup: entry.cup || 'cup' }), setState() {} });
</script>
<script src="../webview.js"></script>
<script>window.postMessage({ type: 'view', rows: entry.rows, honours: entry.honours, open: entry.open, view: entry.view }, '*');</script>
</body></html>`,
);
console.log(`Wrote ${join(out, 'index.html')} (${Object.keys(views).join(', ')})`);
