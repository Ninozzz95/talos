import { test, expect } from '@playwright/test';

/*
 * 18/10/2026 — R5.12, i telefoni collegati DALLA CHAT (owner: «Elenca, apre il QR, revoca»; mockup approvato «Sì, costruiscilo
 * così»; «Carta sempre, anche in Accesso pieno» per il QR). Sul pacchetto SERVITO, nei due temi. Le rotte `/api/v1/remote…` sono
 * INTERCETTATE: qui si prova che cosa la finestra chiede e disegna; il server ha le sue prove (tests/telefoni-seconda-porta.test.mjs).
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const MODULI = { lato: 21, righe: Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => ((x * 7 + y * 3) % 5 < 2 ? '1' : '0')).join('')) };

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page) {
      const chiamate = [];
      const banco = { conAttesa: false };
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
      }, modo);
      await page.route('**/api/v1/sessions/telefoni-proof-*/events', () => { /* aperto e muto */ });
      await page.route(/\/api\/v1\/remote(\/.*)?$/u, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() !== 'GET') chiamate.push(`${req.method()} ${url.pathname} ${req.postData() ?? ''}`.trim());
        if (url.pathname === '/api/v1/remote/pair') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ gettone: 'G'.repeat(22), qr: 'talos-remote:1?pc=x&t=GGG', scadeAlle: Date.now() + 292_000, moduli: MODULI }) });
        if (url.pathname === '/api/v1/remote/pair/close') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ chiuso: true }) });
        return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({
          disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' }, inLinea: ['tel-pad-0001'],
          telefoni: [
            { id: 'tel-pad-0001', nome: 'Pad di Nino', collegatoAlle: Date.now() - 86_400_000, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 } },
            { id: 'tel-pixel-002', nome: 'Pixel 9', collegatoAlle: Date.now() - 10 * 86_400_000, ultimaVoltaAlle: Date.now() - 86_400_000, inLinea: false },
            { id: 'tel-vecchio-3', nome: 'Vecchio', revocatoAlle: Date.now() - 1000, revocatoDa: 'pc', inLinea: false },
          ],
          attese: banco.conAttesa ? [{ id: 'attesa-0001', nome: 'Pixel 10', piattaforma: 'Android 17', codice: '482913', scadeAlle: Date.now() + 60_000 }] : [],
          accoppiamento: { sbagliati: 0 },
        }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Prova dei telefoni', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
        r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'quali telefoni sono collegati?' }, _sequenza: 1 }, r.realSessionState.generation);
      }, `telefoni-proof-${modo}`);
      await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
      return { chiamate, banco };
    }
    const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, lista);
    const foto = async (page, testInfo, nome) => { await page.mouse.move(1900, 1070); await page.screenshot({ path: testInfo.outputPath(`${nome}-${modo}.png`) }); };

    test(`TEL-UI-01 — l'elenco sotto la riga: i telefoni vivi (non i revocati), «2 telefoni», e la porta verso la schermata (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-l1', toolCallName: 'remote_phones', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-l1', content: 'Remote control is on. Paired phones: 2.', _sequenza: 3 },
      ]);
      const elenco = page.locator('[data-telefoni-elenco]');
      await expect(elenco).toBeVisible();
      await expect(elenco.locator('.talos-remoto-riga__nome')).toHaveText(['Pad di Nino', 'Pixel 9']);
      await expect(elenco.locator('.talos-remoto-riga__stato')).toHaveText(['in linea', 'non in linea']);
      await expect(elenco.locator('[data-remoto-revoca]')).toHaveCount(0);
      await expect(page.locator('.talos-tool-row__detail').filter({ hasText: '2 telefoni' })).toHaveCount(1);
      await elenco.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '1-elenco');
      await elenco.locator('[data-telefoni-apri]').click();
      await expect(page.locator('[data-settings-panel="telefoni"]')).toBeVisible();
    });

    test(`TEL-UI-02 — la carta del QR: «Mostra il QR» / «Non ora», niente «Modifica»; approvata, risponde (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const risposte = [];
      await page.route('**/api/v1/sessions/telefoni-proof-*/approve', async (route) => { risposte.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'qr-req-1', _sequenza: 2, azione: { tipo: 'remote_phone_pair', toolCallId: 'call-q1', telefoni: 2 } }]);
      const carta = page.locator('[data-request-id="qr-req-1"]');
      await expect(carta).toBeVisible();
      await expect(carta).toContainText('Mostrare il QR per collegare un telefono?');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Mostra il QR');
      await expect(carta.locator('[data-nega]')).toHaveText('Non ora');
      await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '2-carta-qr');
      await carta.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'qr-req-1', approvato: true }]);
    });

    test(`TEL-UI-03 — approvato, la finestra chiede il QR SENZA accendere; un telefono che lo legge apre «Collegare questo telefono?» (${modo})`, async ({ page }, testInfo) => {
      const { chiamate, banco } = await prepara(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-q2', toolCallName: 'remote_phone_pair', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-q2', content: 'The pairing QR code is now on the person\'s screen, valid once for a few minutes.', _sequenza: 3 },
      ]);
      const qr = page.locator('[data-telefoni-qr]');
      await expect(qr.locator('.talos-remoto-qr__svg')).toBeVisible();
      await expect(qr.locator('[data-remoto-scade]')).toHaveText(/^scade fra 4:\d\d$/u);
      await expect(qr).toContainText('Il codice di 6 cifre lo confermi qui sul computer');
      await expect(page.locator('.talos-tool-row__detail').filter({ hasText: /scade fra/u })).toHaveCount(1);
      expect(chiamate).toEqual(['POST /api/v1/remote/pair {"soloSeAcceso":true}']);
      await qr.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '3-qr');
      banco.conAttesa = true;
      const finestra = page.locator('dialog.td-modal');
      await expect(finestra.locator('[data-remoto-codice]')).toHaveText('482 913');
      await expect(qr).toHaveAttribute('data-telefoni-qr', 'chiuso');
      await expect(qr.locator('.talos-remoto-qr__svg')).toHaveCount(0);
      await foto(page, testInfo, '3b-conferma');
    });

    test(`TEL-UI-04 — remoto spento: l'avviso con la porta verso la schermata, e nessun QR chiesto (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s1', toolCallName: 'remote_phone_pair', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s1', content: 'REFUSED. Remote control is off: only the person can turn it on, from the Phones screen. No QR code was shown.', _sequenza: 3 },
      ]);
      const avviso = page.locator('[data-telefoni-spento]');
      await expect(avviso).toBeVisible();
      await expect(avviso).toContainText('Il controllo remoto è spento');
      await expect(avviso).toContainText('TALOS non lo accende dalla chat.');
      await expect(avviso.locator('[data-telefoni-apri]')).toHaveText('Apri Telefoni collegati');
      /* mockup: pallino giallo, «non eseguita» — non un errore rosso */
      await expect(page.locator('.talos-tool-row[data-tool-state="not-run"]')).toHaveCount(1);
      await expect(page.locator('.talos-tool-row[data-tool-state="error"]')).toHaveCount(0);
      await avviso.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '4-spento');
      expect(chiamate).toEqual([]);
    });

    test(`TEL-UI-05 — la carta della revoca: il telefono come nell'elenco, «Revoca» / «Lascialo collegato» (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'rev-req-1', _sequenza: 2, azione: {
        tipo: 'remote_phone_revoke', toolCallId: 'call-r1', telefono: { idCorto: 'tel-pixe', nome: 'Pixel 9', inLinea: false, ultimaVoltaAlle: Date.now() - 86_400_000 },
      } }]);
      const carta = page.locator('[data-request-id="rev-req-1"]');
      await expect(carta).toContainText('Revoca un telefono');
      await expect(carta.locator('[data-telefoni-revoca] .talos-remoto-riga__nome')).toHaveText('Pixel 9');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Revoca');
      await expect(carta.locator('[data-nega]')).toHaveText('Lascialo collegato');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '5-revoca');
    });

    test(`TEL-UI-06 — Accesso pieno: la revoca senza carta porta «Senza conferma» e il blocco col nome (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-r2', toolCallName: 'remote_phone_revoke', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-r2', content: 'Disconnected "Pad di Nino" (id tel-pad-) : it can no longer reach this computer. Full access: done without asking the person.', _sequenza: 3 },
        /* il giro vero prosegue: il testo e la fine (il segmento ricalcola le voci fissate all'evento dopo, come per le automazioni) */
        { type: 'TextMessageStart', messageId: 'tel-m1', _sequenza: 4 },
        { type: 'TextMessageContent', messageId: 'tel-m1', delta: 'Fatto.', _sequenza: 5 },
        { type: 'TextMessageEnd', messageId: 'tel-m1', _sequenza: 6 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 7 },
      ]);
      /* come le automazioni fatte senza carta: il segno sta sulla riga, a vista (un attrezzo solo non fa segmento; in un segmento
         chiuso la voce resta fissata col segno, `attivita-segmento.js`); un clic sulla riga apre il blocco */
      const segno = page.locator('.talos-tool-row__senza-carta');
      await expect(segno).toBeVisible();
      await expect(segno).toHaveText('Senza conferma');
      await segno.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '6-accesso-pieno');
      await page.locator('.talos-tool-row[data-senza-carta="si"]').click();
      const blocco = page.locator('[data-telefoni-senza-carta]');
      await expect(blocco).toBeVisible();
      await expect(blocco).toContainText('«Pad di Nino» è stato revocato');
      await foto(page, testInfo, '6b-accesso-pieno-aperto');
    });

    test(`TEL-UI-08 — la testata della barra laterale con l'icona del telefono: nessun pulsante esce dal margine (${modo})`, async ({ page }) => {
      await prepara(page);
      for (const larghezza of [1920, 1440, 1024]) {
        await page.setViewportSize({ width: larghezza, height: 900 });
        const m = await page.evaluate(() => {
          const brand = document.querySelector('.talos-brand');
          const destra = brand.getBoundingClientRect().right - parseFloat(getComputedStyle(brand).paddingRight);
          return { destra, ultimo: Math.max(...[...brand.querySelectorAll('button')].map((x) => x.getBoundingClientRect().right)), scorre: brand.scrollWidth > brand.clientWidth };
        });
        expect(m.ultimo, `${larghezza}: ultimo pulsante a ${m.ultimo}, margine a ${m.destra}`).toBeLessThanOrEqual(m.destra + 0.5);
        expect(m.scorre).toBe(false);
      }
    });

    test(`TEL-UI-07 — al contrario: rigiocando la storia un QR di ieri NON si richiede e l'elenco non si ridisegna (${modo})`, async ({ page }) => {
      const { chiamate } = await prepara(page);
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Rigiocata', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        for (const e of [
          { type: 'RunStarted', input: { consegna: 'collega un telefono' }, _sequenza: 1 },
          { type: 'ToolCallStart', toolCallId: 'call-h1', toolCallName: 'remote_phone_pair', _sequenza: 2 },
          { type: 'ToolCallResult', toolCallId: 'call-h1', content: 'The pairing QR code is now on the person\'s screen, valid once for a few minutes.', _sequenza: 3 },
          { type: 'ToolCallStart', toolCallId: 'call-h2', toolCallName: 'remote_phones', _sequenza: 4 },
          { type: 'ToolCallResult', toolCallId: 'call-h2', content: 'Remote control is on. Paired phones: 2.', _sequenza: 5 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
      }, `telefoni-proof-rigiocata-${modo}`);
      await page.waitForTimeout(600);
      await expect(page.locator('[data-telefoni-qr], [data-telefoni-elenco]')).toHaveCount(0);
      expect(chiamate).toEqual([]);
    });
  });
}
