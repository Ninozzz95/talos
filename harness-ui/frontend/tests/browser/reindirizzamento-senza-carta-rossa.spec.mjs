import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ REINDIRIZZARE NON LASCIA UNA CARTA ROSSA — provato sul pacchetto SERVITO, nei DUE temi.
 *
 * Il difetto: reindirizzare chiudeva il giro vecchio con un `RunError` e la chat mostrava «il giro
 * si è interrotto per un errore, apri Doctor». La cura (commit dbc15998) sta in tre anelli; le prove
 * unitarie leggono il testo del monolite. Questa guarda lo SCHERMO: il gestore vero, il pacchetto
 * che il server serve, la conversazione disegnata.
 *
 * ⛔ LA SEQUENZA NON È INVENTATA. Misurata nel codice il 13/09 prima di scrivere questa prova:
 *   · `session-registry.mjs:4980` — reindirizzare emette `RunRedirectRequested` e poi
 *     `voce.controller.abort()`;
 *   · il kernel chiude il giro con «⛔ interrotto su richiesta: …» (`talosHarness.mjs:9334`) e
 *     `agent-service.mjs:169` lo traduce in `RunError` con `code: 'fermato'`;
 *   · `broadcast` lo consegna a tutti gli ascoltatori senza filtri; poi, a giro chiuso,
 *     `session-registry.mjs:3108` emette `RunRedirectApplied` e riparte un `RunStarted`.
 *   ⭐ Il messaggio usato qui è quello REALE: nello store vero ci sono tre `RunError` `fermato`, e
 *   cominciano tutti con «⛔ interrotto su richiesta: mentre il modello stava rispondendo».
 *
 * ⛔ DUE VERSI CONTRARI, perché una prova che conta zero carte deve dimostrare di saperne vedere una:
 *   · un guasto VERO mentre un reindirizzamento è in attesa ⇒ la carta c'è ed è ROSSA;
 *   · uno stop SENZA reindirizzamento ⇒ una nota c'è (il giro si è fermato davvero), non rossa.
 *
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo con uno store isolato.
 */

const MESSAGGIO_FERMO_REALE = '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 2.';

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      await page.route('**/api/v1/sessions/redirect-proof-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      /*
       * ⛔⛔ IL VELO D'AVVIO COPRE TUTTO, e la prima corsa di questa prova l'ha fotografato cinque volte.
       *   `#talosAvvio` resta almeno 650 ms da quando si accende e al massimo 4 s (`avvio.js`, «la vita
       *   del velo»); le prove duravano 500-800 ms. Le asserzioni sul DOM erano vere, ma ogni foto era
       *   del marchio TALOS su fondo vuoto: una verifica visiva che non poteva mostrare nessun difetto.
       *   ⇒ Si aspetta che il velo sia RIMOSSO dal documento, non solo avviato a uscire.
       */
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    });

    async function apri(page, id) {
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(`redirect-proof-${id}`, 'workspace', 'Prova del reindirizzamento', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, id);
    }
    async function eventi(page, lista) {
      await page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }
    const conta = (page, selettore) => page.locator(`#conversation ${selettore}`).count();
    /* Dove sta l'attesa rispetto alla domanda: indici dei turni, letti dal DOM. */
    const posizioni = (page, testoDomanda) => page.evaluate((testo) => {
      const figli = [...document.querySelector('#conversation').children];
      return {
        attesa: figli.findIndex((c) => c.querySelector('.talos-waiting')),
        domanda: figli.findIndex((c) => c.dataset.turno === 'utente' && c.textContent.includes(testo)),
        turni: figli.length,
      };
    }, testoDomanda);

    test(`REDIRECT-SCHERMO-01 — il cambio di direzione non lascia né carta rossa né tick rosso (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `pulito-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 2 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Sto leggendo la cartella dei test…', _sequenza: 3 },
        { type: 'RunRedirectRequested', redirectId: 'r-1', testo: 'Lascia stare i test, guarda il README', _sequenza: 4 },
      ]);
      /*
       * ⛔ Il tema si verifica com'è fatto, non come lo immagino. La prima versione pretendeva
       *   `data-theme` presente in entrambi i modi: `avvio.js` lo stampa SOLO per il chiaro, e nello
       *   scuro l'attributo è assente per costruzione. La prova principale nel tema scuro si fermava
       *   lì, prima delle sue asserzioni vere — verde in chiaro, mai eseguita in scuro.
       */
      const radice = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(radice === 'light', `tema chiesto ${modo}, la radice dice data-theme=${JSON.stringify(radice)}`).toBe(modo === 'light');
      await page.screenshot({ path: testInfo.outputPath(`1-durante-la-richiesta-${modo}.png`) });

      // il giro vecchio muore come muore davvero: RunError `fermato`, col messaggio reale
      await eventi(page, [
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 5 },
        { type: 'RunError', code: 'fermato', message: MESSAGGIO_FERMO_REALE, _sequenza: 6 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`2-giro-vecchio-chiuso-${modo}.png`) });

      expect(await conta(page, '.talos-system-note--errore'), 'una carta d’errore dopo un cambio di direzione').toBe(0);
      expect(await conta(page, '.talos-badge--danger'), 'un badge rosso dopo un cambio di direzione').toBe(0);
      expect(await conta(page, '.real-session-error'), 'una nota marcata errore dopo un cambio di direzione').toBe(0);
      expect(await conta(page, '.talos-turn-spine__tick--danger'), 'il tick del giro è diventato rosso').toBe(0);
      await expect(page.locator('#conversation')).not.toContainText('interrotto per un errore');

      await eventi(page, [
        { type: 'RunRedirectApplied', redirectId: 'r-1', testo: 'Lascia stare i test, guarda il README', _sequenza: 7 },
        { type: 'RunStarted', input: { consegna: 'Lascia stare i test, guarda il README', seguito: true }, _sequenza: 8 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`3-ripartito-${modo}.png`) });
      expect(await conta(page, '.talos-system-note--errore')).toBe(0);
      expect(await conta(page, '.talos-turn-spine__tick--danger')).toBe(0);
      await expect(page.locator('#conversation')).toContainText('Lascia stare i test, guarda il README');
      /* ⛔ D2 (13/09 sera): l'attesa restava nel turno vecchio, SOPRA la correzione a cui rispondeva. */
      const p = await posizioni(page, 'Lascia stare i test, guarda il README');
      expect(p.domanda, `la correzione non è a schermo: ${JSON.stringify(p)}`).toBeGreaterThan(-1);
      expect(p.attesa, `l’attesa sta sopra la domanda a cui risponde: ${JSON.stringify(p)}`).toBeGreaterThan(p.domanda);
      expect(await conta(page, '.talos-waiting'), 'una sola attesa, non due').toBe(1);
    });

    test(`REDIRECT-SCHERMO-02 AL CONTRARIO — un guasto VERO durante il reindirizzamento resta rosso (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `guasto-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'RunRedirectRequested', redirectId: 'r-2', testo: 'guarda il README', _sequenza: 2 },
        { type: 'RunError', code: 'internal-error', message: 'fetch failed: ECONNREFUSED 127.0.0.1:8080', _sequenza: 3 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`4-guasto-vero-${modo}.png`) });
      expect(await conta(page, '.talos-system-note--errore'), 'la prova non sa vedere una carta rossa').toBe(1);
      expect(await conta(page, '.talos-badge--danger')).toBeGreaterThan(0);
      expect(await conta(page, '.talos-turn-spine__tick--danger'), 'un guasto vero deve colorare di rosso anche il tick').toBeGreaterThan(0);
    });

    test(`REDIRECT-SCHERMO-03 AL CONTRARIO — uno stop SENZA reindirizzamento lascia la sua nota, non rossa (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `stop-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'RunError', code: 'fermato', message: MESSAGGIO_FERMO_REALE, _sequenza: 2 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`5-stop-senza-redirect-${modo}.png`) });
      expect(await conta(page, '.talos-system-note'), 'uno stop vero deve lasciare una nota: il silenzio dipende dalla provenienza').toBe(1);
      expect(await conta(page, '.talos-system-note--errore'), 'uno stop non è un guasto').toBe(0);
      /* ⛔ D1 (13/09 sera): la carta diceva «Fermato» con l'accento e il tick era rosso. */
      expect(await conta(page, '.talos-turn-spine__tick--danger'), 'uno stop chiesto dalla persona ha colorato il tick di rosso').toBe(0);
      expect(await conta(page, '.real-session-error'), 'uno stop marcato come errore').toBe(0);
    });

    test(`CODA-SCHERMO-04 — un messaggio accodato mentre il modello RAGIONA ha l’attesa sotto di sé (${modo})`, async ({ page }, testInfo) => {
      /*
       * ⛔ Il gesto che l'owner usa di più. Consegnato DOPO il primo testo era già giusto (l'attesa se
       *   n'era andata); consegnato mentre il modello ragiona, l'attesa restava nel turno vecchio.
       */
      await apri(page, `coda-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'QueuedMessageDelivered', testo: 'e poi controlla il README', _sequenza: 3 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`6-coda-consegnata-${modo}.png`) });
      const p = await posizioni(page, 'e poi controlla il README');
      expect(p.domanda, `la domanda accodata non è a schermo: ${JSON.stringify(p)}`).toBeGreaterThan(-1);
      expect(p.attesa, `l’attesa sta sopra la domanda accodata: ${JSON.stringify(p)}`).toBeGreaterThan(p.domanda);
      expect(await conta(page, '.talos-waiting'), 'una sola attesa, non due').toBe(1);
    });

    /* I numeri della spine, turno per turno, come li legge l'Indice dei giri. */
    const spine = (page) => page.evaluate(() => [...document.querySelectorAll('#conversation > .talos-turn')]
      .map((t) => `${t.dataset.turno}:${[...t.querySelectorAll('.talos-turn-spine__n')].map((n) => n.textContent).join('+')}`));

    test(`SPINE-01 — dopo un reindirizzamento il giro nuovo ha UN numero, non due (${modo})`, async ({ page }, testInfo) => {
      /*
       * ⛔⛔ 13/09 notte, GIRO VERO (glm-5.3-flash, banco 5471): l'Indice dei giri diceva «4 · Risposta 0 attrezzi» e
       *   «5 · Risposta in corso» con UNA risposta sola in chat; nel DOM `talos:4+5`. `RunRedirectApplied` apre il turno
       *   dell'attesa col suo numero, e `RunStarted` ne aggiungeva un secondo.
       */
      await apri(page, `spine-redirect-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'ReasoningMessageStart', messageId: 'g1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'g1', delta: 'Devo capire dove stanno i test. ', _sequenza: 3 },
        { type: 'RunRedirectRequested', redirectId: 'r-s', testo: 'Cambio di programma: guarda il README', _sequenza: 4 },
        { type: 'RunError', code: 'fermato', message: MESSAGGIO_FERMO_REALE, _sequenza: 5 },
        { type: 'RunRedirectApplied', redirectId: 'r-s', testo: 'Cambio di programma: guarda il README', _sequenza: 6 },
        { type: 'RunStarted', input: { consegna: 'Cambio di programma: guarda il README', seguito: true }, _sequenza: 7 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`7-spine-dopo-il-reindirizzamento-${modo}.png`) });
      expect(await spine(page)).toEqual(['utente:1', 'talos:2', 'utente:3', 'talos:4']);
    });

    test(`SPINE-02 AL CONTRARIO — un secondo giro nello STESSO turno prende davvero il suo numero (${modo})`, async ({ page }) => {
      /* La guardia non deve spegnere la numerazione vera: un giro che riparte dopo aver già scritto è un giro nuovo. */
      await apri(page, `spine-secondo-giro-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 2 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Leggo la cartella.', _sequenza: 3 },
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 4 },
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 5 },
      ]);
      expect(await spine(page)).toEqual(['utente:1', 'talos:2+3']);
    });

    test(`SPINE-03 — rigiocare un seguito non aggiunge un numero al turno di PRIMA (${modo})`, async ({ page }) => {
      /* ⛔ La forma della rigiocata: il `RunStarted` del seguito arriva quando in fondo c'è ancora la risposta vecchia. */
      await apri(page, `spine-seguito-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 },
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 2 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho letto la cartella.', _sequenza: 3 },
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 4 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 5 },
        { type: 'RunStarted', input: { consegna: 'e poi guarda il README', seguito: true }, _sequenza: 6 },
        { type: 'TextMessageStart', messageId: 'm2', _sequenza: 7 },
        { type: 'TextMessageContent', messageId: 'm2', delta: 'Il README dice come si lancia.', _sequenza: 8 },
      ]);
      expect(await spine(page)).toEqual(['utente:1', 'talos:2', 'utente:3', 'talos:4']);
    });
  });
}
