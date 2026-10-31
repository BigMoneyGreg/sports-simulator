// A stand-in for VS Code, just enough to run the real extension in a test. Vitest swaps it for 'vscode'.
export const fake = {
  config: {} as Record<string, unknown>,
  configListeners: [] as ((e: { affectsConfiguration(key: string): boolean }) => void)[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  provider: null as null | { resolveWebviewView(view: unknown): void },
  posts: [] as any[],
  toWebview: null as null | ((message: unknown) => void),
  toasts: [] as string[],
  warnings: [] as string[],
  infos: [] as string[],
  pick: null as null | ((items: any[]) => any),
  status: { text: '', visible: false, command: '' },
  view: null as any,
  reset() {
    Object.assign(fake, { config: {}, configListeners: [], commands: new Map(), provider: null, posts: [], toWebview: null, toasts: [], warnings: [], infos: [], pick: null, view: null });
    fake.status = { text: '', visible: false, command: '' };
  },
  /** Opens the box, as the player would. */
  openBox() {
    fake.view = {
      visible: true,
      webview: {
        options: {},
        html: '',
        cspSource: 'test',
        asWebviewUri: (u: unknown) => u,
        onDidReceiveMessage: (fn: (message: unknown) => void) => (fake.toWebview = fn),
        postMessage: async (m: unknown) => void fake.posts.push(m),
      },
      onDidChangeVisibility: () => {},
      onDidDispose: () => {},
    };
    fake.provider!.resolveWebviewView(fake.view);
    fake.send({ type: 'ready' });
  },
  send(message: unknown) {
    fake.toWebview!(message);
  },
  /** What the box was last told. */
  get box() {
    return fake.posts[fake.posts.length - 1];
  },
};

const noop = { dispose() {} };

export const StatusBarAlignment = { Left: 1 };
export const ProgressLocation = { Notification: 15 };
export const ConfigurationTarget = { Global: 1 };
export class MarkdownString {
  constructor(public value: string) {}
}
export const Uri = { joinPath: (base: unknown, ...parts: string[]) => ({ base, parts }) };
export const env = { language: 'en', clipboard: { writeText: async () => {} } };

export const window = {
  state: { focused: true },
  createStatusBarItem: () => ({
    set command(c: string) {
      fake.status.command = c;
    },
    set text(t: string) {
      fake.status.text = t;
    },
    tooltip: '',
    name: '',
    show: () => (fake.status.visible = true),
    hide: () => (fake.status.visible = false),
    dispose() {},
  }),
  withProgress: (options: { title: string }, task: () => unknown) => {
    fake.toasts.push(options.title);
    return task();
  },
  showWarningMessage: async (text: string) => void fake.warnings.push(text),
  showInformationMessage: async (text: string) => void fake.infos.push(text),
  showQuickPick: async (items: any[]) => fake.pick?.(items),
  setStatusBarMessage: () => noop,
  registerWebviewViewProvider: (_id: string, provider: typeof fake.provider) => {
    fake.provider = provider;
    return noop;
  },
  onDidChangeWindowState: () => noop,
};

export const commands = {
  registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => {
    fake.commands.set(id, fn);
    return noop;
  },
  executeCommand: async (id: string, ...args: unknown[]) => fake.commands.get(id)?.(...args),
};

export const workspace = {
  getConfiguration: () => ({
    get: (key: string, fallback?: unknown) => fake.config[key] ?? fallback,
    update: async (key: string, value: unknown) => {
      fake.config[key] = value;
      for (const fn of fake.configListeners) fn({ affectsConfiguration: (k) => k === 'sportsSimulator' || k === `sportsSimulator.${key}` });
    },
  }),
  onDidChangeConfiguration: (fn: (typeof fake.configListeners)[number]) => {
    fake.configListeners.push(fn);
    return noop;
  },
};
