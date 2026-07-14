import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 10_000,
    include: ['tests/**/*.test.ts'],
    mockReset: true,
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
