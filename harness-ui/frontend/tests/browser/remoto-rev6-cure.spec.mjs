import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

/*
 * Revisione a blocco 6 (25/10/2026, `REVISIONE-BLOCCO-6-2026-10-25.md`) — le cure della FINESTRA, ognuna nel verso che prima falliva:
 *   · REV6-F2: lo stato di un'offerta va sulla scheda del SUO file (uguaglianza col percorso dentro la cartella, non il suffisso);
 *   · REV6-F3: col percorso assoluto del modello, la scheda usa quello dentro la cartella che l'esito porta (`path "…"`);
 *   · REV6-F5: senza niente da mostrare la riga dell'invio non si apre;
 *   · decisioni dell'owner del 25/10: (a) l'invio fallito a parole, il grezzo sotto «Technical details»; (b) la conferma del primo
 *     «Allow» resta SOPRA la carta successiva; (c) scaricato e poi cambiato ⇒ «Downloaded» e «Send the new version» nel menu.
 * Le rotte `/api/v1/remote…` sono intercettate: ogni richiesta che non è una lettura si ferma e si conta. Le foto (1920×1080) vanno in
 * TALOS_FOTO_DIR, se data. Le scene pesano: en e it, scuro e chiaro, ma le asserzioni sono le stesse.
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const ORA = Date.now();
const PAD = { id: 'tel-pad-0001', nome: 'Pad di Nino', collegatoAlle: ORA - 86_400_000, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 } };
const PIXEL = { id: 'tel-pixel-002', nome: 'Pixel 9', collegatoAlle: ORA - 10 * 86_400_000, inLinea: true, percorso: { tipo: 'relay', rttMs: 140 } };
const FOTO = process.env.TALOS_FOTO_DIR || null;
if (FOTO) mkdirSync(FOTO, { recursive: true });

for (const lingua of ['en', 'it']) {
  for (const modo of ['dark', 'light']) {
    test.describe(`REV6 ${lingua} · ${modo}`, () => {
      test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, locale: lingua === 'it' ? 'it-IT' : 'en-US' });
      const en = lingua === 'en';
      const sid = `rev6-cure-${modo}-${lingua}`;

      async function prepara(page, { dispositivi = [PAD], offerte = [] } = {}) {
        const fermate = [];
        const banco = { dispositivi, offerte };
        await page.addInitScript(({ colorMode, uiLanguage }) => {
          try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage }, chat: { model: 'z-ai/glm-5.3-flash' } })); } catch { /* sandbox */ }
        }, { colorMode: modo, uiLanguage: lingua });
        await page.route('**/api/v1/sessions/rev6-cure-*/events*', () => { /* aperto e muto */ });
        await page.route(/\/api\/v1\/remote(\/.*)?$/u, async (route) => {
          const req = route.request();
          const url = new URL(req.url());
          if (url.pathname === '/api/v1/remote/events') return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'remote.changed', motivo: 'connesso' })}\n\n` });
          if (req.method() !== 'GET') { fermate.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
          if (/\/offers$/u.test(url.pathname)) return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ offerte: banco.offerte }) });
          return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' },
            inLinea: banco.dispositivi.filter((d) => d.inLinea).map((d) => d.id), telefoni: banco.dispositivi, attese: [], accoppiamento: { sbagliati: 0 } }) });
        });
        await page.goto('/');
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
        await page.evaluate(({ id }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'rev6', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
          r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
          let s = 0;
          window.__rev6Seq = () => (s += 1);
        }, { id: sid });
        return { fermate, banco };
      }
      const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent({ ...e, _sequenza: window.__rev6Seq() }, r.realSessionState.generation); }, lista);
      const giro = (page, domanda = 'Send me the report on the Pad.') => eventi(page, [{ type: 'RunStarted', input: { consegna: domanda }, contesto: { modello: 'z-ai/glm-5.3-flash' } }]);
      const attrezzo = (id, path, content) => [
        { type: 'ToolCallStart', toolCallId: id, toolCallName: 'remote_device_send_file' },
        { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ path }) },
        { type: 'ToolCallEnd', toolCallId: id },
        { type: 'ToolCallResult', toolCallId: id, content },
      ];
      const rigaInvio = (page) => page.locator('.talos-tool-row').filter({ hasText: en ? 'Sending a file to a device' : 'Invio di un file a un dispositivo' }).last();
      const foto = async (page, nome) => { if (!FOTO) return; await page.mouse.move(1900, 1070); await page.waitForTimeout(250); await page.screenshot({ path: `${FOTO}/rev6-${nome}-${modo}-${lingua}.png` }); };

      test(`REV6-F2 — stesso nome in due cartelle: lo stato va sulla scheda di sub/notes.txt (${lingua} ${modo})`, async ({ page }) => {
        const { banco, fermate } = await prepara(page);
        banco.offerte = [{ offertaId: 'o-sub', dispositivoId: PAD.id, nome: 'notes.txt', percorso: 'C:/w/progetto/sub/notes.txt', relativo: 'sub/notes.txt', stato: 'scaricato', scaricatoAlle: ORA, dimensione: 5, inviataAlle: ORA }];
        await giro(page, 'two notes');
        /* le schede dei file nascono nella card del lotto di un attrezzo (`schedaFileDellaChat` dallo StateDelta con `allegato`) */
        await eventi(page, [
          { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'document_create' },
          { type: 'ToolCallResult', toolCallId: 'd1', content: 'Created sub/notes.txt and notes.txt.' },
          { type: 'StateDelta', delta: [{ op: 'add', path: '/file/sub/notes.txt', value: '', allegato: { nome: 'notes.txt', formato: 'txt', byte: 5 } }] },
          { type: 'StateDelta', delta: [{ op: 'add', path: '/file/notes.txt', value: '', allegato: { nome: 'notes.txt', formato: 'txt', byte: 6 } }] },
          { type: 'RunFinished' },
        ]);
        await expect.poll(() => page.locator('[data-offerta-id="o-sub"]').count(), { timeout: 5_000 }).toBe(1);
        const schede = await page.locator('.talos-file-scaricabile[data-percorso-file]').evaluateAll((l) => l.map((s) => [s.dataset.percorsoFile, s.dataset.offertaId ?? null]));
        expect(schede.find(([p]) => p === 'sub/notes.txt')?.[1]).toBe('o-sub');
        expect(schede.find(([p]) => p === 'notes.txt')?.[1] ?? null).toBeNull();
        expect(fermate).toEqual([]);
      });

      test(`REV6-F3 + F5 — percorso assoluto dal modello: la scheda usa quello dentro la cartella; la riga senza Accesso pieno non si apre (${lingua} ${modo})`, async ({ page }) => {
        const { fermate } = await prepara(page);
        await giro(page);
        await eventi(page, [...attrezzo('c10', 'C:/w/progetto/docs/report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer offerta-10, path "docs/report-q3.pdf").'), { type: 'RunFinished' }]);
        const scheda = page.locator('[data-offerta-id="offerta-10"]');
        await expect(scheda).toHaveCount(1);
        expect(await scheda.getAttribute('data-percorso-file')).toBe('docs/report-q3.pdf');
        const href = await scheda.evaluate((s) => decodeURIComponent(s.querySelector('a')?.getAttribute('href') ?? ''));
        expect(href).toContain('percorso=docs/report-q3.pdf');
        expect(href).not.toContain('C:/');
        await expect(scheda.locator('.talos-file-scaricabile__nome')).toHaveText('docs/report-q3.pdf');
        /* F5 */
        const riga = rigaInvio(page);
        await riga.scrollIntoViewIfNeeded();
        expect(await riga.getAttribute('aria-controls')).toBeNull();
        expect(await riga.getAttribute('aria-expanded')).toBeNull();
        await riga.click();
        await page.waitForTimeout(300);
        expect(await riga.getAttribute('aria-expanded')).toBeNull();
        await foto(page, 'f3-f5');
        expect(fermate).toEqual([]);
      });

      test(`REV6-F6 (owner a) — un invio fallito a parole; il testo del motore solo sotto «Technical details» (${lingua} ${modo})`, async ({ page }) => {
        await prepara(page);
        await giro(page);
        await eventi(page, [
          { type: 'ToolCallStart', toolCallId: 'c11', toolCallName: 'remote_device_send_file' },
          { type: 'ToolCallArgs', toolCallId: 'c11', delta: JSON.stringify({ path: '../secret.txt' }) },
          { type: 'ToolCallEnd', toolCallId: 'c11' },
          { type: 'ToolCallResult', toolCallId: 'c11', content: 'REFUSED. That file is not in this conversation\'s folder. Nothing was sent.', esito: 'error' },
          { type: 'RunFinished' },
        ]);
        /* la riga fallita mostra la frase AL POSTO del nome dell'attrezzo: si prende l'ultima riga d'attrezzo, in errore */
        const riga = page.locator('.talos-tool-row[data-tool-state="error"]').last();
        const frase = en ? 'The file is outside this conversation\'s folder. Nothing was sent.' : 'Il file è fuori dalla cartella di questa conversazione. Non è partito niente.';
        await expect(riga.locator('.talos-tool-row__detail')).toHaveText(frase);
        await riga.click();
        const id = await riga.getAttribute('aria-controls');
        const corpo = page.locator(`[id="${id}"]`);
        await expect(corpo.locator('.talos-invio-file__errore')).toHaveText(frase);
        const tecnico = corpo.locator('details.talos-invio-file__tecnico');
        await expect(tecnico.locator('summary')).toHaveText(en ? 'Technical details' : 'Dettagli tecnici');
        expect(await tecnico.evaluate((d) => d.open)).toBe(false);
        await expect(tecnico.locator('pre')).toBeHidden();
        await foto(page, 'f6-errore');
      });

      test(`owner (c) — scaricato e poi cambiato: resta «Downloaded», il menu offre «Send the new version», senza doppioni (${lingua} ${modo})`, async ({ page }) => {
        const { banco, fermate } = await prepara(page);
        banco.offerte = [{ offertaId: 'offerta-12', dispositivoId: PAD.id, nome: 'report-q3.pdf', percorso: 'C:/w/progetto/report-q3.pdf', relativo: 'report-q3.pdf', stato: 'scaricato', cambiatoDopo: true, scaricatoAlle: ORA, dimensione: 2_516_582, inviataAlle: ORA }];
        await giro(page);
        await eventi(page, [...attrezzo('c12', 'report-q3.pdf', 'Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id tel-pad-): it appears in this conversation on the device, ready to download (offer offerta-12, path "report-q3.pdf").'), { type: 'RunFinished' }]);
        const scheda = page.locator('[data-offerta-id="offerta-12"]');
        await expect(scheda.locator('[data-invio-stato]')).toHaveAttribute('data-tono', 'success', { timeout: 5_000 });
        await expect(scheda.locator('[data-invio-rimanda]')).toHaveCount(0);
        await scheda.locator('[data-file-piu]').click();
        const menu = page.locator('#menuFileDellaChat');
        await expect(menu).toBeVisible();
        const voci = await menu.locator('[role=menuitem]').allTextContents();
        expect(voci[0]).toContain(en ? 'Send the new version to Pad di Nino' : 'Invia la versione nuova a Pad di Nino');
        expect(voci.filter((v) => v.includes(en ? 'Send to Pad di Nino' : 'Invia a Pad di Nino'))).toEqual([]);
        await foto(page, 'c-versione-nuova');
        expect(fermate).toEqual([]);
      });
    });
  }
}

test.describe('REV6-C1 (owner b)', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 1920, height: 1080 } });
  test('due richieste, «Allow» sulla prima: la sua conferma si vede SOPRA la carta della seconda', async ({ page }) => {
    const RICHIESTA = { type: 'consent.requested', richiestaId: 'rev6-c1-a', dispositivo: { id: 't1', nome: 'Pad di Nino' }, cartella: { nome: 'AVM', percorso: 'D:\\Projects\\AVM' }, scadeAlle: new Date(ORA + 115_000).toISOString() };
    const RICHIESTA_B = { ...RICHIESTA, richiestaId: 'rev6-c1-b', dispositivo: { id: 't2', nome: 'Pixel 9' }, cartella: { nome: 'Docs', percorso: 'D:\\Docs' }, scadeAlle: new Date(ORA + 118_000).toISOString() };
    await page.addInitScript(() => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en', colorMode: 'dark' } }));
      const vero = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...resto) => (ms === 3_000 || ms === 20_000 ? 0 : vero(fn, ms, ...resto));
    });
    const { createServer } = await import('node:http');
    const aperti = [];
    const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }); res.write(':ok\n\n'); aperti.push(res); });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    const manda = (...ev) => { for (const res of aperti) res.write(ev.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')); };
    const nonGet = [];
    try {
      await page.route('**/api/v1/remote**', async (route) => {
        const r = route.request(); const p = new URL(r.url()).pathname;
        if (p === '/api/v1/remote/events') return route.continue({ url: `http://127.0.0.1:${server.address().port}/events` });
        if (r.method() === 'POST' && /^\/api\/v1\/remote\/consents\/[^/]+\/allow$/u.test(p)) return route.fulfill({ json: { ok: true, data: { esito: 'consentita' } } });
        if (r.method() !== 'GET') { nonGet.push(`${r.method()} ${p}`); return route.fulfill({ status: 418, json: {} }); }
        if (p === '/api/v1/remote') return route.fulfill({ json: { ok: true, data: { disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: ['t1', 't2'], telefoni: [PAD, PIXEL].map((v, i) => ({ ...v, id: `t${i + 1}` })), attese: [], accoppiamento: { sbagliati: 0 }, consensi: [] } } });
        if (/\/folders$/u.test(p)) return route.fulfill({ json: { ok: true, data: { cartelle: [] } } });
        return route.fulfill({ status: 404, json: { ok: false } });
      });
      await page.goto('/');
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
      await expect.poll(() => aperti.length, { timeout: 5_000 }).toBe(1);
      manda({ type: 'remote.changed', motivo: 'connesso' });
      manda(RICHIESTA, RICHIESTA_B);
      const carta = page.locator('[data-remoto-consenso]');
      await expect(carta).toHaveCount(1);
      await expect(page.locator('[data-remoto-consenti]:not([data-in-armamento])')).toHaveCount(1, { timeout: 5_000 });
      await page.locator('[data-remoto-consenti]').click();
      const conferma = page.locator('[data-remoto-conferma]');
      await expect(conferma).toHaveCount(1);
      await expect(carta).toHaveCount(1);
      await expect(carta).toContainText('Pixel 9');
      const [c, k] = await Promise.all([conferma.boundingBox(), carta.boundingBox()]);
      expect(c.y + c.height).toBeLessThanOrEqual(k.y + 1);
      /* resta per i suoi secondi: dopo 1,5 s c'è ancora */
      await page.waitForTimeout(1500);
      await expect(conferma).toHaveCount(1);
      if (FOTO) await page.screenshot({ path: `${FOTO}/rev6-c1-conferma-sopra-dark-en.png` });
      expect(nonGet).toEqual([]);
    } finally {
      for (const res of aperti.splice(0)) res.destroy();
      server.closeAllConnections?.();
      await new Promise((ok) => server.close(() => ok()));
    }
  });
});
