import { test, expect } from '@playwright/test';

/*
 * R5.13 corsa 2 (24/10/2026) — MANDARE UN FILE A UN DISPOSITIVO nella finestra, sul pacchetto SERVITO, nei due temi e nelle due
 * lingue, con le stesse scene dei bozzetti approvati (`lavoro-desktop-2026-10-24/bozzetti-r513/`, D1-D8): il menu del file (1a, 1b,
 * 2a), la carta (2b, 3a), l'Accesso pieno (3b), gli stati (4a) e gli errori (4b). Le rotte `/api/v1/remote…` e `/approve` sono
 * INTERCETTATE (ogni richiesta che non è una lettura si ferma e si conta): qui si prova che cosa la finestra chiede e disegna; il
 * server ha le sue prove (`tests/remoto-invio-file-attrezzo.test.mjs`).
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const ORA = Date.now();
const PAD = { id: 'tel-pad-0001', nome: 'Pad di Nino', collegatoAlle: ORA - 86_400_000, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 } };
const PIXEL = { id: 'tel-pixel-002', nome: 'Pixel 9', collegatoAlle: ORA - 10 * 86_400_000, inLinea: true, percorso: { tipo: 'relay', rttMs: 140 } };
const TAB = { id: 'tel-tab-0003', nome: 'Galaxy Tab', collegatoAlle: ORA - 30 * 86_400_000, ultimaVoltaAlle: ORA - 86_400_000, inLinea: false };
const SID = (modo, lingua) => `invio-proof-${modo}-${lingua}`;

const T = {
  en: { domanda: 'Write the Q3 report as a PDF from the sales sheet, and update the notes.', risposta: 'Done. The report is in report-q3.pdf (12 pages, with the three charts), and notes/q3.md has the summary.', domanda2: 'Send me the report on the Pad, I want to read it on the train.' },
  it: { domanda: 'Scrivi la relazione del terzo trimestre in PDF dal foglio delle vendite, e aggiorna le note.', risposta: 'Fatto. La relazione è in report-q3.pdf (12 pagine, coi tre grafici), e notes/q3.md ha il riassunto.', domanda2: 'Mandami la relazione sul Pad, voglio leggerla in treno.' },
};

for (const lingua of ['en', 'it']) {
  for (const modo of ['dark', 'light']) {
    test.describe(`${lingua} · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
      test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, locale: lingua === 'it' ? 'it-IT' : 'en-US' });
      const L = T[lingua];
      const en = lingua === 'en';

      async function prepara(page, { dispositivi = [PAD], offerte = [], flusso = [] } = {}) {
        const fermate = [];
        const banco = { dispositivi, offerte, flusso };
        await page.addInitScript(({ colorMode }) => {
          try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode }, chat: { model: 'z-ai/glm-5.3-flash' } })); } catch { /* sandbox */ }
        }, { colorMode: modo, lingua });
        await page.route('**/api/v1/sessions/invio-proof-*/events*', () => { /* aperto e muto */ });
        await page.route('**/api/v1/sessions/*/approve', async (route) => { fermate.push(`POST approve ${route.request().postData()}`); await route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
        await page.route(/\/api\/v1\/remote(\/.*)?$/u, async (route) => {
          const req = route.request();
          const url = new URL(req.url());
          if (url.pathname === '/api/v1/remote/events') {
            if (!banco.flusso.length) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            return route.fulfill({ contentType: 'text/event-stream', body: [...banco.flusso.map((e) => `data: ${JSON.stringify(e)}\n\n`), `data: ${JSON.stringify({ type: 'remote.changed', motivo: 'connesso' })}\n\n`].join('') });
          }
          if (/\/offers$/u.test(url.pathname)) {
            if (req.method() !== 'GET') {
              fermate.push(`${req.method()} ${url.pathname} ${req.postData() ?? ''}`);
              const c = JSON.parse(req.postData() ?? '{}');
              return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ offertaId: `nuova-${fermate.length}`, nome: c.percorso.split(/[\\/]/u).pop(), dimensione: 2_516_582, fileId: 'f', versione: 'v' }) });
            }
            return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ offerte: banco.offerte }) });
          }
          if (req.method() !== 'GET') { fermate.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
          return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' },
            inLinea: banco.dispositivi.filter((d) => d.inLinea).map((d) => d.id), telefoni: banco.dispositivi, attese: [], accoppiamento: { sbagliati: 0 } }) });
        });
        await page.goto('/');
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
        /* lo stato del remoto è letto all'avvio: il menu sa quali dispositivi ci sono */
        await expect(page.locator('[data-remoto-pillola]')).toBeVisible({ timeout: 10_000 }).catch(() => null);
        await page.evaluate(({ id, L }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', L.domanda.slice(0, 20), 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
          r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
          let s = 0;
          const e = (lista) => { for (const ev of lista) r.handleRealEvent({ ...ev, _sequenza: (s += 1) }, r.realSessionState.generation); };
          e([
            { type: 'RunStarted', input: { consegna: L.domanda }, contesto: { modello: 'z-ai/glm-5.3-flash' } },
            { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'document_create' },
            { type: 'ToolCallResult', toolCallId: 'c1', content: 'Created report-q3.pdf (2.4 MB).' },
            { type: 'StateDelta', delta: [{ op: 'add', path: '/file/report-q3.pdf', value: '', allegato: { nome: 'report-q3.pdf', formato: 'pdf', byte: 2_516_582 } }] },
            { type: 'StateDelta', delta: [{ op: 'add', path: '/file/notes/q3.md', value: { op: 'add', dopo: 'a\nb\n' } }] },
            { type: 'TextMessageStart', messageId: 'm1' }, { type: 'TextMessageContent', messageId: 'm1', delta: L.risposta }, { type: 'TextMessageEnd', messageId: 'm1' },
            { type: 'RunFinished' },
          ]);
          window.__invioSeq = () => (s += 1);
        }, { id: SID(modo, lingua), L });
        await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
        return { fermate, banco };
      }
      const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent({ ...e, _sequenza: window.__invioSeq() }, r.realSessionState.generation); }, lista);
      const giroInvio = (page, domanda = L.domanda2) => eventi(page, [{ type: 'RunStarted', input: { consegna: domanda, seguito: true }, contesto: { modello: 'z-ai/glm-5.3-flash' } }]);
      const attrezzo = (id, path, content, device) => [
        { type: 'ToolCallStart', toolCallId: id, toolCallName: 'remote_device_send_file' },
        { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ path, ...(device ? { device } : {}) }) },
        { type: 'ToolCallEnd', toolCallId: id },
        { type: 'ToolCallResult', toolCallId: id, content },
      ];
      const foto = async (page, testInfo, nome) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: testInfo.outputPath(`r513-${nome}-${modo}${en ? '' : '-it'}.png`) });
      };
      const schedaPdf = (page) => page.locator('.talos-file-scaricabile').filter({ hasText: 'report-q3.pdf' }).first();

      test(`INV-B-1a — il «⋯» sulla scheda: «Send to Pad di Nino», «Open in the reader», «Copy path»; niente «Download» ripetuto (${lingua} ${modo})`, async ({ page }, testInfo) => {
        const { fermate } = await prepara(page);
        const scheda = schedaPdf(page);
        await scheda.scrollIntoViewIfNeeded();
        const piu = scheda.locator('[data-file-piu]');
        await expect(piu).toHaveAttribute('aria-label', en ? 'More actions on report-q3.pdf' : 'Altre azioni su report-q3.pdf');
        await piu.click();
        const menu = page.locator('#menuFileDellaChat');
        await expect(menu).toBeVisible();
        await expect(menu.locator('[role=menuitem]')).toHaveText(en ? ['Send to Pad di Nino', 'Open in the reader', 'Copy path'] : ['Invia a Pad di Nino', 'Apri nel lettore', 'Copia il percorso']);
        await expect(piu).toHaveAttribute('aria-expanded', 'true');
        await page.mouse.move(1900, 1070);
        /* bozzetto 1a: col menu aperto il «⋯» resta PREMUTO (lo sfondo del passaggio), anche col puntatore lontano */
        await foto(page, testInfo, '1a-scheda-menu');
        await page.waitForTimeout(400); // la transizione dello sfondo dell'hover, finita
        const fondoAperto = await piu.evaluate((b) => getComputedStyle(b).backgroundColor);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await piu.evaluate((b) => b.blur());
        await expect.poll(() => piu.evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe(fondoAperto);
        expect(fermate).toEqual([]);
      });

      test(`INV-B-1b — il tasto destro su un file toccato: «Send to …», «Download», «Copy path»; il clic resta la Revisione (${lingua} ${modo})`, async ({ page }, testInfo) => {
        await prepara(page);
        const riga = page.locator('[data-c="TouchedFiles"] .talos-touched__row').filter({ hasText: 'q3.md' }).first();
        await riga.scrollIntoViewIfNeeded();
        await riga.click({ button: 'right' });
        const menu = page.locator('#menuFileDellaChat');
        /* bozzetto 1b: il titolo è il percorso nella cartella, non il solo nome */
        /* visto nella foto del 25/10: il tasto destro saliva fino alla risposta e apriva ANCHE il suo menu (Riprova / Elimina) */
        await expect(menu).toBeVisible();
        await expect(page.locator('#menuRispostaMessaggio')).toBeHidden();
        await expect(menu.locator('.talos-context-menu__title')).toHaveText('notes/q3.md');
        await expect(menu.locator('[role=menuitem]')).toHaveText(en ? ['Send to Pad di Nino', 'Download', 'Copy path'] : ['Invia a Pad di Nino', 'Scarica', 'Copia il percorso']);
        await foto(page, testInfo, '1b-tasto-destro');
        await page.mouse.click(1500, 900);
        await expect(menu).toBeHidden();
      });

      test(`INV-B-2a — più dispositivi: «Send to device…» diventa la scelta; scelto Pixel 9, l'offerta parte e la scheda lo dice (${lingua} ${modo})`, async ({ page }, testInfo) => {
        /* «visto ieri» si calcola ADESSO, con l'orologio della macchina (lo stesso della pagina): la corsa del 25/10 ha passato la mezzanotte
           e un «ieri» calcolato al caricamento del modulo era diventato l'altro ieri */
        const { fermate } = await prepara(page, { dispositivi: [PAD, PIXEL, { ...TAB, ultimaVoltaAlle: Date.now() - 86_400_000 }] });
        const scheda = schedaPdf(page);
        await scheda.scrollIntoViewIfNeeded();
        await scheda.locator('[data-file-piu]').click();
        const menu = page.locator('#menuFileDellaChat');
        await expect(menu.locator('[role=menuitem]').first()).toHaveText(en ? 'Send to device…' : 'Invia a un dispositivo…');
        await menu.locator('[role=menuitem]').first().click();
        await expect(menu.locator('.talos-context-menu__title')).toHaveText(en ? 'Send report-q3.pdf to' : 'Invia report-q3.pdf a');
        await expect(menu.locator('[role=menuitem] > span')).toHaveText(['Pad di Nino', 'Pixel 9', 'Galaxy Tab']);
        await expect(menu.locator('[role=menuitem] small').nth(2)).toHaveText(en ? 'offline · gets it when it connects · seen yesterday' : 'non in linea · lo riceve quando si collega · visto ieri');
        await expect(menu.locator('.talos-dot--success')).toHaveCount(2);
        await expect(menu.locator('.talos-dot--warning')).toHaveCount(1);
        await page.mouse.move(1900, 1070);
        await foto(page, testInfo, '2a-scelta-dispositivo');
        await menu.locator('[role=menuitem]').nth(1).click();
        await expect.poll(() => fermate.length).toBe(1);
        expect(fermate[0]).toMatch(/^POST \/api\/v1\/remote\/sessions\/invio-proof-[a-z-]+\/offers \{"percorso":"report-q3\.pdf","dispositivo":"tel-pixel-002"\}$/u);
        await expect(scheda.locator('[data-invio-stato]')).toHaveText(en ? 'Sent to Pixel 9 · not downloaded yet' : 'Inviato a Pixel 9 · non ancora scaricato');
      });

      test(`INV-B-D4 — nessun dispositivo collegato ⇒ nel menu non c'è «Send to» (${lingua} ${modo})`, async ({ page }) => {
        await prepara(page, { dispositivi: [] });
        const scheda = schedaPdf(page);
        await scheda.scrollIntoViewIfNeeded();
        await scheda.locator('[data-file-piu]').click();
        await expect(page.locator('#menuFileDellaChat [role=menuitem]')).toHaveText(en ? ['Open in the reader', 'Copy path'] : ['Apri nel lettore', 'Copia il percorso']);
      });

      for (const [scena, dispositivo, molti] of [['3a-carta', { idCorto: 'tel-pad-', nome: 'Pad di Nino', inLinea: true }, 1], ['2b-carta-piu-dispositivi', { idCorto: 'tel-pixe', nome: 'Pixel 9', inLinea: true }, 3]]) {
        test(`INV-B-${scena} — la carta di remote_device_send_file: file, dispositivo, «Send» / «Don't send»; il sì risponde (${lingua} ${modo})`, async ({ page }, testInfo) => {
          const { fermate } = await prepara(page, { dispositivi: molti > 1 ? [PAD, PIXEL, TAB] : [PAD] });
          await giroInvio(page);
          await eventi(page, [{ type: 'ApprovalRequested', requestId: 'invio-1', azione: { tipo: 'remote_device_send_file', toolCallId: 'c-inv',
            file: { nome: 'report-q3.pdf', dimensione: 2_516_582, percorso: 'C:\\Users\\Nino\\Projects\\Sales\\report-q3.pdf' },
            telefono: { ...dispositivo, ultimaVoltaAlle: Date.now() - 60_000 }, dispositivi: molti } }]);
          const carta = page.locator('[data-request-id="invio-1"]');
          await expect(carta).toBeVisible();
          await expect(carta.locator('.talos-approval__head .talos-badge')).toContainText(en ? 'Send a file to a device' : 'Invia un file a un dispositivo');
          await expect(carta.locator('.talos-approval__head .talos-mono')).toHaveText('report-q3.pdf');
          await expect(carta.locator('.talos-approval__why')).toHaveText(molti > 1
            ? (en ? 'TALOS wants to send this file to Pixel 9, one of your 3 paired devices. It appears in this conversation on the device, ready to download.' : 'TALOS vuole mandare questo file a Pixel 9, uno dei tuoi 3 dispositivi collegati. Compare in questa conversazione sul dispositivo, pronto da scaricare.')
            : (en ? 'TALOS wants to send this file to Pad di Nino. It appears in this conversation on the device, ready to download.' : 'TALOS vuole mandare questo file a Pad di Nino. Compare in questa conversazione sul dispositivo, pronto da scaricare.'));
          await expect(carta.locator('[data-invio-file] .talos-file-scaricabile__nome')).toHaveText('report-q3.pdf');
          await expect(carta.locator('[data-invio-file] .talos-file-scaricabile__scarica')).toHaveCount(0);
          await expect(carta.locator('[data-invio-file] .talos-remoto-riga__nome')).toHaveText(dispositivo.nome);
          await expect(carta.locator('[data-approva-una-volta]')).toHaveText(en ? 'Send' : 'Invia');
          await expect(carta.locator('[data-nega]')).toHaveText(en ? 'Don’t send' : 'Non inviare');
          await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
          await carta.scrollIntoViewIfNeeded();
          await page.mouse.move(1900, 1070);
          await foto(page, testInfo, scena);
          await carta.locator('[data-approva-una-volta]').click();
          await expect.poll(() => fermate.length).toBe(1);
          expect(fermate[0]).toMatch(/"requestId":"invio-1".*"approvato":true/u);
        });
      }

      test(`INV-B-3b — Accesso pieno: niente carta; «Not asked» sulla riga e «Sent without asking» col file e il dispositivo; la scheda dice «Sent to» (${lingua} ${modo})`, async ({ page }, testInfo) => {
        await prepara(page);
        await giroInvio(page);
        await eventi(page, [...attrezzo('c-fa', 'report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer offerta-fa). Full access: done without asking the person.'),
          { type: 'TextMessageStart', messageId: 'm-fa' }, { type: 'TextMessageContent', messageId: 'm-fa', delta: en ? 'Sent. It is in this conversation on Pad di Nino, ready to download.' : 'Inviata. È in questa conversazione su Pad di Nino, pronta da scaricare.' }, { type: 'TextMessageEnd', messageId: 'm-fa' },
          { type: 'RunFinished' }]);
        const riga = page.locator('.talos-tool-row').filter({ hasText: en ? 'Sending a file to a device' : 'Invio di un file a un dispositivo' }).last();
        await expect(riga.locator('.talos-tool-row__detail')).toHaveText('report-q3.pdf → Pad di Nino');
        await expect(riga.locator('.talos-tool-row__senza-carta')).toBeVisible();
        const blocco = page.locator('[data-telefoni-senza-carta]');
        await expect(blocco.locator('b')).toHaveText(en ? 'Sent without asking: Full access is on' : 'Inviato senza chiedere: è attivo l’Accesso pieno');
        await expect(blocco.locator('p')).toHaveText(en ? 'report-q3.pdf was sent to Pad di Nino. With Full access TALOS does not ask.' : 'report-q3.pdf è stato inviato a Pad di Nino. Con l’Accesso pieno TALOS non chiede.');
        await expect(blocco.locator('button')).toHaveCount(0);
        /* 3b, owner 25/10: il corpo della riga porta SOLO la frase per la persona — niente `path:` né l'esito grezzo per il modello */
        const corpoRiga = page.locator(`[id="${await riga.getAttribute('aria-controls')}"]`);
        await expect(corpoRiga.locator(':scope > *')).toHaveCount(1);
        await expect(corpoRiga.locator(':scope > [data-telefoni-senza-carta]')).toHaveCount(1);
        await expect(corpoRiga).not.toContainText('path');
        await expect(corpoRiga).not.toContainText('offer offerta-fa');
        const scheda = page.locator('[data-offerta-id="offerta-fa"]');
        await expect(scheda.locator('[data-invio-stato]')).toHaveText(en ? 'Sent to Pad di Nino · not downloaded yet' : 'Inviato a Pad di Nino · non ancora scaricato');
        await page.locator('[data-request-id]').waitFor({ state: 'detached', timeout: 50 }).catch(() => null);
        await expect(page.locator('[data-request-id]')).toHaveCount(0);
        /* il dettaglio della riga, aperto come lo apre la persona (clic sulla testa dell'attività e sulla riga) */
        if (await blocco.isHidden()) await riga.click({ timeout: 2000 }).catch(() => null);
        await scheda.scrollIntoViewIfNeeded();
        await page.mouse.move(1900, 1070);
        await foto(page, testInfo, '3b-accesso-pieno');
      });

      test(`INV-B-4a — gli stati: scaricato con l'ora (verde), in scaricamento con la % (live, anche dall'evento dello stream), inviato a uno fuori linea (giallo) (${lingua} ${modo})`, async ({ page }, testInfo) => {
        const scaricatoAlle = new Date(); scaricatoAlle.setHours(20, 31, 0, 0);
        await prepara(page, {
          dispositivi: [PAD, PIXEL, TAB],
          offerte: [
            { offertaId: 'o-pad', dispositivoId: PAD.id, nome: 'report-q3.pdf', dimensione: 2_516_582, stato: 'scaricato', percentuale: 100, scaricatoAlle: scaricatoAlle.getTime(), percorso: 'C:\\S\\report-q3.pdf' },
            { offertaId: 'o-tab', dispositivoId: TAB.id, nome: 'q3.md', dimensione: 1_126, stato: 'inviato', percentuale: 0, percorso: 'C:\\S\\notes\\q3.md' },
          ],
          flusso: [{ type: 'file.offer', offerta: { offertaId: 'o-pix', dispositivoId: PIXEL.id, nome: 'sales-chart.png', dimensione: 860_160, stato: 'in-scaricamento', percentuale: 62, percorso: 'C:\\S\\sales-chart.png' } }],
        });
        await giroInvio(page, en ? 'Send the report to the Pad, the sales chart to the Pixel and the notes to the Tab.' : 'Manda la relazione al Pad, il grafico delle vendite al Pixel e le note al Tab.');
        await eventi(page, [
          ...attrezzo('s1', 'report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer o-pad).', 'tel-pad-'),
          ...attrezzo('s2', 'sales-chart.png', 'Sent "sales-chart.png" (840.0 KB) to "Pixel 9" (id tel-pixe): it appears in this conversation on the device, ready to download (offer o-pix).', 'tel-pixe'),
          ...attrezzo('s3', 'notes/q3.md', 'Sent "q3.md" (1.1 KB) to "Galaxy Tab" (id tel-tab-): it is offline now and gets the file in this conversation when it connects again (offer o-tab).', 'tel-tab-'),
          { type: 'TextMessageStart', messageId: 'm-s' }, { type: 'TextMessageContent', messageId: 'm-s', delta: en ? 'Sent: the report to Pad di Nino, the chart to Pixel 9, the notes to Galaxy Tab. Each file is in this conversation on its device.' : 'Inviati: la relazione a Pad di Nino, il grafico a Pixel 9, le note a Galaxy Tab. Ogni file è in questa conversazione sul suo dispositivo.' }, { type: 'TextMessageEnd', messageId: 'm-s' },
          { type: 'RunFinished' }]);
        const stato = (id) => page.locator(`[data-offerta-id="${id}"] [data-invio-stato]`);
        await expect(stato('o-pad')).toHaveText(en ? 'Downloaded on Pad di Nino · 20:31' : 'Scaricato su Pad di Nino · 20:31');
        await expect(stato('o-pad')).toHaveAttribute('data-tono', 'success');
        await expect(stato('o-pix')).toHaveText(en ? 'Downloading on Pixel 9 · 62%' : 'In scaricamento su Pixel 9 · 62%');
        await expect(stato('o-pix')).toHaveAttribute('data-tono', 'live');
        await expect(stato('o-tab')).toHaveText(en ? 'Galaxy Tab is offline: it gets the file when it connects again' : 'Galaxy Tab non è in linea: riceve il file quando si collega di nuovo');
        await expect(stato('o-tab')).toHaveAttribute('data-tono', 'warning');
        await expect(page.locator('[data-offerta-id="o-pad"] .talos-file-scaricabile__misura').first()).toHaveText(en ? 'PDF · 2.4 MB' : 'PDF · 2,4 MB');
        await expect(page.locator('[data-invio-rimanda]')).toHaveCount(0);
        /* 4a, owner 25/10: la scheda dice il percorso DENTRO il progetto, come il bozzetto («notes/q3.md»), non solo il nome */
        const nome = (id) => page.locator(`[data-offerta-id="${id}"] .talos-file-scaricabile__nome`);
        await expect(nome('o-tab')).toHaveText('notes/q3.md');
        await expect(nome('o-pad')).toHaveText('report-q3.pdf');
        const att = page.locator('[data-offerta-id="o-pad"]').locator('xpath=ancestor::*[contains(@class,"talos-activity")][1]');
        await expect(att.locator(':scope > .talos-activity__head')).toContainText(en ? 'Sending files to devices ×3' : 'Invio di file ai dispositivi ×3');
        await page.locator('#conversation .talos-message--user').last().scrollIntoViewIfNeeded();
        await page.mouse.move(1900, 1070);
        await foto(page, testInfo, '4a-stati');
      });

      test(`INV-B-4a-assoluto — al contrario: un percorso assoluto del PC o che esce dal progetto non va sulla scheda, resta il nome (${lingua} ${modo})`, async ({ page }) => {
        await prepara(page, { dispositivi: [PAD] });
        await giroInvio(page);
        await eventi(page, [
          ...attrezzo('a1', 'C:\\Users\\Nino\\progetto\\notes\\q3.md', 'Sent "q3.md" (1.1 KB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer o-ass).'),
          ...attrezzo('a2', '../fuori/report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer o-fuori).'),
          { type: 'RunFinished' }]);
        await expect(page.locator('[data-offerta-id="o-ass"] .talos-file-scaricabile__nome')).toHaveText('q3.md');
        await expect(page.locator('[data-offerta-id="o-fuori"] .talos-file-scaricabile__nome')).toHaveText('report-q3.pdf');
        expect((await page.locator('#conversation .talos-file-scaricabile__nome').allTextContents()).join(' | ')).not.toMatch(/Users|fuori|\.\./u);
      });

      test(`INV-B-4b — gli errori: file cambiato (rosso, «Send again» solo lì, che rimanda), fuori linea (giallo), troppo grande (riga «non eseguita» e scheda rossa) (${lingua} ${modo})`, async ({ page }, testInfo) => {
        const { fermate } = await prepara(page, {
          dispositivi: [PAD, TAB],
          offerte: [
            { offertaId: 'o-gone', dispositivoId: PAD.id, nome: 'report-q3.pdf', dimensione: 2_516_582, stato: 'cambiato', percorso: 'C:\\S\\report-q3.pdf' },
            { offertaId: 'o-off', dispositivoId: TAB.id, nome: 'sales-chart.png', dimensione: 860_160, stato: 'inviato', percorso: 'C:\\S\\sales-chart.png' },
          ],
        });
        await giroInvio(page, en ? 'Send the report, the video and the sales chart to my devices.' : 'Manda la relazione, il video e il grafico delle vendite ai miei dispositivi.');
        await eventi(page, [
          ...attrezzo('e1', 'report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer o-gone).', 'tel-pad-'),
          ...attrezzo('e2', 'sales-chart.png', 'Sent "sales-chart.png" (840.0 KB) to "Galaxy Tab" (id tel-tab-): it is offline now and gets the file in this conversation when it connects again (offer o-off).', 'tel-tab-'),
          ...attrezzo('e3', 'demo-video.mp4', 'REFUSED. FILE_TOO_LARGE: "demo-video.mp4" is 31.2 MB (32715571 bytes) and a device takes files up to 25 MB. Nothing was sent.', 'tel-pad-'),
          { type: 'TextMessageStart', messageId: 'm-e' }, { type: 'TextMessageContent', messageId: 'm-e', delta: en ? 'I sent what fits. The video is over the 25 MB a device takes, so it stayed here.' : 'Ho mandato quello che ci sta. Il video supera i 25 MB che un dispositivo accetta, quindi è rimasto qui.' }, { type: 'TextMessageEnd', messageId: 'm-e' },
          { type: 'RunFinished' }]);
        const gone = page.locator('[data-offerta-id="o-gone"]');
        await expect(gone.locator('[data-invio-stato]')).toHaveText(en ? 'Pad di Nino could not download it: the file changed after it was sent' : 'Pad di Nino non è riuscito a scaricarlo: il file è cambiato dopo l’invio');
        await expect(gone.locator('[data-invio-stato]')).toHaveAttribute('data-tono', 'danger');
        await expect(gone.locator('[data-invio-rimanda]')).toHaveText(en ? 'Send again' : 'Invia di nuovo');
        await expect(page.locator('[data-invio-rimanda]')).toHaveCount(1);
        await expect(page.locator('[data-offerta-id="o-off"] [data-invio-stato]')).toHaveAttribute('data-tono', 'warning');
        const troppo = page.locator('[data-invio-troppo]');
        await expect(troppo.locator('[data-invio-stato]')).toHaveText(en ? 'Not sent: 31 MB, and a device takes files up to 25 MB' : 'Non inviato: 31 MB, e un dispositivo accetta file fino a 25 MB');
        const rigaTroppo = page.locator('.talos-tool-row').filter({ hasText: en ? 'Too large for a device' : 'Troppo grande per un dispositivo' });
        await expect(rigaTroppo).toHaveAttribute('data-tool-state', 'not-run');
                await page.locator('#conversation .talos-message--user').last().scrollIntoViewIfNeeded();
        await page.mouse.move(1900, 1070);
        await foto(page, testInfo, '4b-errori');
        await gone.locator('[data-invio-rimanda]').click();
        await expect.poll(() => fermate.length).toBe(1);
        expect(fermate[0]).toMatch(/\/offers \{"percorso":"C:\\\\S\\\\report-q3\.pdf","dispositivo":"tel-pad-0001"\}$/u);
        /* rimandata, la scheda porta l'offerta NUOVA (l'id cambia) e torna «inviato», senza «Invia di nuovo» */
        const rimandata = page.locator('[data-offerta-id^="nuova-"]');
        await expect(rimandata.locator('[data-invio-stato]')).toHaveText(en ? 'Sent to Pad di Nino · not downloaded yet' : 'Inviato a Pad di Nino · non ancora scaricato');
        await expect(rimandata).toContainText('report-q3.pdf');
        await expect(page.locator('[data-invio-rimanda]')).toHaveCount(0);
      });
    });
  }
}
