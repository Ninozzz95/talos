import { defineConfig } from '@playwright/test';

/*
 * Il laboratorio del frontend, dal 05/09/2026, e' UNA cosa sola: il cancello di
 * parita' fra la app e il mockup approvato (`tests/parity/parita.spec.mjs`).
 * Le tre viewport sono quelle DESKTOP dichiarate — 1440×900, 1280×800 e
 * 1024×800, dove le colonne si stringono per prime. Nessun server: il mockup e
 * la app statica si aprono dal disco; con `TALOS_PARITA_APP=http://…` la app
 * si legge da un server vero.
 */
const viewports = [
  ['desktop-1440x900', { width: 1440, height: 900 }],
  ['desktop-1280x800', { width: 1280, height: 800 }],
  ['desktop-1024x800', { width: 1024, height: 800 }],
];

export default defineConfig({
  testDir: './tests/parity',
  testMatch: ['parita.spec.mjs'], // il cancello dei componenti ha il suo config (serve un server): playwright.componenti.config.mjs
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/parita.json' }]],
  use: {
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: viewports.map(([name, viewport]) => ({ name, use: { viewport } })),
});
