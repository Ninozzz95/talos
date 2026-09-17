import { test, expect } from '@playwright/test';
import { installSidebarFixture } from '../fixtures/sidebar-fixture.mjs';

// The aggregate stream is now authoritative; chat replay must not trigger a list poll.
const aggiornaSidebar = (page, riga) => page.evaluate(row => window.__sidebarTest.delta([row]), riga);

/*
 * ⛔ LA BARRA LATERALE E IL PULSANTE, QUANDO UN GIRO SI FERMA O RIPARTE — provato sul pacchetto SERVITO, nei DUE temi. 14/09/2026.
 *
 * Trovato col giro vero della coda (banco 5475, glm-5.3-flash, due finestre):
 *   · dopo lo stop la riga della sessione diceva ancora «in corso» in TUTTE e due le finestre, e «fermata» solo dopo una
 *     ricarica: `RunFinished` rileggeva l'elenco, `RunError` no, e restava il giro dei 15 s;
 *   · ripreso il giro dalla finestra A, la finestra B lo mostrava come FINITO — «Ha ragionato», barra «fermata», nessun
 *     «Interrompi» — per 2 min 18 s di ragionamento vero. B aveva aperto la sessione conclusa, e `chiusaDalServer` si azzera
 *     solo dove parte un invio (O-48), cioè nella finestra che invia.
 * Codex avvisa ogni client a inizio, fine e interruzione del turno (`note_turn_started`, `note_turn_completed`,
 * `note_turn_interrupted`: codex-rs/app-server/src/thread_status.rs:147-160, clone 728cb12 del 03/09/2026).
 *
 * ⛔ O-48 resta vero, ed è la prova al contrario: un `RunStarted` della STORIA (prima di `talos.fine-rigiocata`) non riaccende
 *   una sessione chiusa. Dopo il confine un `RunStarted` è per forza in diretta.
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo. L'elenco e gli eventi qui sono INTERCETTATI.
 */

const MODELLO = 'z-ai/glm-5.3-flash';
const INTERROTTO = '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.';

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo });

    const eventi = (page, lista) => page.evaluate((lista) => {
      const r = window.__talosHarnessUiRuntime;
      for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
    }, lista);
    const stop = (page) => page.locator('.send-btn.is-stop');

    async function prepara(page, id, { fermata = false } = {}) {
      const base = { taskId: 'workspace', modello: MODELLO, avviataAlle: '2026-09-14T08:00:00.000Z', interrotta: false, usage: null, inAttesaApprovazione: false };
      const riga = { ...base, sessionId: id, nome: 'Prova della barra', conclusa: fermata, ...(fermata ? { ultimoEsito: 'errore', motivoChiusura: 'fermata' } : {}) };
      const letture = [];
      await installSidebarFixture(page, { rows: [riga], mode: modo });
      await page.addInitScript((colorMode) => {
        try {
          localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' }));
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
        } catch { /* un frame in sandbox non ha storage */ }
      }, modo);
      await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => {
        letture.push(Date.now());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [riga] }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      });
      await page.route(`**/api/v1/sessions/${id}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('[data-sidebar-connection="live"]').waitFor();
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(async ([id, modello, conclusa]) => {
        const runtime = window.__talosHarnessUiRuntime;
        runtime.passaASessione(id, 'workspace', 'Prova della barra', modello, { conclusa, modello });
        // This fixture injects replay manually, so consume the transport-open boundary once
        // and then close the intercepted static SSE. Otherwise the browser can enter its
        // one-hour reconnect state after the fulfilled body closes and fire a late onopen,
        // resetting inRigiocata after our synthetic end-of-replay.
        const source = runtime.realSessionState.eventSource;
        source.onopen?.();
        source.onopen = null;
        source.close();
      }, [id, MODELLO, fermata]);
      /* La storia arriva prima del confine: una sessione fermata porta il suo giro e il suo stop. */
      await eventi(page, fermata
        ? [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }, { type: 'RunError', code: 'fermato', message: INTERROTTO, _sequenza: 2 }]
        : [{ type: 'RunStarted', input: { consegna: 'Controlla i test' }, _sequenza: 1 }]);
      await page.waitForTimeout(200); // la rilettura rimandata (60 ms) di uno stop della storia non cade dentro le misure delle prove
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      const voce = page.locator('#sessionList .talos-session-item', { hasText: 'Prova della barra' });
      await expect(voce).toContainText(fermata ? 'fermata' : 'in corso');
      return { riga, letture, voce };
    }

    test(`ELENCO-STOP-01 — dopo lo stop la riga dice «fermata» subito, non al giro dei 15 s (${modo})`, async ({ page }, testInfo) => {
      const { riga, letture, voce } = await prepara(page, `lista-stop-${modo}`);
      Object.assign(riga, { conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' });
      const primaDelloStop = letture.length;
      const t = Date.now();
      await eventi(page, [{ type: 'RunError', code: 'fermato', message: INTERROTTO, _sequenza: 2 }]);
      await aggiornaSidebar(page, riga);
      await expect(voce).toContainText('fermata', { timeout: 2000 });
      expect(letture.length, 'il flusso aggiorna la barra senza una seconda lettura HTTP').toBe(primaDelloStop);
      expect(Date.now() - t, 'lo stato arriva dallo stream, non dal timer dei 15 secondi').toBeLessThan(2000);
      await page.mouse.move(700, 450);
      await page.screenshot({ path: testInfo.outputPath(`elenco-fermata-${modo}.png`) });
    });

    test(`ELENCO-STOP-02 AL CONTRARIO — la barra dice quello che dice il server: se non l’ha ancora chiusa, resta «in corso» (${modo})`, async ({ page }) => {
      const { letture, voce } = await prepara(page, `lista-contrario-${modo}`);
      const primaDelloStop = letture.length;
      await eventi(page, [{ type: 'RunError', code: 'fermato', message: INTERROTTO, _sequenza: 2 }]);
      await page.waitForTimeout(200);
      expect(letture.length, 'l’evento della chat non sostituisce lo stato del feed').toBe(primaDelloStop);
      await expect(voce).toContainText('in corso');
      await expect(voce).not.toContainText('fermata');
    });

    test(`ELENCO-STOP-03 — un giro ripreso da UN’ALTRA finestra si vede vivo anche qui: «Interrompi» e «in corso» (${modo})`, async ({ page }, testInfo) => {
      const { riga, letture, voce } = await prepara(page, `lista-altrove-${modo}`, { fermata: true });
      await eventi(page, [{ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} }]);
      await expect(stop(page), 'una sessione fermata non ha niente da interrompere').toHaveCount(0);
      /* L'altra finestra preme «Invia ora»: il server riprende, e a questa arriva il RunStarted in diretta. */
      Object.assign(riga, { conclusa: false, ultimoEsito: undefined, motivoChiusura: undefined });
      const prima = letture.length;
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Quando hai finito, aggiungi una riga col conteggio.', seguito: true }, _sequenza: 3 }]);
      await aggiornaSidebar(page, riga);
      await expect(stop(page), 'il giro ripreso altrove si interrompe anche da qui').toHaveCount(1);
      await expect(voce).toContainText('in corso', { timeout: 2000 });
      expect(letture.length, 'il giro ripreso arriva dal feed senza polling della lista').toBe(prima);
      await page.mouse.move(700, 450);
      await page.screenshot({ path: testInfo.outputPath(`elenco-ripreso-altrove-${modo}.png`) });
    });

    test(`ELENCO-STOP-04 AL CONTRARIO — un RunStarted della STORIA non riaccende una sessione chiusa (O-48) (${modo})`, async ({ page }) => {
      const { letture } = await prepara(page, `lista-storia-${modo}`, { fermata: true });
      const prima = letture.length;
      /* Nessun confine: siamo ancora dentro la rigiocata, e una sessione interrotta finisce la storia con un RunStarted. */
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'un seguito di ieri', seguito: true }, _sequenza: 3 }]);
      await page.waitForTimeout(400);
      await expect(stop(page), 'O-48: il pulsante non torna su «Interrompi» per un giro finito da un pezzo').toHaveCount(0);
      expect(letture.length, 'la storia non fa rileggere l’elenco a ogni giro rigiocato').toBe(prima);
    });

    test(`ELENCO-STOP-05 — i giri fermati entrano nel conto della riga, e il titolo dice perché i token non ci sono (${modo})`, async ({ page }) => {
      /* ⛔ 14/09, giro vero della coda: 7 invii, 6 fermati, e la riga diceva «1 giro» (registro del banco 5475, contato a mano). */
      const { riga, voce } = await prepara(page, `lista-giri-${modo}`, { fermata: true });
      Object.assign(riga, { usageSessione: { prompt_tokens: 9488, completion_tokens: 8008, cached_tokens: 0, giri: 1, esecuzioni: 1 }, giriFermati: 6 });
      await aggiornaSidebar(page, riga);
      const conto = voce.locator('.talos-session-item__aside span', { hasText: /\bgir[oi]$/ });
      await expect(conto).toHaveText('7 giri');
      await expect(conto).toHaveAttribute('title', /6 giri fermati prima che il fornitore dichiarasse il consumo/);
      Object.assign(riga, { giriFermati: 0 });
      await aggiornaSidebar(page, riga);
      await expect(conto, 'AL CONTRARIO: senza fermati la riga è quella di prima').toHaveText('1 giro');
      await expect(conto).not.toHaveAttribute('title', /.+/);
    });

    test(`ELENCO-STOP-06 — un seguito mandato da UN’ALTRA finestra porta ora e permesso anche qui (${modo})`, async ({ page }) => {
      /*
       * ⛔ 14/09, giro vero (foto 12): la finestra che guardava una sessione aperta CONCLUSA disegnava il giro ripreso come storia
       *   — domanda senza ora né permesso, testata di TALOS senza ora — perché il differimento della storia non si spegneva mai.
       */
      await prepara(page, `lista-ora-${modo}`, { fermata: true });
      await eventi(page, [{ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} }]);
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Alla fine scrivi soltanto quanti sono.', seguito: true }, contesto: { permessi: 'Full access', modello: MODELLO }, _sequenza: 3 }]);
      const domanda = page.locator('#conversation .talos-message--user').last();
      await expect(domanda).toContainText('Alla fine scrivi soltanto quanti sono.');
      await expect(domanda.locator('.talos-message__meta')).toHaveText(/^\d{2}:\d{2} · Follow-up · \S/);
      await expect(page.locator('#conversation .talos-turn[data-turno="talos"]').last().locator('.talos-message__meta').first()).toHaveText(/ · \d{2}:\d{2}$/);
    });

    test(`ELENCO-STOP-07 AL CONTRARIO — lo stesso seguito dentro la STORIA resta senza ora: l’orario di ieri non si inventa (${modo})`, async ({ page }) => {
      await prepara(page, `lista-ora-storia-${modo}`, { fermata: true });
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Un seguito della storia.', seguito: true }, contesto: { permessi: 'Full access', modello: MODELLO }, _sequenza: 3 }]);
      const domanda = page.locator('#conversation .talos-message--user').last();
      await expect(domanda).toContainText('Un seguito della storia.');
      await expect(domanda.locator('.talos-message__meta')).toHaveText(/^Follow-up/);
    });
  });
}
