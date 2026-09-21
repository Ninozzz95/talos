/* Config TEMPORANEA del banco BC-36/37/41/42 — RUNTIME-01 contro il MIO server (4196), mai la 4174. */
import { defineConfig } from '@playwright/test';

const BASE = process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4196/';
if (/:4174/.test(BASE)) throw new Error('mai la 4174');
process.env.TALOS_URL_CANCELLO = BASE;

export default defineConfig({
  testDir: './tests/parity',
  testMatch: ['nessun-errore-a-runtime.spec.mjs'],
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { headless: true, viewport: { width: 1440, height: 900 } },
});
