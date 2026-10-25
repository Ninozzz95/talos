import { defineConfig } from '@playwright/test';

import base from './playwright.config.mjs';

/*
 * 22/10/2026 — I CANCELLI DELLO STREAMING su UNA porta sola. I contratti dello streaming stanno in due cartelle: quelli del
 * 14/09 (`STREAMING-LIVE-SMOOTH-02/03`, `STREAMING-HIDDEN-FALLBACK-019`) in `tests/parity/nessun-errore-a-runtime.spec.mjs`,
 * lanciati dalla CI con `playwright.componenti.config.mjs` (che accende DUE server, 4176 e 4177), e quelli nuovi in
 * `tests/browser/streaming-fluido.spec.mjs`. Questa configurazione li fa girare insieme sul server di prova della suite di serie
 * (la 4176, archivio vuoto, portachiavi in memoria: `playwright.config.mjs`), senza una seconda porta e senza mai il 4174.
 * Uso: `npx playwright test -c playwright.streaming.config.mjs`.
 */
const porta = process.env.TALOS_HARNESS_UI_TEST_PORT || '4176';
if (!process.env.TALOS_URL_CANCELLO) process.env.TALOS_URL_CANCELLO = `http://127.0.0.1:${porta}/`;
if (process.env.TALOS_URL_CANCELLO.includes(':4174')) throw new Error('I cancelli dello streaming non girano sulla 4174: è l’istanza viva dell’owner.');

export default defineConfig({
  ...base,
  testDir: './tests',
  testMatch: ['parity/nessun-errore-a-runtime.spec.mjs', 'browser/streaming-fluido.spec.mjs'],
  testIgnore: [],
  reporter: [['list']],
});
