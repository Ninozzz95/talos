/*
 * R4 — ATTIVITÀ COMPATTA: le foto del PRODOTTO ATTUALE, per il confronto affiancato col prototipo.
 *
 * ⛔ Solo la porta 4176 (regola del coordinatore, 23/09/2026): prima di lanciare si controlla che sia
 *   libera, e il server si spegne da solo a fine corsa (`reuseExistingServer: false`).
 * ⛔ Mai il 4174: è l'istanza dell'owner. Lo store è una cartella temporanea nuova, buttata a fine corsa.
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
const STORE = mkdtempSync(join(tmpdir(), 'talos-harness-test-store-r4-attivita-'));
process.once('exit', () => { try { rmSync(STORE, { recursive: true, force: true }); } catch { /* temporanea */ } });

export default defineConfig({
  testDir: QUI,
  testMatch: ['foto-attuale.spec.mjs'],
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: join(FRONTEND, 'artifacts', 'r4-attivita-attuale'),
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
      TALOS_HARNESS_UI_PUBLIC_DIR: join(FRONTEND, 'dist'),
    },
  },
  use: { baseURL: `http://127.0.0.1:${PORTA}/`, channel: 'chrome', headless: true, timezoneId: 'Europe/Rome', locale: 'it-IT' },
});
