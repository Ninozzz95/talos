import { expect, test } from '@playwright/test';

/*
 * ⛔ 02/10/2026 sera — owner («sì, tutte e tre»): riaprendo una sessione la card del consenso diceva «Approvato da un’altra
 * finestra» a chi l'aveva dato da questa (misurato sul 4174, sessione 5a552e6b…), e così le domande e la scheda MCP: nella
 * storia rigiocata nessuna card sa più chi ha risposto. «Da un’altra finestra» si dice solo di una risposta arrivata IN
 * DIRETTA a una card che non l'ha data. Flusso finto come `ask-ricevuta.spec.mjs`; ogni non-GET si ferma e si conta.
 */
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const avvio = { type: 'RunStarted', _sequenza: 1, input: { consegna: 'prova' }, contesto: { cartella: 'C:\\p' } };
const STORIA = [
  avvio,
  { type: 'ApprovalRequested', _sequenza: 2, requestId: 'app-storia', azione: { tipo: 'shell', comando: 'npm test' } },
  { type: 'ApprovalResolved', _sequenza: 3, requestId: 'app-storia', approvato: true },
  { type: 'UserQuestionRequested', _sequenza: 4, requestId: 'dom-storia', questions: [{ id: 'q', question: 'Quale strada prendo?', options: [{ label: 'Veloce' }, { label: 'Completa' }] }],
    at: '2026-10-02T14:00:00.000Z', toolCallId: 'call_ask', origine: { modalita: 'normale', agente: 'principale' } },
  { type: 'UserQuestionResolved', _sequenza: 5, requestId: 'dom-storia', status: 'answered', answers: { q: 'Veloce' }, at: '2026-10-02T14:00:10.000Z', da: 'persona' },
  { type: 'McpElicitationRequested', _sequenza: 6, requestId: 'mcp-storia', server: 'github', mode: 'form', message: 'Il titolo della PR',
    requestedSchema: { type: 'object', properties: { titolo: { type: 'string' } } } },
  { type: 'McpElicitationResolved', _sequenza: 7, requestId: 'mcp-storia', action: 'accept', da: 'persona' },
];
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

async function apri(page, sid, replay) {
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
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Riapertura', 'z-ai/glm-5.3-flash', { conclusa: true }), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return scritture;
}

test('ESITO-RIAPERTURA: nella storia rigiocata consenso, domanda e scheda MCP non dicono «da un’altra finestra»', async ({ page }) => {
  const scritture = await apri(page, 'riapertura-esiti', STORIA);
  const conversazione = page.locator('#conversation');
  await expect(conversazione.locator('.talos-approval__esito', { hasText: 'Approvato' })).toHaveCount(1);
  await expect(conversazione.locator('[data-c="McpRequestCard"] .talos-approval__esito')).toHaveText('Inviato al server');
  await expect(conversazione.locator('[data-c="UserQuestionCard"][data-request-id="dom-storia"]')).toHaveCount(1);
  await expect(conversazione).not.toContainText('altra finestra');
  expect(scritture).toEqual([]);
});

/*
 * ⛔ 02/10/2026 sera — owner («nella storia non scriverla»): riaprendo la sessione, la riga del comando della PERSONA diceva
 * «… · 6 ms» per un comando fermato dopo secondi (il tempo fra due eventi rigiocati). Dal vivo la durata resta.
 */
const comandoDellaPersona = (id, sequenza) => [
  { type: 'ComandoUtenteIniziato', _sequenza: sequenza, comando: 'ping -n 45 127.0.0.1', contesto: { cartella: 'C:\\p' } },
  { type: 'ToolCallStart', _sequenza: sequenza + 1, toolCallId: id, toolCallName: 'shell' },
  { type: 'ToolCallResult', _sequenza: sequenza + 2, toolCallId: id, content: 'exit 130 [sandbox: none]\n⛔ Fermato su richiesta.' },
  { type: 'ComandoUtenteFinito', _sequenza: sequenza + 3 },
];

test('DURATA-RIAPERTURA: nella storia rigiocata la riga del comando della persona non scrive una durata; dal vivo sì', async ({ page }) => {
  const scritture = await apri(page, 'riapertura-durata', [avvio, ...comandoDellaPersona('cmd-storia', 2)]);
  const riga = page.locator('#conversation .talos-tool-row__name', { hasText: 'Annullato · codice 130' });
  await expect(riga).toHaveCount(1);
  await expect(riga).toHaveText('Annullato · codice 130 · su Windows, senza isolamento');
  // AL CONTRARIO: lo stesso comando dal vivo, fermato dopo più di un secondo, dice quanto è durato
  const [inizio, start, risultato, fine] = comandoDellaPersona('cmd-vivo', 10);
  await evento(page, inizio);
  await evento(page, start);
  await page.waitForTimeout(1200);
  await evento(page, risultato);
  await evento(page, fine);
  await expect(page.locator('#conversation .talos-tool-row__name', { hasText: 'Annullato · codice 130' })).toHaveCount(2);
  await expect(page.locator('#conversation .talos-tool-row__name', { hasText: 'Annullato · codice 130' }).last()).toHaveText(/^Annullato · codice 130 · su Windows, senza isolamento · 1\.\d s$/u);
  expect(scritture).toEqual([]);
});

test('ESITO-RIAPERTURA, AL CONTRARIO: una risposta arrivata in diretta e non data da questa pagina lo dice ancora', async ({ page }) => {
  const scritture = await apri(page, 'riapertura-vivo', [avvio]);
  await evento(page, { type: 'ApprovalRequested', _sequenza: 2, requestId: 'app-vivo', azione: { tipo: 'shell', comando: 'npm test' } });
  await evento(page, { type: 'ApprovalResolved', _sequenza: 3, requestId: 'app-vivo', approvato: true });
  await expect(page.locator('#conversation .talos-approval__esito')).toHaveText('Approvato da un’altra finestra');
  await evento(page, { type: 'McpElicitationRequested', _sequenza: 4, requestId: 'mcp-vivo', server: 'github', mode: 'form', message: 'Il titolo',
    requestedSchema: { type: 'object', properties: { titolo: { type: 'string' } } } });
  await evento(page, { type: 'McpElicitationResolved', _sequenza: 5, requestId: 'mcp-vivo', action: 'decline', da: 'persona' });
  await expect(page.locator('#conversation [data-c="McpRequestCard"] .talos-approval__esito')).toHaveText('Rifiutato da un’altra finestra');
  expect(scritture).toEqual([]);
});
