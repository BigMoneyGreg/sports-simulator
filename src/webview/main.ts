import { ratingLabel } from '../core/league';
import type { Difficulty, Duration, FixtureView, GameView, LiveMatchView, StatKey, TableView, TeamBadge, ToHost, ToWebview, View } from '../shared/view';

declare function acquireVsCodeApi(): { postMessage(m: ToHost): void; getState(): unknown; setState(s: unknown): void };

const vscode = acquireVsCodeApi();
const app = document.getElementById('app')!;

type Tab = 'match' | 'table' | 'fixtures' | 'club';
interface UiState {
  tab: Tab;
  tableTier: number | null;
}

const ui: UiState = { tab: 'match', tableTier: null, ...((vscode.getState() as Partial<UiState>) ?? {}) };
let view: View | null = null;

const setup = {
  rating: 50,
  difficulty: 'medium' as Difficulty,
  duration: '2m' as Duration,
  name: '',
  custom: false,
  attack: 50,
  defence: 50,
  rendered: false,
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

function swatch(b: Pick<TeamBadge, 'colours'>): string {
  return `<span class="swatch" data-c1="${esc(b.colours[0])}" data-c2="${esc(b.colours[1])}"></span>`;
}

/** Inline styles are blocked by the CSP, so colours are applied through the CSSOM. */
function paintSwatches(): void {
  app.querySelectorAll<HTMLElement>('[data-c1]').forEach((el) => {
    el.style.background = `linear-gradient(135deg, ${el.dataset.c1} 50%, ${el.dataset.c2} 50%)`;
  });
  app.querySelectorAll<HTMLElement>('[data-width]').forEach((el) => {
    el.style.width = `${el.dataset.width}%`;
  });
}

// ---------------------------------------------------------------------------
// Setup

function chemistryFromSplit(): number {
  return setup.rating * 3 - setup.attack - setup.defence;
}

function renderSetup(suggestedName: string, duration: Duration): void {
  if (!setup.rendered) {
    setup.name = suggestedName;
    setup.duration = duration;
  }
  setup.rendered = true;
  const seg = <T extends string>(name: string, options: [T, string][], value: T) =>
    `<div class="seg" role="radiogroup" data-name="${name}">${options
      .map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === value}" class="${v === value ? 'on' : ''}" data-value="${v}">${esc(label)}</button>`)
      .join('')}</div>`;
  app.innerHTML = `
  <div class="setup">
    <h2>New career</h2>
    <p class="muted">Pick how good your club is. Sideline plays every match on its own; once a season you decide where to strengthen.</p>

    <label class="field">Club name
      <span class="row"><input id="name" type="text" maxlength="40" value="${esc(setup.name)}"><button type="button" id="reroll" class="icon" title="Suggest another name" aria-label="Suggest another name">↻</button></span>
    </label>

    <label class="field">Starting rating <strong id="ratingValue">${setup.rating}</strong>
      <input id="rating" type="range" min="0" max="99" value="${setup.rating}">
      <span id="ratingLabel" class="hint">${esc(ratingLabel(setup.rating))}</span>
    </label>

    <div class="field">Difficulty ${seg('difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], setup.difficulty)}
      <span class="hint">${esc({ easy: 'A big hidden boost every season: climb fast.', medium: 'A few seasons in each league.', hard: 'A long grind to the top.' }[setup.difficulty])}</span>
    </div>

    <div class="field">Match length ${seg('duration', [['30s', '30s'], ['1m', '1 min'], ['2m', '2 min'], ['5m', '5 min']], setup.duration)}
      <span class="hint">Real time for one 90-minute match. Change it any time in settings.</span>
    </div>

    <details id="split" ${setup.custom ? 'open' : ''}>
      <summary>Customise attack / defence / chemistry</summary>
      ${splitHtml()}
    </details>

    <button type="button" id="start" class="primary">Start career</button>
  </div>`;
  updateSplit();
}

function splitHtml(): string {
  return `<div id="splitBody">
      <label class="field">Attack <strong id="attackValue">${setup.attack}</strong><input id="attack" type="range" min="0" max="99" value="${setup.attack}"></label>
      <label class="field">Defence <strong id="defenceValue">${setup.defence}</strong><input id="defence" type="range" min="0" max="99" value="${setup.defence}"></label>
      <div class="field">Chemistry <strong id="chemistryValue"></strong></div>
      <span id="splitHint" class="hint"></span>
    </div>`;
}

/** Refreshes the split read-outs in place, so a slider being dragged is never replaced. */
function updateSplit(): void {
  const chem = chemistryFromSplit();
  const valid = chem >= 0 && chem <= 99;
  const weak = valid && [setup.attack, setup.defence, chem].some((v) => setup.rating - v > 2);
  const byId = (id: string) => document.getElementById(id);
  (byId('attack') as HTMLInputElement).value = String(setup.attack);
  (byId('defence') as HTMLInputElement).value = String(setup.defence);
  byId('attackValue')!.textContent = String(setup.attack);
  byId('defenceValue')!.textContent = String(setup.defence);
  const chemEl = byId('chemistryValue')!;
  chemEl.textContent = valid ? String(chem) : '—';
  chemEl.classList.toggle('bad', !valid);
  const hint = byId('splitHint')!;
  hint.classList.toggle('bad', !valid);
  hint.textContent = !valid
    ? 'That split can’t average your rating. Move attack or defence.'
    : weak
      ? 'Opponents exploit a weak area: a stat well below your rating costs you on the pitch.'
      : 'The three stats always average your rating.';
  (byId('start') as HTMLButtonElement).disabled = setup.custom && !valid;
}

function updateSetupRating(): void {
  document.getElementById('ratingValue')!.textContent = String(setup.rating);
  document.getElementById('ratingLabel')!.textContent = ratingLabel(setup.rating);
  if (!setup.custom) {
    setup.attack = setup.rating;
    setup.defence = setup.rating;
  }
  updateSplit();
}

// ---------------------------------------------------------------------------
// Game

function renderGame(v: GameView): void {
  const tabs: [Tab, string][] = [
    ['match', 'Match'],
    ['table', 'Table'],
    ['fixtures', 'Fixtures'],
    ['club', 'Club'],
  ];
  app.innerHTML = `
    ${headerHtml(v)}
    <nav class="tabs" role="tablist">${tabs
      .map(([id, label]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" class="${ui.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`)
      .join('')}</nav>
    <section class="panel">${panelHtml(v)}</section>`;
  paintSwatches();
}

function headerHtml(v: GameView): string {
  const h = v.header;
  const dots = h.form.map((r) => `<span class="dot ${r}" title="${r === 'W' ? 'Won' : r === 'D' ? 'Drawn' : 'Lost'}"></span>`).join('');
  return `<header class="head">
    <div class="club">${swatch(h.club)}<div><div class="name">${esc(h.club.name)}</div>
      <div class="muted small">League ${h.tier} · ${ordinal(h.position)} · ${esc(h.round)}</div></div></div>
    <div class="right"><span class="form" aria-label="Form">${dots}</span>
      <button type="button" id="pause" class="icon" title="${h.paused ? 'Play' : 'Pause'}" aria-label="${h.paused ? 'Play' : 'Pause'}">${h.paused ? '▶' : '⏸'}</button></div>
  </header>`;
}

function panelHtml(v: GameView): string {
  switch (ui.tab) {
    case 'match':
      return matchHtml(v);
    case 'table':
      return tableHtml(v.tables, ui.tableTier ?? v.playerTier);
    case 'fixtures':
      return fixturesHtml(v.fixtures);
    case 'club':
      return clubHtml(v);
  }
}

function matchHtml(v: GameView): string {
  if (v.waiting === 'seasonOver') return `<p class="notice">The season is over. Your points are waiting to be allocated.</p>`;
  const m = v.match;
  if (!m) return `<p class="muted">Next match about to kick off…</p>`;
  return `${scoreboard(m)}
    <ol class="feed">${m.commentary
      .map((l) => `<li class="${l.kind}${l.mine ? ' mine' : ''}"><span class="clock">${esc(l.clock)}</span><span>${esc(l.text)}</span></li>`)
      .join('')}</ol>`;
}

function scoreboard(m: LiveMatchView): string {
  const team = (t: LiveMatchView['home']) => `<div class="team ${t.isPlayer ? 'me' : ''}">${swatch(t)}<span title="${esc(t.name)}">${esc(t.short)}</span></div>`;
  const scorers = (list: string[]) => list.map(esc).join(', ');
  return `<div class="board">
      <div class="comp muted small">${esc(m.competition)}</div>
      <div class="score">${team(m.home)}<div class="goals">${m.home.goals}–${m.away.goals}</div>${team(m.away)}</div>
      <div class="clock-big ${m.finished ? 'ft' : ''}">${esc(m.clock)}</div>
      ${m.aggregate ? `<div class="muted small">${esc(m.aggregate)}</div>` : ''}
      <div class="scorers small"><span>${scorers(m.scorers.home)}</span><span>${scorers(m.scorers.away)}</span></div>
    </div>`;
}

function tableHtml(tables: TableView[], tier: number): string {
  const t = tables[tier - 1];
  const chips = tables.map((x) => `<button type="button" class="${x.tier === tier ? 'on' : ''}" data-tier="${x.tier}">L${x.tier}</button>`).join('');
  const rows = t.rows
    .map(
      (r) => `<tr class="${r.zone ?? ''} ${r.isPlayer ? 'me' : ''}">
      <td class="pos">${r.pos}</td><td class="team" title="${esc(r.name)}">${esc(r.town)}${r.live ? ' <span class="live" title="Playing now">●</span>' : ''}</td>
      <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td></tr>`,
    )
    .join('');
  return `<div class="seg chips">${chips}</div>
    <table class="league"><thead><tr><th></th><th></th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th><th title="Goal difference">GD</th><th title="Points">Pts</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="legend small"><span class="key promotion"></span>Promotion <span class="key playoff"></span>Play-offs <span class="key relegation"></span>Relegation</p>`;
}

function fixturesHtml(fixtures: FixtureView[]): string {
  return `<ol class="fixtures">${fixtures
    .map(
      (f) => `<li class="${f.current ? 'current' : ''}"><span class="muted small">${esc(f.label)}</span>
      <span class="opp">${swatch(f.opponent)}<span class="ellipsis">${esc(f.opponent.name)}</span></span>
      <span class="muted small">${f.home ? 'H' : 'A'}</span>
      <span class="res ${f.outcome ?? ''}">${f.result ? esc(f.result) : f.current ? 'LIVE' : ''}</span></li>`,
    )
    .join('')}</ol>`;
}

function clubHtml(v: GameView): string {
  const c = v.club;
  const bar = (label: string, key: StatKey) =>
    `<div class="stat"><span>${label}</span><span class="bar"><span data-width="${(c.stats[key] / 99) * 100}"></span></span><strong>${c.stats[key]}</strong></div>`;
  return `<div class="clubcard">
    <div class="club">${swatch(c)}<div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.short)} · League ${c.tier} · Season ${c.season}</div></div></div>
    <div class="rating"><span class="big">${c.rating}</span><span class="muted small">rating · expected ${ordinal(c.expected)} · ${esc(c.difficulty)}</span></div>
    ${bar('Attack', 'attack')}${bar('Defence', 'defence')}${bar('Chemistry', 'chemistry')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Rendering and events

function render(): void {
  if (!view) return;
  if (view.screen === 'setup') {
    if (!setup.rendered) renderSetup(view.setup.suggestedName, view.setup.duration);
    return;
  }
  setup.rendered = false;
  renderGame(view);
}

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.tab) {
    ui.tab = button.dataset.tab as Tab;
    saveUi();
    render();
  } else if (button.dataset.tier) {
    ui.tableTier = Number(button.dataset.tier);
    saveUi();
    render();
  } else if (button.id === 'pause') {
    send({ type: 'togglePause' });
  } else if (button.id === 'reroll') {
    send({ type: 'suggestName' });
  } else if (button.id === 'start') {
    const chem = chemistryFromSplit();
    if (setup.custom && (chem < 0 || chem > 99)) return;
    send({
      type: 'startCareer',
      rating: setup.rating,
      difficulty: setup.difficulty,
      duration: setup.duration,
      name: (document.getElementById('name') as HTMLInputElement).value,
      split: setup.custom ? { attack: setup.attack, defence: setup.defence, chemistry: chem } : undefined,
    });
  } else if (button.closest('.seg')?.getAttribute('data-name')) {
    const group = button.closest('.seg')!.getAttribute('data-name')!;
    const value = button.dataset.value!;
    if (group === 'difficulty') setup.difficulty = value as Difficulty;
    if (group === 'duration') setup.duration = value as Duration;
    setup.name = (document.getElementById('name') as HTMLInputElement).value;
    setup.rendered = false;
    if (view?.screen === 'setup') renderSetup(view.setup.suggestedName, view.setup.duration);
  }
});

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === 'rating') {
    setup.rating = Number(input.value);
    updateSetupRating();
  } else if (input.id === 'attack' || input.id === 'defence') {
    setup[input.id] = Number(input.value);
    setup.custom = true;
    updateSplit();
  } else if (input.id === 'name') {
    setup.name = input.value;
  }
});

app.addEventListener('toggle', (e) => {
  const details = e.target as HTMLDetailsElement;
  if (details.id !== 'split') return;
  setup.custom = details.open;
  if (!details.open) {
    setup.attack = setup.rating;
    setup.defence = setup.rating;
  }
  updateSplit();
}, true);

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message.type === 'view') {
    const wasSetup = view?.screen === 'setup';
    view = message.view;
    if (view.screen === 'setup' && !wasSetup) setup.rendered = false;
    render();
  } else if (message.type === 'suggestedName') {
    const input = document.getElementById('name') as HTMLInputElement | null;
    if (input) input.value = message.name;
    setup.name = message.name;
  }
});

send({ type: 'ready' });
