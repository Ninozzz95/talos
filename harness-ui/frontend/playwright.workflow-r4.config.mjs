/*
 * Playwright owner gate R4 — isolato dal laboratorio storico.
 * Inserito da ChatGPT / GPT-5.6 Sol su istruzione Owner, 22/09/2026.
 *
 * Baseline owner:
 * 1920×1080 light/dark
 * 2560×1440 light/dark
 *
 * Porta predefinita: 4180.
 * 4174 e 4178 sono esplicitamente vietate.
 */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.TALOS_WORKFLOW_R4_PORT || 4180);
if (PORT === 4174 || PORT === 4178) {
  throw new Error(`R4 owner gate non può usare la porta ${PORT}: 4174 e 4178 sono riservate.`);
}
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  throw new Error(`Porta R4 non valida: ${PORT}`);
}

const BASE = `http://127.0.0.1:${PORT}`;
process.env.TALOS_LAB_PORT = String(PORT);
process.env.TALOS_LAB_URL = BASE;

const matrix = [
  ['1920x1080-dark', { width: 1920, height: 1080 }],
  ['1920x1080-light', { width: 1920, height: 1080 }],
  ['2560x1440-dark', { width: 2560, height: 1440 }],
  ['2560x1440-light', { width: 2560, height: 1440 }],
];

export default defineConfig({
  testDir: './tests/parity',
  testMatch: ['workflow-r4-owner-gate.spec.mjs'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/workflow-r4-owner-gate.json' }],
  ],
  use: {
    baseURL: BASE,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    timezoneId: 'Europe/Rome',
    screenshot: 'off',
    video: 'off',
  },
  projects: matrix.map(([name, viewport]) => ({
    name,
    use: { viewport },
  })),
  webServer: {
    command: 'node scripts/serve-lab.mjs',
    url: `${BASE}/health`,
    env: {
      ...process.env,
      TALOS_FRONTEND_LAB_PORT: String(PORT),
      TALOS_LAB_PORT: String(PORT),
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
