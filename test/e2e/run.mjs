// Clicks through the real box in a real VS Code, with a throwaway profile, in an untrusted folder.
//   npm run test:e2e
// It checks the steps only a real window can: the box drawing at all, End, Reset career, Reset honours, the
// season-end message, the status bar, Restricted Mode, and the game passing between two windows.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
const bin = process.env.VSCODE_BIN ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const shots = process.env.E2E_SHOTS;
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const passed = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const profile = mkdtempSync(join(tmpdir(), 'sports-simulator-e2e-'));
const user = join(profile, 'user');
const storage = join(user, 'User', 'globalStorage', 'bigdevgreg.sports-simulator');
const folder = join(profile, 'project');
mkdirSync(storage, { recursive: true });
mkdirSync(folder);
// Not trusted, and no prompt to trust it: Restricted Mode, the way someone opening a stranger's folder gets it.
writeFileSync(join(user, 'User', 'settings.json'), JSON.stringify({ 'security.workspace.trust.startupPrompt': 'never', 'security.workspace.trust.banner': 'never', 'security.workspace.trust.emptyWindow': false, 'workbench.startupEditor': 'none' }));

const seedFile = join(profile, 'seed.cjs');
await build({ entryPoints: [join(root, 'test/e2e/seed.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: seedFile, logLevel: 'error' });
spawnSync(process.execPath, [seedFile, join(storage, 'career.rugby.json'), join(storage, 'career.cricket.json')], { stdio: 'inherit' });

// Behind other windows VS Code holds back its drawing, and notifications with it.
const BACKGROUND_OK = ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const args = (extra = []) => [`--remote-debugging-port=${PORT}`, `--user-data-dir=${user}`, `--extensions-dir=${join(profile, 'ext')}`, `--extensionDevelopmentPath=${root}`, '--skip-welcome', '--skip-release-notes', ...BACKGROUND_OK, ...extra];
const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined };
const app = spawn(bin, args([folder]), { stdio: 'ignore', env });

async function targets(port = PORT) {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    return [];
  }
}

/** One Chrome DevTools connection to a page or frame in VS Code. */
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, x) => {
    ws.onopen = r;
    ws.onerror = x;
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const data = JSON.parse(m.data);
    if (data.id) waiting.get(data.id)?.(data);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const mine = ++id;
      waiting.set(mine, r);
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
  return {
    send,
    close: () => ws.close(),
    run: async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value,
  };
}

async function until(what, fn, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => undefined);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(250);
  }
}

const inBox = (body) => `(() => { const d = document.getElementById('active-frame')?.contentDocument; if (!d || !d.getElementById('app')) return undefined; ${body} })()`;

async function findWindows(port = PORT) {
  return (await targets(port)).filter((t) => t.type === 'page' && t.url.includes('workbench'));
}

async function findBox(port = PORT) {
  return until(
    'the box',
    async () => {
      for (const t of (await targets(port)).filter((x) => x.url.includes('vscode-webview'))) {
        const c = await connect(t);
        if (await c.run(inBox(`return !!d.querySelector('.sport');`))) return c;
        c.close();
      }
    },
    60_000,
  );
}

/** A save already exists, so the box doesn't open itself: open it the way a player would. */
function openBox(w) {
  return until('the Sports Simulator pane', () =>
    w.run(`(() => {
      const explorer = document.querySelector('.activitybar a[aria-label^="Explorer"], .activitybar .action-label[aria-label^="Explorer"]');
      const pane = () => [...document.querySelectorAll('.pane-header')].find((h) => /sports simulator/i.test(h.getAttribute('aria-label') ?? h.innerText));
      if (!pane()) { explorer?.click(); return false; }
      if (pane().getAttribute('aria-expanded') !== 'true') pane().click();
      return true;
    })()`),
  );
}

const statusOf = (w) => w.run(`[...document.querySelectorAll('.statusbar-item')].find((x) => x.id.includes('sports-simulator'))?.innerText ?? null`);
const shot = async (w, name) => {
  if (!shots) return;
  const { result } = await w.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(result.data, 'base64'));
};

try {
  const first = await until('a window', async () => (await findWindows())[0], 60_000);
  const main = await connect(first);
  await openBox(main);
  const box = await findBox();
  const click = (selector) => box.run(inBox(`d.querySelector(${JSON.stringify(selector)}).click(); return true;`));
  const text = () => box.run(inBox(`return d.getElementById('app').innerText;`));
  const rowText = (id) => box.run(inBox(`return d.querySelector('[data-sport="${id}"] .row-main')?.innerText;`));

  const restricted = await until('the Restricted Mode badge', () => main.run(`/restricted mode/i.test(document.querySelector('.statusbar')?.innerText ?? '')`), 20_000).catch(() => false);
  passed('The box draws in Restricted Mode', !!restricted);
  passed('Sports show, with the seeded rugby career', /Wales/.test(await rowText('rugby')));
  passed('Choose sports link is there', /Choose sports/.test(await text()));
  await shot(main, 'first');

  // A real season end: the seeded match finishes, and football is the one open.
  await main.send('Page.bringToFront');
  const toast = await until('the season-end message', () => main.run(`[...document.querySelectorAll('.notification-toast')].map((x) => x.innerText).join(' | ') || undefined`), 120_000);
  passed('The season-end message appears', /Rugby season 1 finished: .*Decision waiting\./.test(toast), toast.replace(/\s+/g, ' ').slice(0, 90));
  await until('the row to say so', async () => /decision waiting/i.test(await rowText('rugby')));
  passed('The rugby row says a decision is waiting', true);
  const bell = await until('the bell', async () => {
    const s = await statusOf(main);
    return /season over/i.test(s ?? '') && s;
  });
  passed('The status bar says so', true, bell.replace(/\s+/g, ' '));
  await shot(main, 'season-over');

  // Answer it.
  await click('[data-sport="rugby"] .row-main');
  await until('the summer question', () => box.run(inBox(`return !!d.querySelector('[data-focus="attack"]');`)));
  await shot(main, 'summer');
  await click('[data-focus="attack"]');
  await click('#nextSeason');
  await until('next season', async () => !/decision waiting/i.test(await rowText('rugby')));
  passed('Answering starts the next season', true);

  // A World Championship just finished: gold row, its own report, then the next season.
  passed('A finished World Championship shows on its row', /World Championship over/.test(await rowText('cricket')));
  passed('Its row is gold', await box.run(inBox(`return d.querySelector('[data-sport="cricket"]').classList.contains('world');`)));
  await click('[data-sport="cricket"] .row-main');
  await until('the report', () => box.run(inBox(`return !!d.getElementById('continueSeason');`)));
  await shot(main, 'world-end');
  passed('The report has no summer question', await box.run(inBox(`return !d.querySelector('[data-focus]') && /World/.test(d.querySelector('.headline').textContent);`)));
  await click('#continueSeason');
  await until('the league', () => box.run(inBox(`return !d.getElementById('continueSeason') && !!d.querySelector('[data-ask-career]');`)));
  passed('Carrying on starts the league', true);
  await click('[data-ask-career]');
  await until('the question', () => box.run(inBox(`return !!d.querySelector('[data-ask-reset]');`)));
  await click('[data-ask-reset]');
  await until('the red step', () => box.run(inBox(`return !!d.querySelector('[data-do-reset]');`)));
  await click('[data-do-reset]');
  await until('cricket gone', async () => !/India/.test(await rowText('cricket')));

  // Start football from nothing, browsing the country list.
  await click('[data-sport="football"] .row-main');
  await until('setup', () => box.run(inBox(`return !!d.getElementById('search') && /football/i.test(d.querySelector('.setup h2').textContent);`)));
  const listed = await box.run(inBox(`return d.querySelectorAll('#nations .nation').length;`));
  passed('Countries can be browsed without typing', listed > 100 || (await box.run(inBox(`return !!d.querySelector('.chosen');`))), `${listed} listed`);
  await box.run(inBox(`const s = d.getElementById('search'); s.value = 'Scotland'; s.dispatchEvent(new Event('input', { bubbles: true })); return true;`));
  await click('#nations .nation');
  await click('#start');
  await until('the football career', async () => /Scotland/.test(await rowText('football')));
  const cycling = new Set();
  const seen = await until(
    'both sports in the status bar',
    async () => {
      cycling.add((await statusOf(main)).split(':')[0].trim());
      return cycling.size >= 2 && [...cycling];
    },
    15_000,
  );
  passed('The status bar cycles through the careers', true, seen.join(', '));
  await shot(main, 'two-careers');

  // Pause, from the row, and the real End.
  await click('[data-pause="rugby"]');
  await until('the pause', async () => /⏸/.test((await box.run(inBox(`return d.querySelector('[data-sport="rugby"] .row-line').textContent;`))) ?? ''));
  passed('Pause works from a row', true);
  await click('[data-ask-career]');
  await until('the End question', () => box.run(inBox(`return !!d.querySelector('[data-do-end]');`)));
  await shot(main, 'end-question');
  await click('[data-do-end]');
  await until('Past careers', async () => /1 past career/.test(await rowText('honours')));
  passed('End keeps the career in Past careers', !/Scotland/.test(await rowText('football')));

  // The real Reset career, both steps.
  await click('[data-sport="rugby"] .row-main');
  await until('rugby open', () => box.run(inBox(`return !!d.querySelector('[data-ask-career]');`)));
  await click('[data-ask-career]');
  await until('the question', () => box.run(inBox(`return !!d.querySelector('[data-ask-reset]');`)));
  await click('[data-ask-reset]');
  await until('the red step', () => box.run(inBox(`return !!d.querySelector('[data-do-reset]');`)));
  await shot(main, 'reset-career');
  await click('[data-do-reset]');
  await until('rugby gone', async () => !/Wales/.test(await rowText('rugby')));
  passed('Reset career deletes it, and Past careers stays at one', /1 past career/.test(await rowText('honours')));

  // The real Reset honours, both red steps.
  await click('[data-sport="honours"] .row-main');
  await until('the page', () => box.run(inBox(`return !!d.querySelector('[data-ask-honours]');`)));
  await click('[data-ask-honours]');
  await until('step one', () => box.run(inBox(`return !!d.querySelector('[data-ask-final]');`)));
  await click('[data-ask-final]');
  await until('step two', () => box.run(inBox(`return !!d.querySelector('[data-do-honours]');`)));
  await shot(main, 'reset-honours');
  await click('[data-do-honours]');
  await until('honours gone', async () => !(await rowText('honours')));
  passed('Reset honours clears them', true);

  // A career again, then a second window on the same saves.
  await click('[data-sport="football"] .row-main');
  await until('setup again', () => box.run(inBox(`return !!d.getElementById('search');`)));
  await box.run(inBox(`const s = d.getElementById('search'); s.value = 'Scotland'; s.dispatchEvent(new Event('input', { bubbles: true })); return true;`));
  await click('#nations .nation');
  await click('#start');
  await until('the career', async () => /Scotland/.test(await rowText('football')));
  const owner = () => JSON.parse(readFileSync(join(storage, 'clock.json'), 'utf8')).owner;
  const ownerOne = owner();
  // VS Code won't open a second development window on one profile, so a second copy shares the save folder: the same files, read the same way.
  const user2 = join(profile, 'user2');
  mkdirSync(join(user2, 'User', 'globalStorage'), { recursive: true });
  symlinkSync(storage, join(user2, 'User', 'globalStorage', 'bigdevgreg.sports-simulator'), 'dir');
  writeFileSync(join(user2, 'User', 'settings.json'), readFileSync(join(user, 'User', 'settings.json')));
  const SECOND = PORT + 1;
  const app2 = spawn(bin, [`--remote-debugging-port=${SECOND}`, `--user-data-dir=${user2}`, `--extensions-dir=${join(profile, 'ext2')}`, `--extensionDevelopmentPath=${root}`, '--skip-welcome', '--skip-release-notes', ...BACKGROUND_OK, folder], { stdio: 'ignore', env });
  try {
    const two = await connect(await until('a second window', async () => (await findWindows(SECOND))[0], 60_000));
    const shown = await until('the status bar in the second window', async () => {
      const text = await statusOf(two);
      return /Football|SCO|Wk/.test(text ?? '') && text;
    }, 60_000);
    passed('A second window shows the same career', true, shown.replace(/\s+/g, ' '));
    // The handover a player sets off by using the box in another window. Focus itself can't be given to a second copy from here.
    await openBox(two);
    const boxTwo = await findBox(SECOND);
    await until('the row in the second window', () => boxTwo.run(inBox(`return !!d.querySelector('#pause, [data-pause="football"]');`)));
    await boxTwo.run(inBox(`d.querySelector('#pause, [data-pause="football"]').click(); return true;`));
    const claimed = await until('the second window taking the game', async () => owner() !== ownerOne, 15_000).catch(() => false);
    passed('Using the box in the second window hands the game over', !!claimed);
    const paused = await until('the pause arriving', async () => /⏸/.test((await statusOf(two)) ?? ''), 10_000).catch(() => false);
    passed('The press that asked for it still happens', !!paused);
    boxTwo.close();
    await shot(two, 'second-window');
    // Whichever window runs it closes: the other carries on.
    const before = owner();
    (before === ownerOne ? app : app2).kill();
    const taken = await until('the other window taking over', async () => {
      const now = owner();
      return now && now !== before;
    }, 25_000).catch(() => false);
    passed('When the running window closes, the other takes over', !!taken);
    two.close();
  } finally {
    app2.kill();
  }
  box.close();
  main.close();
} catch (error) {
  passed(error.message, false);
} finally {
  app.kill();
  spawnSync('pkill', ['-f', profile]);
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nE2E OK');
process.exit(failures.length ? 1 : 0);
