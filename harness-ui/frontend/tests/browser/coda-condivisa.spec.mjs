import { test, expect } from '@playwright/test';

/*
 * ⭐⭐ LA CODA È DELLA SESSIONE — provato sul pacchetto SERVITO, nei DUE temi. Owner, 14/09/2026: «i competitor lo fanno,
 * lo facciamo anche noi».
 *
 * Il difetto, trovato col giro vero del 13/09: la coda la conosceva solo la finestra che l'aveva scritta, e dopo uno stop il
 * banner prometteva «parte alla fine di questo giro» su un giro fermo. Da oggi il banner mostra SOLO quello che dice il
 * server (`CUSTOM talos.coda`, o la risposta di una rotta della coda). Fonti nel modulo `components/coda-messaggi.js`.
 *
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo con uno store isolato. Le rotte della coda qui sono INTERCETTATE:
 *   la prova guarda cosa manda la chat e cosa disegna con la risposta, non il server (che ha le sue prove).
 */

const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const coda = (voci, inPausa = false) => ({ type: 'CUSTOM', name: 'talos.coda', value: { voci, inPausa } });
const VOCE = { id: 'q-1', testo: 'poi aggiorna il README coi numeri veri', immagini: 0 };

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        try {
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
        } catch { /* un frame in sandbox non ha storage */ }
      }, modo);
      await page.route('**/api/v1/sessions/coda-proof-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    });

    async function apri(page, id, { conclusa = false } = {}) {
      await page.evaluate(([id, conclusa]) => {
        window.__talosHarnessUiRuntime.passaASessione(`coda-proof-${id}`, 'workspace', 'Prova della coda', 'z-ai/glm-5.3-flash', { conclusa, modello: 'z-ai/glm-5.3-flash' });
      }, [id, conclusa]);
    }
    async function eventi(page, lista) {
      await page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }
    const banner = (page) => page.locator('#queuedMessage');

    test(`CODA-SCHERMO-01 — a giro vivo: quanti, cosa, quando parte, e le due azioni (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `viva-${modo}`);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }, coda([VOCE])]);
      await expect(banner(page)).toBeVisible();
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveText('1 in coda');
      await expect(banner(page).locator('[data-coda-conteggio]')).not.toHaveClass(/talos-badge--warning/);
      await expect(banner(page).locator('[data-coda-testo]')).toHaveText('«poi aggiorna il README coi numeri veri»');
      await expect(banner(page).locator('[data-coda-testo]')).toHaveAttribute('title', '«poi aggiorna il README coi numeri veri» — Parte quando TALOS finisce di rispondere');
      await expect(banner(page).locator('[data-coda-invia]')).toHaveText('Indirizza ora');
      await expect(banner(page).locator('[data-coda-togli]')).toHaveText('Togli');
      await page.screenshot({ path: testInfo.outputPath(`1-coda-viva-${modo}.png`) });
    });

    test(`CODA-SCHERMO-02 — dopo uno stop: IN PAUSA, e non promette più una partenza che non avverrà (${modo})`, async ({ page }, testInfo) => {
      await apri(page, `pausa-${modo}`);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 },
        { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 2 },
        coda([VOCE, { id: 'q-2', testo: 'e i test', immagini: 0 }], true),
      ]);
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveText('2 in pausa');
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveClass(/talos-badge--warning/);
      await expect(banner(page).locator('[data-coda-testo]')).toHaveText('«poi aggiorna il README coi numeri veri»');
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveAttribute('title', 'In pausa dallo stop: parte solo se lo invii tu');
      await expect(banner(page).locator('[data-coda-testo]')).not.toHaveAttribute('title', /fine di questo giro|finisce di rispondere/);
      /*
       * ⛔ 14/09, dalle foto a 1280 px con la colonna destra aperta: la riga non contiene tutto, e i puntini tagliavano
       *   «(+1 alt…», cioè proprio quanti messaggi aspettano. Il numero sta nel badge, che non si accorcia; il messaggio si
       *   può accorciare, ma le due azioni non lo schiacciano sotto una parola.
       */
      const misure = await banner(page).evaluate((el) => {
        const badge = el.querySelector('[data-coda-conteggio]');
        return { badgeIntero: badge.scrollWidth <= badge.clientWidth + 1, testo: el.querySelector('[data-coda-testo]').clientWidth };
      });
      expect(misure.badgeIntero, 'il badge col numero si legge intero').toBe(true);
      expect(misure.testo, 'le due azioni lasciano al messaggio una larghezza leggibile').toBeGreaterThan(160);
      await expect(banner(page).locator('[data-coda-invia]')).toHaveText('Invia ora');
      const righe = await banner(page).evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 64);
      expect(righe, 'il banner resta una riga sola anche con badge e due azioni').toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`2-coda-in-pausa-${modo}.png`) });
    });

    test(`CODA-SCHERMO-03 — «Togli» manda l’id del messaggio che si VEDE, e disegna la coda che il server rimanda (${modo})`, async ({ page }) => {
      const corpi = [];
      await page.route('**/api/v1/sessions/coda-proof-*/queue/annulla', async (route) => {
        corpi.push(route.request().postDataJSON());
        await route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, rimosso: true, coda: { voci: [], inPausa: false } }) });
      });
      await apri(page, `togli-${modo}`);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }, coda([VOCE, { id: 'q-2', testo: 'secondo', immagini: 0 }])]);
      await banner(page).locator('[data-coda-togli]').click();
      await expect.poll(() => corpi.length).toBe(1);
      expect(corpi[0], 'il primo, per id — non l’ultimo accodato').toEqual({ id: 'q-1' });
      await expect(banner(page)).toBeHidden();
    });

    test(`CODA-SCHERMO-04 AL CONTRARIO — il banner è quello del server: una coda vuota lo toglie, una pausa senza voci non lo accende (${modo})`, async ({ page }) => {
      await apri(page, `vuota-${modo}`);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }, coda([VOCE])]);
      await expect(banner(page)).toBeVisible();
      await eventi(page, [coda([])]);
      await expect(banner(page)).toBeHidden();
      await eventi(page, [coda([], true)]);
      await expect(banner(page)).toBeHidden();
      await eventi(page, [{ type: 'QueuedMessageDelivered', testo: 'arrivato senza annuncio', _sequenza: 2 }]);
      await expect(banner(page), 'una consegna da sola non inventa una coda').toBeHidden();
    });

    test(`CODA-SCHERMO-05 — «Invia ora» a giro FERMO usa la rotta della coda con l’id, non /resume col testo (${modo})`, async ({ page }) => {
      const invii = [];
      const riprese = [];
      await page.route('**/api/v1/sessions/coda-proof-*/queue/invia', async (route) => {
        invii.push(route.request().postDataJSON());
        await route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, modo: 'ripreso', coda: { voci: [], inPausa: false } }) });
      });
      await page.route('**/api/v1/sessions/coda-proof-*/resume', async (route) => {
        riprese.push(route.request().postDataJSON());
        await route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ sessionId: 'x' }) });
      });
      await apri(page, `invia-${modo}`, { conclusa: true });
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 },
        { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 2 },
        coda([VOCE], true),
      ]);
      await expect(banner(page).locator('[data-coda-invia]')).toHaveText('Invia ora');
      await banner(page).locator('[data-coda-invia]').click();
      await expect.poll(() => invii.length).toBe(1);
      expect(invii[0]).toEqual({ id: 'q-1' });
      expect(riprese, '⛔ il testo sta sul server: nessuna ripresa col testo copiato dalla finestra').toEqual([]);
      await expect(page.locator('#conversation')).toContainText('poi aggiorna il README coi numeri veri');
      /* ⛔ 14/09, foto 12: su una sessione aperta CONCLUSA la domanda mandata da qui usciva senza ora — un invio è diretta. */
      await expect(page.locator('#conversation .talos-message--user').last().locator('.talos-message__meta')).toHaveText(/^\d{2}:\d{2} · Follow-up/);
    });

    test(`CODA-SCHERMO-06 — il giro ripreso da «Invia ora» si può INTERROMPERE (${modo})`, async ({ page }, testInfo) => {
      /*
       * ⛔ 14/09, giro vero (banco 5475): ripreso con «Invia ora», il modello ha ragionato 2 min 18 s e il pulsante è rimasto
       *   «Invia» per tutto il giro — nessun modo di fermarlo. `chiusaDalServer` si azzera dove parte un invio vero (O-48, in
       *   `submitPrompt`), e «Invia ora» è un invio vero che da lì non passava.
       */
      await page.route('**/api/v1/sessions/coda-proof-*/queue/invia', (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, modo: 'ripreso', coda: { voci: [], inPausa: false } }) }));
      await apri(page, `interrompi-${modo}`, { conclusa: true });
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 },
        { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 2 },
        coda([VOCE], true),
      ]);
      await expect(page.locator('.send-btn.is-stop'), 'a giro fermo non c’è niente da interrompere').toHaveCount(0);
      const generazione = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.generation);
      await banner(page).locator('[data-coda-invia]').click();
      await page.waitForFunction((g) => window.__talosHarnessUiRuntime.realSessionState.generation !== g, generazione);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: VOCE.testo, seguito: true }, contesto: { permessi: 'Full access', modello: 'z-ai/glm-5.3-flash' }, _sequenza: 3 }]);
      await expect(page.locator('.send-btn.is-stop'), 'il giro ripreso ha il suo «Interrompi»').toHaveCount(1);
      /* ⛔ 14/09, giro vero (parte 5): la domanda mandata da qui prende il permesso che il server dichiara, come nelle altre finestre. */
      await expect(page.locator('#conversation .talos-message--user').last().locator('.talos-message__meta')).toHaveText(/^\d{2}:\d{2} · Follow-up · \S/);
      await page.screenshot({ path: testInfo.outputPath(`6-ripreso-interrompibile-${modo}.png`) });
    });

    test(`CODA-SCHERMO-07 — una voce in pausa dice «Indirizza ora» mentre un giro lavora, e «Invia ora» quando si ferma (${modo})`, async ({ page }, testInfo) => {
      /*
       * ⛔ 14/09, giro vero (foto 06 e 07): ripreso il giro con «Invia ora», la voce rimasta in pausa diceva ancora «Invia ora» e
       *   «Il giro è fermo» mentre il modello lavorava. Hermes: `const canSteer = busy && …` (queue-panel.tsx:79).
       * ⛔ Il cambio NON arriva da un nuovo annuncio della coda: lo porta il giro che si ferma. Per questo si prova sul RunError.
       */
      await apri(page, `vivo-in-pausa-${modo}`);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }, coda([VOCE], true)]);
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveText('1 in pausa');
      await expect(banner(page).locator('[data-coda-invia]')).toHaveText('Indirizza ora');
      await expect(banner(page).locator('[data-coda-conteggio]')).not.toHaveAttribute('title', /giro è fermo/);
      await page.screenshot({ path: testInfo.outputPath(`7-in-pausa-a-giro-vivo-${modo}.png`) });
      await eventi(page, [{ type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 2 }]);
      await expect(banner(page).locator('[data-coda-invia]'), 'la parola segue il giro, senza un nuovo annuncio della coda').toHaveText('Invia ora');
      await expect(banner(page).locator('[data-coda-conteggio]')).toHaveText('1 in pausa');
    });
  });
}
