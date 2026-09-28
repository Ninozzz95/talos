/*
 * R4 — ATTIVITÀ COMPATTA: le foto e le prove del PROTOTIPO nel laboratorio.
 *
 * ⛔ Solo la porta 4176 (regola del coordinatore, 23/09/2026), controllata libera prima di lanciare; il
 *   server del laboratorio si spegne da solo a fine corsa. Mai il 4174.
 * ⛔ `serve-lab.mjs` ricostruisce il laboratorio prima di ascoltare: si guarda sempre il codice di adesso.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const QUI = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND = resolve(QUI, '..', '..');
const PORTA = 4176;

export default defineConfig({
  testDir: QUI,
  testMatch: ['foto-proposta.spec.mjs', 'verifica-proposta.spec.mjs'],
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: join(FRONTEND, 'artifacts', 'r4-attivita-proposta'),
  webServer: {
    command: 'node scripts/serve-lab.mjs',
    cwd: FRONTEND,
    url: `http://127.0.0.1:${PORTA}/health`,
    env: { TALOS_FRONTEND_LAB_PORT: String(PORTA) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: `http://127.0.0.1:${PORTA}`, channel: 'chrome', headless: true, timezoneId: 'Europe/Rome', locale: 'it-IT' },
});
