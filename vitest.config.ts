import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Some tests play whole seasons, about 3 seconds each and more on a busy machine.
    testTimeout: 20_000,
    include: ['test/**/*.test.ts'],
  },
});
