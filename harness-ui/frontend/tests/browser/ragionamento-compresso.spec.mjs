import { test, expect } from '@playwright/test';

/*
 * ⛔⛔ IL RAGIONAMENTO SI COMPRIME, NON SPARISCE — provato sul pacchetto SERVITO, nei DUE temi, con le foto.
 *
 * Decisione dell'owner, 13/09/2026 sera, dopo la ricerca (fonti in `src/components/ragionamento.js`):
 * riga chiusa di serie, etichetta con la durata, niente riga per un ragionamento senza testo, e
 * l'interruttore che dice se aprirlo mentre il modello scrive.
 *
 * ⭐ Il caso che l'ha fatto nascere: un messaggio accodato arrivato mentre il modello ragionava lasciava un
 *   turno TALOS con la sola intestazione, perché il suo unico contenuto era un ragionamento NASCOSTO.
 *
 * ⛔ Le foto si scattano dopo che il velo d'avvio è stato RIMOSSO: la prima prova a schermo di questa sera
 *   l'aveva fotografato cinque volte.
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo con uno store isolato.
 */

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' }));
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      await page.route('**/api/v1/sessions/ragionamento-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    });

    async function apri(page, id) {
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(`ragionamento-${id}`, 'workspace', 'Prova del ragionamento', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, id);
    }
    async function eventi(page, lista) {
      await page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }

    const avvio = { type: 'RunStarted', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 1 };
    const pensiero = 'Devo prima capire dove stanno i test.\n\nLa cartella `tests/` ha 40 file: comincio da quelli che toccano la chat.';

    test(`RAGIONAMENTO-SCHERMO-01 — mentre scrive e a fine giro: una riga chiusa, con la sua etichetta (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `giro-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 3 },
      ]);
      const nota = page.locator('#conversation .real-reasoning-note');
      const testa = nota.locator(':scope > .talos-activity__head');
      await expect(nota).toBeVisible();
      await expect(testa).toHaveAttribute('aria-expanded', 'false');
      await expect(testa).toContainText('Sta ragionando…');
      /*
       * ⭐⭐ 13/09 sera — UN SOLO SEGNALE, «fare meglio di Hermes». Hermes desktop mostra la riga «Thinking…»
       *   e una riga di stato in fondo; noi avevamo «Sta ragionando…» e «Ragionamento in corso…» insieme.
       *   Ora la riga è l'indicatore: l'argomento corrente (l'ultima frase COMPLETA: quella dopo «test.» è
       *   ancora senza lo spazio che la chiude), i secondi, il pallino delle righe in corso.
       */
      await expect(page.locator('#conversation .talos-waiting'), 'l’attesa sotto ripete quello che dice la riga').toHaveCount(0);
      await expect(testa.locator('.talos-dot--live')).toHaveCount(1);
      await expect(testa.locator('.talos-measure')).toHaveText(/^\d+ s$/);
      await expect(testa.locator('.talos-ragionamento__argomento')).toHaveText('Devo prima capire dove stanno i test.');
      /* il movimento è quello dell'attesa: lo stesso shimmer nelle lettere dell'etichetta */
      await expect(testa.locator('.tool-note-summary-text')).toHaveCSS('animation-name', 'talosAttesaShimmer');
      await page.screenshot({ path: testInfo.outputPath(`1-sta-ragionando-${modo}.png`) });

      await eventi(page, [{ type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 4 }]);
      /* ⭐ Finito il ragionamento l'attesa torna: adesso sullo schermo non si muove nient'altro. */
      await expect(page.locator('#conversation .talos-waiting')).toHaveCount(1);
      await expect(page.locator('#conversation .talos-waiting')).toContainText('preparando la risposta');
      await expect(testa.locator('.talos-dot--live, .talos-measure, .talos-ragionamento__argomento'), 'i pezzi vivi restano su una riga finita').toHaveCount(0);
      await expect(testa.locator('.tool-note-summary-text'), 'una riga finita non scintilla più').toHaveCSS('animation-name', 'none');
      await page.screenshot({ path: testInfo.outputPath(`1b-ragionamento-finito-${modo}.png`) });

      await eventi(page, [
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 5 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho trovato 40 file di test; quelli della chat sono 6.', _sequenza: 6 },
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 7 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 8 },
      ]);
      await expect(testa).toContainText(/^\s*Ha ragionato/);
      await expect(testa).not.toContainText('Sta ragionando');
      await expect(testa).toHaveAttribute('aria-expanded', 'false');
      await page.screenshot({ path: testInfo.outputPath(`2-giro-finito-${modo}.png`) });

      /* un clic basta per leggere: la riga interna nasce aperta */
      await testa.click();
      await expect(nota.locator('.tool-note-detail')).toBeVisible();
      await expect(nota.locator('.tool-note-detail')).toContainText('Devo prima capire dove stanno i test.');
      /*
       * ⛔ Il corpo si apre con un'animazione d'opacità. Fotografato subito, nel tema chiaro sembrava VUOTO:
       *   misurato, `opacity` 0 al clic e 1 dopo un secondo, identico nei due temi. Si aspetta che finisca.
       */
      await nota.locator(':scope > .talos-activity__body').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await page.screenshot({ path: testInfo.outputPath(`3-aperto-a-mano-${modo}.png`) });
    });

    test(`RAGIONAMENTO-SCHERMO-02 — il turno che restava vuoto: coda consegnata mentre il modello ragionava (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `coda-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 3 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 4 },
        { type: 'QueuedMessageDelivered', testo: 'e poi controlla il README', _sequenza: 5 },
      ]);
      await page.screenshot({ path: testInfo.outputPath(`4-coda-dopo-il-ragionamento-${modo}.png`) });
      const turnoVecchio = await page.evaluate(() => {
        const turni = [...document.querySelectorAll('#conversation > [data-turno="talos"]')];
        const primo = turni[0];
        return {
          turniTalos: turni.length,
          ragionamentoVisibile: Boolean(primo?.querySelector('.real-reasoning-note:not([hidden])')),
        };
      });
      expect(turnoVecchio.turniTalos, 'il turno nuovo con l’attesa sotto la domanda').toBe(2);
      expect(turnoVecchio.ragionamentoVisibile, 'il turno vecchio non resta con la sola intestazione').toBe(true);
    });

    test(`RAGIONAMENTO-SCHERMO-03 AL CONTRARIO — un ragionamento senza testo non disegna una riga vuota (${modo})`, async ({ page }) => {
      await apri(page, `vuoto-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 3 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 4 },
      ]);
      await expect(page.locator('#conversation .real-reasoning-note')).toBeHidden();
    });

    test(`RAGIONAMENTO-SCHERMO-04 AL CONTRARIO — un giro fermato a metà ragionamento non resta «Sta ragionando…» (${modo})`, async ({ page }) => {
      await apri(page, `fermo-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 3 },
        { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 4 },
      ]);
      const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
      await expect(testa).toContainText(/^\s*Ha ragionato/);
      await expect(testa).not.toContainText('Sta ragionando');
      await expect(testa.locator('.talos-dot--live, .talos-measure, .talos-ragionamento__argomento'), 'un giro fermato lascia i pezzi vivi').toHaveCount(0);
    });

    test(`RAGIONAMENTO-SCHERMO-05 AL CONTRARIO — con un reindirizzamento in attesa, il suo avviso non lo prende la riga (${modo})`, async ({ page }) => {
      /*
       * ⛔ Il caso che la guardia copre, ed è una sequenza vera: il ragionamento è partito, la persona chiede
       *   di reindirizzare, e il primo testo arriva DOPO la richiesta. L'attesa in quel momento dice
       *   «Reindirizzamento al prossimo punto sicuro…»: è l'unico avviso che la correzione è in viaggio, e
       *   la riga viva non deve portarselo via.
       */
      await apri(page, `redirect-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'RunRedirectRequested', redirectId: 'rr-1', testo: 'guarda il README', _sequenza: 3 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 4 },
      ]);
      await expect(page.locator('#conversation .real-reasoning-note')).toBeVisible();
      await expect(page.locator('#conversation .talos-waiting')).toHaveCount(1);
      await expect(page.locator('#conversation .talos-waiting')).toContainText('Reindirizzamento al prossimo punto sicuro');
    });
  });
}
