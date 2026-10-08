import { test, expect } from '@playwright/test';

/*
 * ATTESA-DA-CAPO (08/10/2026, bugfixer, riprodotto dal vivo sulla 4176 col fornitore finto) — riaperta una sessione mentre il
 *   modello tace, la bolla d'attesa contava da quando la pagina l'aveva ridisegnata: nello stesso istante la pagina che seguiva
 *   il giro dall'inizio diceva «33s», quella riaperta «8s», e `/metrics` 33.601 ms. Anche l'etichetta scalava dal momento
 *   sbagliato («Il modello ci sta ancora lavorando…» invece di «Ci sta mettendo più del solito…»).
 * ⇒ La bolla nata nella storia ricorda la `_sequenza` dell'evento che l'ha aperta; la lettura di `/metrics` ne chiede l'età
 *   (`GET /metrics?eta=<_sequenza>` ⇒ `etaEvento`, da `etaDellEvento` nel registro), e l'origine si corregge una volta sola.
 *   Il finto `/metrics` risponde come il vero: l'età solo della sequenza CHIESTA, `null` se non la sa.
 * Stesso modello di `riapriViva` (ragionamento-compresso.spec.mjs): il flusso finto resta aperto e il confine lo manda la prova,
 *   dopo la storia, com'è l'ordine del server. La forma di `/metrics` è quella di `http-app.mjs` (busta `ok/data/meta`).
 */

const TESTI = {
  processing: 'TALOS sta elaborando la risposta…',
  longer: 'Ci sta mettendo più del solito — resta in attesa…',
};

for (const modo of ['light', 'dark']) {
  test.describe(`ATTESA-DA-CAPO · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage: 'it' } }));
      }, modo);
      /* ⛔ Lo stream si conta APERTO quando lo dice il browser, non quando `inRigiocata` diventa vero: `source.onopen` (app.js)
         rimette la chat «nella storia» a ogni apertura, e se arrivava DOPO il confine mandato dalla prova il velo restava su —
         2 su 174 nelle corse lunghe, tracciato il 08/10/2026 (`inRigiocata:true, defer:false` al blocco). Col server vero il
         confine viaggia dentro lo stream, quindi l'ordine è garantito: qui lo si garantisce aspettando l'apertura. */
      await page.addInitScript(() => {
        const Originale = window.EventSource;
        window.__apertureStream = 0;
        window.EventSource = class extends Originale {
          constructor(...argomenti) { super(...argomenti); this.addEventListener('open', () => { window.__apertureStream += 1; }); }
        };
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    });

    /** Risponde come `/metrics?eta=<n>`: l'età di QUELLA sequenza se la conosce (`eta`: {sequenza: ms}), altrimenti `null`. */
    const corpoMetriche = (url, eta) => {
      const chiesta = new URL(url).searchParams.get('eta');
      const ms = chiesta !== null ? eta[chiesta] : undefined;
      const etaEvento = Number.isFinite(ms) ? { sequenza: Number(chiesta), ms } : null;
      return JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {}, ragionamentiInCorsoDaMs: {}, etaEvento }, meta: { schema: 'talos.harness-ui.api.v1' } });
    };
    /** Apre una sessione VIVA con un flusso che resta aperto. */
    async function riapriViva(page, sessione, eta) {
      const letture = { metrics: 0 };
      await page.route((url) => url.pathname.endsWith(`/sessions/${sessione}/metrics`), (route) => { // un glob non copre la query `?eta=`
        letture.metrics += 1;
        return route.fulfill({
          contentType: 'application/json',
          body: corpoMetriche(route.request().url(), eta),
        });
      });
      await page.route(`**/api/v1/sessions/${sessione}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      const apertePrima = await page.evaluate(() => window.__apertureStream);
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Attesa riaperta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, sessione);
      await page.waitForFunction((n) => window.__apertureStream > n && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === true, apertePrima);
      return letture;
    }
    async function eventi(page, lista) {
      await page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }
    const avvio = (sequenza) => ({ type: 'RunStarted', input: { consegna: 'Rispondi con una riga sola.' }, _sequenza: sequenza });
    const confine = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
    const secondi = (page) => page.locator('#conversation .run-activity-elapsed').first().innerText().then((t) => Number.parseInt(t, 10));
    const etichetta = (page) => page.locator('#conversation .run-activity-label').first();
    const fineVelo = (page) => page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });

    test('ATTESA-01 — riaperta mentre il modello tace da 33 s: la bolla dice 33 s, e l’etichetta è quella dei 33 s', async ({ page }, testInfo) => {
      const letture = await riapriViva(page, `attesa-viva-${modo}`, { 1: 33_000 });
      await eventi(page, [avvio(1), confine]);
      await fineVelo(page);
      await expect.poll(() => secondi(page), { timeout: 3_000 }).toBeGreaterThanOrEqual(33);
      expect(await secondi(page), 'nessun salto oltre il vero').toBeLessThanOrEqual(36);
      await expect(etichetta(page)).toHaveText(TESTI.longer);
      expect(letture.metrics, 'il confine rilegge /metrics se la bolla rigiocata aspetta ancora la sua età').toBeGreaterThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`attesa-01-riaperta-${modo}.png`) });
    });

    test('ATTESA-04 — la bolla aperta da un evento DOPO la lettura del RunStarted: la rilettura al confine porta la sua età', async ({ page }) => {
      const letture = await riapriViva(page, `attesa-tarda-${modo}`, { 4: 33_000 });
      // la storia: il giro parte, un attrezzo chiude la bolla — e la lettura partita al RunStarted si esaurisce QUI
      await eventi(page, [avvio(1), { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2 },
        { type: 'ToolCallEnd', toolCallId: 't1', _sequenza: 3 }]);
      await expect.poll(() => letture.metrics).toBeGreaterThanOrEqual(1);
      await page.evaluate(() => new Promise((ok) => setTimeout(ok, 300)));
      const primaDelConfine = letture.metrics;
      // poi il modello ricomincia a ragionare (la bolla riapre, nella storia), e arriva il confine
      await eventi(page, [{ type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning', _sequenza: 4 }, confine]);
      await fineVelo(page);
      await expect.poll(() => secondi(page), { timeout: 3_000 }).toBeGreaterThanOrEqual(33);
      expect(letture.metrics, 'una lettura in più, al confine').toBeGreaterThan(primaDelConfine);
    });

    test('ATTESA-05 — una prima lettura che NON conosce l’età non consuma il ricordo: la successiva la porta', async ({ page }) => {
      const sessione = `attesa-due-letture-${modo}`;
      let letture = 0;
      await page.route((url) => url.pathname.endsWith(`/sessions/${sessione}/metrics`), (route) => { // un glob non copre la query `?eta=`
        letture += 1;
        return route.fulfill({ contentType: 'application/json', body: corpoMetriche(route.request().url(), letture === 1 ? {} : { 1: 33_000 }) });
      });
      await page.route(`**/api/v1/sessions/${sessione}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      const apertePrima = await page.evaluate(() => window.__apertureStream);
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Attesa riaperta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, sessione);
      await page.waitForFunction((n) => window.__apertureStream > n && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === true, apertePrima);
      await eventi(page, [avvio(1)]);
      await expect.poll(() => letture).toBeGreaterThanOrEqual(1);
      await page.evaluate(() => new Promise((ok) => setTimeout(ok, 300)));
      await eventi(page, [confine]);
      await fineVelo(page);
      await expect.poll(() => secondi(page), { timeout: 3_000 }).toBeGreaterThanOrEqual(33);
    });

    test('ATTESA-06a — riaperta a metà di un ragionamento LUNGO: la riga ragiona dal vivo e NON c’è una bolla d’attesa (come dal vivo)', async ({ page }) => {
      /* ⛔ RAGIONA-RIAPERTA (08/10/2026): dal vivo, al primo pezzo di ragionamento la bolla se ne va e la riga diventa l'indicatore
         (`accendiRagionamentoVivo`). Riaperta, A1-R3 lasciava la riga su «Ha ragionato» con una seconda bolla sotto: era la bolla
         che la prima stesura di questa prova misurava. Qui: 100 pezzi rigiocati, ragionamento ancora aperto al confine. */
      await riapriViva(page, `attesa-ragionamento-${modo}`, { 1: 33_000 });
      const pezzi = Array.from({ length: 100 }, (_, i) => ({ type: 'ReasoningMessageContent', messageId: 'r1', delta: 'x', _sequenza: 3 + i }));
      await eventi(page, [avvio(1), { type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning', _sequenza: 2 }, ...pezzi, confine]);
      await fineVelo(page);
      await expect(page.locator('#conversation .real-reasoning-note > .talos-activity__head').first()).toContainText(/Sta ragionando/);
      await expect(page.locator('#conversation .run-activity-elapsed')).toHaveCount(0);
    });

    test('ATTESA-06b — dopo un ragionamento LUNGO già finito, la bolla «sta preparando» chiede l’età della FINE del ragionamento', async ({ page }) => {
      const chieste = [];
      page.on('request', (r) => { if (r.url().includes('/metrics')) chieste.push(new URL(r.url()).searchParams.get('eta')); });
      await riapriViva(page, `attesa-preparando-${modo}`, { 103: 33_000 });
      const pezzi = Array.from({ length: 100 }, (_, i) => ({ type: 'ReasoningMessageContent', messageId: 'r1', delta: 'x', _sequenza: 3 + i }));
      await eventi(page, [avvio(1), { type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning', _sequenza: 2 }, ...pezzi,
        { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 103 }, confine]);
      await fineVelo(page);
      await expect.poll(() => secondi(page), { timeout: 3_000 }).toBeGreaterThanOrEqual(33);
      expect(chieste, 'la lettura chiede l’evento che ha aperto la bolla (la fine del ragionamento)').toContain('103');
    });

    test('ATTESA-07 — una risposta TARDA per una bolla già chiusa non tocca quella riaperta dopo, nella storia', async ({ page }) => {
      /* La lettura `?eta=1` parte mentre la storia arriva ancora (un `consumo-fornitore` rigiocato la rilancia) e torna lenta; nel
         frattempo un attrezzo chiude la bolla e un ragionamento la riapre (sequenza 4). L'età di 1 (99 s) non vale per la 4 (33 s). */
      const sessione = `attesa-risposta-tarda-${modo}`;
      const eta = { 1: 99_000, 4: 33_000 };
      await page.route((url) => url.pathname.endsWith(`/sessions/${sessione}/metrics`), async (route) => { // un glob non copre la query `?eta=`
        if (new URL(route.request().url()).searchParams.get('eta') === '1') await new Promise((ok) => setTimeout(ok, 1_000));
        return route.fulfill({ contentType: 'application/json', body: corpoMetriche(route.request().url(), eta) });
      });
      await page.route(`**/api/v1/sessions/${sessione}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      const chieste = [];
      page.on('request', (r) => { if (r.url().includes('/metrics')) chieste.push(new URL(r.url()).searchParams.get('eta')); });
      const apertePrima = await page.evaluate(() => window.__apertureStream);
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Attesa riaperta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, sessione);
      await page.waitForFunction((n) => window.__apertureStream > n && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === true, apertePrima);
      await eventi(page, [avvio(1)]);
      await page.evaluate(() => new Promise((ok) => setTimeout(ok, 300))); // la lettura del RunStarted (senza domanda) è tornata
      await eventi(page, [{ type: 'CUSTOM', name: 'consumo-fornitore', value: { esito: 'completato', usage: { prompt_tokens: 10, completion_tokens: 2 } }, _sequenza: 2 }]);
      await expect.poll(() => chieste).toContain('1');
      await eventi(page, [{ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 3 },
        { type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning', _sequenza: 4 }, confine]);
      await fineVelo(page);
      await expect.poll(() => chieste, { timeout: 5_000 }).toContain('4');
      await expect.poll(() => secondi(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(33);
      expect(await secondi(page), 'l’età della bolla chiusa (99 s) non è passata a quella nuova').toBeLessThan(60);
    });

    test('ATTESA-02 — al contrario: se il registro non sa l’età di quell’evento, la bolla resta com’era (niente inventato)', async ({ page }) => {
      await riapriViva(page, `attesa-ignota-${modo}`, { 99: 33_000 });
      await eventi(page, [avvio(1), confine]);
      await fineVelo(page);
      await page.waitForTimeout(1_200);
      expect(await secondi(page)).toBeLessThanOrEqual(3);
      await expect(etichetta(page)).toHaveText(TESTI.processing);
    });

    test('ATTESA-03 — al contrario: una bolla nata DAL VIVO parte da adesso, anche se /metrics conosce la sua sequenza', async ({ page }) => {
      await riapriViva(page, `attesa-dal-vivo-${modo}`, { 5: 33_000 });
      await eventi(page, [confine, avvio(5)]);
      await page.waitForTimeout(1_200);
      expect(await secondi(page)).toBeLessThanOrEqual(3);
      await expect(etichetta(page)).toHaveText(TESTI.processing);
    });
  });
}
