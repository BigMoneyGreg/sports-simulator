import {
  DURATION_LABELS,
  type CupView,
  type Difficulty,
  type Duration,
  type FixtureView,
  type Focus,
  type FullTimeView,
  type GameView,
  type LiveMatchView,
  type NationOption,
  type PlayoffView,
  type SeasonEndView,
  type SetupView,
  type Style,
  type TableView,
  type TeamBadge,
  type TimelineView,
  type ToHost,
  type ToWebview,
  type View,
} from '../shared/view';



declare function acquireVsCodeApi(): { postMessage(m: ToHost): void; getState(): unknown; setState(s: unknown): void };

const vscode = acquireVsCodeApi();
const app = document.getElementById('app')!;
// The full-time card lives outside #app so re-renders underneath don't restart its animation.
const overlay = document.createElement('div');
overlay.className = 'ft-layer';
overlay.setAttribute('aria-live', 'polite');
document.body.appendChild(overlay);
let overlayKey = '';

type Tab = 'match' | 'table' | 'fixtures' | 'cups' | 'club';
interface UiState {
  tab: Tab;
  tableTier: number | null;
  cup: CupView['id'];
}

const ui: UiState = { tab: 'match', tableTier: null, cup: 'cup', ...((vscode.getState() as Partial<UiState>) ?? {}) };
let view: View | null = null;
/** The summer focus picked but not yet confirmed, and the season it belongs to. */
const summer = { season: 0, focus: null as Focus | null, sent: false };

const setup = {
  team: '',
  search: '',
  league: 3,
  difficulty: 'medium' as Difficulty,
  duration: '2m' as Duration,
  style: 'balanced' as Style,
  /** Defaults are taken from the host once; option clicks must not reset them. */
  initialised: false,
};

function send(message: ToHost): void {
  vscode.postMessage(message);
}

function saveUi(): void {
  vscode.setState(ui);
}

// ---------------------------------------------------------------------------
// Helpers

function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function swatch(b: Pick<TeamBadge, 'colours'>, cls = 'swatch'): string {
  return `<span class="${cls}" data-colours="${esc(b.colours.join(' '))}"></span>`;
}

/** Diagonal bands of the flag's colours, two or three of them. */
function flagGradient(colours: string[]): string {
  const step = 100 / colours.length;
  return `linear-gradient(135deg, ${colours.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

/** Inline styles are blocked by the CSP, so colours are applied through the CSSOM. */
function paintSwatches(root: ParentNode = app): void {
  root.querySelectorAll<HTMLElement>('[data-colours]').forEach((el) => {
    el.style.background = flagGradient(el.dataset.colours!.split(' '));
  });
  root.querySelectorAll<HTMLElement>('[data-accent]').forEach((el) => {
    el.style.setProperty('--club', el.dataset.accent!);
  });
}

// ---------------------------------------------------------------------------
// Setup

type Option = [value: string, label: string, sub?: string];

function seg(name: string, options: Option[], value: string): string {
  return `<div class="seg" role="radiogroup" data-name="${name}">${options
    .map(
      ([val, label, sub]) =>
        `<button type="button" role="radio" aria-checked="${val === value}" class="${val === value ? 'on' : ''}" data-value="${val}">${esc(label)}${
          sub ? `<span class="sub-label">${esc(sub)}</span>` : ''
        }</button>`,
    )
    .join('')}</div>`;
}

const NATION_LIMIT = 40;

function nationMatches(nations: NationOption[]): NationOption[] {
  const q = setup.search.trim().toLowerCase();
  return q ? nations.filter((n) => n.name.toLowerCase().includes(q) || n.code.toLowerCase() === q) : nations;
}

/** The search results; redrawn on its own while typing so the search box keeps focus. */
function nationList(nations: NationOption[]): string {
  const matches = nationMatches(nations);
  if (!matches.length) return '<p class="muted small">No country matches.</p>';
  return `${matches
    .slice(0, NATION_LIMIT)
    .map(
      (n) =>
        `<button type="button" role="option" class="nation ${n.code === setup.team ? 'on' : ''}" aria-selected="${n.code === setup.team}" data-team="${n.code}">${swatch(n)}<span class="grow">${esc(n.name)}</span><span class="muted small">L${n.tier}</span></button>`,
    )
    .join('')}${matches.length > NATION_LIMIT ? `<p class="muted small">${matches.length - NATION_LIMIT} more: keep typing.</p>` : ''}`;
}

function renderSetup(v: SetupView): void {
  if (!setup.initialised) {
    setup.duration = v.duration;
    setup.initialised = true;
  }
  const chosen = v.nations.find((n) => n.code === setup.team);
  const leagueOptions = [1, 2, 3, 4, 5].map((t): Option => [String(t), `L${t}`, chosen?.tier === t ? 'Usual' : undefined]);
  app.dataset.mode = 'setup';
  app.innerHTML = `
  <div class="setup card">
    <h2>New career</h2>
    <p class="muted">Pick your country and where it starts. Every match plays on its own; each summer you decide where to strengthen.</p>

    <div class="field">Country
      ${chosen ? `<div class="chosen">${swatch(chosen, 'crest big')}<strong>${esc(chosen.name)}</strong></div>` : ''}
      <input id="search" type="search" placeholder="Search countries" aria-label="Search countries" value="${esc(setup.search)}" autocomplete="off">
      <div id="nations" class="nation-list" role="listbox" aria-label="Countries">${nationList(v.nations)}</div>
    </div>

    <div class="field">League ${seg('league', leagueOptions, String(setup.league))}</div>

    <div class="field">Difficulty ${seg(
      'difficulty',
      [
        ['easy', 'Easy', 'A helpful boost each season'],
        ['medium', 'Medium', 'A subtle boost each season'],
        ['hard', 'Hard', 'No extra season boost'],
      ],
      setup.difficulty,
    )}</div>

    <div class="field">Match length ${seg('duration', v.durations.map((d): Option => [d, DURATION_LABELS[d]]), setup.duration)}</div>

    <div class="field">Style ${seg(
      'style',
      [
        ['attacking', 'Attacking'],
        ['balanced', 'Balanced'],
        ['defensive', 'Defensive'],
      ],
      setup.style,
    )}</div>

    <button type="button" id="start" class="primary" ${chosen ? '' : 'disabled'}>${chosen ? 'Start career' : 'Pick a country'}</button>
  </div>`;
  paintSwatches();
}

// ---------------------------------------------------------------------------
// Game


function renderOverlay(ft: FullTimeView | null): void {
  if (!ft) {
    overlay.replaceChildren();
    overlayKey = '';
    return;
  }
  if (ft.key === overlayKey) return;
  overlayKey = ft.key;
  overlay.innerHTML = `<div class="ft-card" role="status">
      <div class="muted small">Full time${ft.note ? ` · ${esc(ft.note)}` : ''}</div>
      <div class="ft-score">${swatch(ft.home)}<span>${esc(ft.home.name)}</span> <strong>${ft.home.goals}–${ft.away.goals}</strong> <span>${esc(ft.away.name)}</span>${swatch(ft.away)}</div>
      ${ft.scorers ? `<div class="small muted">${esc(ft.scorers)}</div>` : ''}
    </div>`;
  paintSwatches(overlay);
  (overlay.firstElementChild as HTMLElement).style.animationDuration = `${ft.ms}ms`;
}

/** Last HTML written to each region, so unchanged regions are left alone. */
const written = new WeakMap<Element, string>();

/**
 * Writes each part into its own region, touching only the ones that changed.
 * The box updates every match-minute; rewriting everything would replace a
 * button between mouse-down and mouse-up and swallow the click.
 */
function patch(container: HTMLElement, parts: string[]): void {
  if (container.children.length !== parts.length) {
    container.innerHTML = parts.map(() => '<div class="part"></div>').join('');
  }
  parts.forEach((html, i) => {
    const region = container.children[i];
    if (written.get(region) !== html) {
      region.innerHTML = html;
      written.set(region, html);
    }
  });
}

function renderGame(v: GameView): void {
  renderOverlay(v.seasonEnd ? null : v.fullTime);
  if (app.dataset.mode !== 'game') {
    app.innerHTML = '<div id="top"></div><div id="main"></div>';
    app.dataset.mode = 'game';
  }
  // The narrowest layout shows only the header, except when a summer choice is waiting.
  app.classList.toggle('needs-choice', !!v.seasonEnd);
  patch(document.getElementById('top')!, [headerHtml(v)]);
  const tabs: [Tab, string][] = [
    ['match', 'Match'],
    ['table', 'Table'],
    ['fixtures', 'Fixtures'],
    ['cups', 'Cups'],
    ['club', 'Team'],
  ];
  const nav = `<nav class="tabs" role="tablist">${tabs
    .map(([id, label]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" class="${ui.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`)
    .join('')}</nav>`;
  patch(document.getElementById('main')!, v.seasonEnd ? [seasonEndHtml(v.seasonEnd)] : [nav, ...panelParts(v)]);
  paintSwatches();
  trackGoals(v);
  showFlash();
  if (scrollFixtures && ui.tab === 'fixtures' && !v.seasonEnd) {
    scrollFixtures = false;
    app.querySelector('.fixtures li.current, .fixtures li:not(.played)')?.scrollIntoView({ block: 'center' });
  }
}

/** Set when the fixtures tab opens, so the list starts at the current match rather than MD 1. */
let scrollFixtures = true;

const FLASH_MS = 1600;
const lastScore = { key: '', home: 0, away: 0 };
const flash = { cls: '', at: 0, id: 0 };

/** Notices a goal in the player's match: green when they score, red when they concede. */
function trackGoals(v: GameView): void {
  const m = v.match;
  if (!m || (!m.home.isPlayer && !m.away.isPlayer)) return;
  const key = `${m.home.name}|${m.away.name}|${m.competition}|${m.round ?? ''}`;
  if (key === lastScore.key) {
    const homeScored = m.home.goals > lastScore.home;
    const awayScored = m.away.goals > lastScore.away;
    if (homeScored || awayScored) {
      const mine = (homeScored && m.home.isPlayer) || (awayScored && m.away.isPlayer);
      Object.assign(flash, { cls: mine ? 'goal-for' : 'goal-against', at: Date.now(), id: flash.id + 1 });
    }
  }
  Object.assign(lastScore, { key, home: m.home.goals, away: m.away.goals });
}

/**
 * Regions are rewritten every match-minute, so a rewritten scoreboard picks the
 * flash up part-way through (negative delay) instead of restarting it.
 */
function showFlash(): void {
  const elapsed = Date.now() - flash.at;
  if (elapsed >= FLASH_MS) return;
  app.querySelectorAll<HTMLElement>('.board, .head').forEach((el) => {
    if (el.dataset.flash === String(flash.id)) return;
    el.dataset.flash = String(flash.id);
    el.classList.remove('goal-for', 'goal-against');
    void el.offsetWidth; // restart the animation if the same class was already on
    el.classList.add(flash.cls);
    el.style.animationDelay = `-${elapsed}ms`;
  });
}

function headerHtml(v: GameView): string {
  const h = v.header;
  const dots = h.form.map((f) => `<span class="dot ${f.result}" title="${esc(f.title)}"></span>`).join('');
  const next = h.durations[(h.durations.indexOf(h.duration) + 1) % h.durations.length];
  return `<header class="head card" data-accent="${esc(h.club.colours[0])}">
    <div class="club">${swatch(h.club, 'crest')}<div class="grow"><div class="name">${esc(h.club.name)}</div>
      <div class="muted small where"><span class="wide">League </span><span class="slim">L</span>${h.tier} · ${ordinal(h.position)} · <span title="League games played">${h.played}/${h.games}</span></div></div></div>
    <div class="right">
      <span class="form" aria-label="Form">${dots}</span>
      <span class="controls">
        <button type="button" id="speed" class="chip" data-next="${next}" title="Match length: ${DURATION_LABELS[h.duration]}. Click for ${DURATION_LABELS[next]}." aria-label="Match length ${DURATION_LABELS[h.duration]}"><span>⏱</span><span class="wide"> ${DURATION_LABELS[h.duration]}</span></button>
        <button type="button" id="pause" class="chip icon" title="${h.paused ? 'Play' : 'Pause'}" aria-label="${h.paused ? 'Play' : 'Pause'}">${h.paused ? '▶' : '⏸'}</button>
      </span>
    </div>
  </header>`;
}

/** The active tab's content, split into regions that update independently. */
function panelParts(v: GameView): string[] {
  switch (ui.tab) {
    case 'match':
      return matchParts(v);
    case 'table': {
      const tier = ui.tableTier ?? v.playerTier;
      const playoff = v.playoffs.find((p) => p.tier === tier);
      const chips = `<div class="seg chips">${v.tables
        .map((x) => {
          const mine = x.tier === v.playerTier;
          return `<button type="button" class="${x.tier === tier ? 'on' : ''} ${mine ? 'mine' : ''}" data-tier="${x.tier}"${mine ? ' title="Your league"' : ''}>L${x.tier}</button>`;
        })
        .join('')}</div>`;
      return [chips, tableHtml(v.tables, tier, false), playoff ? playoffHtml(playoff) : ''];
    }
    case 'fixtures':
      return [fixturesHtml(v.fixtures)];
    case 'cups':
      return cupParts(v);
    case 'club':
      return [clubHtml(v)];
  }
}

function matchParts(v: GameView): string[] {
  if (v.waiting === 'seasonOver') return [`<p class="notice">The season is over. Choose your summer focus.</p>`];
  const m = v.match;
  if (!m) return [`<p class="muted">Next match about to kick off…</p>`];
  // Newest first, so the latest event is always in view.
  const items = m.timeline;
  const event = (t: TimelineView) => {
    const icon = t.kind === 'goal' ? '<span class="ball" aria-label="Goal">⚽</span>' : `<span class="card ${t.kind}" aria-label="${t.kind === 'red' ? 'Red' : 'Yellow'} card"></span>`;
    return `<span class="ev">${icon}<span class="who">${esc(t.text)}</span>${t.score ? `<span class="running">${esc(t.score)}</span>` : ''}</span>`;
  };
  const row = (t: TimelineView) =>
    t.kind === 'break'
      ? `<li class="break"><span>${esc(t.clock)}</span><span>${esc(t.text)}</span></li>`
      : `<li class="${t.kind}"><span class="home">${t.side === 'home' ? event(t) : ''}</span><span class="min">${esc(t.clock)}</span><span class="away">${t.side === 'away' ? event(t) : ''}</span></li>`;
  return [scoreboard(m), `<div class="card feed-card">${items.length ? `<ol class="report-feed">${[...items].reverse().map(row).join('')}</ol>` : '<p class="muted small center">No goals yet.</p>'}</div>`];
}

function scoreboard(m: LiveMatchView): string {
  const team = (t: LiveMatchView['home'], town: string) =>
    `<div class="team ${t.isPlayer ? 'me' : ''}" title="${esc(t.name)}"${t.isPlayer ? ` data-accent="${esc(t.colours[0])}"` : ''}>${swatch(t, 'crest big')}<span class="code">${esc(t.short)}</span><span class="town">${esc(town)}</span></div>`;
  return `<div class="board card">
      <div class="comp muted small">${esc(m.competition)}${m.round ? ` · ${esc(m.round)}` : ''}</div>
      <div class="score">${team(m.home, m.homeTown)}<div class="mid"><div class="goals">${m.home.goals}<span>–</span>${m.away.goals}</div>
        <div class="clock-big ${m.finished ? 'ft' : 'live'}">${esc(m.clock)}</div></div>${team(m.away, m.awayTown)}</div>
      ${m.aggregate ? `<div class="muted small">${esc(m.aggregate)}</div>` : ''}
    </div>`;
}

function tableHtml(tables: TableView[], tier: number, withChips = true): string {
  const t = tables[tier - 1];
  const chips = withChips
    ? `<div class="seg chips">${tables.map((x) => `<button type="button" class="${x.tier === tier ? 'on' : ''}" data-tier="${x.tier}">L${x.tier}</button>`).join('')}</div>`
    : '';
  const rows = t.rows
    .map(
      (r) => `<tr class="${r.zone ?? ''} ${r.isPlayer ? 'me' : ''}">
      <td class="pos">${r.pos}</td><td class="team" title="${esc(r.name)}">${esc(r.town)}${
        r.move ? ` <span class="move ${r.move > 0 ? 'up' : 'down'}" title="${r.move > 0 ? 'Up' : 'Down'} ${Math.abs(r.move)} since kick-off">${r.move > 0 ? '▲' : '▼'}</span>` : ''
      }</td>
      <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td></tr>`,
    )
    .join('');
  return `${chips}
    <div class="card flush"><table class="league"><thead><tr><th></th><th></th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th><th title="Goal difference">GD</th><th title="Points">Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${legendHtml(t)}`;
}

/** Keys only the zones this table has: the top league crowns a champion, the bottom one relegates nobody. */
function legendHtml(t: TableView): string {
  const labels: Record<string, string> = { champion: 'Champions', promotion: 'Promotion', playoff: 'Play-offs', relegation: 'Relegation' };
  const zones = [...new Set(t.rows.map((r) => r.zone).filter((z) => z !== null))];
  return `<p class="legend small">${zones.map((z) => `<span class="key ${z}"></span>${labels[z]}`).join(' ')}</p>`;
}

function playoffHtml(p: PlayoffView): string {
  const tie = (t: PlayoffView['semis'][number]) => `<li><span>${swatch(t.low)}${esc(t.low.short)} v ${swatch(t.high)}${esc(t.high.short)}</span>
      <span class="muted">${t.legs.map(esc).join(', ') || 'to play'}</span>${t.winner ? `<span class="win">${esc(t.winner)} through</span>` : ''}</li>`;
  const final = p.final
    ? `<li><span>Final: ${swatch(p.final.home)}${esc(p.final.home.short)} v ${swatch(p.final.away)}${esc(p.final.away.short)}</span>
      <span class="muted">${p.final.result ? esc(p.final.result) : 'to play'}</span>${p.final.winner ? `<span class="win">${esc(p.final.winner)} promoted</span>` : ''}</li>`
    : '';
  return `<h3 class="sub">League ${p.tier} play-offs</h3><ul class="bracket card flush">${p.semis.map(tie).join('')}${final}</ul>`;
}

/** The Nations Cup or the World Championship: where you stand, the draw so far (latest round first), the groups and past winners. */
function cupParts(v: GameView): string[] {
  const c = ui.cup === 'championship' ? v.cups.championship : v.cups.cup;
  const toggle = `<div class="seg chips">${[v.cups.cup, v.cups.championship]
    .map((x) => `<button type="button" class="${x.id === c.id ? 'on' : ''}" data-cup="${x.id}">${esc(x.name)}</button>`)
    .join('')}</div>`;
  const status = `<div class="card"><p class="small first">${esc(c.status)}</p>${
    c.winner ? `<p class="small">🏆 Winners: ${swatch(c.winner)}<strong>${esc(c.winner.name)}</strong></p>` : ''
  }</div>`;
  const tie = (t: CupView['rounds'][number]['ties'][number]) => {
    const side = (b: typeof t.home, won: boolean) => `${swatch(b)}${won ? `<strong>${esc(b.short)}</strong>` : esc(b.short)}`;
    return `<li class="${t.mine ? 'me' : ''}"><span>${side(t.home, t.winner === 'home')} v ${side(t.away, t.winner === 'away')}</span>
      <span class="muted">${t.legs.map(esc).join(', ') || 'to play'}${t.aggregate ? ` · ${esc(t.aggregate)}` : ''}</span></li>`;
  };
  const rounds = c.rounds.map(
    (r) => `<h3 class="sub">${esc(r.name)}</h3><ul class="bracket card flush">${[...r.ties]
      .sort((a, b) => Number(b.mine) - Number(a.mine))
      .map(tie)
      .join('')}</ul>`,
  );
  const groups = c.groups.length
    ? `<h3 class="sub">Groups</h3><div class="groups">${c.groups
        .map(
          (g) => `<table class="league group card flush"><thead><tr><th></th><th>Group ${esc(g.name)}</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>${g.rows
            .map(
              (r) =>
                `<tr class="${r.through ? 'promotion' : ''} ${r.isPlayer ? 'me' : ''}"><td class="pos">${r.pos}</td><td class="team">${swatch(r.club)}${esc(r.town)}</td><td>${r.played}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td></tr>`,
            )
            .join('')}</tbody></table>`,
        )
        .join('')}</div>`
    : '';
  const past = c.pastWinners.length
    ? `<h3 class="sub">Past winners</h3><ul class="cabinet card">${c.pastWinners
        .map((w) => `<li>S${w.season} ${swatch(w.winner)}<strong>${esc(w.winner.name)}</strong> <span class="muted small">beat ${esc(w.runnerUp.name)}</span></li>`)
        .join('')}</ul>`
    : '';
  return [toggle, status, ...rounds, groups, past];
}

function seasonEndHtml(e: SeasonEndView): string {
  const r = e.report;
  const perf = e.points.performance;
  const verdict =
    perf > 0
      ? `You beat expectations: expected ${ordinal(e.expected)}, finished ${ordinal(e.position)}. Plenty to build with this summer.`
      : perf < 0
        ? `You fell short: expected ${ordinal(e.expected)}, finished ${ordinal(e.position)}. Less to build with this summer.`
        : `You finished where you were expected: ${ordinal(e.position)}.`;
  const FOCUS_TEXT: Record<Focus, [string, string]> = {
    attack: ['Focus attack', 'Most of the work goes into scoring'],
    balanced: ['Balanced', 'Shared evenly'],
    defence: ['Focus defence', 'Most of the work goes into defending'],
  };
  if (summer.season !== e.season) Object.assign(summer, { season: e.season, focus: null, sent: false });
  const option = (o: SeasonEndView['options'][number]) => `<button type="button" role="radio" aria-checked="${summer.focus === o.focus}" class="focus ${o.focus} ${summer.focus === o.focus ? 'on' : ''}" data-focus="${o.focus}"${summer.sent ? ' disabled' : ''}>
      <strong>${FOCUS_TEXT[o.focus][0]}</strong><span class="muted small">${FOCUS_TEXT[o.focus][1]}</span>
    </button>`;
  return `<div class="season-end">
    <div class="card hero ${e.outcome ?? ''}">
      <h2 class="headline">${esc(e.headline)}</h2>
      <p class="muted small">Season ${e.season} · League ${e.tier}${e.newTier !== e.tier ? ` → League ${e.newTier} next season` : ''}</p>
    </div>

    <div class="card">
    <h3 class="sub first">Season report</h3>
    <dl class="report">
      <dt>Record</dt><dd>${esc(r.record)} · ${r.points} pts</dd>
      <dt>Scored</dt><dd>${r.goalsFor} <span class="muted">(league avg ${r.avgFor})</span></dd>
      <dt>Conceded</dt><dd>${r.goalsAgainst} <span class="muted">(league avg ${r.avgAgainst})</span></dd>
      <dt>Goals a game</dt><dd>${r.perGame} <span class="muted">in your matches (league ${r.leaguePerGame})</span></dd>
      <dt>Best run</dt><dd>${esc(r.bestRun)}</dd>
      <dt>Worst run</dt><dd>${esc(r.worstRun)}</dd>
      ${r.topScorer ? `<dt>Top scorer</dt><dd>${esc(r.topScorer)}</dd>` : ''}
      ${r.cups.map((x) => `<dt>${esc(x.name)}</dt><dd>${esc(x.run)}</dd>`).join('')}
    </dl>
    </div>

    <div class="card accent-card">
    <h3 class="sub first">Summer</h3>
    <p class="small">${esc(verdict)}</p>
    <details class="howto small"><summary>How does summer work?</summary>
      <p class="muted">Players age and leave over the summer, and every team loses some strength. You won't be told whether it hit your attack or your defence: the goals are the clue. Lots at both ends suggests you lean attacking; tight, low-scoring games suggest you lean defensive.</p>
    </details>
    <p class="small strong">Where should the summer's work go?</p>
    <div class="focus-row" role="radiogroup">${e.options.map(option).join('')}</div>
    <button type="button" id="nextSeason" class="primary"${summer.focus && !summer.sent ? '' : ' disabled'}>Start next season</button>
    ${e.canRetire ? '<p class="muted small center">Start next season to defend the title.</p>' : ''}
    ${e.canRetire ? `<button type="button" id="newCareer" class="secondary">Start a new career</button>` : ''}
    <p class="small"><button type="button" class="link" data-copy="${esc(e.summary)}">Copy summary</button> <span class="muted">${esc(e.summary)}</span></p>
    </div>

    <h3 class="sub">Final table</h3>
    ${tableHtml([e.table], 1, false)}
    ${e.playoffs ? playoffHtml(e.playoffs) : ''}
  </div>`;
}

function fixturesHtml(fixtures: FixtureView[]): string {
  return `<ol class="fixtures card flush">${fixtures
    .map(
      (f) => `<li class="${f.current ? 'current' : ''} ${f.result ? 'played' : ''}"><span class="muted small">${esc(f.label)}</span>
      <span class="opp" title="${esc(f.opponent.name)}">${swatch(f.opponent)}<span class="ellipsis">${esc(f.town)}</span></span>
      <span class="muted small">${f.home ? 'H' : 'A'}</span>
      <span class="res">${f.result ? `<span class="pill ${f.outcome ?? ''}"${f.resultTitle ? ` title="${esc(f.resultTitle)}"` : ''}>${esc(f.result)}</span>` : f.current ? '<span class="pill live">LIVE</span>' : ''}</span></li>`,
    )
    .join('')}</ol>`;
}

/** Only records that exist yet; a brand-new club gets a line instead of a column of dashes. */
function recordsHtml(r: GameView['club']['records']): string {
  const rows: [string, string | null][] = [
    ['Biggest win', r.biggestWin ? esc(r.biggestWin) : null],
    ['Heaviest defeat', r.heaviestDefeat ? esc(r.heaviestDefeat) : null],
    ['Unbeaten run', /^0\b/.test(r.unbeaten) ? null : esc(r.unbeaten)],
    ['Winning run', /^0\b/.test(r.winning) ? null : esc(r.winning)],
    ['Most goals', r.mostGoals ? esc(r.mostGoals) : null],
    ['Top scorers', r.topScorers.length ? r.topScorers.map(esc).join('<br>') : null],
  ];
  const shown = rows.filter(([, value]) => value !== null);
  return shown.length
    ? `<dl class="report">${shown.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`
    : '<p class="muted small">Records appear as the matches are played.</p>';
}

function clubHtml(v: GameView): string {
  const c = v.club;
  const r = c.records;
  const g = c.goals;
  return `<div class="clubcard card" data-accent="${esc(c.colours[0])}">
    <div class="club">${swatch(c, 'crest')}<div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.short)} · League ${c.tier} · Season ${c.season} · ${esc(c.difficulty[0].toUpperCase() + c.difficulty.slice(1))}</div></div></div>
    <p class="expect">Expected to finish <strong>${ordinal(c.expected)}</strong> this season</p>
    <dl class="report">
      <dt>Scored</dt><dd>${g.scored} <span class="muted">(league avg ${g.average})</span></dd>
      <dt>Conceded</dt><dd>${g.conceded} <span class="muted">(league avg ${g.average})</span></dd>
    </dl>
    <p class="muted small">After ${g.played} league match${g.played === 1 ? '' : 'es'} this season.</p>
    ${c.rival ? `<p class="small">Rival: ${swatch(c.rival)}<strong>${esc(c.rival.name)}</strong> <span class="muted">· ${esc(c.rival.where)}</span></p>` : ''}
  </div>
  <div class="card">
    <h3 class="sub first">Trophy cabinet</h3>
    ${
      c.cabinet.titles.length || c.cabinet.promotions || c.cabinet.cups.length || c.cabinet.championships.length
        ? `<ul class="cabinet">${c.cabinet.championships.length ? `<li>🌍 World champions <span class="muted small">× ${c.cabinet.championships.length} (S${c.cabinet.championships.join(', S')})</span></li>` : ''}
           ${c.cabinet.cups.length ? `<li>🏆 Nations Cup winners <span class="muted small">× ${c.cabinet.cups.length} (S${c.cabinet.cups.join(', S')})</span></li>` : ''}
           ${c.cabinet.titles.map((t) => `<li>🏆 League ${t.tier} champions <span class="muted small">× ${t.seasons.length} (S${t.seasons.join(', S')})</span></li>`).join('')}
           ${c.cabinet.promotions ? `<li>⬆ Promotions <span class="muted small">× ${c.cabinet.promotions}</span></li>` : ''}
           ${c.cabinet.playoffWins ? `<li>🎟 Play-off wins <span class="muted small">× ${c.cabinet.playoffWins}</span></li>` : ''}</ul>`
        : '<p class="muted small">Empty for now. Win something!</p>'
    }

  </div>
  <div class="card">
    <h3 class="sub first">Records</h3>
    ${recordsHtml(r)}

  </div>
  <div class="card">
    <h3 class="sub first">Manager</h3>
    <p class="small">${r.manager.seasons} season${r.manager.seasons === 1 ? '' : 's'} completed · ${r.manager.matches} matches · ${r.manager.won}W ${r.manager.drawn}D ${r.manager.lost}L · ${r.manager.winPct}% won · ${r.manager.titles} title${r.manager.titles === 1 ? '' : 's'}</p>

  </div>
  <div class="card">
    <h3 class="sub first">History</h3>
    ${
      c.history.length
        ? `<ol class="history">${c.history
            .map(
              (h) => `<li><span>S${h.season}</span><span>L${h.tier} · ${ordinal(h.position)}</span><span class="muted small">${esc(h.record)}</span>
              <button type="button" class="link small" data-copy="${esc(h.summary)}" title="Copy summary">Copy</button>${
                h.cups.map((x) => `<span class="muted small cups">${esc(x.name)}: ${esc(x.run)}</span>`).join('')
              }</li>`,
            )
            .join('')}</ol>`
        : '<p class="muted small">Your first season is under way.</p>'
    }
    <p class="small"><button type="button" class="link" id="resetCareer">Reset career…</button></p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Rendering and events

function render(): void {
  if (!view) return;
  if (view.screen === 'setup') {
    renderOverlay(null);
    if (app.dataset.mode !== 'setup') renderSetup(view.setup);
    return;
  }
  setup.initialised = false;
  renderGame(view);
}

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.tab) {
    ui.tab = button.dataset.tab as Tab;
    scrollFixtures = true;
    saveUi();
    render();
  } else if (button.dataset.cup) {
    ui.cup = button.dataset.cup as CupView['id'];
    saveUi();
    render();
  } else if (button.dataset.tier) {
    ui.tableTier = Number(button.dataset.tier);
    saveUi();
    render();
  } else if (button.dataset.focus) {
    summer.focus = button.dataset.focus as Focus;
    render();
  } else if (button.id === 'nextSeason' && summer.focus && !summer.sent) {
    summer.sent = true;
    render();
    send({ type: 'chooseFocus', focus: summer.focus });
  } else if (button.dataset.copy) {
    send({ type: 'copy', text: button.dataset.copy });
  } else if (button.id === 'newCareer') {
    send({ type: 'newCareer' });
  } else if (button.id === 'resetCareer') {
    send({ type: 'resetCareer' });
  } else if (button.id === 'speed') {
    send({ type: 'setDuration', duration: button.dataset.next as Duration });
  } else if (button.id === 'pause') {
    send({ type: 'togglePause' });
  } else if (button.id === 'start' && setup.team) {
    send({ type: 'startCareer', team: setup.team, league: setup.league, difficulty: setup.difficulty, duration: setup.duration, style: setup.style });
  } else if (button.dataset.team && view?.screen === 'setup') {
    setup.team = button.dataset.team;
    setup.league = view.setup.nations.find((n) => n.code === setup.team)!.tier;
    renderSetup(view.setup);
  } else if (button.closest('.seg')?.getAttribute('data-name')) {
    const group = button.closest('.seg')!.getAttribute('data-name')!;
    const value = button.dataset.value!;
    if (group === 'league') setup.league = Number(value);
    if (group === 'difficulty') setup.difficulty = value as Difficulty;
    if (group === 'duration') setup.duration = value as Duration;
    if (group === 'style') setup.style = value as Style;
    if (view?.screen === 'setup') renderSetup(view.setup);
  }
});

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== 'search' || view?.screen !== 'setup') return;
  setup.search = input.value;
  const list = document.getElementById('nations')!;
  list.innerHTML = nationList(view.setup.nations);
  paintSwatches(list);
});

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message.type === 'view') {
    view = message.view;
    render();
  }
});

send({ type: 'ready' });
