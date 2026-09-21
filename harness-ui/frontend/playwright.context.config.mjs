import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['context-compactor.spec.mjs'],
  timeout: 45000, fullyParallel: false, workers: 1, forbidOnly: true, retries: 0,
  outputDir: 'test-results-context', reporter: [['list'], ['json', { outputFile: 'artifacts/context-desktop.json' }]],
  use: { channel: 'chrome', headless: true, locale: 'it-IT', viewport: { width: 1920, height: 1080 }, trace: 'retain-on-failure' },
});
