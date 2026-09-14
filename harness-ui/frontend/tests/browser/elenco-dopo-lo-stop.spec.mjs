import { test, expect } from '@playwright/test';

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
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(([id, modello, conclusa]) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Prova della barra', modello, { conclusa, modello });
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
      await expect(voce).toContainText('fermata', { timeout: 2000 });
      expect(letture.length, 'lo stop fa rileggere l’elenco').toBeGreaterThan(primaDelloStop);
      expect(letture[primaDelloStop] - t, 'la rilettura parte dallo stop, non da un timer lontano').toBeLessThan(1000);
      await page.mouse.move(700, 450);
      await page.screenshot({ path: testInfo.outputPath(`elenco-fermata-${modo}.png`) });
    });

    test(`ELENCO-STOP-02 AL CONTRARIO — la barra dice quello che dice il server: se non l’ha ancora chiusa, resta «in corso» (${modo})`, async ({ page }) => {
      const { letture, voce } = await prepara(page, `lista-contrario-${modo}`);
      const primaDelloStop = letture.length;
      await eventi(page, [{ type: 'RunError', code: 'fermato', message: INTERROTTO, _sequenza: 2 }]);
      await expect.poll(() => letture.length, { timeout: 2000 }).toBeGreaterThan(primaDelloStop);
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
      await expect(stop(page), 'il giro ripreso altrove si interrompe anche da qui').toHaveCount(1);
      await expect(voce).toContainText('in corso', { timeout: 2000 });
      expect(letture.length, 'l’inizio di un giro in diretta fa rileggere l’elenco').toBeGreaterThan(prima);
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
  });
}
