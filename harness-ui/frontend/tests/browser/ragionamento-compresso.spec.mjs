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
        /* ⛔ 24/09/2026 (R4 fase 2): la lingua si fissa a ITALIANO. Prima era «sistema» e il browser di prova è `en-US`; le
           parole della riga del segmento passano ora da `t()` (D1, `i18n/en.js`), e queste prove leggono le parole italiane. */
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage: 'it' } }));
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

    test(`R4-CHAT-ACTIVITY-SEGMENT-01 — tool e ragionamenti consecutivi occupano un segmento auditabile (${modo})`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await apri(page, `segmento-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallArgs', toolCallId: 't1', delta: '{"percorso":"src/app.js"}', _sequenza: 3 },
        { type: 'ToolCallResult', toolCallId: 't1', ok: true, _sequenza: 4 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 5 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Controllo il primo file e scelgo cosa cercare.', _sequenza: 6 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 7 },
        { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 8 },
        { type: 'ToolCallArgs', toolCallId: 't2', delta: '{"query":"test"}', _sequenza: 9 },
        { type: 'ToolCallResult', toolCallId: 't2', ok: true, _sequenza: 10 },
        { type: 'ReasoningMessageStart', messageId: 'r2', _sequenza: 11 },
        { type: 'ReasoningMessageContent', messageId: 'r2', delta: 'I risultati indicano i test pertinenti.', _sequenza: 12 },
        { type: 'ReasoningMessageEnd', messageId: 'r2', _sequenza: 13 },
        { type: 'TextMessageStart', messageId: 'm1', _sequenza: 14 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho letto il file e trovato i test.', _sequenza: 15 },
        { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 16 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 17 },
      ]);
      await expect(page.locator('#conversation .talos-turn[data-turno="talos"] .talos-turn-spine__n')).toHaveCount(2);
      await expect(page.locator('#inspectorPanel')).toContainText('1 file letto');
      /* ⛔ 26/09 (foto dell'owner): l'Indice dei giri legge la testa del gruppo, e diceva ancora «1 ricerca completata»
         mentre il segmento parla per specie (D1 del 24/09: niente «completate»). Le parole ora sono UNE, `fraseSpecie`. */
      await expect(page.locator('#inspectorPanel')).toContainText('1 ricerca');
      await expect(page.locator('#inspectorPanel [data-c="TurnIndex"]')).not.toContainText(/complet|eseguit/u);
      const segmento = page.locator('#conversation .talos-activity--segment');
      await expect(segmento, 'un unico segmento tool/ragionamento prima della prosa').toHaveCount(1);
      await expect(segmento.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'false');
      await expect(segmento.locator('.real-reasoning-note')).toHaveCount(2);
      /* ⛔ CONTRATTO CAMBIATO il 24/09/2026 (R4 fase 2): i gruppi stanno in `.talos-activity__voci` dentro il corpo (che ora è
         `hidden="until-found"` e senza padding), non più figli diretti del corpo. */
      const gruppiTool = segmento.locator('.talos-activity__voci > [data-c="ActivityBundle"]:not(.real-reasoning-note)');
      await expect(gruppiTool).toHaveCount(2);
      await expect(gruppiTool.locator('[data-c="ToolRow"]')).toHaveCount(2);
      /* ⛔ CONTRATTO CAMBIATO il 24/09/2026 (R4 fase 2, D1): dentro un segmento la riga di una voce dice «verbo · oggetto»
         («Letto src/app.js», «Cercato»), non più il conteggio annidato («1 file letto», «1 ricerca completata»). L'ordine
         degli eventi resta: attrezzo, ragionamento, attrezzo, ragionamento. */
      const ordine = await segmento.locator('.talos-tool-row__name').allTextContents();
      expect(ordine.join(' · ')).toMatch(/Letto.*Ragion.*Cercato.*Ragion/is);
      await segmento.locator(':scope > .talos-activity__head').click();
      await expect(segmento.locator('.real-reasoning-note').first()).toBeVisible();
      await expect(segmento).toContainText('src/app.js');
      await expect(segmento).toContainText('I risultati indicano i test pertinenti.');
      await expect(page.locator('#conversation .talos-message__copy').last()).toContainText('Ho letto il file e trovato i test.');
    });

    test(`R4-CHAT-ACTIVITY-GAP-09 — il confine attività-testo resta leggibile (${modo})`, async ({ page }, testInfo) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
          version: 1, appearance: { colorMode, uiLanguage: 'it' },
        }));
      }, modo);
      await page.reload();
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await apri(page, `activity-gap-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 'gap-tool', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'gap-tool', ok: true, _sequenza: 3 },
        { type: 'ReasoningMessageStart', messageId: 'gap-reasoning', _sequenza: 4 },
        { type: 'ReasoningMessageContent', messageId: 'gap-reasoning', delta: 'Valuto il risultato.', _sequenza: 5 },
        { type: 'ReasoningMessageEnd', messageId: 'gap-reasoning', _sequenza: 6 },
        { type: 'TextMessageContent', messageId: 'gap-answer', delta: 'La risposta del modello comincia qui.', _sequenza: 7 },
        { type: 'ToolCallStart', toolCallId: 'gap-tool-next', toolCallName: 'cerca', _sequenza: 8 },
        { type: 'ToolCallResult', toolCallId: 'gap-tool-next', ok: true, _sequenza: 9 },
        { type: 'ReasoningMessageStart', messageId: 'gap-reasoning-next', _sequenza: 10 },
        { type: 'ReasoningMessageContent', messageId: 'gap-reasoning-next', delta: 'Verifico ancora.', _sequenza: 11 },
        { type: 'ReasoningMessageEnd', messageId: 'gap-reasoning-next', _sequenza: 12 },
        { type: 'TextMessageContent', messageId: 'gap-answer-next', delta: 'La seconda risposta segue la nuova attività.', _sequenza: 13 },
      ]);
      const segment = page.locator('#conversation .talos-activity--segment');
      const activityToCopy = page.locator('#conversation .talos-message > .talos-activity--segment + .talos-message__copy');
      const copyToActivity = page.locator('#conversation .talos-message > .talos-message__copy + .talos-activity--segment');
      await expect(segment).toHaveCount(2);
      await expect(activityToCopy).toHaveCount(2);
      await expect(copyToActivity).toHaveCount(1);
      await expect(activityToCopy.first()).toContainText('La risposta del modello');
      await expect(activityToCopy.last()).toContainText('La seconda risposta');
      for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        /*
         * ⛔ 23/09/2026 (riparazione D3 della revisione UI) — si misura a STATO QUIETO. Il testo entra con
         *   `talosEntrataMessaggio` (`aspetto.css:478-483`, translateY → 0 in 180 ms): durante l'entrata i due
         *   spazi valgono 16+t e 16−t (i 16,398/15,602 visti da Codex), a fine animazione 16,000/16,000. Due rAF
         *   non bastano: sulla base la prova era rossa 4 volte su 8. Si aspettano le animazioni FINITE del
         *   sottoalbero della conversazione (le infinite — shimmer, pallini — non finiscono mai: MDN,
         *   Element.getAnimations + Animation.finished, consultato 23/09/2026,
         *   https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations). La soglia NON cambia: se il
         *   CSS sbaglia, lo spazio quieto resta sbagliato e la prova resta rossa.
         */
        const animazioniResidue = await page.evaluate(async () => {
          const conversazione = document.querySelector('#conversation');
          const finite = () => conversazione.getAnimations({ subtree: true }).filter((animazione) => {
            const timing = animazione.effect?.getComputedTiming?.();
            return animazione.playState === 'running' && Number.isFinite(timing?.endTime);
          });
          const scadenza = performance.now() + 3000;
          while (finite().length && performance.now() < scadenza) {
            await Promise.race([
              Promise.all(finite().map((animazione) => animazione.finished.catch(() => null))),
              new Promise((resolve) => setTimeout(resolve, 250)),
            ]);
          }
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return finite().map((animazione) => animazione.animationName || animazione.constructor.name);
        });
        expect(animazioniResidue, 'la geometria si legge solo a stato quieto').toEqual([]);
        const measure = await page.evaluate(() => {
          const segment = document.querySelector('#conversation .talos-activity--segment');
          const activityToCopy = [...document.querySelectorAll('#conversation .talos-message > .talos-activity--segment + .talos-message__copy')];
          const copyToActivity = [...document.querySelectorAll('#conversation .talos-message > .talos-message__copy + .talos-activity--segment')];
          const inner = segment?.querySelector('.talos-activity');
          return {
            width: innerWidth, height: innerHeight,
            theme: document.documentElement.dataset.talosResolvedColorMode,
            activityToCopyGaps: activityToCopy.map((copy) => copy.getBoundingClientRect().top - copy.previousElementSibling.getBoundingClientRect().bottom),
            copyToActivityGaps: copyToActivity.map((card) => card.getBoundingClientRect().top - card.previousElementSibling.getBoundingClientRect().bottom),
            activityToCopyMargins: activityToCopy.map((copy) => getComputedStyle(copy).marginTop),
            copyToActivityMargins: copyToActivity.map((card) => getComputedStyle(card).marginTop),
            innerMarginTop: inner ? getComputedStyle(inner).marginTop : null,
            segmentHeadHeight: segment.querySelector(':scope > .talos-activity__head')?.getBoundingClientRect().height,
            composerTop: document.querySelector('#schermoChat .talos-chat-foot')?.getBoundingClientRect().top,
            copyBottom: activityToCopy.at(-1).getBoundingClientRect().bottom,
          };
        });
        const screenshot = testInfo.outputPath(`r4-activity-gap-${viewport.width}x${viewport.height}-${modo}.png`);
        for (const dismiss of await page.locator('#regioneToast [data-toast-chiudi]').all()) {
          if (await dismiss.isVisible()) await dismiss.click();
        }
        await expect(page.locator('#regioneToast .talos-toast:visible')).toHaveCount(0);
        await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`browser-view-${viewport.width}-${modo}`, { path: screenshot, contentType: 'image/png' });
        await testInfo.attach(`geometry-${viewport.width}-${modo}`, {
          body: Buffer.from(JSON.stringify(measure)), contentType: 'application/json',
        });
        expect({ width: measure.width, height: measure.height }).toEqual(viewport);
        expect(measure.theme).toBe(modo);
        expect(measure.innerMarginTop).toBe('2px');
        /* ⛔ CONTRATTO CAMBIATO il 24/09/2026 (R4 fase 2, D4): la testa del segmento è alta 30 px FISSI (era 34 per la
           regola `.talos-activity--segment .talos-activity__head{min-height:34px}`). I respiri di GAP-09 restano 16 px. */
        expect(measure.segmentHeadHeight).toBeGreaterThanOrEqual(29.5);
        expect(measure.segmentHeadHeight).toBeLessThanOrEqual(30.5);
        expect(measure.copyBottom).toBeLessThan(measure.composerTop);
        expect(measure.activityToCopyGaps).toHaveLength(2);
        expect(measure.copyToActivityGaps).toHaveLength(1);
        expect(measure.activityToCopyMargins).toEqual(['16px', '16px']);
        expect(measure.copyToActivityMargins).toEqual(['16px']);
        for (const gap of measure.copyToActivityGaps) {
          expect(Number(gap.toFixed(1)), 'il testo deve respirare prima della card successiva').toBeGreaterThanOrEqual(16);
          expect(Number(gap.toFixed(1))).toBeLessThanOrEqual(20);
        }
        for (const gap of measure.activityToCopyGaps) {
          expect(Number(gap.toFixed(1)), 'la card deve respirare prima del testo successivo').toBeGreaterThanOrEqual(16);
          expect(Number(gap.toFixed(1))).toBeLessThanOrEqual(20);
        }
      }
    });

    test(`R4-CHAT-ACTIVITY-ERROR-02 — un tool fallito resta subito visibile nel segmento (${modo})`, async ({ page }) => {
      await apri(page, `errore-segmento-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 3 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 4 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Controllo il risultato prima di cercare.', _sequenza: 5 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 6 },
        { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 7 },
        { type: 'ToolCallResult', toolCallId: 't2', content: 'ERROR ricerca non disponibile', _sequenza: 8 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 9 },
      ]);
      const segmento = page.locator('#conversation .talos-activity--segment');
      await expect(segmento).toHaveCount(1);
      await expect(segmento.locator(':scope > .talos-activity__head')).toContainText('non riuscita');
      /* ⛔ CONTRATTO CAMBIATO il 24/09/2026 (R4 fase 2, D3): il segmento NON si apre più da solo — il conteggio va in rosso
         e la voce fallita resta FISSATA sotto la riga, leggibile a segmento chiuso (prima: 172 px aperti e la voce
         comunque chiusa nel suo gruppo). L'esito grezzo resta nel documento (`until-found`), trovabile dalla ricerca. */
      await expect(segmento.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'false');
      await expect(segmento.locator(':scope > .talos-activity__fissate .talos-activity__fissata')).toBeVisible();
      await expect(segmento.locator(':scope > .talos-activity__fissate .talos-activity__fissata')).toContainText('Cercato');
      await expect(segmento).toContainText('ERROR ricerca non disponibile');
    });

    test(`R4-CHAT-ACTIVITY-GATE-03 — il permesso interrompe il segmento senza nascondere la card (${modo})`, async ({ page }) => {
      await apri(page, `gate-segmento-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 3 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 4 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Serve un permesso per procedere.', _sequenza: 5 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 6 },
        { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'scrivi', percorso: 'src/nuovo.js' }, _sequenza: 7 },
      ]);
      await expect(page.locator('#conversation .real-approval-card')).toBeVisible();
      await eventi(page, [
        { type: 'ApprovalResolved', requestId: 'p1', approvato: true, _sequenza: 8 },
        { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 9 },
        { type: 'ToolCallResult', toolCallId: 't2', content: 'ricerca completata', _sequenza: 10 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 11 },
      ]);
      const segmento = page.locator('#conversation .talos-activity--segment');
      await expect(segmento).toHaveCount(1);
      await expect(segmento.locator('[data-c="ToolRow"]')).toHaveCount(2);
      const fuori = page.locator('#conversation [data-c="ActivityBundle"]:not(.talos-activity--segment):not(.real-reasoning-note)').last();
      expect(await fuori.evaluate((element) => element.closest('.talos-activity--segment') === null)).toBe(true);
      await expect(page.locator('#conversation .real-approval-card')).toBeVisible();
    });

    test(`R4-CHAT-ACTIVITY-SINGLE-04 — un tool solo non duplica la testata (${modo})`, async ({ page }) => {
      await apri(page, `singolo-segmento-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 3 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho letto il file.', _sequenza: 4 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 5 },
      ]);
      await expect(page.locator('#conversation .talos-activity--segment')).toHaveCount(0);
      const singolo = page.locator('#conversation .talos-activity--nuda');
      await expect(singolo).toHaveCount(1);
      await expect(singolo.locator(':scope > .talos-activity__head')).toBeHidden();
      await expect(singolo.locator('[data-c="ToolRow"]')).toBeVisible();
    });

    test(`R4-CHAT-ACTIVITY-DIRECT-05 — il comando scritto dalla persona mostra subito l'output (${modo})`, async ({ page }) => {
      await apri(page, `diretto-segmento-${modo}`);
      await eventi(page, [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 3 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 4 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Controllo il file.', _sequenza: 5 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 6 },
        { type: 'ComandoUtenteIniziato', comando: 'pwd', _sequenza: 7 },
        { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell', _sequenza: 8 },
        { type: 'ToolCallArgs', toolCallId: 't2', delta: '{"command":"pwd"}', _sequenza: 9 },
        { type: 'ToolCallResult', toolCallId: 't2', content: 'C:\\workspace', _sequenza: 10 },
        { type: 'ComandoUtenteFinito', _sequenza: 11 },
      ]);
      const segmentoModello = page.locator('#conversation .talos-activity--segment');
      await expect(segmentoModello).toHaveCount(1);
      const comandoMio = page.locator('#conversation [data-c="ActivityBundle"]:has([data-c="ToolRow"]):not(.talos-activity--segment)').last();
      expect(await comandoMio.evaluate((element) => element.closest('.talos-activity--segment') === null)).toBe(true);
      await expect(comandoMio.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'true');
      await expect(comandoMio.locator('[data-c="ToolRow"]')).toBeVisible();
      await expect(comandoMio.locator('.tool-result-block')).toBeVisible();
      await expect(comandoMio.locator('.tool-result-block')).toContainText('C:\\workspace');
    });

    test(`R4-CHAT-ACTIVITY-REPLAY-07 — la storia mantiene un solo segmento e ogni dettaglio dopo reload (${modo})`, async ({ page }) => {
      const id = `replay-r4-${modo}`;
      const storia = [
        avvio,
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallArgs', toolCallId: 't1', delta: '{"percorso":"src/app.js"}', _sequenza: 3 },
        { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 4 },
        { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 5 },
        { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Il primo file indica una ricerca mirata.', _sequenza: 6 },
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 7 },
        { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 8 },
        { type: 'ToolCallArgs', toolCallId: 't2', delta: '{"query":"test"}', _sequenza: 9 },
        { type: 'ToolCallResult', toolCallId: 't2', content: 'test trovato', _sequenza: 10 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho trovato il test.', _sequenza: 11 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 12 },
        { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 13 },
      ];
      await page.route(`**/api/v1/sessions/ragionamento-${id}/events*`, (route) => route.fulfill({
        contentType: 'text/event-stream',
        body: `retry: 3600000\n${storia.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}`,
      }));
      const verifica = async () => {
        const segmento = page.locator('#conversation .talos-activity--segment');
        await expect(segmento).toHaveCount(1);
        await expect(segmento.locator('.talos-activity__voci > [data-c="ActivityBundle"]:not(.real-reasoning-note) [data-c="ToolRow"]')).toHaveCount(2); // 24/09: i gruppi stanno in `.talos-activity__voci` (contratto dichiarato)
        await expect(segmento.locator('.real-reasoning-note')).toHaveCount(1);
        await expect(segmento.locator(':scope > .talos-activity__head')).toContainText('1 file letto');
        /* ⛔ CONTRATTO CAMBIATO il 24/09/2026 (R4 fase 2, D1): niente «completata» (ridondante) — «1 ricerca». */
        await expect(segmento.locator(':scope > .talos-activity__head')).toContainText('1 ricerca');
        await expect(segmento.locator(':scope > .talos-activity__head')).not.toContainText('completata');
        await expect(page.locator('#conversation .talos-turn[data-turno="talos"] .talos-turn-spine__n')).toHaveCount(2);
        await segmento.locator(':scope > .talos-activity__head').click();
        await expect(segmento).toContainText('src/app.js');
        await expect(segmento).toContainText('Il primo file indica una ricerca mirata.');
        await expect(segmento).toContainText('test trovato');
      };
      await apri(page, id);
      await verifica();
      await page.reload();
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await apri(page, id);
      await verifica();
    });
  });
}

/** Il flusso di una sessione senza storia, come lo manda il server: solo il confine, e niente riconnessioni. */
const CONFINE_SSE = `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n`;
