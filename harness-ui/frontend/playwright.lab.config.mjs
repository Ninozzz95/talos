import { defineConfig } from '@playwright/test';

const viewports = [
  ['desktop-1440x900', { width: 1440, height: 900 }],
  ['desktop-1280x800', { width: 1280, height: 800 }],
  ['desktop-1024x800', { width: 1024, height: 800 }],
];

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser/lab-bootstrap.spec.mjs', 'component/*.spec.mjs', 'integration/application-lifecycle.spec.mjs'],
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/phase-03-playwright.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    channel: 'chrome',
    headless: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: viewports.map(([name, viewport]) => ({ name, use: { viewport } })),
  webServer: {
    command: 'node scripts/serve-lab.mjs',
    url: 'http://127.0.0.1:4175/health',
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
