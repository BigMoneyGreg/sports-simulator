import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, deactivate } from '../src/extension/extension';
import { fake } from './fakeVscode';

const memento = () => {
  const values: Record<string, unknown> = {};
  return { values, get: (k: string, d?: unknown) => values[k] ?? d, update: async (k: string, v: unknown) => void (values[k] = v) };
};

describe('the extension, played through its messages', () => {
  let dir: string;
  let state: ReturnType<typeof memento>;
  let subscriptions: { dispose(): void }[];

  const start = (sport = 'football', team = 'SCO', duration = '25m') => fake.send({ type: 'startCareer', sport, team, league: 3, duration });
  const row = (id: string) => fake.box.rows.find((r: { id: string }) => r.id === id);
  const run = (ms: number) => vi.advanceTimersByTime(ms);
  const open = (panel: string | null) => fake.send({ type: 'openPanel', panel });

  function launch(): void {
    subscriptions = [];
    activate({ globalStorageUri: { fsPath: dir }, globalState: state, extensionUri: {}, subscriptions } as never);
    fake.openBox();
  }

  function close(): void {
    deactivate();
    for (const s of subscriptions) s.dispose();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fake.reset();
    dir = mkdtempSync(join(tmpdir(), 'ss-extension-'));
    state = memento();
    launch();
  });

  afterEach(() => {
    close();
    vi.useRealTimers();
  });

  it('offers a new player the shortest length, and starts a career', () => {
    expect(fake.box.view.setup.duration).toBe('25m');
    start();
    expect(row('football').club).toBe('Scotland');
    expect(fake.status.text).toMatch(/^⚽ {2}/);
  });

  it('remembers the length a career started at without touching the settings', () => {
    start('football', 'SCO', '4h');
    expect(fake.config.seasonLength).toBeUndefined();
    fake.send({ type: 'resetCareer', sport: 'football' });
    expect(fake.box.view.setup.duration).toBe('4h');
    // Changing the setting afterwards wins.
    fake.configListeners.forEach((fn) => fn({ affectsConfiguration: (k) => k === 'sportsSimulator.seasonLength' }));
    fake.send({ type: 'ready' });
    expect(fake.box.view.setup.duration).toBe('25m');
  });

  it('End keeps the career in Past careers', () => {
    start();
    run(60_000);
    fake.send({ type: 'endCareer', sport: 'football' });
    fake.send({ type: 'ready' });
    expect(row('football').club).toBeUndefined();
    expect(fake.box.honours).toBe('1 past career');
    expect(existsSync(join(dir, 'career.json'))).toBe(false);
    open('honours');
    expect(fake.box.view.past[0].club).toBe('Scotland');
  });

  it('Reset career deletes it, leaving no past career', () => {
    start();
    run(60_000);
    fake.send({ type: 'resetCareer', sport: 'football' });
    fake.send({ type: 'ready' });
    expect(row('football').club).toBeUndefined();
    expect(fake.box.honours).toBeNull();
    expect(existsSync(join(dir, 'career.json'))).toBe(false);
  });

  it('Reset honours clears past careers and leaves a running career alone', () => {
    start();
    fake.send({ type: 'endCareer', sport: 'football' });
    start('rugby', 'WAL', '25m');
    fake.send({ type: 'ready' });
    expect(fake.box.honours).toBe('1 past career');
    fake.send({ type: 'resetHonours' });
    fake.send({ type: 'ready' });
    expect(fake.box.honours).toBeNull();
    expect(row('rugby').club).toBe('Wales');
  });

  it('says when a season ends if that sport is not open, waits for the answer, then carries on', () => {
    start('rugby', 'WAL', '25m');
    open(null);
    run(50 * 60_000);
    expect(fake.toasts).toEqual([expect.stringMatching(/^Rugby season 1 finished: .*Decision waiting\.$/)]);
    expect(fake.status.text).toMatch(/\$\(bell\)/);
    expect(fake.view.badge.value).toBe(1);
    fake.send({ type: 'ready' });
    expect(row('rugby').waiting).toBe(true);
    fake.send({ type: 'chooseFocus', sport: 'rugby', focus: 'attack' });
    fake.send({ type: 'ready' });
    expect(row('rugby').waiting).toBe(false);
    expect(fake.view.badge).toBeUndefined();
  });

  it('Choose sports hides a sport, holds its career where it is, and brings it back', async () => {
    start();
    start('rugby', 'WAL', '25m');
    run(30_000);
    fake.pick = (items) => items.filter((i) => i.id !== 'football');
    await fake.commands.get('sportsSimulator.chooseSports')!();
    expect(fake.box.rows.map((r: { id: string }) => r.id)).toEqual(['rugby', 'cricket']);
    expect(fake.status.text).toMatch(/🏉/);
    fake.pick = (items) => items;
    const saved = () => JSON.parse(readFileSync(join(dir, 'career.json'), 'utf8')).live.matches[0].minute;
    const minute = saved();
    run(60_000);
    expect(saved()).toBe(minute);
    await fake.commands.get('sportsSimulator.chooseSports')!();
    expect(fake.box.rows).toHaveLength(3);
    const line = row('football').line;
    run(10_000);
    fake.send({ type: 'ready' });
    expect(row('football').line).not.toBe(line);
  });

  it('refuses to hide every sport', async () => {
    fake.pick = () => [{ id: 'honours' }];
    await fake.commands.get('sportsSimulator.chooseSports')!();
    expect(fake.infos[0]).toMatch(/at least one sport/);
    expect(fake.config.sports).toBeUndefined();
  });

  it('hides Honours and its notifications when asked', async () => {
    start();
    fake.send({ type: 'endCareer', sport: 'football' });
    fake.pick = (items) => items.filter((i) => i.id !== 'honours');
    await fake.commands.get('sportsSimulator.chooseSports')!();
    expect(fake.box.honours).toBeNull();
  });

  it('a click on the status bar opens the sport on show', async () => {
    start();
    start('rugby', 'WAL', '25m');
    run(5000);
    const shown = fake.status.text.includes('Rugby') ? 'rugby' : 'football';
    await fake.commands.get('sportsSimulator.openShown')!();
    expect(fake.box.open).toBe(shown);
  });

  it('keeps playing when it can no longer save, and warns once', () => {
    start();
    run(30_000);
    const before = fake.status.text;
    rmSync(dir, { recursive: true });
    run(120_000);
    expect(fake.warnings).toHaveLength(1);
    expect(fake.warnings[0]).toMatch(/can't save/);
    expect(fake.status.text).not.toBe(before);
  });

  it('keeps a damaged save and says so', () => {
    close();
    fake.reset();
    writeFileSync(join(dir, 'career.rugby.json'), '{"version":8,');
    launch();
    expect(fake.warnings[0]).toMatch(/rugby save was damaged/);
    expect(readdirSync(dir).some((f) => f.startsWith('career.rugby.damaged-'))).toBe(true);
    expect(row('rugby').club).toBeUndefined();
  });

  it('carries a career over a restart', () => {
    start();
    run(30_000);
    close();
    fake.reset();
    launch();
    expect(row('football').club).toBe('Scotland');
  });
});
