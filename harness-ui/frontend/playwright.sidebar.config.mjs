import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Real built app, isolated test store/port; never the owner's running instance.
const port = 4189;
export default defineConfig({
  testDir: './tests/browser', testMatch: ['sidebar-desktop.spec.mjs', 'elenco-dopo-lo-stop.spec.mjs'],
  timeout: 45_000, expect: { timeout: 8000 }, fullyParallel: false, workers: 1,
  forbidOnly: true, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/sidebar-browser.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}/`, timezoneId: 'Europe/Rome',
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  outputDir: 'artifacts/sidebar-browser',
  webServer: {
    command: 'node scripts/build.mjs && node ../server.mjs',
    url: `http://127.0.0.1:${port}/api/v1/health`, reuseExistingServer: false, timeout: 120_000,
    env: { TALOS_HARNESS_UI_PORT: String(port), TALOS_HARNESS_UI_PUBLIC_DIR: resolve('dist'),
      TALOS_HARNESS_UI_SESSIONS_DIR: mkdtempSync(join(tmpdir(), 'talos-sidebar-e2e-')), TALOS_INTRO: '0' },
  },
});
