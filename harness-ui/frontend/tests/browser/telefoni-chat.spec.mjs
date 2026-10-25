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
      const banco = { conAttesa: false, acceso: true, sceltaFatta: true, relay: { modo: 'n0' } }; // R5.14: lo stato del remoto cambia con /settings
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
        /* R5.14: la rotta della schermata — il ponte e l'interruttore, come `remoto.imposta` */
        if (url.pathname === '/api/v1/remote/settings') {
          const c = JSON.parse(req.postData() ?? '{}');
          if (c.relay) { banco.relay = c.relay; banco.sceltaFatta = true; }
          if (typeof c.acceso === 'boolean') banco.acceso = c.acceso;
          return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ disponibile: true, acceso: banco.acceso, sceltaFatta: banco.sceltaFatta, relay: banco.relay, telefoni: [], attese: [] }) });
        }
        if (/^\/api\/v1\/remote\/pair\/[^/]+\/confirm$/u.test(url.pathname)) { banco.conAttesa = false; return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ telefono: { id: 'tel-pixel-10', nome: 'Pixel 10' } }) }); }
        return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({
          disponibile: true, acceso: banco.acceso, sceltaFatta: banco.sceltaFatta, relay: banco.relay, inLinea: ['tel-pad-0001'],
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
        { type: 'ToolCallResult', toolCallId: 'call-l1', content: 'Remote control is on. Paired devices: 2.', _sequenza: 3 },
      ]);
      const elenco = page.locator('[data-telefoni-elenco]');
      await expect(elenco).toBeVisible();
      await expect(elenco.locator('.talos-remoto-riga__nome')).toHaveText(['Pad di Nino', 'Pixel 9']);
      await expect(elenco.locator('.talos-remoto-riga__stato')).toHaveText(['in linea', 'non in linea']);
      await expect(elenco.locator('[data-remoto-revoca]')).toHaveCount(0);
      await expect(page.locator('.talos-tool-row__detail').filter({ hasText: '2 dispositivi' })).toHaveCount(1);
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
      await expect(carta).toContainText('Mostrare il QR per collegare un dispositivo?');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Mostra il QR');
      await expect(carta.locator('[data-nega]')).toHaveText('Non ora');
      await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '2-carta-qr');
      await carta.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'qr-req-1', approvato: true }]);
    });

    test(`TEL-UI-03 — approvato, la finestra chiede il QR SENZA accendere; un dispositivo che lo legge porta la conferma NELLA chat (R5.14) (${modo})`, async ({ page }, testInfo) => {
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
      /* R5.14 (bozzetto 5 approvato il 23/10): la conferma sotto il QR, nella chat — non più la finestra a parte */
      const conferma = page.locator('[data-telefoni-conferma]');
      await expect(conferma.locator('[data-remoto-codice]')).toHaveText('482 913');
      await expect(page.locator('dialog.td-modal[open]')).toHaveCount(0);
      await expect(qr).toHaveAttribute('data-telefoni-qr', 'chiuso');
      await expect(qr.locator('.talos-remoto-qr__svg')).toHaveCount(0);
      await expect(page.locator('.talos-tool-row__detail').filter({ hasText: 'un dispositivo ha inquadrato il codice' })).toHaveCount(1);
      /* ⛔ il fuoco NON va su «Collega»: un Invio battuto nel compositore non deve poter collegare un dispositivo */
      await expect(conferma.locator('[data-remoto-collega]')).not.toBeFocused();
      await conferma.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '3b-conferma');
      await conferma.locator('[data-remoto-collega]').click();
      await expect(conferma).toHaveAttribute('data-telefoni-conferma', 'chiusa');
      await expect(conferma).toContainText('«Pixel 10» comanda TALOS su questo computer');
      await expect(page.locator('.talos-tool-row__detail').filter({ hasText: 'Pixel 10 collegato' })).toHaveCount(1);
      expect(chiamate.at(-1)).toMatch(/^POST \/api\/v1\/remote\/pair\/attesa-0001\/confirm/u);
    });

    test(`TEL-UI-04 — remoto spento: l'avviso con la porta verso la schermata, e nessun QR chiesto (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s1', toolCallName: 'remote_phone_pair', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s1', content: 'REFUSED. Remote control is off: only the person can turn it on, from the Connected devices screen. No QR code was shown.', _sequenza: 3 },
      ]);
      const avviso = page.locator('[data-telefoni-spento]');
      await expect(avviso).toBeVisible();
      await expect(avviso).toContainText('Il controllo remoto è spento');
      await expect(avviso).toContainText('o chiedi di nuovo qui di collegare un dispositivo'); // R5.14: dalla chat ora si accende, con la carta
      await expect(avviso.locator('[data-telefoni-apri]')).toHaveText('Apri Dispositivi collegati');
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
      await expect(carta).toContainText('Revoca un dispositivo');
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
          { type: 'ToolCallResult', toolCallId: 'call-h2', content: 'Remote control is on. Paired devices: 2.', _sequenza: 5 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
      }, `telefoni-proof-rigiocata-${modo}`);
      await page.waitForTimeout(600);
      await expect(page.locator('[data-telefoni-qr], [data-telefoni-elenco]')).toHaveCount(0);
      expect(chiamate).toEqual([]);
    });

    /* ——— R5.14 (owner 23/10/2026 sera, bozzetti 1-5 approvati): collegare un dispositivo dalla chat ——— */
    const rispondiCarte = async (page) => {
      const risposte = [];
      await page.route('**/api/v1/sessions/telefoni-proof-*/approve', async (route) => { risposte.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      return risposte;
    };

    test(`R514-01 — il QR a remoto spento: la carta lo accende, col ponte; un server proprio senza indirizzo si ferma nella carta; poi il ponte va alla rotta PRIMA del sì (${modo})`, async ({ page }, testInfo) => {
      const { chiamate, banco } = await prepara(page);
      banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
      const risposte = await rispondiCarte(page);
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'on-req-1', _sequenza: 2, azione: { tipo: 'remote_phone_pair', toolCallId: 'call-o1', telefoni: 2, acceso: false, ponte: null } }]);
      const carta = page.locator('[data-request-id="on-req-1"]');
      await expect(carta).toContainText('Accendi il controllo remoto');
      await expect(carta).toContainText('Per collegare un dispositivo il controllo remoto deve essere acceso');
      await expect(carta.locator('[data-remoto-scelta="n0"]')).toHaveAttribute('aria-checked', 'true');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Accendi e mostra il codice');
      await expect(carta.locator('[data-nega]')).toHaveText('Non ora');
      await expect(carta).toContainText('Chiesto ogni volta, anche in Accesso pieno');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, 'r514-1-carta-spento');
      // AL CONTRARIO: il server proprio senza indirizzo non parte
      await carta.locator('[data-remoto-scelta="proprio"]').click();
      await carta.locator('[data-approva-una-volta]').click();
      await expect(carta.locator('[data-telefoni-errore]')).toHaveText('Scrivi l’indirizzo del tuo server, o scegli i server gratuiti.');
      await page.waitForTimeout(300);
      expect(risposte).toEqual([]);
      expect(chiamate).toEqual([]);
      await carta.locator('[data-remoto-url]').fill('https://relay.mio.example/?token=SEGRETO');
      await carta.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'on-req-1', approvato: true }]);
      expect(chiamate).toEqual(['POST /api/v1/remote/settings {"relay":{"modo":"proprio","url":"https://relay.mio.example/?token=SEGRETO"}}']);
    });

    test(`R514-02 — remote_control: «Spegni» dice chi verrà staccato e non scrive niente prima del sì; «Accendi» col ponte che c'è già non lo riscrive (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      const risposte = await rispondiCarte(page);
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'off-req-1', _sequenza: 2, azione: { tipo: 'remote_control', toolCallId: 'call-c1', acceso: false, ponte: 'n0', telefoni: 2, inLinea: 1 } }]);
      const spegni = page.locator('[data-request-id="off-req-1"]');
      await expect(spegni).toContainText('Spegni il controllo remoto');
      await expect(spegni.locator('[data-telefoni-spegni]')).toContainText('1 dispositivo è in linea adesso: verrà staccato.');
      await expect(spegni.locator('[data-approva-una-volta]')).toHaveText('Spegni');
      await expect(spegni.locator('[data-nega]')).toHaveText('Lascialo acceso');
      await spegni.scrollIntoViewIfNeeded();
      await foto(page, testInfo, 'r514-2-spegni');
      await spegni.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'off-req-1', approvato: true }]);
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'on-req-2', _sequenza: 3, azione: { tipo: 'remote_control', toolCallId: 'call-c2', acceso: true, ponte: 'n0', telefoni: 2, inLinea: 0 } }]);
      const accendi = page.locator('[data-request-id="on-req-2"]');
      await expect(accendi.locator('[data-approva-una-volta]')).toHaveText('Accendi');
      await expect(accendi).toContainText('I dispositivi collegati raggiungeranno questo computer');
      await accendi.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte.length).toBe(2);
      expect(chiamate, 'il ponte non cambia: nessuna scrittura prima del sì').toEqual([]);
    });

    test(`R514-03 — il menu «+»: «Collega un dispositivo» apre la riga nella chat e subito il QR, a remoto acceso (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      await page.locator('#capabilityBtn').first().click();
      const voce = page.locator('#menuAllega [data-voce-collega]');
      await expect(voce).toContainText('Collega un dispositivo');
      await expect(voce).toContainText('Usa TALOS da un altro dispositivo');
      await foto(page, testInfo, 'r514-3-menu');
      await voce.click();
      const riga = page.locator('[data-telefoni-collega]');
      await expect(riga).toContainText('Collega un dispositivo');
      await expect(page.locator('.talos-telefoni-collega [data-telefoni-qr] .talos-remoto-qr__svg')).toBeVisible();
      await expect(riga.locator('.talos-tool-row__detail')).toHaveText(/^scade fra 4:\d\d$/u);
      expect(chiamate).toEqual(['POST /api/v1/remote/pair {"soloSeAcceso":true}']);
      await foto(page, testInfo, 'r514-3-qr');
    });

    test(`R514-04 — \`/connect\` a remoto spento: la carta della persona accende col ponte e mostra il QR; «Non ora» non scrive niente (${modo})`, async ({ page }, testInfo) => {
      const { chiamate, banco } = await prepara(page);
      banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
      const campo = page.locator('#composerInput, textarea').first();
      await campo.fill('/connect');
      await campo.press('Enter');
      const carta = page.locator('[data-telefoni-accendi-persona]');
      await expect(carta).toBeVisible();
      await expect(page.locator('[data-telefoni-collega] .talos-tool-row__detail')).toHaveText('il controllo remoto è spento');
      await expect(campo).toHaveValue('');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, 'r514-4-connect-spento');
      await carta.locator('[data-approva-una-volta]').click();
      await expect(page.locator('.talos-telefoni-collega [data-telefoni-qr] .talos-remoto-qr__svg')).toBeVisible();
      expect(chiamate).toEqual(['POST /api/v1/remote/settings {"relay":{"modo":"n0"},"acceso":true}', 'POST /api/v1/remote/pair {"soloSeAcceso":true}']);
      // AL CONTRARIO: di nuovo spento, «Non ora» chiude e non chiama niente
      banco.acceso = false;
      chiamate.length = 0;
      await campo.fill('/connect');
      await campo.press('Enter');
      const seconda = page.locator('[data-telefoni-accendi-persona]').nth(1);
      await seconda.locator('[data-nega]').click();
      await expect(seconda).toContainText('Il controllo remoto resta spento: non è cambiato niente.');
      await expect(page.locator('[data-telefoni-collega] .talos-tool-row__detail').nth(1)).toHaveText('non acceso');
      await page.waitForTimeout(300);
      expect(chiamate).toEqual([]);
    });

    test(`R514-05 — il suggerimento: «/c» mostra solo /connect (e «Tutti i comandi…»), «/» tutti e due; Invio sceglie quello acceso, non manda niente al modello (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      let invii = 0;
      /* qualunque scrittura sulla sessione (riprendi, indirizza, accoda): /connect non ne fa nessuna */
      await page.route(/\/api\/v1\/sessions\/telefoni-proof-[^/]+\/[a-z-]+$/u, (route) => { if (route.request().method() === 'POST') invii += 1; return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      const campo = page.locator('#composerInput, textarea').first();
      await campo.fill('/');
      const elenco = page.locator('#suggerimentoComandi');
      await expect(elenco.locator('[role="option"]:not([hidden])')).toHaveCount(3);
      await campo.fill('/c');
      await expect(elenco.locator('[role="option"]:not([hidden])')).toHaveCount(2);
      await expect(elenco.locator('#suggerimentoComandiConnect')).toBeVisible();
      await expect(elenco.locator('#suggerimentoComandiGoal')).toBeHidden();
      await expect(elenco.locator('#suggerimentoComandiConnect')).toHaveAttribute('aria-selected', 'true');
      await foto(page, testInfo, 'r514-5-suggerimento');
      await campo.press('Enter');
      await expect(page.locator('[data-telefoni-collega]')).toHaveCount(1);
      await expect(campo).toHaveValue('');
      await expect.poll(() => chiamate).toEqual(['POST /api/v1/remote/pair {"soloSeAcceso":true}']);
      expect(invii).toBe(0);
      // AL CONTRARIO: «/g» resta su /goal
      await campo.fill('/g');
      await expect(elenco.locator('#suggerimentoComandiGoal')).toHaveAttribute('aria-selected', 'true');
      await expect(elenco.locator('#suggerimentoComandiConnect')).toBeHidden();
    });

    test(`R514-06 — al contrario: «/connect qualcosa» e un messaggio che solo parla di /connect vanno al modello come testo (${modo})`, async ({ page }) => {
      const { chiamate } = await prepara(page);
      const corpi = [];
      /* il testo va al modello per la strada del giro in corso (riprendi, indirizza o accoda): basta che parta */
      await page.route(/\/api\/v1\/sessions\/telefoni-proof-[^/]+\/[a-z-]+$/u, (route) => { if (route.request().method() === 'POST') corpi.push(route.request().url()); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      const campo = page.locator('#composerInput, textarea').first();
      await campo.fill('come funziona /connect?');
      await campo.press('Enter');
      /* col giro in corso il testo arriva alla scelta «indirizza o accoda», come ogni messaggio: non è il comando */
      await expect(page.getByRole('group', { name: /scegli cosa fare del messaggio/u })).toContainText('come funziona /connect?');
      await page.getByRole('button', { name: 'Indirizza ora' }).click();
      await expect.poll(() => corpi.length).toBe(1);
      await expect(page.locator('[data-telefoni-collega]')).toHaveCount(0);
      expect(chiamate).toEqual([]);
    });

    test(`R514-07 — \`/connect \` inviato senza passare dal suggerimento (lo spazio lo chiude) non va al modello: apre la riga (${modo})`, async ({ page }) => {
      const { chiamate } = await prepara(page);
      let invii = 0;
      await page.route(/\/api\/v1\/sessions\/telefoni-proof-[^/]+\/[a-z-]+$/u, (route) => { if (route.request().method() === 'POST') invii += 1; return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      const campo = page.locator('#composerInput, textarea').first();
      await campo.fill('/connect ');
      await expect(page.locator('#suggerimentoComandi:not([hidden])')).toHaveCount(0);
      await campo.press('Enter');
      /* col giro in corso il compositore chiede prima «indirizza o accoda»: il comando si riconosce lo stesso */
      const scelta = page.getByRole('button', { name: 'Indirizza ora' });
      if (await scelta.isVisible().catch(() => false)) await scelta.click();
      await expect(page.locator('[data-telefoni-collega]')).toHaveCount(1);
      await expect.poll(() => chiamate).toEqual(['POST /api/v1/remote/pair {"soloSeAcceso":true}']);
      expect(invii, 'niente al modello').toBe(0);
    });
  });
}
