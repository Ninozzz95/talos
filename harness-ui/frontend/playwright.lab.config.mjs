import { defineConfig } from '@playwright/test';

/*
 * IL CANCELLO DEL LABORATORIO (`lab dei componenti`, `.github/workflows/ci.yml`).
 *
 * Lo step CI lancia `npx playwright test -c playwright.lab.config.mjs`: questa config porta su
 * IL LABORATORIO DA SOLO — `scripts/serve-lab.mjs`, che costruisce `dist-lab/` da `lab/main.js`
 * e lo serve con un allowlist proprio — e ci punta le spec che PARLANO COL LABORATORIO.
 *
 * Che cosa gira qui, e perché: è l'insieme ESATTO delle spec del repo pubblico che leggono
 * `TALOS_LAB_URL` / `TALOS_LAB_PORT` per aprire `/?componente=…`. Non c'entra il banco della
 * app (quello resta nel cancello dei componenti, `playwright.componenti.config.mjs`, che apre
 * anche il 4177): qui il laboratorio è l'unica infrastruttura, su una porta SUA.
 *
 * Le tre viewport sono quelle DESKTOP dichiarate — 1440×900, 1280×800 e 1024×800, dove le
 * colonne si stringono per prime. È il contratto che le spec del laboratorio citano a
 * testa alta (`tests/component/surfaces.spec.mjs`: «le tre viewport sono quelle DESKTOP
 * dichiarate (`playwright.lab.config.mjs»)»).
 *
 * ⛔ PERCHÉ QUI NON CI SONO `tests/browser/lab-bootstrap.spec.mjs`, `tests/component/*.spec.mjs`
 *   né `tests/integration/application-lifecycle.spec.mjs`: quelle spec chiedono `?component=…`
 *   (bootstrap, Surfaces, FocusOverlay, VirtualList, ApplicationLifecycle) di una generazione
 *   DEL LABORATORIO mai pubblicata in questo repo (il lab pubblicato legge `?componente=…` e i
 *   suoi banchi stanno in `LABORATORI`, `lab/main.js`). Le stringhe che quelle spec pretendono
 *   («Fondazioni modulari pronte», `data-testid="lab-*"`, «Apri dialogo», `data-component=
 *   "VirtualList"`, `__talosHarnessDestroy` nel lab) non esistono da nessuna parte del repo:
 *   incluse qui, la suite sarebbe rossa PER SEMPRE, e non per un difetto del codice di adesso.
 *   Deciderne (cancellarle, ripubblicare il lab vecchio o riscriverle) è scelta di chi
 *   custodisce il repo — non di una config.
 *
 * ⛔ E non torna nemmeno la suite ASTRA (`tests/parity/parita.spec.mjs`): tolta il 08/09/2026
 *   perché rossa e senza nessuno che la riparasse, con una guardia in
 *   `tests/contract/package-shape.test.mjs` che pretende che `test:lab` NON ricompaia. La
 *   parità «a partire dai dati» che quella suite apriva oggi vive in
 *   `tests/parity/componenti.spec.mjs`, che qui gira contro un laboratorio tutto suo.
 */
const viewports = [
  ['desktop-1440x900', { width: 1440, height: 900 }],
  ['desktop-1280x800', { width: 1280, height: 800 }],
  ['desktop-1024x800', { width: 1024, height: 800 }],
];

/*
 * La porta si sceglie da fuori, stessa ragione del cancello dei componenti: due persone possono
 * far girare il laboratorio nello stesso momento su due worktree. Qui il comando di serie è il
 * 4175 — la porta del «laboratorio modulare» già documentata in `playwright.config.mjs` — così
 * NON tocca il 4174 (istanza viva dell'owner), il 4176 (lab del cancello dei componenti) né il
 * 4177 (banco della app). `serve-lab.mjs` legge questa variabile da sé.
 */
const PORTA = process.env.TALOS_LAB_PORT || process.env.TALOS_FRONTEND_LAB_PORT || '4175';
if (PORTA === '4174') throw new Error('Il laboratorio non gira sulla 4174: quella e’ l’istanza viva dell’owner.');
const BASE_LAB = `http://127.0.0.1:${PORTA}`;

/*
 * ⛔ `process.env` e non solo `webServer.env`: l'indirizzo serve ai PROCESSI DI PROVA.
 *   `componenti.spec.mjs` e `review-testata.spec.mjs` leggono `TALOS_LAB_URL` (si lascia vincere
 *   a un valore già impostato da fuori, per poter puntare altrove a mano);
 *   `context-compactor.spec.mjs` invece legge solo `TALOS_LAB_PORT`, quindi quello si assicura
 *   che sia la porta di QUESTO banco — chi il lab lo comanda, lo comanda per tutti.
 */
/* ⛔ SENZA barra finale: le spec compongono `${LAB}/?componente=…` — con la barra la richiesta
   diventa `…:4175//?componente=…`, il doppio slacco arriva al server come `//?…` (URL
   protocol-relative) e `new URL` dentro `serve-lab.mjs` muore con «Invalid URL», uccidendo il
   banco al PRIMO test (misurato: 135 falliti per connection refused). La forma di ripiego che le
   spec costruiscano da `TALOS_LAB_PORT` non ha la barra: questa variabile deve esserle uguale. */
if (!process.env.TALOS_LAB_URL) process.env.TALOS_LAB_URL = BASE_LAB;
process.env.TALOS_LAB_PORT = PORTA;

export default defineConfig({
  testDir: './tests/parity',
  // ⛔ testMatch ESPLICITO, niente testIgnore: in `tests/parity/` stanno anche spec che NON
  //    devono partire da un config (le «vivo» della suite ASTRA senza il suo ambiente, e tre
  //    cancelli tenuti fuori dal testMatch a testa alta, con la ragione scritta nella loro
  //    testata: `selettore-modelli-non-sfonda`, `sfondo-animato-abolito`, `aspetto-non-rende-
  //    illeggibile`; e `bc43-scorrevole-chat` vuole lo stato del suo banco). Qui entrano SOLO
  //    le tre che parlano col laboratorio.
  testMatch: ['componenti.spec.mjs', 'review-testata.spec.mjs', 'context-compactor.spec.mjs'],
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/lab-componenti.json' }]],
  // Le fixture dei componenti sono istanti UTC; il mockup documenta il formato locale italiano.
  // Fissare la zona rende la parita identica su workstation Windows e runner Linux — la stessa
  // scelta del cancello dei componenti.
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure', timezoneId: 'Europe/Rome' },
  projects: viewports.map(([name, viewport]) => ({ name, use: { viewport } })),
  webServer: {
    // serve-lab.mjs COSTRUISCE il laboratorio prima di mettersi in ascolto (`build-lab.mjs`
    // dentro di lui): il lab guardato è sempre quello del codice di adesso, non l'uscita di un
    // build di ieri — «il build non arriva al telefono», stessa lezione del banco della app.
    command: 'node scripts/serve-lab.mjs',
    url: `${BASE_LAB}/health`,
    env: { TALOS_FRONTEND_LAB_PORT: PORTA },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
