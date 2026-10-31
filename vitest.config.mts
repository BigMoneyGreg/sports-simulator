import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The real extension runs in tests against a stand-in for VS Code.
  resolve: { alias: { vscode: fileURLToPath(new URL('./test/fakeVscode.ts', import.meta.url)) } },
  test: {
    // Some tests play whole seasons, about 3 seconds each and more on a busy machine.
    testTimeout: 20_000,
    include: ['test/**/*.test.ts'],
  },
});
