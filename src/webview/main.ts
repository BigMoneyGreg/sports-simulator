import { ratingLabel } from '../core/league';
import {
  DURATION_LABELS,
  type Difficulty,
  type Duration,
  type FixtureView,
  type FullTimeView,
  type GameView,
  type LiveMatchView,
  type PlayoffView,
  type SeasonEndView,
  type SetupView,
  type StatKey,
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
  lean: 0,
  tolerance: 5,
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

function swatch(b: Pick<TeamBadge, 'colours'>, cls = 'swatch'): string {
  return `<span class="${cls}" data-c1="${esc(b.colours[0])}" data-c2="${esc(b.colours[1])}"></span>`;
}

/** Inline styles are blocked by the CSP, so colours are applied through the CSSOM. */
function paintSwatches(): void {
  app.querySelectorAll<HTMLElement>('[data-c1]').forEach((el) => {
    el.style.background = `linear-gradient(135deg, ${el.dataset.c1} 50%, ${el.dataset.c2} 50%)`;
  });
  app.querySelectorAll<HTMLElement>('[data-width]').forEach((el) => {
    el.style.width = `${el.dataset.width}%`;
  });
  app.querySelectorAll<HTMLElement>('[data-accent]').forEach((el) => {
    el.style.setProperty('--club', el.dataset.accent!);
  });
}

// ---------------------------------------------------------------------------
// Setup

const MAX_LEAN = 15;

function leanLimit(): number {
  return Math.min(MAX_LEAN, setup.rating, 99 - setup.rating);
}

function renderSetup(v: SetupView): void {
  if (!setup.rendered) {
    setup.name = v.suggestedName;
    setup.duration = v.duration;
  }
  setup.tolerance = v.tolerance;
  setup.rendered = true;
  const seg = <T extends string>(name: string, options: [T, string][], value: T) =>
    `<div class="seg" role="radiogroup" data-name="${name}">${options
      .map(([val, label]) => `<button type="button" role="radio" aria-checked="${val === value}" class="${val === value ? 'on' : ''}" data-value="${val}">${esc(label)}</button>`)
      .join('')}</div>`;
  app.innerHTML = `
  <div class="setup card">
    <h2>New career</h2>
    <p class="muted">Pick how good your club is. Every match plays on its own; once a season you decide where to strengthen: attack or defence.</p>

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

    <div class="field">Match length ${seg('duration', v.durations.map((d) => [d, DURATION_LABELS[d]] as [Duration, string]), setup.duration)}
      <span class="hint">Real time for one 90-minute match. You can change it from the box later.</span>
    </div>

    <label class="field">Style <strong id="leanValue"></strong>
      <input id="lean" type="range" min="-${MAX_LEAN}" max="${MAX_LEAN}" value="${setup.lean}">
      <span class="row between small muted"><span>Defensive</span><span>Attacking</span></span>
      <span id="leanHint" class="hint"></span>
    </label>

    <button type="button" id="start" class="primary">Start career</button>
  </div>`;
  updateLean();
}

/** Refreshes the style read-out in place, so the slider being dragged is never replaced. */
function updateLean(): void {
  setup.lean = Math.max(-leanLimit(), Math.min(leanLimit(), setup.lean));
  const attack = setup.rating + setup.lean;
  const defence = setup.rating - setup.lean;
  (document.getElementById('lean') as HTMLInputElement).value = String(setup.lean);
  document.getElementById('leanValue')!.textContent = `Attack ${attack} · Defence ${defence}`;
  const hint = document.getElementById('leanHint')!;
  const weak = Math.abs(setup.lean) > setup.tolerance;
  hint.classList.toggle('bad', weak);
  hint.textContent =
    setup.lean === 0
      ? 'Balanced. Lean either way to score more and concede more, or the reverse.'
      : weak
        ? 'Leaning this far leaves a weakness opponents exploit: it costs you on the pitch.'
        : setup.lean > 0
          ? 'Attacking: more goals at both ends.'
          : 'Defensive: tighter games, fewer goals at both ends.';
}

function updateSetupRating(): void {
  document.getElementById('ratingValue')!.textContent = String(setup.rating);
  document.getElementById('ratingLabel')!.textContent = ratingLabel(setup.rating);
  updateLean();
}

// ---------------------------------------------------------------------------
// Game

const STATS: StatKey[] = ['attack', 'defence'];
const STAT_LABEL: Record<StatKey, string> = { attack: 'Attack', defence: 'Defence' };
const alloc = { season: 0, attack: 0, defence: 0 };

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
  overlay.querySelectorAll<HTMLElement>('[data-c1]').forEach((el) => {
    el.style.background = `linear-gradient(135deg, ${el.dataset.c1} 50%, ${el.dataset.c2} 50%)`;
  });
  (overlay.firstElementChild as HTMLElement).style.animationDuration = `${ft.ms}ms`;
}

function renderGame(v: GameView): void {
  renderOverlay(v.seasonEnd ? null : v.fullTime);
  if (v.seasonEnd) {
    app.innerHTML = `${headerHtml(v)}${seasonEndHtml(v.seasonEnd)}`;
    paintSwatches();
    return;
  }
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
  const next = h.durations[(h.durations.indexOf(h.duration) + 1) % h.durations.length];
  return `<header class="head card" data-accent="${esc(h.club.colours[0])}">
    <div class="club">${swatch(h.club, 'crest')}<div class="grow"><div class="name">${esc(h.club.name)}</div>
      <div class="muted small">League ${h.tier} · ${ordinal(h.position)}</div></div></div>
    <div class="right">
      <span class="form" aria-label="Form">${dots}</span>
      <span class="controls">
        <button type="button" id="speed" class="chip" data-next="${next}" title="Match length: ${DURATION_LABELS[h.duration]}. Click for ${DURATION_LABELS[next]}." aria-label="Match length ${DURATION_LABELS[h.duration]}">⏱ ${DURATION_LABELS[h.duration]}</button>
        <button type="button" id="pause" class="chip icon" title="${h.paused ? 'Play' : 'Pause'}" aria-label="${h.paused ? 'Play' : 'Pause'}">${h.paused ? '▶' : '⏸'}</button>
      </span>
    </div>
  </header>`;
}

function panelHtml(v: GameView): string {
  switch (ui.tab) {
    case 'match':
      return matchHtml(v);
    case 'table': {
      const tier = ui.tableTier ?? v.playerTier;
      const playoff = v.playoffs.find((p) => p.tier === tier);
      return tableHtml(v.tables, tier) + (playoff ? playoffHtml(playoff) : '');
    }
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
  const items = m.timeline;
  const event = (t: TimelineView) => {
    const icon = t.kind === 'goal' ? '<span class="ball" aria-label="Goal">⚽</span>' : `<span class="card ${t.kind}" aria-label="${t.kind === 'red' ? 'Red' : 'Yellow'} card"></span>`;
    return `<span class="ev">${icon}<span class="who">${esc(t.text)}</span>${t.score ? `<span class="running">${esc(t.score)}</span>` : ''}</span>`;
  };
  const row = (t: TimelineView) =>
    t.kind === 'break'
      ? `<li class="break"><span>${esc(t.clock)}</span><span>${esc(t.text)}</span></li>`
      : `<li class="${t.kind}"><span class="home">${t.side === 'home' ? event(t) : ''}</span><span class="min">${esc(t.clock)}</span><span class="away">${t.side === 'away' ? event(t) : ''}</span></li>`;
  return `${scoreboard(m)}
    <div class="card feed-card">${items.length ? `<ol class="report-feed">${items.map(row).join('')}</ol>` : '<p class="muted small center">No goals yet.</p>'}</div>`;
}

function scoreboard(m: LiveMatchView): string {
  const team = (t: LiveMatchView['home'], town: string) =>
    `<div class="team ${t.isPlayer ? 'me' : ''}" title="${esc(t.name)}">${swatch(t, 'crest big')}<span class="code">${esc(t.short)}</span><span class="town">${esc(town)}</span></div>`;
  return `<div class="board card">
      <div class="comp muted small">${esc(m.competition)}${m.round ? ` · ${esc(m.round)}` : ''}${m.derby ? ' <span class="derby">Derby</span>' : ''}</div>
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
      <td class="pos">${r.pos}</td><td class="team" title="${esc(r.name)}">${esc(r.town)}${r.live ? ' <span class="live" title="Playing now">●</span>' : ''}</td>
      <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td></tr>`,
    )
    .join('');
  return `${chips}
    <div class="card flush"><table class="league"><thead><tr><th></th><th></th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th><th title="Goal difference">GD</th><th title="Points">Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="legend small"><span class="key promotion"></span>Promotion <span class="key playoff"></span>Play-offs <span class="key relegation"></span>Relegation</p>`;
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

function seasonEndHtml(e: SeasonEndView): string {
  if (alloc.season !== e.season) Object.assign(alloc, { season: e.season, attack: 0, defence: 0 });
  const spent = STATS.reduce((t, k) => t + alloc[k], 0);
  const left = e.points.total - spent;
  const after = (k: StatKey) => e.stats[k] + alloc[k];
  const mean = STATS.reduce((t, k) => t + after(k), 0) / 3;
  const weak = STATS.filter((k) => mean - after(k) > e.tolerance);
  const r = e.report;
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  const breakdown = [
    `Base ${e.points.base}`,
    e.points.performance === 0
      ? `Met expectation (${ordinal(e.position)}) 0`
      : `${e.points.performance > 0 ? 'Beat' : 'Missed'} expectation (${ordinal(e.expected)} → ${ordinal(e.position)}) ${signed(e.points.performance)}`,
    e.points.bonus ? `Finishing ${ordinal(e.position)} ${signed(e.points.bonus)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const statRow = (k: StatKey) => `<div class="alloc-row">
      <span>${STAT_LABEL[k]}</span>
      <span class="muted small">−${Math.round(e.decline.byStat[k])}</span>
      <button type="button" class="step" data-alloc="${k}" data-delta="-5" ${alloc[k] < 1 ? 'disabled' : ''} aria-label="Take 5 from ${STAT_LABEL[k]}">−5</button>
      <button type="button" class="step" data-alloc="${k}" data-delta="-1" ${alloc[k] < 1 ? 'disabled' : ''} aria-label="Take 1 from ${STAT_LABEL[k]}">−</button>
      <strong class="${weak.includes(k) ? 'bad' : ''}">${Math.round(after(k))}</strong>
      <button type="button" class="step" data-alloc="${k}" data-delta="1" ${left < 1 || alloc[k] >= e.room[k] ? 'disabled' : ''} aria-label="Add 1 to ${STAT_LABEL[k]}">+</button>
      <button type="button" class="step" data-alloc="${k}" data-delta="5" ${left < 1 || alloc[k] >= e.room[k] ? 'disabled' : ''} aria-label="Add 5 to ${STAT_LABEL[k]}">+5</button>
      <span class="muted small added">${alloc[k] ? `+${alloc[k]}` : ''}</span>
    </div>`;
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
      <dt>Best run</dt><dd>${esc(r.bestRun)}</dd>
      <dt>Worst run</dt><dd>${esc(r.worstRun)}</dd>
      ${r.topScorer ? `<dt>Top scorer</dt><dd>${esc(r.topScorer)}</dd>` : ''}
    </dl>
    <p class="verdict">${esc(r.verdict)}</p>
    </div>

    <div class="card">
    <h3 class="sub first">Decline</h3>
    <p class="small">Every club loses about 10 rating a season (20 stat points), split unevenly. Yours: ${STATS.map((k) => `${STAT_LABEL[k]} −${Math.round(e.decline.byStat[k])}`).join(' · ')}.
      Rating ${Math.round(e.decline.ratingBefore)} → ${Math.round(e.decline.ratingAfter)}.</p>

    </div>

    <div class="card accent-card">
    <h3 class="sub first">Strengthen: ${e.points.total} points</h3>
    <p class="muted small">Rating gain ${esc(breakdown)}${e.points.boosted ? ' · plus your difficulty boost' : ''}. Each point of gain = 2 points to spend; 1 point = +1 to a stat.</p>
    <div class="alloc">${STATS.map(statRow).join('')}</div>
    <div class="row alloc-actions">
      <span class="${left === 0 ? '' : 'strong'}">${left} left</span>
      <button type="button" class="link" id="allocEven">Even split</button>
      <button type="button" class="link" id="allocClear">Clear</button>
    </div>
    ${weak.length ? `<p class="hint bad">${weak.map((k) => STAT_LABEL[k]).join(' and ')} ${weak.length > 1 ? 'lag' : 'lags'} behind the rest: opponents will exploit it.</p>` : ''}
    <button type="button" id="confirmAlloc" class="primary" ${left === 0 ? '' : 'disabled'}>${e.canRetire ? 'Carry on: defend the title' : `Start season ${e.season + 1}`}</button>
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
      (f) => `<li class="${f.current ? 'current' : ''}"><span class="muted small">${esc(f.label)}</span>
      <span class="opp" title="${esc(f.opponent.name)}">${swatch(f.opponent)}<span class="ellipsis">${esc(f.town)}</span>${f.derby ? '<span class="derby" title="Derby">D</span>' : ''}</span>
      <span class="muted small">${f.home ? 'H' : 'A'}</span>
      <span class="res">${f.result ? `<span class="pill ${f.outcome ?? ''}">${esc(f.result)}</span>` : f.current ? '<span class="pill live">LIVE</span>' : ''}</span></li>`,
    )
    .join('')}</ol>`;
}

function clubHtml(v: GameView): string {
  const c = v.club;
  const r = c.records;
  const bar = (label: string, key: StatKey) =>
    `<div class="stat"><span>${label}</span><span class="bar"><span data-width="${(c.stats[key] / 99) * 100}"></span></span><strong>${c.stats[key]}</strong></div>`;
  return `<div class="clubcard card" data-accent="${esc(c.colours[0])}">
    <div class="club">${swatch(c, 'crest')}<div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.short)} · League ${c.tier} · Season ${c.season}</div></div></div>
    <div class="rating"><span class="big">${c.rating}</span><span class="muted small">rating · expected ${ordinal(c.expected)} · ${esc(c.difficulty)}</span></div>
    ${bar('Attack', 'attack')}${bar('Defence', 'defence')}
    ${c.weakSide ? `<p class="hint bad">Your ${c.weakSide} has fallen too far behind: opponents are exploiting it. Strengthen it at the end of the season.</p>` : ''}
    ${c.rival ? `<p class="small">Rival: ${swatch(c.rival)}${esc(c.rival.name)}</p>` : ''}
  </div>
  <div class="card">
    <h3 class="sub first">Trophy cabinet</h3>
    ${
      c.cabinet.titles.length || c.cabinet.promotions
        ? `<ul class="cabinet">${c.cabinet.titles.map((t) => `<li>🏆 League ${t.tier} champions <span class="muted small">× ${t.seasons.length} (S${t.seasons.join(', S')})</span></li>`).join('')}
           ${c.cabinet.promotions ? `<li>⬆ Promotions <span class="muted small">× ${c.cabinet.promotions}</span></li>` : ''}
           ${c.cabinet.playoffWins ? `<li>🎟 Play-off wins <span class="muted small">× ${c.cabinet.playoffWins}</span></li>` : ''}</ul>`
        : '<p class="muted small">Empty for now. Win something!</p>'
    }

  </div>
  <div class="card">
    <h3 class="sub first">Records</h3>
    <dl class="report">
      <dt>Biggest win</dt><dd>${esc(r.biggestWin ?? '—')}</dd>
      <dt>Heaviest defeat</dt><dd>${esc(r.heaviestDefeat ?? '—')}</dd>
      <dt>Unbeaten run</dt><dd>${esc(r.unbeaten)}</dd>
      <dt>Winning run</dt><dd>${esc(r.winning)}</dd>
      <dt>Most goals</dt><dd>${esc(r.mostGoals ?? '—')}</dd>
      <dt>Top scorers</dt><dd>${r.topScorers.length ? r.topScorers.map(esc).join('<br>') : '—'}</dd>
    </dl>

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
              <button type="button" class="link small" data-copy="${esc(h.summary)}" title="Copy summary">Copy</button></li>`,
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
    if (!setup.rendered) renderSetup(view.setup);
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
  } else if (button.dataset.alloc && view?.screen === 'game' && view.seasonEnd) {
    const e = view.seasonEnd;
    const k = button.dataset.alloc as StatKey;
    const left = e.points.total - STATS.reduce((t, s) => t + alloc[s], 0);
    const delta = Number(button.dataset.delta);
    alloc[k] = Math.max(0, Math.min(alloc[k] + Math.min(delta, left), e.room[k]));
    render();
  } else if (button.id === 'allocEven' && view?.screen === 'game' && view.seasonEnd) {
    const e = view.seasonEnd;
    STATS.forEach((k) => (alloc[k] = 0));
    let left = e.points.total;
    for (let guard = 0; left > 0 && guard < 400; guard++) {
      const k = STATS[guard % 3];
      if (alloc[k] < e.room[k]) {
        alloc[k]++;
        left--;
      }
    }
    render();
  } else if (button.id === 'allocClear') {
    STATS.forEach((k) => (alloc[k] = 0));
    render();
  } else if (button.dataset.copy) {
    send({ type: 'copy', text: button.dataset.copy });
  } else if (button.id === 'newCareer') {
    send({ type: 'newCareer' });
  } else if (button.id === 'resetCareer') {
    send({ type: 'resetCareer' });
  } else if (button.id === 'confirmAlloc') {
    send({ type: 'allocate', allocation: { attack: alloc.attack, defence: alloc.defence } });
  } else if (button.id === 'speed') {
    send({ type: 'setDuration', duration: button.dataset.next as Duration });
  } else if (button.id === 'pause') {
    send({ type: 'togglePause' });
  } else if (button.id === 'reroll') {
    send({ type: 'suggestName' });
  } else if (button.id === 'start') {
    send({
      type: 'startCareer',
      rating: setup.rating,
      difficulty: setup.difficulty,
      duration: setup.duration,
      name: (document.getElementById('name') as HTMLInputElement).value,
      split: setup.lean ? { attack: setup.rating + setup.lean, defence: setup.rating - setup.lean } : undefined,
    });
  } else if (button.closest('.seg')?.getAttribute('data-name')) {
    const group = button.closest('.seg')!.getAttribute('data-name')!;
    const value = button.dataset.value!;
    if (group === 'difficulty') setup.difficulty = value as Difficulty;
    if (group === 'duration') setup.duration = value as Duration;
    setup.name = (document.getElementById('name') as HTMLInputElement).value;
    setup.rendered = false;
    if (view?.screen === 'setup') renderSetup(view.setup);
  }
});

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === 'rating') {
    setup.rating = Number(input.value);
    updateSetupRating();
  } else if (input.id === 'lean') {
    setup.lean = Number(input.value);
    updateLean();
  } else if (input.id === 'name') {
    setup.name = input.value;
  }
});

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
