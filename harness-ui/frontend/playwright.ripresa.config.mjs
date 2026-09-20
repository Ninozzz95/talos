import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.TALOS_RIPRESA_ISOLATED !== '1' || !process.env.TALOS_RIPRESA_OUTPUT || !process.env.TALOS_DESKTOP_DATA_DIR || process.env.TALOS_HARNESS_UI_BASE_URL) {
  throw new Error('Avviare tramite scripts/ripresa-run.mjs: server esterni non ammessi.');
}
const output = process.env.TALOS_RIPRESA_OUTPUT;
const baseURL = 'http://127.0.0.1:4186/';
export default defineConfig({
  testDir: './tests/browser', testIgnore: ['lab-bootstrap.spec.mjs', '_confronto-exa.spec.mjs', '_confronto-fase1.spec.mjs'],
  timeout: 30_000, expect: { timeout: 5_000 }, fullyParallel: false,
  workers: 1, forbidOnly: true, retries: 0,
  outputDir: join(output, 'test-results'),
  reporter: [['list'], ['json', { outputFile: join(output, 'playwright.json') }], ['./scripts/ripresa-reporter.mjs', { output }]],
  webServer: {
    command: 'node server.mjs', cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `${baseURL}api/v1/health`, reuseExistingServer: false, timeout: 60_000,
    stdout: 'pipe', stderr: 'pipe', env: process.env,
  },
  // 1.62.1 inietta un getter non protetto con serviceWorkers:block negli iframe
  // a origine opaca. Il prodotto non registra SW e ogni test ha un contesto nuovo.
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }],
});
