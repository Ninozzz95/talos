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
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      /*
       * ⛔⛔ 13/09 notte — il flusso finto dice quello che dice il server vero a una sessione senza storia: il confine
       *   `talos.fine-rigiocata` e basta. Senza, la chat resterebbe «nella storia» e non cronometrerebbe niente (è la
       *   cura del GIRO VERO: vedi `handleRealEvent`). `retry` lungo: un flusso finito si riaprirebbe da solo, e ogni
       *   riapertura rimette la chat nella storia.
       */
      await page.route('**/api/v1/sessions/ragionamento-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: CONFINE_SSE }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    });

    async function apri(page, id) {
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(`ragionamento-${id}`, 'workspace', 'Prova del ragionamento', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, id);
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
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

    for (const [caso, durate, attesa] of [
      ['con la durata salvata', { r1: 12_000 }, 'Ha ragionato per 12 s'],
      ['AL CONTRARIO senza durata salvata', {}, 'Ha ragionato'],
    ]) {
      test(`RAGIONAMENTO-SCHERMO-06 — una sessione RIAPERTA sa quanto ha ragionato, ${caso} (${modo})`, async ({ page }, testInfo) => {
        /*
         * ⭐⭐ Punto 3 di «fare meglio di Hermes»: Hermes desktop perde la durata a ogni ricarica e lo dichiara
         *   (`activity-timer.ts`). Qui la rigiocata non ha orari (in memoria non c'è niente da misurare), e la
         *   durata vera arriva dalla rotta `/metrics`, che la legge dal record `tempi-giro` sul disco.
         * ⛔ La risposta arriva DOPO la rigiocata: la riga va aggiornata a posteriori, ed è quello che si prova.
         */
        const sessione = `ragionamento-rigiocata-${modo}-${Object.keys(durate).length}`;
        await page.route(`**/api/v1/sessions/${sessione}/metrics`, (route) => route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: durate }, meta: { schema: 'talos.harness-ui.api.v1' } }),
        }));
        await page.route(`**/api/v1/sessions/${sessione}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
        await page.evaluate((id) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'Sessione riaperta', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
          r.realSessionState.deferHistoricalRendering = true;
        }, sessione);
        await eventi(page, [
          avvio,
          { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
          { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 3 },
          { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 4 },
          { type: 'TextMessageStart', messageId: 'm1', _sequenza: 5 },
          { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho trovato 40 file di test.', _sequenza: 6 },
          { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 7 },
          { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 8 },
        ]);
        const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
        await expect(testa).toHaveText(new RegExp(`^\\s*${attesa}\\s*$`));
        await page.screenshot({ path: testInfo.outputPath(`6-sessione-riaperta-${Object.keys(durate).length ? 'con' : 'senza'}-durata-${modo}.png`) });
      });
    }

    /*
     * ⛔⛔ 13/09 notte — LA SESSIONE VIVA RIAPERTA. Trovato col GIRO VERO (glm-5.3-flash, banco 5471): ricaricata la
     *   pagina a metà giro, la chat trattava la storia come diretta. Un ragionamento di 8 s rigiocato in pochi
     *   millisecondi diceva «Ha ragionato poco»; quello aperto da tredici minuti diceva «35 s»; e con un argomento lungo
     *   i secondi andavano a capo. Le prove di stasera avevano una sessione conclusa (differita) o una diretta pura:
     *   la sessione viva riaperta non c'era.
     * Qui il flusso finto NON manda il confine da solo: lo manda la prova, dopo la storia, com'è l'ordine del server.
     */
    async function riapriViva(page, sessione, metriche) {
      await page.route(`**/api/v1/sessions/${sessione}/metrics`, (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ...metriche }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      }));
      await page.route(`**/api/v1/sessions/${sessione}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sessione viva riaperta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, sessione);
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === true);
    }
    const confine = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
    const fraseLunga = 'Now check four digit numbers one by one and verify that each sum of fourth powers matches the number itself exactly. ';

    test(`RAGIONAMENTO-SCHERMO-07 — riaperta a metà ragionamento: il contatore riparte dall'inizio VERO, e non va a capo (${modo})`, async ({ page }, testInfo) => {
      const sessione = `ragionamento-viva-aperta-${modo}`;
      await riapriViva(page, sessione, { ragionamentiMs: {}, ragionamentiInCorsoDaMs: { r1: 754_000 } });
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: fraseLunga, _sequenza: 3 },
        confine,
      ]);
      const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
      const secondi = testa.locator('.talos-measure');
      /* ⛔ Trovato con una sonda: la riga aperta nella storia restava «Ha ragionato», con l'attesa «Ragionamento in corso…» sotto. */
      await expect(testa, 'un ragionamento ancora aperto al confine sta ragionando adesso').toContainText('Sta ragionando');
      await expect(testa.locator('.talos-dot--live')).toHaveCount(1);
      await expect(page.locator('#conversation .talos-waiting'), 'la riga viva è l’indicatore: l’attesa sotto la smentirebbe').toHaveCount(0);
      await expect(secondi, 'il contatore dice da quanto ragiona davvero, non da quando si è riaperta la pagina').toHaveText(/^12 min 3\d s$/);
      await expect(testa.locator('.talos-ragionamento__argomento')).toHaveText(/…$/);
      const forma = await secondi.evaluate((el) => ({ righe: el.getClientRects().length, alto: el.getBoundingClientRect().height, carattere: parseFloat(getComputedStyle(el).fontSize) }));
      expect(forma.righe, `i secondi su più righe: ${JSON.stringify(forma)}`).toBe(1);
      expect(forma.alto, `i secondi vanno a capo: ${JSON.stringify(forma)}`).toBeLessThan(forma.carattere * 2);
      await page.screenshot({ path: testInfo.outputPath(`7-viva-riaperta-a-meta-${modo}.png`) });
    });

    for (const [caso, durate, attesa] of [
      ['con la durata sul registro', { r0: 8_000 }, 'Ha ragionato per 8 s'],
      ['AL CONTRARIO senza durata sul registro', {}, 'Ha ragionato'],
    ]) {
      test(`RAGIONAMENTO-SCHERMO-08 — riaperta: un ragionamento della STORIA non dice «poco», ${caso} (${modo})`, async ({ page }, testInfo) => {
        const sessione = `ragionamento-viva-storia-${modo}-${Object.keys(durate).length}`;
        await riapriViva(page, sessione, { ragionamentiMs: durate, ragionamentiInCorsoDaMs: {} });
        await eventi(page, [
          avvio,
          { type: 'ReasoningMessageStart', messageId: 'r0', _sequenza: 2 },
          { type: 'ReasoningMessageContent', messageId: 'r0', delta: pensiero, _sequenza: 3 },
          { type: 'ReasoningMessageEnd', messageId: 'r0', _sequenza: 4 },
          { type: 'TextMessageStart', messageId: 'm1', _sequenza: 5 },
          { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho trovato 40 file di test.', _sequenza: 6 },
          { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 7 },
          confine,
        ]);
        const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
        await expect(testa).toHaveText(new RegExp(`^\\s*${attesa}\\s*$`));
        await expect(testa, '⛔ una durata di millisecondi misurata sulla rigiocata').not.toContainText('poco');
        await page.screenshot({ path: testInfo.outputPath(`8-viva-riaperta-storia-${Object.keys(durate).length ? 'con' : 'senza'}-durata-${modo}.png`) });
      });
    }

    test(`RAGIONAMENTO-SCHERMO-11 — quando il modello comincia a scrivere, la riga smette di ragionare (${modo})`, async ({ page }, testInfo) => {
      /*
       * ⛔⛔ 13/09 notte, l'ordine VERO dello store del giro: la fine del ragionamento arriva DOPO la risposta intera.
       *   Nella foto della finestra riaperta: «Sta ragionando… 35 s» col pallino acceso, la risposta che scorre sotto e
       *   la striscia «TALOS sta scrivendo · 36 s» — due indicatori vivi insieme.
       */
      await apri(page, `passa-oltre-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: pensiero, _sequenza: 3 },
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 4 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho trovato 40 file di test; quelli della chat sono 6.', _sequenza: 5 },
      ]);
      const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
      await expect(testa, 'mentre scrive la risposta il modello non sta più ragionando').toHaveText(/^\s*Ha ragionato/);
      await expect(testa.locator('.talos-dot--live, .talos-measure, .talos-ragionamento__argomento')).toHaveCount(0);
      const etichettaAlTesto = await testa.textContent();
      await page.screenshot({ path: testInfo.outputPath(`11-scrive-la-risposta-${modo}.png`) });

      await page.waitForTimeout(1200);
      await eventi(page, [
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 6 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 7 },
      ]);
      await expect(testa, '⛔ la fine annunciata tardi non allunga la durata').toHaveText(etichettaAlTesto);
      await expect(page.locator('#conversation .talos-waiting'), '⛔ nessuna «preparazione della risposta» sotto una risposta già scritta').toHaveCount(0);
    });

    /*
     * ⛔ La prima versione di questa prova NON MORDEVA (rottura della cura, prova verde): il registro dava l'inizio vero
     *   prima del primo testo, e con un inizio noto la riga si accende comunque. Il caso della cura è l'altro — inizio
     *   ancora ignoto quando arriva il primo testo in diretta — e sta nella variante «senza inizio».
     */
    for (const [caso, inCorso, secondi] of [
      ['senza inizio dal registro: si accende, e i secondi non si inventano', {}, /^$/],
      ['con l’inizio dal registro: i secondi veri', { r2: 65_000 }, /^1 min [5-9] s$/],
    ]) {
      test(`RAGIONAMENTO-SCHERMO-10 — cominciato nella storia, primo testo dopo il confine, ${caso} (${modo})`, async ({ page }) => {
        const sessione = `ragionamento-viva-muta-${modo}-${Object.keys(inCorso).length}`;
        await riapriViva(page, sessione, { ragionamentiMs: {}, ragionamentiInCorsoDaMs: inCorso });
        await eventi(page, [avvio, { type: 'ReasoningMessageStart', messageId: 'r2', _sequenza: 2 }, confine]);
        await expect(page.locator('#conversation .real-reasoning-note'), 'senza testo non c’è riga').toBeHidden();
        await eventi(page, [{ type: 'ReasoningMessageContent', messageId: 'r2', delta: pensiero, _sequenza: 3 }]);
        const testa = page.locator('#conversation .real-reasoning-note > .talos-activity__head');
        await expect(testa, 'un ragionamento vivo non dice «Ha ragionato» solo perché il suo inizio non si sa').toContainText('Sta ragionando');
        await expect(testa.locator('.talos-dot--live')).toHaveCount(1);
        await expect(testa.locator('.talos-measure')).toHaveText(secondi);
      });
    }

    test(`RAGIONAMENTO-SCHERMO-09 AL CONTRARIO — dopo il confine si cronometra di nuovo dal vivo (${modo})`, async ({ page }) => {
      const sessione = `ragionamento-viva-dopo-${modo}`;
      await riapriViva(page, sessione, { ragionamentiMs: {}, ragionamentiInCorsoDaMs: {} });
      await eventi(page, [avvio, confine, { type: 'ReasoningMessageStart', messageId: 'r9', _sequenza: 2 }, { type: 'ReasoningMessageContent', messageId: 'r9', delta: pensiero, _sequenza: 3 }]);
      const secondi = page.locator('#conversation .real-reasoning-note > .talos-activity__head .talos-measure');
      await expect(secondi, 'un ragionamento nato dopo il confine ha il suo orologio').toHaveText(/^\d+ s$/);
    });
  });
}

/** Il flusso di una sessione senza storia, come lo manda il server: solo il confine, e niente riconnessioni. */
const CONFINE_SSE = `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n`;
