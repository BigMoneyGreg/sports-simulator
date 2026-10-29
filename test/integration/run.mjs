// Launches the locally installed VS Code with a throwaway profile and runs index.js.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const bin = process.env.VSCODE_BIN ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const profile = mkdtempSync(join(tmpdir(), 'sideline-it-'));
const result = spawnSync(
  bin,
  [
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${join(root, 'test/integration/index.js')}`,
    `--user-data-dir=${join(profile, 'user')}`,
    `--extensions-dir=${join(profile, 'ext')}`,
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--new-window',
  ],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } },
);
process.exit(result.status ?? 1);
