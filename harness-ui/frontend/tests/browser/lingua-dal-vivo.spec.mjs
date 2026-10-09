import { expect, test } from '@playwright/test';

/*
 * Owner 03/10/2026, «Ridisegno dal vivo (Consigliato)»: cambiata la lingua nelle Impostazioni, ogni superficie visibile si
 *   ridisegna subito nella lingua nuova, SENZA ricaricare la pagina; un giro che sta lavorando non si interrompe e la sua
 *   conversazione si rilegge quando finisce. Prima si aggiornavano solo Terminale, Browser e Impostazioni.
 * La lingua si cambia dal controllo vero (`#setting-uiLanguageSelect`, evento `change`). La riga della prova NOT RUN è
 *   scritta da `app.js` col dizionario (`kernel.prova.nessunTestRiga`): è il testimone della conversazione.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
const NON_ESEGUITA = 'NOT RUN: NO_TESTS_RAN — the test command ran and exited 0, but no tests ran: this is not a pass. Create the suite or point the command at the folder that has one.\nThe runner said: ℹ tests 0';
const INIZIO = [
  { type: 'RunStarted', input: { consegna: 'Lancia i test.' } },
  { type: 'ToolCallStart', toolCallId: 'v-t1', toolCallName: 'prova' },
  { type: 'ToolCallArgs', toolCallId: 'v-t1', delta: '{}' },
  { type: 'ToolCallResult', toolCallId: 'v-t1', content: NON_ESEGUITA },
];
const FINE = [
  { type: 'TextMessageStart', messageId: 'v-m1' },
  { type: 'TextMessageContent', messageId: 'v-m1', delta: 'Fatto.' },
  { type: 'TextMessageEnd', messageId: 'v-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
];
const numera = (lista) => lista.map((e, i) => ({ ...e, _sequenza: 1 + i }));

async function apri(page, sessione, storie, { conclusa }) {
  const conti = { nonGet: 0, letture: 0 };
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${sessione}/events`) {
      const storia = storie[Math.min(conti.letture, storie.length - 1)];
      conti.letture += 1;
      const corpo = [...storia, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${corpo.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    /* ⛔ 09/10/2026 (bugfixer) — la barra delle sessioni contava sulle sessioni VERE del 4174: sul server di prova l'archivio è
       vuoto («Sessions 0») e non c'era nessun «done» da tradurre. L'elenco vero si legge e ci si aggiunge la sessione della
       prova col SUO stato, nella forma di una riga di `GET /api/v1/sessions` (letta dal 4174 il 09/10). */
    if (url.pathname === '/api/v1/sessions') {
      const vera = await (await route.fetch()).json();
      const righe = Array.isArray(vera?.data?.items) ? vera.data.items : [];
      if (!righe.some((r) => r.sessionId === sessione)) {
        righe.unshift({ sessionId: sessione, taskId: 'lingua-dal-vivo', progetto: null, nome: 'Lingua dal vivo', avviataAlle: '2026-10-03T09:00:00.000Z',
          conclusa, interrotta: false, modello: 'z-ai/glm-5.3-flash', padreId: null, profonditaDelega: 0 });
      }
      return route.fulfill({ json: { ...vera, data: { ...vera.data, items: righe } } });
    }
    if (url.pathname === `/api/v1/sessions/${sessione}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${sessione}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(([s, conclusa]) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Lingua dal vivo', 'z-ai/glm-5.3-flash', { conclusa }), [sessione, conclusa]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await page.evaluate(() => { window.__nessunaRicarica = true; });
  return conti;
}
const inInglese = (page) => page.evaluate(() => {
  const sel = document.querySelector('#setting-uiLanguageSelect');
  sel.value = 'en';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
const riga = (page) => page.locator('#conversation .talos-tool-row').filter({ hasText: /Test non eseguiti|Tests not run/u }).first();

test('LINGUA-DAL-VIVO — una conversazione ferma si rilegge subito nella lingua nuova, senza ricaricare la pagina', async ({ page }) => {
  const conti = await apri(page, 'lingua-dal-vivo-ferma', [numera([...INIZIO, ...FINE])], { conclusa: true });
  await expect(riga(page)).toContainText('Test non eseguiti');
  await inInglese(page);
  await expect(riga(page)).toContainText('Tests not run');
  expect(await page.evaluate(() => window.__nessunaRicarica), 'la pagina non si è ricaricata').toBe(true);
  expect(conti.letture, 'la storia si è riletta dal server').toBe(2);
  /* la barra delle sessioni (le sessioni vere del 4174, tutte concluse) parla la lingua nuova */
  /* «done ·» e non `\bdone\b`: nel testo della riga il titolo e lo stato stanno in due elementi senza spazio fra loro
     («Lingua dal vivodone · …»), e il confine di parola non c'è. In italiano sarebbe «conclusa ·». */
  await expect(page.locator('#sessionList')).toContainText('done ·');
  await expect(page.locator('#sessionList')).not.toContainText('conclusa ·');
  expect(conti.nonGet).toBe(0);
});

test('LINGUA-DAL-VIVO — un giro che lavora non si interrompe: la conversazione si rilegge quando finisce', async ({ page }) => {
  const conti = await apri(page, 'lingua-dal-vivo-in-corso', [numera(INIZIO), numera([...INIZIO, ...FINE])], { conclusa: false });
  await expect(riga(page)).toContainText('Test non eseguiti');
  await inInglese(page);
  /* il giro è vivo: niente rilettura, la riga resta com'era */
  await page.waitForTimeout(500);
  expect(conti.letture, 'durante il giro la storia non si rilegge').toBe(1);
  await expect(riga(page)).toContainText('Test non eseguiti');
  /* il giro finisce: adesso si rilegge, nella lingua nuova */
  await page.evaluate(() => { const rt = window.__talosHarnessUiRuntime; rt.handleRealEvent({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 50 }, rt.realSessionState.generation); });
  await expect.poll(() => conti.letture).toBe(2);
  await expect(riga(page)).toContainText('Tests not run');
  expect(await page.evaluate(() => window.__nessunaRicarica)).toBe(true);
  expect(conti.nonGet).toBe(0);
});
