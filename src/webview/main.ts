import {
  DURATION_LABELS,
  type CupView,
  type Duration,
  type FixtureView,
  type Focus,
  type FullTimeView,
  type GameView,
  type HonoursView,
  type LiveMatchView,
  type MatchBadge,
  type NationOption,
  type PanelId,
  type PlayoffView,
  type SeasonEndView,
  type SetupView,
  type SportRowView,
  type TableView,
  type TeamBadge,
  type TimelineView,
  type ToHost,
  type ToWebview,
  type View,
  type WorldEndView,
} from '../shared/view';
import { ordinal } from '../shared/format';
import type { SportId } from '../core/format';
import type { InningsCard, SportTerms } from '../core/sport';

declare function acquireVsCodeApi(): { postMessage(m: ToHost): void; getState(): unknown; setState(s: unknown): void };

const vscode = acquireVsCodeApi();
const app = document.getElementById('app')!;
/** The open sport's full view; moves into whichever sport is open in the list. */
const panel = document.createElement('div');
panel.id = 'panel';
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
let rows: SportRowView[] = [];
let honours: string | null = null;
/** A question open in the box: red steps can't be done by VS Code's own pop-ups. */
let ask: { kind: 'career'; step: 'choose' | 'reset' } | { kind: 'honours'; step: 'first' | 'final' } | null = null;
const askBox = document.createElement('div');
askBox.id = 'ask';
let open: PanelId | null = null;
/** What was last shown in full, so opening another sport starts on your own league. */
let shownPanel: PanelId | null = null;
/** The side to rebuild, picked but not yet confirmed, and the sport and season it belongs to. */
const summer = { sport: null as SportId | null, season: 0, focus: null as Focus | null, sent: false, howTo: false };

const setup = {
  sport: null as SportId | null,
  team: '',
  search: '',
  /** The whole list shows until a country is picked, and again when the search box is clicked to change it. */
  browsing: false,
  league: 3,
  duration: '2m' as Duration,
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

/** Plain line icons in the text colour, one per sport. */
const SPORT_ICONS: Record<SportId, string> = {
  football: '<circle cx="8" cy="8" r="6.5"/><path d="M8 5l2.9 2.1-1.1 3.4H6.2L5.1 7.1z"/><path d="M8 5V1.6M10.9 7.1l3.2-1M9.8 10.5l2 2.7M6.2 10.5l-2 2.7M5.1 7.1l-3.2-1"/>',
  rugby: '<ellipse cx="8" cy="8" rx="7" ry="4.3" transform="rotate(-40 8 8)"/><path d="M5.6 10.4l4.8-4.8M6.6 7.4l2 2M7.8 6.2l2 2"/>',
  cricket: '<path d="M13.6 1.4l1 1-3.1 3.1-1-1zM10.5 4.5l1 1L5.2 11.8a1.4 1.4 0 0 1-2-2z"/><circle cx="12.5" cy="12.5" r="1.9"/>',
};

const TROPHY_ICON = '<path d="M5 2h6v4a3 3 0 0 1-6 0zM5 3H2.5c0 2 1 3.2 2.6 3.5M11 3h2.5c0 2-1 3.2-2.6 3.5M8 9v3M5.5 14h5M6.5 12h3"/>';

function lineIcon(paths: string): string {
  return `<svg class="sport-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function sportIcon(sport: SportId): string {
  return lineIcon(SPORT_ICONS[sport]);
}

function seg(name: string, options: Option[], value: string): string {
  return `<div class="seg" role="radiogroup" data-name="${name}">${options
    .map(
      ([val, label, sub]) =>
        `<button type="button" role="radio" aria-checked="${val === value}" tabindex="${val === value ? 0 : -1}" class="${val === value ? 'on' : ''}" data-value="${val}">${esc(label)}${
          sub ? `<span class="sub-label">${esc(sub)}</span>` : ''
        }</button>`,
    )
    .join('')}</div>`;
}

function nationMatches(nations: NationOption[]): NationOption[] {
  const q = setup.search.trim().toLowerCase();
  return q ? nations.filter((n) => n.name.toLowerCase().includes(q) || n.code.toLowerCase() === q) : nations;
}

/** The countries to pick from; redrawn on its own while typing so the search box keeps focus. */
function nationList(nations: NationOption[]): string {
  if (!setup.search.trim() && setup.team && !setup.browsing) return '';
  const matches = nationMatches(nations);
  if (!matches.length) return '<p class="muted small">No country matches.</p>';
  const option = (n: NationOption) =>
    `<button type="button" role="option" class="nation ${n.code === setup.team ? 'on' : ''}" aria-selected="${n.code === setup.team}" data-team="${n.code}">${swatch(n)}<span class="grow">${esc(n.name)}</span><span class="muted small">L${n.tier}</span></button>`;
  return matches.map(option).join('');
}

function renderSetup(v: SetupView): void {
  if (setup.sport !== v.sport) Object.assign(setup, { sport: v.sport, team: '', search: '', league: Math.min(3, v.leagues), initialised: false });
  if (!setup.initialised) {
    setup.duration = v.duration;
    const suggested = v.nations.find((n) => n.code === v.suggested);
    if (suggested && !setup.team) Object.assign(setup, { team: suggested.code, league: suggested.tier });
    setup.initialised = true;
  }
  const chosen = v.nations.find((n) => n.code === setup.team);
  const leagueOptions = Array.from({ length: v.leagues }, (_, i) => i + 1).map((t): Option => [String(t), `L${t}`, chosen?.tier === t ? 'Usual' : undefined]);
  panel.dataset.mode = 'setup';
  panel.innerHTML = `
  <div class="setup card">
    <h2>New ${esc(v.terms.name.toLowerCase())} career</h2>
    <p class="muted small">Every match plays itself. Each summer you make one decision.</p>

    <div class="field">Country
      ${chosen ? `<div class="chosen">${swatch(chosen, 'crest big')}<strong>${esc(chosen.name)}</strong></div>` : ''}
      <input id="search" type="search" placeholder="Pick or type your country" aria-label="Pick or type your country" value="${esc(setup.search)}" autocomplete="off">
      <div id="nations" class="nation-list" role="listbox" aria-label="Countries">${nationList(v.nations)}</div>
    </div>

    ${chosen ? `<div class="field">Starting league ${seg('league', leagueOptions, String(setup.league))}</div>` : ''}

    <div class="field">Match length ${seg('duration', v.durations.map((d): Option => [d, DURATION_LABELS[d], v.terms.seasonLabels[d]]), setup.duration)}</div>

    ${chosen ? '<button type="button" id="start" class="primary">Start career</button>' : ''}
  </div>`;
  paintSwatches(panel);
}

// ---------------------------------------------------------------------------
// The list of sports

/** A row's parts that rarely change; its line changes every tick and is written on its own. */
function rowHtml(r: SportRowView, isOpen: boolean): string {
  const control = isOpen
    ? r.club
      ? `<button type="button" class="chip" data-ask-career title="End or reset this career">End…</button>`
      : ''
    : !r.club
      ? `<button type="button" class="chip" data-open="${r.id}">Start</button>`
      : r.waiting
        ? ''
        : `<button type="button" class="chip icon" data-pause="${r.id}" title="${r.paused ? 'Play' : 'Pause'}" aria-label="${r.paused ? 'Play' : 'Pause'} ${esc(r.name)}">${r.paused ? '▶' : '⏸'}</button>`;
  return `<div class="sport-row${isOpen ? ' open' : ''}${r.waiting ? ' waiting' : ''}">
    <button type="button" class="row-main" data-open="${r.id}" aria-expanded="${isOpen}">
      <span class="chevron" aria-hidden="true"></span>${sportIcon(r.id)}
      <span class="row-text"><span class="row-name">${esc(r.name)}${r.club ? `<span class="muted"> · ${esc(r.club)}</span>` : ''}</span><span class="row-sub">${r.badge && !isOpen && !r.waiting ? badgeHtml(r.badge) : ''}<span class="row-line muted small"></span></span></span>
    </button>${control}${r.club ? '<span class="row-progress" aria-hidden="true"><span></span></span>' : ''}
  </div>`;
}

function badgeHtml(b: MatchBadge): string {
  return `<span class="badge ${b.kind}">${b.label}</span>`;
}

function writeRow(section: HTMLElement, html: string, line: string): void {
  patch(section.querySelector<HTMLElement>('.row-slot')!, [html]);
  const lineEl = section.querySelector<HTMLElement>('.row-line')!;
  if (lineEl.textContent !== line) {
    lineEl.textContent = line;
    // If it still can't fit, hovering shows all of it.
    lineEl.title = line;
    fitLine(lineEl);
  }
}

/** The smallest a row's line goes to fit, in pixels: any smaller is hard to read, so it's cut off instead. */
const MIN_LINE_PX = 9;

/** Shrinks a row's line just enough to fit its width, as a cricket score needs more room than a football one. */
function fitLine(el: HTMLElement): void {
  el.style.fontSize = '';
  if (!el.clientWidth || el.scrollWidth <= el.clientWidth) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  // Text doesn't quite scale evenly, so this steps down until it fits.
  while (el.scrollWidth > el.clientWidth && size > MIN_LINE_PX) {
    size = Math.max(MIN_LINE_PX, size - 0.25);
    el.style.fontSize = `${size}px`;
  }
}

// Dragging the box wider or narrower changes what fits.
new ResizeObserver(() => app.querySelectorAll<HTMLElement>('.row-line').forEach(fitLine)).observe(app);

/**
 * The rows stay in place and only their lines change: a button replaced between
 * mouse-down and mouse-up would swallow the click.
 */
function renderRows(): void {
  const panels: PanelId[] = [...rows.map((r) => r.id), ...(honours ? (['honours'] as const) : [])];
  // Sports can be hidden in the settings, so the same number of rows doesn't mean the same rows.
  if (Array.from(app.querySelectorAll<HTMLElement>(':scope > .sport'), (s) => s.dataset.sport).join() !== panels.join()) {
    app.innerHTML = `<div id="pins"></div>${panels.map((id) => `<section class="sport" data-sport="${id}"><div class="row-slot"></div></section>`).join('')}<p class="small choose-sports"><button type="button" class="link" data-choose-sports>Choose sports…</button></p>`;
  }
  // A long open page can push the other rows out of sight, so a decision waiting stays pinned at the top.
  const pins = document.getElementById('pins')!;
  const waiting = open ? rows.filter((r) => r.waiting && r.id !== open) : [];
  patch(pins, waiting.map((r) => `<button type="button" class="pin" data-open="${r.id}">${esc(r.name)}: ${esc(r.waitingLine ?? 'season over, decision waiting')}</button>`));
  app.style.setProperty('--pin-h', `${pins.offsetHeight}px`);
  for (const r of rows) {
    const section = app.querySelector<HTMLElement>(`:scope > [data-sport="${r.id}"]`)!;
    const isOpen = open === r.id;
    section.classList.toggle('needs-you', r.waiting && !isOpen);
    section.classList.toggle('world', !!r.world);
    writeRow(section, rowHtml(r, isOpen), isOpen ? '' : r.waiting ? (r.waitingLine ?? 'Season over: decision waiting') : r.club ? (r.line ?? '') : 'Not started');
    // Inline styles are blocked by the CSP, so the width goes through the CSSOM.
    const bar = section.querySelector<HTMLElement>('.row-progress span');
    if (bar) bar.style.width = `${(r.progress ?? 0) * 100}%`;
    if (isOpen && panel.parentElement !== section) section.append(askBox, panel);
  }
  if (honours) {
    const section = app.querySelector<HTMLElement>(':scope > [data-sport="honours"]')!;
    const isOpen = open === 'honours';
    const html = `<div class="sport-row${isOpen ? ' open' : ''}"><button type="button" class="row-main" data-open="honours" aria-expanded="${isOpen}"><span class="chevron" aria-hidden="true"></span>${lineIcon(TROPHY_ICON)}<span class="row-text"><span class="row-name">Honours</span><span class="row-line muted small"></span></span></button></div>`;
    writeRow(section, html, isOpen ? '' : honours);
    if (isOpen && panel.parentElement !== section) section.append(askBox, panel);
  }
  if (!open) {
    panel.remove();
    askBox.remove();
  }
}

// ---------------------------------------------------------------------------
// Honours

function careerRowHtml(c: HonoursView['past'][number]): string {
  return `<li><div>${sportIcon(c.sport)} <strong>${esc(c.club)}</strong> <span class="muted small">${esc(c.sportName)} · ${c.seasons} season${c.seasons === 1 ? '' : 's'}${c.live ? ' · playing' : ''}</span></div><div class="muted small">${esc(c.summary)}</div></li>`;
}

/** The question for what's open, one step at a time. Written only when it changes, so its buttons survive every tick. */
function renderAsk(): void {
  const row = rows.find((r) => r.id === open);
  const v = view?.screen === 'honours' ? view : null;
  if (ask && (ask.kind === 'career' ? !row?.club : !v)) ask = null;
  const cancel = '<button type="button" class="link" data-ask-cancel>Cancel</button>';
  let html = '';
  if (ask?.kind === 'career' && row) {
    const career = `your ${esc(row.name.toLowerCase())} career with ${esc(row.club!)}`;
    html =
      ask.step === 'choose'
        ? `<div class="card ask"><p class="small strong">What should happen to ${career}?</p>
            <button type="button" class="secondary" data-do-end>End career</button>
            <p class="muted small">Stops here and keeps it in Past careers, where it still counts for greatest teams and records.</p>
            <button type="button" class="danger-line" data-ask-reset>Reset career…</button>
            <p class="muted small">Deletes it completely, as if it was never played.</p>${cancel}</div>`
        : `<div class="card ask danger" role="alert"><p class="small strong">Delete ${career}?</p>
            <p class="small">All its seasons, trophies and records go for good, and it won't appear in Past careers. This can't be undone. Honours already earned stay.</p>
            <button type="button" class="danger-fill" data-do-reset>Yes, delete this career</button>${cancel}</div>`;
  } else if (ask?.kind === 'honours' && v) {
    const what = [v.feats.length && `${v.feats.length} honour${v.feats.length === 1 ? '' : 's'}`, v.past.length && `${v.past.length} past career${v.past.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    html =
      ask.step === 'first'
        ? `<div class="card ask danger" role="alert"><p class="small strong">Reset honours?</p>
            <p class="small">This deletes ${what}. Careers you're playing carry on, and earn honours only from the seasons still to come.</p>
            <button type="button" class="danger-line" data-ask-final>Continue</button>${cancel}</div>`
        : `<div class="card ask danger" role="alert"><p class="small strong">Are you sure? This can't be undone.</p>
            <button type="button" class="danger-fill" data-do-honours>Yes, delete ${what}</button>${cancel}</div>`;
  }
  if (written.get(askBox) === html) return;
  written.set(askBox, html);
  askBox.innerHTML = html;
  if (html) askBox.scrollIntoView({ block: 'nearest' });
}

function honoursHtml(v: HonoursView): string {
  const card = (title: string, body: string) => `<div class="card"><h3 class="sub first">${title}</h3>${body}</div>`;
  return [
    v.feats.length ? card('Honours', `<ul class="career-list">${v.feats.map((f) => `<li><div>🏆 <strong>${esc(f.title)}</strong></div><div class="muted small">${esc(f.detail)}</div></li>`).join('')}</ul>`) : '',
    v.greatest.length ? card('Greatest teams', `<ol class="career-list">${v.greatest.map(careerRowHtml).join('')}</ol>`) : '',
    ...v.records.map((r) => card(`${sportIcon(r.sport)} ${esc(r.name)} records`, `<dl class="report records">${r.rows.map((x) => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>`)),
    v.past.length ? card('Past careers', `<ul class="career-list">${v.past.map(careerRowHtml).join('')}</ul>`) : '',
    v.feats.length || v.past.length ? '<p class="small"><button type="button" class="link danger-link" data-ask-honours>Reset honours…</button></p>' : '',
  ].join('');
}

function renderHonours(v: HonoursView): void {
  renderOverlay(null);
  app.classList.remove('needs-choice');
  const html = honoursHtml(v);
  if (panel.dataset.mode === 'honours' && written.get(panel) === html) return;
  panel.dataset.mode = 'honours';
  panel.innerHTML = html;
  written.set(panel, html);
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
      <div class="muted small">Full time · ${esc(ft.competition)}${ft.note ? ` · ${esc(ft.note)}` : ''}</div>
      <div class="ft-score">${swatch(ft.home)}<span title="${esc(ft.home.name)}">${esc(ft.home.short)}</span> <strong>${esc(ft.score)}</strong> <span title="${esc(ft.away.name)}">${esc(ft.away.short)}</span>${swatch(ft.away)}</div>
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
      // Someone using the keyboard stays on the same button when it's redrawn.
      const focused = region.contains(document.activeElement) ? focusKey(document.activeElement!) : null;
      region.innerHTML = html;
      written.set(region, html);
      if (focused) region.querySelector<HTMLElement>(focused)?.focus();
    }
  });
}

/** How to find this button again after its region is redrawn. */
function focusKey(el: Element): string | null {
  if (el.id) return `#${el.id}`;
  const data = Array.from(el.attributes).find((a) => a.name.startsWith('data-'));
  return data ? `[${data.name}=${JSON.stringify(data.value)}]` : null;
}

function renderGame(v: GameView): void {
  renderOverlay(v.seasonEnd ? null : v.fullTime);
  if (panel.dataset.mode !== 'game') {
    panel.innerHTML = '<div id="top"></div><div id="main"></div>';
    panel.dataset.mode = 'game';
  }
  // The narrowest layout shows only the header, except when a summer choice is waiting.
  app.classList.toggle('needs-choice', !!v.seasonEnd || !!v.worldEnd);
  patch(document.getElementById('top')!, [headerHtml(v), v.header.paused && !v.seasonEnd && !v.worldEnd ? '<p class="notice paused small">Paused. Press ▶ to carry on.</p>' : '']);
  const tabs: [Tab, string][] = [
    ['match', 'Match'],
    ['table', 'Table'],
    ['fixtures', 'Fixtures'],
    ['cups', 'Cups'],
    ['club', 'Team'],
  ];
  const nav = `<nav class="tabs" role="tablist">${tabs
    .map(([id, label]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" tabindex="${ui.tab === id ? 0 : -1}" class="${ui.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`)
    .join('')}</nav>`;
  patch(document.getElementById('main')!, v.seasonEnd ? [seasonEndHtml(v.seasonEnd, v.sport, v.terms)] : v.worldEnd ? [worldEndHtml(v.worldEnd, v.fixtures)] : [nav, ...panelParts(v)]);
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

/** Read out by screen readers when something big happens in the player's match, and invisible otherwise. */
const announcer = document.createElement('div');
announcer.className = 'sr-only';
announcer.setAttribute('aria-live', 'polite');
document.body.appendChild(announcer);

const FLASH_MS = 1600;
const lastScore = { key: '', home: 0, away: 0 };
const flash = { cls: '', at: 0, id: 0 };

/** Notices a big moment in the player's match: green when it goes their way, red when it doesn't. */
function trackGoals(v: GameView): void {
  const m = v.match;
  if (!m || (!m.home.isPlayer && !m.away.isPlayer)) return;
  const key = `${m.home.name}|${m.away.name}|${m.competition}|${m.round ?? ''}`;
  if (key === lastScore.key) {
    const homeScored = m.alerts[0] > lastScore.home;
    const awayScored = m.alerts[1] > lastScore.away;
    if (homeScored || awayScored) {
      const mine = (homeScored && m.home.isPlayer) || (awayScored && m.away.isPlayer);
      Object.assign(flash, { cls: mine ? 'goal-for' : 'goal-against', at: Date.now(), id: flash.id + 1 });
      announcer.textContent = `${v.terms.alert} ${m.home.name} ${m.score[0]}, ${m.away.name} ${m.score[1]}, ${m.clock}`;
    }
  }
  Object.assign(lastScore, { key, home: m.alerts[0], away: m.alerts[1] });
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
  const dots = h.form.map((f) => `<span class="dot ${f.result}" title="${esc(f.title)}">${f.result}</span>`).join('');
  const next = h.durations[(h.durations.indexOf(h.duration) + 1) % h.durations.length];
  return `<header class="head card" data-accent="${esc(h.club.colours[0])}">
    <div class="head-line"><div class="club">${swatch(h.club, 'crest')}<div class="name">${esc(h.club.name)}</div></div><span class="form" role="group" aria-label="Form, latest last">${dots}</span></div>
    <div class="head-line"><div class="muted small where">${ordinal(h.position)} · L${h.tier} · <span title="League games played">played ${h.played}/${h.games}</span></div>
      <span class="controls">
        <button type="button" id="speed" class="chip" data-next="${next}" title="Match length: ${DURATION_LABELS[h.duration]} (${(v.terms.seasonLabels[h.duration] ?? '').toLowerCase()}). Click for ${DURATION_LABELS[next]}." aria-label="Match length ${DURATION_LABELS[h.duration]}"><span>⏱</span><span class="wide"> ${DURATION_LABELS[h.duration]}</span></button>
        <button type="button" id="pause" class="chip icon" title="${h.paused ? 'Play' : 'Pause'}" aria-label="${h.paused ? 'Play' : 'Pause'}">${h.paused ? '▶' : '⏸'}</button>
      </span></div>
  </header>`;
}

/** The active tab's content, split into regions that update independently. */
function panelParts(v: GameView): string[] {
  switch (ui.tab) {
    case 'match':
      return matchParts(v);
    case 'table': {
      // A league picked in a sport with more leagues than this one doesn't apply here.
      const tier = ui.tableTier !== null && ui.tableTier <= v.tables.length ? ui.tableTier : v.playerTier;
      const playoff = v.playoffs.find((p) => p.tier === tier);
      const chips = `<div class="seg chips">${v.tables
        .map((x) => {
          const mine = x.tier === v.playerTier;
          return `<button type="button" class="${x.tier === tier ? 'on' : ''} ${mine ? 'mine' : ''}" data-tier="${x.tier}"${mine ? ' title="Your league"' : ''}>L${x.tier}</button>`;
        })
        .join('')}</div>`;
      return [chips, tableHtml(v.tables, tier, v.terms), playoff ? playoffHtml(playoff) : ''];
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
  if (v.waiting === 'seasonOver') return [`<p class="notice">The season is over: one decision waiting.</p>`];
  const m = v.match;
  if (!m) return [`<p class="muted">${v.header.paused ? 'The next match kicks off when you press ▶.' : 'Next match about to kick off…'}</p>`];
  // Newest first, so the latest event is always in view.
  const items = m.timeline;
  const icon = (t: TimelineView) =>
    t.kind === 'goal'
      ? `<span class="ball" aria-label="${esc(v.terms.eventName)}">${sportIcon(v.sport)}</span>`
      : t.kind === 'minor'
        ? '<span class="dot-minor" aria-hidden="true">•</span>'
        : `<span class="card ${t.kind}" aria-label="${t.kind === 'red' ? 'Red' : 'Yellow'} card"></span>`;
  // Laid out like the scoreboard above it: the home side's events on the left, the away side's on the right, with when and the score between.
  const row = (t: TimelineView) => {
    if (t.kind === 'break') return `<li class="break"><span>${esc(t.clock)}</span><span>${esc(t.text)}</span></li>`;
    const team = t.side === 'home' ? m.home : m.away;
    const event = `<span class="who" title="${esc(team.name)}: ${esc(t.text)}">${esc(t.text)}</span><span class="ev-icon">${icon(t)}</span>`;
    return `<li class="${t.kind}${team.isPlayer ? ' mine' : ''}"><div class="ev home">${t.side === 'home' ? event : ''}</div><div class="ev-mid"><span class="min">${esc(t.clock)}</span>${t.score ? `<span class="running">${esc(t.score)}</span>` : ''}</div><div class="ev away">${t.side === 'away' ? event : ''}</div></li>`;
  };
  const teams = `<div class="feed-teams"><span>${swatch(m.home)}${esc(m.home.short)}</span><span>${esc(m.away.short)}${swatch(m.away)}</span></div>`;
  if (m.scorecard) return [scoreboard(m, v.terms), ...m.scorecard.map(inningsHtml)];
  return [scoreboard(m, v.terms), `<div class="card feed-card">${items.length ? `${teams}<ol class="report-feed">${[...items].reverse().map(row).join('')}</ol>` : `<p class="muted small center">${esc(v.terms.noEventsYet)}</p>`}</div>`];
}

/** One innings, the way a real scorecard sets it out. The one finished is folded away, and stays open or shut between updates. */
function inningsHtml(c: InningsCard, i: number): string {
  const title = `${esc(c.team)} ${esc(c.total)} <span class="muted">(${esc(c.overs)} ov)</span>`;
  const batter = (b: InningsCard['batters'][number]) =>
    `<tr class="${b.out ? '' : 'in'}"><td><span class="bat-name">${esc(b.name)}${b.striker ? '*' : ''}</span><span class="how muted small">${esc(b.how)}</span></td><td class="num strong">${b.runs}</td><td class="num">${b.balls}</td></tr>`;
  const body = `<table class="scorecard"><thead><tr><th>Batter</th><th class="num" title="Runs">R</th><th class="num" title="Balls faced">B</th></tr></thead><tbody>${c.batters.map(batter).join('')}</tbody></table>
    ${c.yetToBat.length ? `<p class="muted small yet">Yet to bat: ${c.yetToBat.map(esc).join(', ')}</p>` : ''}
    ${
      c.bowlers.length
        ? `<table class="scorecard bowling"><thead><tr><th>Bowler</th><th class="num" title="Overs">O</th><th class="num" title="Runs given">R</th><th class="num" title="Wickets">W</th></tr></thead><tbody>${c.bowlers
            .map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${esc(b.overs)}</td><td class="num">${b.runs}</td><td class="num strong">${b.wickets}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
    }`;
  return i === 0 ? `<div class="card innings"><div class="innings-title">${title}</div>${body}</div>` : `<details class="fold card innings"><summary class="innings-title">${title}</summary>${body}</details>`;
}

function scoreboard(m: LiveMatchView, terms: SportTerms): string {
  // Two cricket totals sit smaller, each beside its own team.
  const long = terms.scoreJoin !== '–';
  const team = (t: LiveMatchView['home'], town: string) =>
    `<div class="team ${t.isPlayer ? 'me' : ''}" title="${esc(t.name)}"${t.isPlayer ? ` data-accent="${esc(t.colours[0])}"` : ''}>${swatch(t, 'crest big')}<span class="code">${esc(t.short)}</span><span class="town">${esc(town)}</span></div>`;
  return `<div class="board card">
      <div class="comp muted small">${m.badge ? `${badgeHtml(m.badge)} ${esc(m.stage ?? '')}` : esc(m.competition)}${m.round ? ` · ${esc(m.round)}` : ''}${m.rival ? ' · <span class="rival-tag">⚔ Rival match</span>' : ''}</div>
      <div class="score">${team(m.home, m.homeTown)}<div class="mid"><div class="goals${long ? ' long' : ''}">${esc(m.score[0] || '–')}<span>${esc(terms.scoreJoin.trim())}</span>${esc(m.score[1] || '–')}</div>
        <div class="clock-big ${m.finished ? 'ft' : 'live'}">${esc(m.clock)}</div></div>${team(m.away, m.awayTown)}</div>
      ${m.situation ? `<div class="small situation">${esc(m.situation)}</div>` : ''}
      ${(m.details ?? []).map((line) => `<div class="muted small detail">${esc(line)}</div>`).join('')}
      ${m.aggregate ? `<div class="muted small">${esc(m.aggregate)}</div>` : ''}
      ${m.penalties ? `<div class="pens small">${esc(m.penalties)}</div>` : ''}
      ${m.suspended ? `<div class="muted small">Suspended: ${m.suspended.map(esc).join(', ')}</div>` : ''}
    </div>`;
}

function tableHtml(tables: TableView[], tier: number, terms: SportTerms): string {
  const t = tables[tier - 1];
  const rows = t.rows
    .map(
      (r) => `<tr class="${r.zone ?? ''} ${r.isPlayer ? 'me' : ''} ${r.isRival ? 'rival' : ''}">
      <td class="pos">${r.pos}</td><td class="team" title="${esc(r.name)}${r.isRival ? ' · your rival' : ''}">${esc(r.town)}${
        r.move ? ` <span class="move ${r.move > 0 ? 'up' : 'down'}" title="${r.move > 0 ? 'Up' : 'Down'} ${Math.abs(r.move)} since kick-off">${r.move > 0 ? '▲' : '▼'}</span>` : ''
      }</td>
      <td>${r.played}</td><td>${r.won}</td>${terms.draws ? `<td>${r.drawn}</td>` : ''}<td>${r.lost}</td><td class="diff">${esc(r.gdText)}</td><td class="pts">${r.points}</td></tr>`,
    )
    .join('');
  return `<div class="card flush"><table class="league${terms.draws ? '' : ' no-draws'}"><thead><tr><th></th><th></th><th title="Played">P</th><th title="Won">W</th>${terms.draws ? '<th title="Drawn">D</th>' : ''}<th title="Lost">L</th><th title="${esc(terms.diffLong)}">${esc(terms.diffShort)}</th><th title="Points">Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${legendHtml(t)}`;
}

/** Keys only the zones this table has: the top league crowns a champion, the bottom one relegates nobody. */
function legendHtml(t: TableView): string {
  const labels: Record<string, string> = { champion: 'Champions', promotion: 'Promotion', playoff: 'Play-offs', relegation: 'Relegation' };
  const zones = [...new Set(t.rows.map((r) => r.zone).filter((z) => z !== null))];
  const rival = t.rows.some((r) => r.isRival) ? ' <span class="key rival-key"></span>Your rival' : '';
  return `<p class="legend small">${zones.map((z) => `<span class="key ${z}"></span>${labels[z]}`).join(' ')}${rival}</p>`;
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
const CUP_SHORT: Record<CupView['id'], string> = { cup: 'Nations Cup', championship: 'World Ch.' };

/**
 * The Nations Cup or the World Championship: where you stand, your run, the
 * latest round in full, earlier rounds and the groups folded away, and past
 * winners.
 */
function cupParts(v: GameView): string[] {
  const c = ui.cup === 'championship' ? v.cups.championship : v.cups.cup;
  const toggle = `<div class="seg chips">${[v.cups.cup, v.cups.championship]
    .map((x) => `<button type="button" class="${x.id === c.id ? 'on' : ''}" data-cup="${x.id}"><span class="full">${esc(x.name)}</span><span class="short">${CUP_SHORT[x.id]}</span></button>`)
    .join('')}</div>`;
  const status = `<div class="card cup-status"><div class="small">${esc(c.status)}</div>${c.next ? `<div class="small muted">${esc(c.next)}</div>` : ''}${
    c.winner ? `<div class="small">🏆 Winners: ${swatch(c.winner)}<strong>${esc(c.winner.name)}</strong></div>` : ''
  }</div>`;
  const tie = (t: CupView['rounds'][number]['ties'][number], round?: string) => {
    const side = (b: typeof t.home, won: boolean) => `${swatch(b)}${won ? `<strong>${esc(b.short)}</strong>` : esc(b.short)}`;
    return `<li class="${t.mine ? 'me' : ''}">${round ? `<span class="round-name muted small">${esc(round)}</span>` : ''}<span>${side(t.home, t.winner === 'home')} v ${side(t.away, t.winner === 'away')}</span>
      <span class="muted">${t.score ? esc(t.score) : 'to play'}</span>${
        t.decided ? `<span class="decided small muted">${esc(t.decided)}</span>` : ''
      }</li>`;
  };
  const ties = (r: CupView['rounds'][number]) => `<ul class="bracket card flush">${[...r.ties].sort((a, b) => Number(b.mine) - Number(a.mine)).map((t) => tie(t)).join('')}</ul>`;
  const myRun = c.rounds.flatMap((r) => r.ties.filter((t) => t.mine).map((t) => ({ round: r.name, t })));
  // Your run is worth its own card once there's more than the current tie to show.
  const run = myRun.length > 1
    ? `<h3 class="sub">Your run</h3><ul class="bracket card flush">${myRun.map(({ round, t }) => tie(t, round)).join('')}</ul>`
    : '';
  const [latest, ...earlier] = c.rounds;
  const rounds = latest
    ? [
        `<h3 class="sub">${esc(latest.name)}</h3>${ties(latest)}`,
        ...earlier.map((r) => `<details class="fold"><summary class="sub">${esc(r.name)} <span class="muted">· ${r.ties.length} ${r.ties.length === 1 ? 'tie' : 'ties'}</span></summary>${ties(r)}</details>`),
      ]
    : [];
  const table = (g: CupView['groups'][number]) =>
    `<table class="league group${v.terms.draws ? '' : ' no-draws'} card flush"><thead><tr><th></th><th>Group ${esc(g.name)}</th><th>P</th><th>${esc(v.terms.diffShort)}</th><th>Pts</th></tr></thead><tbody>${g.rows
      .map(
        (r) =>
          `<tr class="${r.through ? 'promotion' : ''} ${r.isPlayer ? 'me' : ''}"><td class="pos">${r.pos}</td><td class="team">${swatch(r.club)}${esc(r.town)}</td><td>${r.played}</td><td class="diff">${esc(r.gdText)}</td><td class="pts">${r.points}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  const groupTables = `<div class="groups">${c.groups.map(table).join('')}</div>`;
  // Groups stay open while they're being played, then fold away under the knockouts.
  const groups = !c.groups.length ? '' : c.rounds.length ? `<details class="fold"><summary class="sub">Groups</summary>${groupTables}</details>` : `<h3 class="sub">Groups</h3>${groupTables}`;
  const past = c.pastWinners.length
    ? `<h3 class="sub">Past winners</h3><ul class="cabinet card">${c.pastWinners
        .map((w) => `<li>S${w.season} ${swatch(w.winner)}<strong>${esc(w.winner.name)}</strong> <span class="muted small">beat ${esc(w.runnerUp.name)}</span></li>`)
        .join('')}</ul>`
    : '';
  return [toggle, status, run, ...rounds, groups, past];
}

function seasonEndHtml(e: SeasonEndView, sport: SportId, terms: SportTerms): string {
  const r = e.report;
  const verdict =
    e.performance === 'above'
      ? `You beat expectations: expected ${ordinal(e.expected)}, finished ${ordinal(e.position)}. Plenty to build with this summer.`
      : e.performance === 'below'
        ? `You fell short: expected ${ordinal(e.expected)}, finished ${ordinal(e.position)}. Less to build with this summer.`
        : `You finished where you were expected: ${ordinal(e.position)}.`;
  if (summer.sport !== sport || summer.season !== e.season) Object.assign(summer, { sport, season: e.season, focus: null, sent: false, howTo: false });
  const option = (o: SeasonEndView['question']['options'][number]) => `<button type="button" role="radio" aria-checked="${summer.focus === o.focus}" tabindex="${!summer.focus || summer.focus === o.focus ? 0 : -1}" class="focus ${o.focus} ${summer.focus === o.focus ? 'on' : ''}" data-focus="${o.focus}"${summer.sent ? ' disabled' : ''}>
      <strong>${esc(o.title)}</strong>${o.line ? `<span class="muted small">${esc(o.line)}</span>` : ''}
    </button>`;
  return `<div class="season-end">
    <div class="card hero ${e.outcome ?? ''}">
      <h2 class="headline">${esc(e.headline)}</h2>
      <p class="muted small">Season ${e.season} · League ${e.tier}${e.newTier !== e.tier ? ` → League ${e.newTier} next season` : ''}</p>
    </div>

    <div class="card accent-card">
    <h3 class="sub first">Summer</h3>
    <p class="small">${esc(verdict)}</p>
    <div class="clue">
      <div class="clue-row"><span>${esc(terms.attack)}</span><strong>${ordinal(r.scoredRank)}</strong><span class="muted small">${esc(terms.clueScored)}</span></div>
      <div class="clue-row"><span>${esc(terms.defence)}</span><strong>${ordinal(r.concededRank)}</strong><span class="muted small">${esc(terms.clueConceded)}</span></div>
    </div>
    <p class="small strong">${esc(e.question.prompt)}</p>
    <div class="focus-row" role="radiogroup">${e.question.options.map(option).join('')}</div>
    <button type="button" id="nextSeason" class="primary"${summer.focus && !summer.sent ? '' : ' disabled'}>${summer.focus ? 'Start next season' : 'Pick one to carry on'}</button>
    ${e.canRetire ? '<p class="muted small center">Start next season to defend the title.</p>' : ''}
    ${e.canRetire ? `<button type="button" id="newCareer" class="secondary">Start a new career</button>` : ''}
    ${
      // The question comes first, so it's in view in a small box; the other clue is just below it.
      e.squad.leaving.length
        ? `<h3 class="sub">Leaving the squad</h3><ul class="plain small">${e.squad.leaving.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
           ${e.squad.arriving.length ? `<p class="muted small">Joining: ${e.squad.arriving.map(esc).join(', ')}</p>` : ''}`
        : ''
    }
    <details class="howto small"${summer.howTo ? ' open' : ''}><summary>How does summer work?</summary>
      ${terms.howTo.map((line) => `<p class="muted">${esc(line)}</p>`).join('')}
    </details>
    </div>

    <div class="card">
    <h3 class="sub first">Season report</h3>
    <dl class="report">
      <dt>Record</dt><dd>${esc(r.record)} · ${r.points} pts</dd>
      <dt>Scored</dt><dd>${esc(r.scoredText)} <span class="muted">(league avg ${esc(r.avgForText)})</span></dd>
      <dt>Conceded</dt><dd>${esc(r.concededText)} <span class="muted">(league avg ${esc(r.avgAgainstText)})</span></dd>
      <dt>Best run</dt><dd>${esc(r.bestRun)}</dd>
      <dt>Worst run</dt><dd>${esc(r.worstRun)}</dd>
      ${r.topScorer ? `<dt>${esc(terms.topScorer)}</dt><dd>${esc(r.topScorer)}</dd>` : ''}
      ${r.topWickets ? `<dt>Top wicket taker</dt><dd>${esc(r.topWickets)}</dd>` : ''}
      ${r.rival ? `<dt>Your rival</dt><dd>${esc(r.rival)}</dd>` : ''}
      ${r.cups.map((x) => `<dt>${esc(x.name)}</dt><dd>${esc(x.run)}</dd>`).join('')}
    </dl>
    <p class="small"><button type="button" class="link" data-copy="${esc(e.summary)}">Copy summary</button> <span class="muted">${esc(e.summary)}</span></p>
    </div>

    <h3 class="sub">Final table</h3>
    ${tableHtml([e.table], 1, terms)}
    ${e.playoffs ? playoffHtml(e.playoffs) : ''}
  </div>`;
}

function worldEndHtml(e: WorldEndView, fixtures: FixtureView[]): string {
  return `<div class="season-end">
    <div class="card hero ${e.won ? 'champion' : ''}">
      <h2 class="headline">${esc(e.headline)}</h2>
      <p class="muted small">After Season ${e.season}${e.won ? '' : ` · won by ${swatch(e.winner)}${esc(e.winner.name)}`}</p>
    </div>
    <button type="button" id="continueSeason" class="primary">Start next season</button>
    <h3 class="sub">Your matches</h3>
    ${fixturesHtml(fixtures.filter((f) => f.kind === 'championship' && f.result))}
  </div>`;
}

function fixturesHtml(fixtures: FixtureView[]): string {
  return `<ol class="fixtures card flush">${fixtures
    .map(
      (f) => `<li class="${f.current ? 'current' : ''} ${f.result ? 'played' : ''} ${f.kind}"><span class="muted small"${f.labelTitle ? ` title="${esc(f.labelTitle)}"` : ''}>${esc(f.label)}</span>
      <span class="opp" title="${esc(f.opponent.name)}">${swatch(f.opponent)}<span class="ellipsis">${esc(f.town)}</span></span>
      <span class="muted small">${f.home ? 'H' : 'A'}</span>
      <span class="res">${f.result ? `<span class="pill ${f.outcome ?? ''}"${f.resultTitle ? ` title="${esc(f.resultTitle)}"` : ''}>${esc(f.result)}</span>` : f.current ? '<span class="pill live">LIVE</span>' : ''}</span></li>`,
    )
    .join('')}</ol>`;
}

/** Only records that exist yet; a brand-new club gets a line instead of a column of dashes. */
function recordsHtml(r: GameView['club']['records'], terms: SportTerms): string {
  const rows: [string, string | null][] = [
    ['Biggest win', r.biggestWin ? esc(r.biggestWin) : null],
    ['Heaviest defeat', r.heaviestDefeat ? esc(r.heaviestDefeat) : null],
    ['Unbeaten run', /^0\b/.test(r.unbeaten) ? null : esc(r.unbeaten)],
    ['Winning run', /^0\b/.test(r.winning) ? null : esc(r.winning)],
    [terms.mostInSeason, r.mostGoals ? esc(r.mostGoals) : null],
    [terms.topScorers, r.topScorers.length ? r.topScorers.map(esc).join('<br>') : null],
    ['Top wicket takers', r.topWicketTakers?.length ? r.topWicketTakers.map(esc).join('<br>') : null],
  ];
  const shown = rows.filter(([, value]) => value !== null);
  return shown.length
    ? `<dl class="report records">${shown.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value}</dd>`).join('')}</dl>`
    : '<p class="muted small">Records appear as the matches are played.</p>';
}

function clubHtml(v: GameView): string {
  const c = v.club;
  const r = c.records;
  const g = c.goals;
  return `<div class="clubcard card" data-accent="${esc(c.colours[0])}">
    <div class="club">${swatch(c, 'crest')}<div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.short)} · League ${c.tier} · Season ${c.season}</div></div></div>
    <p class="expect">Expected to finish <strong>${ordinal(c.expected)}</strong> this season</p>
    <dl class="report">
      <dt>Scored</dt><dd>${esc(g.scoredText)} · ${ordinal(g.scoredRank)} <span class="muted">(league avg ${esc(g.avgForText)})</span></dd>
      <dt>Conceded</dt><dd>${esc(g.concededText)} · ${ordinal(g.concededRank)} <span class="muted">(league avg ${esc(g.avgAgainstText)})</span></dd>
    </dl>
    <p class="muted small">After ${g.played} league match${g.played === 1 ? '' : 'es'} this season.</p>
    ${
      c.rival
        ? `<p class="small rival">Rival: ${swatch(c.rival)}<strong>${esc(c.rival.name)}</strong> <span class="muted">· ${esc(c.rival.where)}</span><br><span class="muted">${esc(c.rival.record)}</span></p>`
        : ''
    }
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
    ${recordsHtml(r, v.terms)}

  </div>
  <div class="card">
    <h3 class="sub first">Manager</h3>
    <p class="small">${r.manager.seasons} season${r.manager.seasons === 1 ? '' : 's'} completed · ${r.manager.matches} matches · ${r.manager.won}W ${v.terms.draws ? `${r.manager.drawn}D ` : ''}${r.manager.lost}L · ${r.manager.winPct}% won · ${r.manager.titles} title${r.manager.titles === 1 ? '' : 's'}</p>

  </div>
  <div class="card">
    <h3 class="sub first">History</h3>
    ${
      c.history.length
        ? `<ol class="history">${c.history
            .map(
              (h) => `<li><span>S${h.season}</span><span>L${h.tier} · ${ordinal(h.position)}</span><span class="muted small">${esc(h.record)}</span>
              <button type="button" class="link small" data-copy="${esc(h.summary)}" title="Copy summary">Copy</button>${
                h.cups ? `<span class="muted small cups">${esc(h.cups)}</span>` : ''
              }</li>`,
            )
            .join('')}</ol>`
        : '<p class="muted small">Your first season is under way.</p>'
    }
  </div>
`;
}

// ---------------------------------------------------------------------------
// Rendering and events

function render(): void {
  renderRows();
  renderPanel();
  renderAsk();
}

function renderPanel(): void {
  if (!view) {
    renderOverlay(null);
    app.classList.remove('needs-choice');
    return;
  }
  if (open !== shownPanel) {
    shownPanel = open;
    ask = null;
    ui.tableTier = null;
    scrollFixtures = true;
  }
  if (view.screen === 'honours') {
    renderHonours(view);
    return;
  }
  if (view.screen === 'setup') {
    renderOverlay(null);
    app.classList.remove('needs-choice');
    if (panel.dataset.mode !== 'setup' || setup.sport !== view.setup.sport) renderSetup(view.setup);
    return;
  }
  setup.initialised = false;
  renderGame(view);
}

/** The sport the open panel belongs to. */
function openSport(): SportId {
  return open as SportId;
}

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.open) {
    // Only one opens at a time; clicking the open one minimises it.
    send({ type: 'openPanel', panel: button.dataset.open === open ? null : (button.dataset.open as PanelId) });
  } else if ('chooseSports' in button.dataset) {
    send({ type: 'chooseSports' });
  } else if ('askCareer' in button.dataset) {
    ask = ask?.kind === 'career' ? null : { kind: 'career', step: 'choose' };
    render();
  } else if ('askReset' in button.dataset) {
    ask = { kind: 'career', step: 'reset' };
    render();
  } else if ('askHonours' in button.dataset) {
    ask = { kind: 'honours', step: 'first' };
    render();
  } else if ('askFinal' in button.dataset) {
    ask = { kind: 'honours', step: 'final' };
    render();
  } else if ('askCancel' in button.dataset) {
    ask = null;
    render();
  } else if ('doEnd' in button.dataset) {
    ask = null;
    render();
    send({ type: 'endCareer', sport: openSport() });
  } else if ('doReset' in button.dataset) {
    ask = null;
    render();
    send({ type: 'resetCareer', sport: openSport() });
  } else if ('doHonours' in button.dataset) {
    ask = null;
    render();
    send({ type: 'resetHonours' });
  } else if (button.dataset.pause) {
    send({ type: 'togglePause', sport: button.dataset.pause as SportId });
  } else if (button.dataset.tab) {
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
    send({ type: 'chooseFocus', sport: openSport(), focus: summer.focus });
  } else if (button.dataset.copy) {
    send({ type: 'copy', text: button.dataset.copy });
  } else if (button.id === 'continueSeason') {
    send({ type: 'continueSeason', sport: openSport() });
  } else if (button.id === 'newCareer') {
    ask = { kind: 'career', step: 'choose' };
    render();
  } else if (button.id === 'speed') {
    send({ type: 'setDuration', sport: openSport(), duration: button.dataset.next as Duration });
  } else if (button.id === 'pause') {
    send({ type: 'togglePause', sport: openSport() });
  } else if (button.id === 'start' && setup.team) {
    send({ type: 'startCareer', sport: openSport(), team: setup.team, league: setup.league, duration: setup.duration });
  } else if (button.dataset.team && view?.screen === 'setup') {
    setup.team = button.dataset.team;
    setup.search = '';
    setup.browsing = false;
    setup.league = view.setup.nations.find((n) => n.code === setup.team)!.tier;
    renderSetup(view.setup);
    document.getElementById('start')?.focus();
  } else if (button.closest('.seg')?.getAttribute('data-name')) {
    const group = button.closest('.seg')!.getAttribute('data-name')!;
    const value = button.dataset.value!;
    if (group === 'league') setup.league = Number(value);
    if (group === 'duration') setup.duration = value as Duration;
    if (view?.screen === 'setup') renderSetup(view.setup);
  }
});

function redrawNations(): void {
  if (view?.screen !== 'setup') return;
  const list = document.getElementById('nations')!;
  list.innerHTML = nationList(view.setup.nations);
  paintSwatches(list);
}

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== 'search') return;
  setup.search = input.value;
  redrawNations();
});

app.addEventListener('focusin', (e) => {
  if ((e.target as HTMLElement).id !== 'search' || setup.browsing) return;
  setup.browsing = true;
  redrawNations();
});

// The how-to stays open when picking an answer rewrites the card around it. The event doesn't bubble, so it's caught on the way down.
app.addEventListener(
  'toggle',
  (e) => {
    if ((e.target as HTMLElement).classList.contains('howto')) summer.howTo = (e.target as HTMLDetailsElement).open;
  },
  true,
);

/** Arrow keys move along tabs and options, the way they do everywhere else. */
app.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step && e.key !== 'Home' && e.key !== 'End') return;
  const button = (e.target as HTMLElement).closest('button');
  const group = button?.closest('[role="tablist"], [role="radiogroup"]');
  if (!button || !group) return;
  const items = Array.from(group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const at = items.indexOf(button);
  const next = items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + step! + items.length) % items.length];
  e.preventDefault();
  const key = focusKey(next);
  next.click();
  if (key) app.querySelector<HTMLElement>(key)?.focus();
});

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message.type === 'view') {
    ({ rows, honours, open } = message);
    if (message.view !== undefined) view = message.view;
    render();
  }
});

send({ type: 'ready' });
