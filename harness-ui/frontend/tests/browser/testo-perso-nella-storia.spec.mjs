import { test, expect } from '@playwright/test';

/*
 * TESTO-PERSO (08/10/2026, bugfixer; trovato col confronto della suite intera prima/dopo A1-R3) — un giro che cade a metà
 *   risposta (testo senza `TextMessageEnd`, poi `RunError`), riaperto dalla sua storia, PERDEVA il testo che il modello aveva
 *   già scritto: a schermo restava solo la carta d'errore.
 * ⛔ Causa: sotto il rinvio della storia `TextMessageContent` accumula e non disegna (app.js, «contaEventoRigiocato»); il
 *   disegno arriva solo con `TextMessageEnd`, che un giro caduto non manda. Prima di A1-R3 succedeva alle sessioni CHIUSE
 *   (concluse e interrotte: quelle lunghe dell'owner); da A1-R3 anche alle aperte. Misurato: base 0db3f506c aperta sì / chiusa
 *   no; dopo, tutte e due no.
 * ⇒ Al confine il testo rimasto indietro si disegna; se il giro non è più vivo, come finito.
 * La storia arriva dentro lo stream finto, col confine in coda, come la manda il server (http-app.mjs, `fineReplay()`); lo
 *   stream resta aperto (nessuna chiusura ⇒ nessuna riapertura e nessun `onopen` che rimetta la chat nella storia).
 */

const TESTO = 'Ho letto la cartella dei test e sistemato i due file rossi.';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const avvio = { type: 'RunStarted', _sequenza: 1, input: { consegna: 'Sistema i test del progetto' } };
const pezzo = (testo, sequenza = 2) => ({ type: 'TextMessageContent', _sequenza: sequenza, messageId: 'm1', delta: testo });
const caduto = { type: 'RunError', _sequenza: 9, message: 'Il fornitore ha chiuso la connessione.' };

for (const modo of ['light', 'dark']) {
  test.describe(`TESTO-PERSO · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function apri(page, id, storia, { conclusa }) {
      await page.addInitScript((colorMode) => {
        if (window.top !== window) return;
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage: 'it' } })); } catch {}
      }, modo);
      await page.route((url) => url.pathname.endsWith(`/sessions/${id}/events`), () => { /* aperto e muto: la storia la manda la prova */ });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, conclusa, eventi }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Testo nella storia', 'z-ai/glm-5.3-flash', { conclusa, modello: 'z-ai/glm-5.3-flash' });
        for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation);
      }, { id, conclusa, eventi: [...storia, CONFINE] });
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'));
    }
    const messaggio = (page) => page.locator('#conversation .talos-message__copy'); // il contenitore del testo (ensureAssistantMessageElement)

    for (const conclusa of [false, true]) {
      test(`TESTO-01 — giro caduto a metà risposta, sessione ${conclusa ? 'chiusa' : 'aperta'}: il testo già scritto resta, e non «scrive» più`, async ({ page }, testInfo) => {
        await apri(page, `testo-perso-${conclusa}-${modo}`, [avvio, pezzo(TESTO), caduto], { conclusa });
        await expect(page.locator('#conversation')).toContainText(TESTO);
        await expect(page.locator('#conversation')).toContainText('interrotto per un errore');
        await expect(messaggio(page)).not.toHaveClass(/is-streaming/u);
        await page.screenshot({ path: testInfo.outputPath(`testo-01-${conclusa ? 'chiusa' : 'aperta'}-${modo}.png`) });
      });
    }

    test('TESTO-02 — al contrario: un giro ANCORA VIVO a metà risposta mostra il testo e continua a scriverlo dal vivo', async ({ page }) => {
      await apri(page, `testo-vivo-${modo}`, [avvio, pezzo('Prima parte. ')], { conclusa: false });
      await expect(page.locator('#conversation')).toContainText('Prima parte.');
      await expect(messaggio(page)).toHaveClass(/is-streaming/u);
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'TextMessageContent', _sequenza: 3, messageId: 'm1', delta: 'Seconda parte.' }, r.realSessionState.generation);
        r.handleRealEvent({ type: 'TextMessageEnd', _sequenza: 4, messageId: 'm1' }, r.realSessionState.generation);
      });
      await expect(messaggio(page)).toContainText('Prima parte. Seconda parte.');
    });

    test('TESTO-03 — al contrario: un messaggio già finito nella storia non si ridisegna al confine (nemmeno uguale)', async ({ page }) => {
      /* Ridisegnare i messaggi già finiti darebbe lo stesso testo a schermo, ma su una sessione da migliaia di giri vorrebbe dire
         ridisegnarli TUTTI al confine: il costo che il rinvio della storia esiste per evitare. Si contano le modifiche del DOM del
         messaggio attraverso il confine: zero. */
      const id = `testo-finito-${modo}`;
      await page.route((url) => url.pathname.endsWith(`/sessions/${id}/events`), () => {});
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, eventi }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Testo nella storia', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation);
      }, { id, eventi: [avvio, pezzo(TESTO), { type: 'TextMessageEnd', _sequenza: 3, messageId: 'm1' }, { type: 'RunFinished', _sequenza: 4 }] });
      await expect(messaggio(page)).toHaveCount(1);
      const modifiche = await page.evaluate(async (confine) => {
        const copia = document.querySelector('#conversation .talos-message__copy');
        let n = 0;
        const osservatore = new MutationObserver((lista) => { n += lista.length; });
        osservatore.observe(copia, { childList: true, subtree: true, characterData: true });
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent(confine, r.realSessionState.generation);
        // si aspetta che il velo si tolga (il custode lo fa al suo giro, fino a 200 ms dopo il confine) e un fotogramma ancora
        const t0 = performance.now();
        while (document.querySelector('#conversation')?.classList.contains('is-restoring') && performance.now() - t0 < 3000) await new Promise((ok) => setTimeout(ok, 20));
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 100))));
        osservatore.disconnect();
        return n;
      }, CONFINE);
      expect(modifiche, 'il messaggio già finito non si tocca al confine').toBe(0);
      const volte = await page.locator('#conversation').evaluate((c, t) => c.innerText.split(t).length - 1, TESTO);
      expect(volte).toBe(1);
    });
  });
}
