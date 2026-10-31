// Launches VS Code with a throwaway profile and runs index.js: the installed copy, or VSCODE_VERSION downloaded.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const root = resolve(import.meta.dirname, '../..');
const installed = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const version = process.env.VSCODE_VERSION;
const bin = process.env.VSCODE_BIN ?? (!version && existsSync(installed) ? installed : await downloadAndUnzipVSCode(version ?? 'stable'));
const profile = mkdtempSync(join(tmpdir(), 'sports-simulator-it-'));
const result = spawnSync(
  bin,
  [
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${join(root, 'test/integration/index.js')}`,
    `--user-data-dir=${join(profile, 'user')}`,
    `--extensions-dir=${join(profile, 'ext')}`,
    '--disable-extensions',
    '--disable-gpu',
    '--no-sandbox',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--new-window',
  ],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } },
);
process.exit(result.status ?? 1);
