import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  // Il laboratorio modulare ha server, build e matrice propri (4175):
  // eseguirlo contro il 4174 prodotto è un falso negativo, non un gate.
  // playwright.lab.config.mjs lo include esplicitamente con testMatch.
  testIgnore: ['lab-bootstrap.spec.mjs'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright.json' }]],
  use: {
    baseURL: process.env.TALOS_HARNESS_UI_BASE_URL || 'http://127.0.0.1:4174/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
