import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/acdl-hook.test.js', 'jsdom']
    ]
  }
});
