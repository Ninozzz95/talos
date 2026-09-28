/*
 * R4 — ATTIVITÀ COMPATTA, fase 2 (24/09/2026): le foto del PRODOTTO DOPO LA CURA, per il confronto col prototipo.
 *
 * ⛔ Solo la porta 4176 (regola dell'owner del 23/09): il server di prova si spegne da solo a fine corsa. Mai il 4174.
 * ⛔ Store temporaneo nuovo, chiavi in memoria (`TALOS_HARNESS_UI_KEYRING=memoria`: una prova non deve toccare il
 *   Credential Manager dell'owner), scratch privata (`TALOS_SCRATCH_DIR`): la stessa custodia di `playwright.config.mjs`.
 * ⛔ Il prodotto fotografato è la build di `dist/` di QUESTO worktree (`npm run build` prima di lanciare).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const QUI = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND = resolve(QUI, '..', '..');
const HARNESS_UI = resolve(FRONTEND, '..');
const PORTA = 4176;
const STORE = mkdtempSync(join(tmpdir(), 'talos-harness-test-store-r4-attivita-prodotto-'));
process.once('exit', () => { try { rmSync(STORE, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temporanea */ } });

export default defineConfig({
  testDir: QUI,
  testMatch: ['foto-prodotto.spec.mjs'],
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: join(FRONTEND, 'artifacts', 'r4-attivita-prodotto'),
  webServer: {
    command: 'node server.mjs',
    cwd: HARNESS_UI,
    url: `http://127.0.0.1:${PORTA}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      TALOS_HARNESS_UI_PORT: String(PORTA),
      TALOS_HARNESS_UI_SESSIONS_DIR: STORE,
      TALOS_HARNESS_UI_KEYRING: 'memoria',
      TALOS_SCRATCH_DIR: join(STORE, 'scratch'),
      TALOS_HARNESS_UI_PUBLIC_DIR: join(FRONTEND, 'dist'),
    },
  },
  use: { baseURL: `http://127.0.0.1:${PORTA}/`, channel: 'chrome', headless: true, timezoneId: 'Europe/Rome', locale: 'it-IT' },
});
