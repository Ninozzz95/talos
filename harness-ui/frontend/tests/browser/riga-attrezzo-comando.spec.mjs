import { expect, test } from '@playwright/test';

/*
 * ⛔ 02/10/2026 sera — owner («sì, tutti e tre»): la riga di un comando dell'agente CON descrizione diceva la stessa frase
 * due volte, a sinistra e in monospazio a destra (foto della sessione 5a552e6b… sul 4174). A destra va il comando.
 * Flusso finto come `ask-ricevuta.spec.mjs`; ogni non-GET si ferma e si conta.
 */
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

async function apri(page, sid, replay = [], { conclusa = false } = {}) {
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse(replay) }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([sid, conclusa]) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Riga', 'z-ai/glm-5.3-flash', { conclusa }), [sid, conclusa]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return scritture;
}

const avvio = { type: 'RunStarted', _sequenza: 1, input: { consegna: 'prova' }, contesto: { cartella: 'C:\\p' } };
/* L'ordine VERO della sessione della foto (5a552e6b…, eventi catturati dalla rotta `/events` del 4174): il modello scrive una
   frase, chiama l'attrezzo, la frase si chiude, arriva il consenso, poi il risultato. Senza il consenso O senza la frase il
   doppione non compare (misurato togliendo un tipo d'evento alla volta, `scratchpad/riproduci-riga-doppia.mjs`). */
const comando = (id, argomenti, sequenza) => [
  { type: 'TextMessageStart', _sequenza: sequenza, messageId: `m-${id}`, role: 'assistant' },
  { type: 'TextMessageContent', _sequenza: sequenza + 1, messageId: `m-${id}`, delta: 'Lancio il comando e aspetto che finisca.' },
  { type: 'ToolCallStart', _sequenza: sequenza + 2, toolCallId: id, toolCallName: 'shell' },
  { type: 'ToolCallArgs', _sequenza: sequenza + 3, toolCallId: id, delta: JSON.stringify(argomenti) },
  { type: 'TextMessageEnd', _sequenza: sequenza + 4, messageId: `m-${id}` },
  { type: 'ApprovalRequested', _sequenza: sequenza + 5, requestId: `app-${id}`, azione: { tipo: 'shell', comando: argomenti.comando, toolCallId: id } },
  { type: 'ApprovalResolved', _sequenza: sequenza + 6, requestId: `app-${id}`, approvato: true },
  { type: 'ToolCallResult', _sequenza: sequenza + 7, toolCallId: id, content: 'exit 0 [sandbox: none]\nok' },
];
const DUE = [...comando('c-desc', { comando: 'git diff --stat', descrizione: 'Mostra i file cambiati' }, 2), ...comando('c-nudo', { comando: 'npm test' }, 12)];
const dettagli = (page) => page.locator('#conversation .talos-tool-row').evaluateAll((n) => n.map((x) => [x.querySelector('.tool-note-summary-text')?.textContent, x.querySelector('.talos-tool-row__detail')?.textContent]));

test('RIGA-COMANDO: nella storia rigiocata, con la descrizione a sinistra a destra c’è il comando, mai la stessa frase', async ({ page }) => {
  // conclusa: true come una sessione riaperta (disegno differito della storia, la strada della foto)
  const scritture = await apri(page, 'riga-comando-storia', [avvio, ...DUE, { type: 'RunFinished', _sequenza: 20 }], { conclusa: true });
  await expect(page.locator('#conversation .talos-tool-row')).toHaveCount(2);
  const righe = await dettagli(page);
  expect(righe.find(([nome]) => nome === 'Mostra i file cambiati')?.[1]).toBe('git diff --stat');
  expect(righe.some(([, dettaglio]) => dettaglio === 'npm test')).toBe(true);
  for (const [nome, dettaglio] of righe) expect(dettaglio).not.toBe(nome);
  expect(scritture).toEqual([]);
});

test('RIGA-COMANDO, dal vivo: stessa regola', async ({ page }) => {
  const scritture = await apri(page, 'riga-comando-vivo');
  for (const e of [avvio, ...DUE]) await evento(page, e);
  await expect(page.locator('#conversation .talos-tool-row')).toHaveCount(2);
  const righe = await dettagli(page);
  expect(righe.find(([nome]) => nome === 'Mostra i file cambiati')?.[1]).toBe('git diff --stat');
  for (const [nome, dettaglio] of righe) expect(dettaglio).not.toBe(nome);
  expect(scritture).toEqual([]);
});
