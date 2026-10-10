import { expect, test } from '@playwright/test';

/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 3) — dopo `conversation_search` il
 *   modello scrive `[titolo](talos://conversazione/<id>)`: in chat diventa un pulsante che apre quella conversazione, come la
 *   barra laterale. Server di prova (4176), mai il 4174; ogni non-GET si ferma e si conta.
 */
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);
const ALTRA = { sessionId: 'conv-altra', taskId: 'workspace', nome: 'Saluto pirata', modello: 'z-ai/glm-5.3-flash', avviataAlle: '2026-09-26T10:00:00.000Z',
  conclusa: true, interrotta: false, usage: null, inAttesaApprovazione: false, inAttesaDomanda: false };

async function apri(page, sid, elenco) {
  for (const id of [sid, ALTRA.sessionId]) {
    await page.route(`**/api/v1/sessions/${id}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([]) }));
    await page.route(`**/api/v1/sessions/${id}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
    await page.route(`**/api/v1/sessions/${id}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  }
  await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: elenco }, meta: { schema: 'talos.harness-ui.api.v1' } }) })
    : route.fallback());
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(`${r.method()} ${r.url()}`); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Corrente', 'z-ai/glm-5.3-flash', { conclusa: false }), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await evento(page, { type: 'RunStarted', _sequenza: 1, input: { consegna: 'di cosa parlavamo?' }, contesto: { cartella: 'C:\\p' } });
  await evento(page, { type: 'TextMessageStart', messageId: 'r1', _sequenza: 2 });
  await evento(page, { type: 'TextMessageContent', messageId: 'r1', _sequenza: 3, delta: `Ne abbiamo parlato in [Saluto pirata](talos://conversazione/${ALTRA.sessionId}), ieri.` });
  await evento(page, { type: 'TextMessageEnd', messageId: 'r1', _sequenza: 4 });
  return { scritture };
}

test('LINK-CONVERSAZIONE-UI — il link del modello è un pulsante che apre l’altra conversazione, come la barra laterale', async ({ page }) => {
  const { scritture } = await apri(page, 'conv-corrente', [ALTRA]);
  const link = page.locator('#conversation .talos-link-conversazione');
  await expect(link).toHaveText('Saluto pirata');
  await expect(link).toHaveAttribute('data-conversazione', ALTRA.sessionId);
  await expect(page.locator('#conversation a[href*="talos:"]')).toHaveCount(0);
  await link.click();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(ALTRA.sessionId);
  expect(scritture).toEqual([]);
});

test('LINK-CONVERSAZIONE-UI-AL-CONTRARIO — una conversazione che non c’è più lo dice e non ci porta via', async ({ page }) => {
  const { scritture } = await apri(page, 'conv-corrente-2', []);
  await page.locator('#conversation .talos-link-conversazione').click();
  await expect(page.locator('#regioneToast')).toContainText(/no longer there|non c’è più/u);
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('conv-corrente-2');
  expect(scritture).toEqual([]);
});

/* 27/09/2026 — le righe delle letture nuove hanno una frase loro: col ripiego `nome umano…` resterebbero coi puntini anche a
 * giro concluso (difetto registrato, `app.js` `riassuntoAttrezzo`, `default`). La prova gira in inglese (en.js).
 * ⛔ 03/10/2026: la suite ora è fissata all'italiano (playwright.config.mjs); questa guarda le frasi INGLESI, quindi l'inglese
 *   si chiede qui, dichiarato, invece di arrivare per caso dal locale di Chromium. */
test.describe('in inglese', () => { test.use({ locale: 'en-US' });
test('RIGHE-SEZIONI — le letture nuove si leggono a giro concluso, senza puntini e senza nomi tecnici', async ({ page }) => {
  const { scritture } = await apri(page, 'conv-righe', [ALTRA]);
  const attrezzo = async (id, nome, argomenti, esito, n) => {
    await evento(page, { type: 'ToolCallStart', toolCallId: id, toolCallName: nome, _sequenza: n });
    await evento(page, { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti), _sequenza: n + 1 });
    await evento(page, { type: 'ToolCallResult', toolCallId: id, content: esito, _sequenza: n + 2 });
  };
  await attrezzo('c1', 'memory_list', {}, 'Memory: showing 1 of 1, most recently updated first.', 10);
  await attrezzo('c2', 'conversation_search', { query: 'saluto' }, 'Conversations: 1 contain these words', 20);
  await attrezzo('c3', 'notes_read', { id: 'n1' }, 'Note «x» — id n1', 30);
  await attrezzo('c4', 'conversation_search', {}, 'Conversations: showing 1 of 1', 40);
  const testi = await page.locator('#conversation .talos-tool-row .tool-note-summary-text').allTextContents();
  for (const atteso of ['Memories listed', 'Searched the conversations: “saluto”', 'Note read', 'Board of conversations']) {
    expect(testi).toContain(atteso);
  }
  expect(testi.filter((t) => /…$|_/u.test(t))).toEqual([]);
  expect(scritture).toEqual([]);
});
});

/* Difetto 1 del 27/09 (owner, stessa notte: «1, 2 e 5 ora»): un attrezzo SENZA frase sua (qui `memory_delete`, com'era stato
 * visto) cadeva nel ripiego «nome umano…» e restava coi puntini a giro concluso. Nessuna riga conclusa finisce con «…». */
test('RIGHE-CONCLUSE — un attrezzo senza frase sua, a giro concluso, non ha i puntini', async ({ page }) => {
  const { scritture } = await apri(page, 'conv-righe-concluse', [ALTRA]);
  await evento(page, { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'memory_delete', _sequenza: 10 });
  await evento(page, { type: 'ToolCallArgs', toolCallId: 'd1', delta: JSON.stringify({ id: 'm1' }), _sequenza: 11 });
  await evento(page, { type: 'ToolCallResult', toolCallId: 'd1', content: 'Memory m1 deleted.', _sequenza: 12 });
  const testi = await page.locator('#conversation .talos-tool-row .tool-note-summary-text').allTextContents();
  expect(testi.length).toBeGreaterThan(0);
  expect(testi.filter((t) => /…$/u.test(t.trim()))).toEqual([]);
  expect(scritture).toEqual([]);
});

/* ⛔ TACCUINO (09/10/2026, bugfixer): i nomi umani degli attrezzi sono minuscoli apposta (entrano a metà frase), e il ripiego li
 * metteva così com'erano nel TITOLO della riga: in chat «risposta a un sotto-agente», nell'Indice «3 · Risposta a un sotto-agente»
 * (misurato sulla 4176). Le due forme del ripiego: la riga in corso e quella conclusa. */
test('RIGHE-MAIUSCOLA — il titolo della riga di un attrezzo senza frase sua comincia con la maiuscola, in corso e concluso', async ({ page }) => {
  const { scritture } = await apri(page, 'conv-righe-maiuscola', [ALTRA]);
  await evento(page, { type: 'ToolCallStart', toolCallId: 'm1', toolCallName: 'memory_delete', _sequenza: 10 });
  await evento(page, { type: 'ToolCallArgs', toolCallId: 'm1', delta: JSON.stringify({ id: 'm1' }), _sequenza: 11 });
  await evento(page, { type: 'ToolCallStart', toolCallId: 'm2', toolCallName: 'answer_child_question', _sequenza: 12 });
  await evento(page, { type: 'ToolCallArgs', toolCallId: 'm2', delta: JSON.stringify({ requestId: 'r1', answer: 'README' }), _sequenza: 13 });
  const leggi = async () => (await page.locator('#conversation .talos-tool-row .tool-note-summary-text').allTextContents()).map((t) => t.trim());
  const inCorso = await leggi();
  await evento(page, { type: 'ToolCallResult', toolCallId: 'm1', content: 'Memory m1 deleted.', _sequenza: 14 });
  await evento(page, { type: 'ToolCallResult', toolCallId: 'm2', content: 'Answer delivered.', _sequenza: 15 });
  const conclusi = await leggi();
  for (const [quando, testi] of [['in corso', inCorso], ['concluso', conclusi]]) {
    expect(testi.length, `${quando}: due righe ${JSON.stringify(testi)}`).toBe(2);
    expect(testi.filter((t) => t[0] !== t[0].toLocaleUpperCase('it-IT')), `${quando}: ${JSON.stringify(testi)}`).toEqual([]);
  }
  expect(scritture).toEqual([]);
});
