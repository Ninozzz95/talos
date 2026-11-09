import { expect, test } from '@playwright/test';

/*
 * R-44 (31/10/2026), domanda del Mobile: «sul PC la carta dice davvero "non eseguita"?». No: misurato prima della cura, una chiamata
 *   annullata dal kernel risultava fra le riuscite. Da quando il giro si rifà da solo, sta accanto alla sua copia riuscita.
 * Il giro arriva come la storia di una sessione riaperta (stesse forme di `doppione-saltato.spec.mjs`). Il testo dell'annullo è quello
 *   del kernel (`talosHarness.mjs`, `consumaFlussoSSE`), non inventato.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
const SEG = '#conversation .talos-activity--segment';
const ANNULLO = '⛔ The connection to the provider dropped before this call was complete: it was not run.';

const chiamata = (id, nome, argomenti, esito) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: nome },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti) },
  { type: 'ToolCallResult', toolCallId: id, ...esito },
];

/* La scrittura rifatta dopo la caduta: lo StateDelta arriva per lei sola, e il diff non deve finire sulla carta annullata. */
const rifatta = [
  { type: 'RunStarted', input: { consegna: 'Scrivi la nota.' } },
  ...chiamata('r-1', 'scrivi', { percorso: 'nota.txt', contenuto: 'x' }, { content: ANNULLO, isError: true, outcome: 'cancelled' }),
  ...chiamata('r-2', 'scrivi', { percorso: 'nota.txt', contenuto: 'x' }, { content: 'File nota.txt scritto.' }),
  { type: 'StateDelta', delta: [{ op: 'add', path: '/file/nota.txt', prima: null, value: 'x\n' }] },
  { type: 'TextMessageStart', messageId: 'r-m1' },
  { type: 'TextMessageContent', messageId: 'r-m1', delta: 'Fatto.' },
  { type: 'TextMessageEnd', messageId: 'r-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: 1 + i }));

const giro = (conIlCampo) => [
  { type: 'RunStarted', input: { consegna: 'Scrivi la nota e lancia il comando.' } },
  ...chiamata('a-1', 'scrivi', { percorso: 'nota.txt', contenuto: 'x' }, { content: ANNULLO, isError: true, ...(conIlCampo ? { outcome: 'cancelled' } : {}) }),
  ...chiamata('a-2', 'shell', { comando: 'npm run build' }, { content: ANNULLO, isError: true, ...(conIlCampo ? { outcome: 'cancelled' } : {}) }),
  ...chiamata('a-3', 'leggi', { percorso: 'package.json' }, { content: '{ "name": "progetto" }' }),
  { type: 'TextMessageStart', messageId: 'a-m1' },
  { type: 'TextMessageContent', messageId: 'a-m1', delta: 'Fatto.' },
  { type: 'TextMessageEnd', messageId: 'a-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: 1 + i }));

async function apri(page, conIlCampo, eventi = giro(conIlCampo)) {
  const conti = { nonGet: 0 };
  const sessione = `chiamata-annullata-${eventi === rifatta ? 'rifatta' : eventi.some((e) => e.interrotta) ? 'interrotta' : conIlCampo ? 'si' : 'no'}`;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${sessione}/events`) {
      const storia = [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (url.pathname === `/api/v1/sessions/${sessione}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${sessione}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Chiamata annullata', 'z-ai/glm-5.3-flash', { conclusa: true }), sessione);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return conti;
}

test('CHIAMATA-ANNULLATA-01 — si legge «non eseguita», mai riuscita e mai fra gli errori', async ({ page }) => {
  const conti = await apri(page, true);
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__descrizione')).toContainText('2 chiamate non eseguite');
  await expect(seg.locator('.talos-activity__errore')).toHaveText('');
  await expect(seg).not.toContainText(/non riuscit/u);
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="not-run"]')).toHaveCount(2);
  await expect(seg.locator('.talos-tool-row[data-tool-state="not-run"]').first()).not.toContainText(/Scritt|Eseguit/u); // il verbo al passato direbbe il contrario
  await expect(seg.locator('.talos-tool-row[data-tool-state="error"]')).toHaveCount(0);
  await expect(seg.locator('.talos-tool-row[data-tool-state="complete"]')).toHaveCount(1); // la lettura vera resta riuscita
  expect(conti.nonGet, 'nessuna scrittura verso il server').toBe(0);
});

test('CHIAMATA-ANNULLATA-02, al contrario — a decidere è il campo, non il testo dell\'annullo', async ({ page }) => {
  await apri(page, false);
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__descrizione')).not.toContainText('non eseguit');
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="not-run"]')).toHaveCount(0);
});

test('CHIAMATA-ANNULLATA-03 — il diff della scrittura rifatta sta sulla sua riga, non su quella annullata', async ({ page }) => {
  await apri(page, true, rifatta);
  const seg = page.locator(SEG).last();
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="not-run"] .tool-note-diff')).toHaveCount(0);
  await expect(seg.locator('.talos-tool-row[data-tool-state="complete"] .tool-note-diff')).toHaveCount(1);
});

test('CHIAMATA-ANNULLATA-04 — una lettura partita e persa nella caduta si dice interrotta, mai riuscita', async ({ page }) => {
  const eventi = [
    { type: 'RunStarted', input: { consegna: 'Leggi.' } },
    ...chiamata('i-1', 'leggi', { percorso: 'a.txt' }, { content: '⛔ This read had started, but its result was not kept.', isError: true, interrotta: true }),
    ...chiamata('i-2', 'leggi', { percorso: 'b.txt' }, { content: 'testo' }),
    ...chiamata('i-3', 'leggi', { percorso: 'c.txt' }, { content: 'testo' }),
    { type: 'TextMessageStart', messageId: 'i-m1' },
    { type: 'TextMessageContent', messageId: 'i-m1', delta: 'Fatto.' },
    { type: 'TextMessageEnd', messageId: 'i-m1' },
    { type: 'RunFinished', outcome: { type: 'success' } },
  ].map((e, i) => ({ ...e, _sequenza: 1 + i }));
  await apri(page, true, eventi);
  const seg = page.locator(SEG).last();
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="interrupted"]')).toHaveCount(1);
  await expect(seg.locator('.talos-tool-row[data-tool-state="complete"]')).toHaveCount(2);
});
