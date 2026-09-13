import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/*
 * ⛔⛔⛔ IL BUCO CHE QUESTA PARTE CHIUDE, e che e' costato due gesti sul server VIVO dell'owner.
 *
 * `nessun-errore-a-runtime.spec.mjs` sta in questo `testMatch` e, senza `TALOS_URL_CANCELLO`,
 * punta al **4174**. Lanciato cosi' il 11/09 ha aspettato 4 s su una sessione dell'owner, ci ha
 * cliccato dentro, ha scritto nel composer e ha aperto il velo dei permessi — su una sessione
 * VERA (dichiarato nel rapporto dell'11/09, §7 punto 0). La cura di quel giorno rese l'URL
 * scavalcabile ma non mise lo scavalco dove serviva: qui.
 *
 * ⇒ Questo `config` accende un banco SUO — la app costruita servita dal server vero, su una
 *   porta che NON e' il 4174 e con uno store di sessioni vuoto — e ci punta da se' i due cancelli
 *   che aprono la app. Chi lancia `npm run test:componenti` non tocca piu' il server di chi lavora.
 * ⛔ `process.env` e non solo `webServer.env`: il `webServer.env` vale per il SERVER, mentre
 *   l'indirizzo serve ai PROCESSI DI PROVA. Si lascia vincere una variabile gia' impostata da
 *   fuori, cosi' si puo' ancora puntare altrove a mano.
 */
const PORTA_ASPETTO = process.env.TALOS_ASPETTO_PORT || '4177';
if (PORTA_ASPETTO === '4174') throw new Error('Il banco non gira sulla 4174: quella e’ l’istanza viva dell’owner.');
const BASE_ASPETTO = `http://127.0.0.1:${PORTA_ASPETTO}/`;
if (!process.env.TALOS_URL_ASPETTO) process.env.TALOS_URL_ASPETTO = BASE_ASPETTO;
if (!process.env.TALOS_URL_CANCELLO) process.env.TALOS_URL_CANCELLO = BASE_ASPETTO;

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(QUI, 'dist');
const SESSIONI_BANCO = path.join(os.tmpdir(), 'talos-banco-aspetto-sessioni');

export default defineConfig({
  testDir: './tests/parity',
  // ⛔ 07/9: accanto alla parita coi componenti gira la prova che il cancello dei veli MORDE
  //    (`veli-sani.banco.html`): un controllo mai messo alla prova contro un difetto noto non
  //    si sa se prende quelli veri.
  // ⭐ 11/9: `aspetto-non-rende-illeggibile.spec.mjs` ENTRA nella suite. Era rimasto fuori perche'
  //    la sua prova AL CONTRARIO falliva e un cancello inerte da' una sicurezza falsa; ora ne ha
  //    DUE che mordono (velo verde riconosciuto, colonna scoperchiata riconosciuta), verificate
  //    nei due versi — vedi la testata di quel file.
  testMatch: ['componenti.spec.mjs', 'veli-sani-morde.spec.mjs', 'review-testata.spec.mjs', 'context-compactor.spec.mjs', 'nessun-errore-a-runtime.spec.mjs'],
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/parita-componenti.json' }]],
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  projects: viewports.map(([name, viewport]) => ({ name, use: { viewport } })),
  webServer: [
    {
      command: 'node scripts/serve-lab.mjs',
      url: `http://127.0.0.1:${PORTA}/health`,
      env: { TALOS_FRONTEND_LAB_PORT: PORTA },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      /* Il banco: si RICOSTRUISCE prima di servire, cosi' i cancelli guardano il codice di adesso
         e non l'uscita di un build di ieri — «il build non arriva al telefono», stessa lezione. */
      command: 'node scripts/build.mjs && node ../server.mjs',
      url: BASE_ASPETTO,
      env: {
        TALOS_HARNESS_UI_PORT: PORTA_ASPETTO,
        TALOS_HARNESS_UI_PUBLIC_DIR: DIST,
        TALOS_HARNESS_UI_SESSIONS_DIR: SESSIONI_BANCO,
        TALOS_INTRO: '0',
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
