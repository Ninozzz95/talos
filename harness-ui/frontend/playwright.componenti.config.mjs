import { defineConfig } from '@playwright/test';

/*
 * Il cancello dei COMPONENTI: il laboratorio (`lab/main.js`, servito da
 * `scripts/serve-lab.mjs` sulla 4176) rende le fixture nel corpo della app e
 * `tests/parity/componenti.spec.mjs` lo confronta con il mockup. Tre viewport
 * desktop, come il cancello della pagina statica.
 */
const viewports = [
  ['desktop-1440x900', { width: 1440, height: 900 }],
  ['desktop-1280x800', { width: 1280, height: 800 }],
  ['desktop-1024x800', { width: 1024, height: 800 }],
];

// La porta si sceglie da fuori (TALOS_LAB_PORT) perché due persone possono far girare
// il cancello nello stesso momento su due worktree: 4176 è la mia, Astra usa la sua.
const PORTA = process.env.TALOS_LAB_PORT || '4176';

export default defineConfig({
  testDir: './tests/parity',
  testMatch: ['componenti.spec.mjs'],
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/parita-componenti.json' }]],
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  projects: viewports.map(([name, viewport]) => ({ name, use: { viewport } })),
  webServer: {
    command: 'node scripts/serve-lab.mjs',
    url: `http://127.0.0.1:${PORTA}/health`,
    env: { TALOS_FRONTEND_LAB_PORT: PORTA },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
