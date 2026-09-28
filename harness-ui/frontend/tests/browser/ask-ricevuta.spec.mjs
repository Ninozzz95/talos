import { expect, test } from '@playwright/test';

/*
 * ⛔ 24/09/2026 — Ask completa, interfaccia (fetta F3-22 della mappa `.claude/F3-MAPPA-WORKFLOW-PLAN-ASK-2026-09-23.md`).
 * Decisioni owner (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`): 10 ricevuta completa nata alla richiesta;
 * 11 una domanda alla volta, consigliata prima, tasti 1-9; 29 la domanda sopravvive al riavvio; 31 nessun furto di fuoco;
 * 32 «perché conta» per ogni domanda. Le prove girano sul server di prova (porta 4176), mai sul 4174.
 */
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const avvio = { type: 'RunStarted', _sequenza: 1, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } };
const DUE_DOMANDE = [
  { id: 'strada', question: 'Quale strada prendo?', why: 'Decide quale file cambia per primo.', options: [
    { label: 'Veloce', description: 'Cambia un file solo', recommended: true }, { label: 'Completa', description: 'Cambia tre file' },
  ] },
  { id: 'canale', question: 'Su quale canale pubblico?', why: 'Decide chi riceve la versione.', options: [
    { label: 'Stabile', description: 'Per tutti' }, { label: 'Anteprima', description: 'Solo tester' },
  ] },
];
const richiesta = (requestId, questions = DUE_DOMANDE, extra = {}) => ({
  type: 'UserQuestionRequested', _sequenza: 2, requestId, questions,
  at: '2026-09-24T13:01:00.000Z', toolCallId: 'call_ask', origine: { modalita: 'normale', agente: 'principale' }, ripristinabile: true, ...extra,
});
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

async function apri(page, sid, { replay = [], impostazioni = { conclusa: false }, bodies = [] } = {}) {
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse(replay) }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/question`, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  // Nessuna scrittura oltre la risposta alla domanda (intercettata sopra): il resto dei non-GET si ferma e si conta.
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && !r.url().endsWith(`/sessions/${sid}/question`)) { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([sid, impostazioni]) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Ask', 'z-ai/glm-5.3-flash', impostazioni), [sid, impostazioni]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return { bodies, scritture };
}

test('R4-ASK-ONE-AT-A-TIME-LIVE: una domanda alla volta, perché conta e consigliata a vista, il clic porta avanti e l’ultimo invia', async ({ page }) => {
  const { bodies, scritture } = await apri(page, 'ask-passi');
  await evento(page, avvio);
  await evento(page, richiesta('req-passi'));
  const card = page.locator('#userQuestionDock [data-c="UserQuestionCard"][data-request-id="req-passi"]');
  await expect(card).toContainText('Domanda 1 di 2');
  await expect(card).toContainText('Perché conta: Decide quale file cambia per primo.');
  await expect(card.getByText('Quale strada prendo?')).toBeVisible();
  await expect(card.getByText('Su quale canale pubblico?')).toBeHidden();
  await expect(card.getByRole('radio').first()).toHaveAccessibleName('Veloce');
  await expect(card.getByRole('radio').first()).toHaveAccessibleDescription(/Consigliata/u);
  await expect(card.locator('.talos-question-card__recommended:visible')).toHaveCount(1);
  await card.getByText('Completa', { exact: true }).click();
  await expect(card).toContainText('Domanda 2 di 2');
  await expect(card.getByText('Su quale canale pubblico?')).toBeVisible();
  expect(bodies).toEqual([]);
  await card.getByRole('button', { name: 'Indietro' }).click();
  await expect(card.getByRole('radio', { name: 'Completa' })).toBeChecked();
  await card.getByRole('button', { name: 'Avanti' }).click();
  await card.getByText('Anteprima', { exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-passi', status: 'answered', answers: { strada: 'Completa', canale: 'Anteprima' } });
  expect(scritture).toEqual([]);
});

test('R4-ASK-RECEIPT-DECISION: la domanda chiusa diventa la ricevuta «Decisione» completa, nel punto della chat dove è nata', async ({ page }) => {
  const { scritture } = await apri(page, 'ask-ricevuta');
  await evento(page, avvio);
  await evento(page, richiesta('req-ricevuta'));
  await evento(page, { type: 'UserQuestionResolved', _sequenza: 3, requestId: 'req-ricevuta', status: 'answered',
    answers: { strada: 'Veloce', canale: 'Solo il gruppo interno' }, at: '2026-09-24T13:02:00.000Z', da: 'persona' });
  const ricevuta = page.locator('#conversation [data-c="UserQuestionCard"][data-request-id="req-ricevuta"]');
  await expect(ricevuta).toHaveCount(1);
  await expect(ricevuta).toHaveAttribute('data-state', 'resolved');
  await expect(page.locator('#userQuestionDock')).toBeHidden();
  await expect(ricevuta).toContainText('Decisione');
  await expect(ricevuta).toContainText('Risposta inviata');
  // Nel riquadro della ricevuta, non nella domanda nascosta che resta nel DOM con lo stesso «Perché conta».
  const riquadro = ricevuta.locator('.talos-question-card__receipt');
  await expect(riquadro).toBeVisible();
  for (const testo of ['Quale strada prendo?', 'Perché conta: Decide quale file cambia per primo.', 'Altro: «Solo il gruppo interno»']) {
    await expect(riquadro).toContainText(testo);
  }
  await expect(ricevuta.locator('fieldset:visible')).toHaveCount(0);
  await expect(ricevuta).toContainText(/Chiesta alle \d\d:\d\d in modalità Normale · hai risposto alle \d\d:\d\d/u);
  const opzioni = ricevuta.locator('details.talos-question-card__offered').first();
  await opzioni.locator('summary').click();
  await expect(opzioni).toContainText('Consigliata');
  await expect(opzioni.locator('[data-scelta="true"]')).toContainText('Veloce');
  expect(scritture).toEqual([]);
});

test('R4-ASK-RECEIPT-RELOAD-NO-DUP: ricaricando la sessione la ricevuta torna una volta sola, e nessuna domanda riapre', async ({ page }) => {
  const risolta = { type: 'UserQuestionResolved', _sequenza: 3, requestId: 'req-reload', status: 'skipped', at: '2026-09-24T13:02:00.000Z', da: 'persona' };
  await apri(page, 'ask-reload', { replay: [avvio, richiesta('req-reload'), risolta] });
  const ricevute = page.locator('#conversation [data-c="UserQuestionCard"][data-request-id="req-reload"]');
  await expect(ricevute).toHaveCount(1);
  await expect(ricevute).toContainText('Domanda saltata');
  await expect(page.locator('#userQuestionDock')).toBeHidden();
  // Lo stesso evento che arriva di nuovo (riconnessione) non duplica niente.
  await evento(page, risolta);
  await expect(ricevute).toHaveCount(1);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('ask-reload', 'workspace', 'Ask', 'z-ai/glm-5.3-flash', { conclusa: true }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(ricevute).toHaveCount(1);
  await expect(page.locator('#userQuestionDock [data-c="UserQuestionCard"]')).toHaveCount(0);
});

test('R4-ASK-EXPIRED-DISTINCT: scaduta, interrotta e «nessuno poteva rispondere» non si leggono mai come annullata', async ({ page }) => {
  await apri(page, 'ask-stati');
  await evento(page, avvio);
  const casi = [
    ['req-scaduta', { status: 'expired', da: 'sistema' }, 'Domanda scaduta: nessuna risposta in tempo, il giro si è fermato'],
    ['req-interrotta', { status: 'cancelled', motivo: 'interrotta', da: 'sistema' }, 'Domanda interrotta: il server si è riavviato prima della risposta'],
    ['req-nessuno', { status: 'unanswerable', motivo: 'nessuna-interfaccia', da: 'sistema' }, 'Nessuno poteva rispondere: TALOS prosegue con l’ipotesi più prudente e la dichiara'],
  ];
  let sequenza = 10;
  for (const [requestId, esito, frase] of casi) {
    await evento(page, richiesta(requestId, DUE_DOMANDE, { _sequenza: sequenza++ }));
    await evento(page, { type: 'UserQuestionResolved', _sequenza: sequenza++, requestId, at: '2026-09-24T13:05:00.000Z', ...esito });
    const ricevuta = page.locator(`#conversation [data-request-id="${requestId}"]`);
    await expect(ricevuta).toContainText(frase);
    await expect(ricevuta).not.toContainText('annullata');
    await expect(ricevuta).toContainText('chiusa dal sistema');
  }
});

test('R4-ASK-FOCUS-POLICY: il fuoco resta nel composer, i numeri scritti lì sono testo; nella scheda il 2 sceglie la seconda', async ({ page }) => {
  const { bodies } = await apri(page, 'ask-tasti');
  await evento(page, avvio);
  await page.locator('#composerInput').click();
  await page.keyboard.type('nota 1');
  await evento(page, richiesta('req-tasti', [DUE_DOMANDE[1]]));
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-tasti"]');
  await expect(card).toBeVisible();
  await page.keyboard.type(' e 2');
  await expect(page.locator('#composerInput')).toBeFocused();
  await expect(page.locator('#composerInput')).toHaveValue('nota 1 e 2');
  await page.waitForTimeout(300);
  expect(bodies).toEqual([]);
  await card.getByRole('radio').first().focus();
  await page.keyboard.press('2');
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-tasti', status: 'answered', answers: { canale: 'Anteprima' } });
});

test('R4-ASK-SURVIVED-RESTART: dopo un riavvio la domanda aperta resta rispondibile e dice che cosa succede', async ({ page }) => {
  const { bodies } = await apri(page, 'ask-riavvio', {
    replay: [avvio, richiesta('req-riavvio', [DUE_DOMANDE[1]])],
    impostazioni: { conclusa: false, interrotta: true },
  });
  const card = page.locator('#userQuestionDock [data-c="UserQuestionCard"][data-request-id="req-riavvio"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Il server è stato riavviato: la domanda è ancora aperta.');
  await card.getByText('Stabile', { exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-riavvio', status: 'answered', answers: { canale: 'Stabile' } });
});

test('R4-ASK-EXPIRY-SETTING: con «Scadenza delle domande» a 1 minuto la scheda conta e alla fine manda «scaduta»', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-24T13:00:00.000Z') });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { askTimeout: '60' } })); } catch { /* niente */ }
  });
  const { bodies } = await apri(page, 'ask-scade');
  await evento(page, avvio);
  await evento(page, richiesta('req-scade', [DUE_DOMANDE[1]], { at: '2026-09-24T13:00:00.000Z' }));
  const card = page.locator('#userQuestionDock [data-request-id="req-scade"]');
  await expect(card.locator('.talos-question-card__timer')).toHaveText(/Scade fra (1:00|0:5\d)/u);
  await page.clock.fastForward(45_000);
  await expect(card.locator('.talos-question-card__timer')).toHaveAttribute('data-ultimi', 'true');
  expect(bodies).toEqual([]);
  await page.clock.fastForward(20_000);
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-scade', status: 'expired' });
});

/* ⛔ 24/09/2026, trovato col giro vero del Piano: la riga viva della sessione aperta diceva «in corso» anche con una domanda
 * aperta (si tratteneva solo per le approvazioni). Una domanda aspetta la persona: «aspetta te», anche fra i battiti del giro. */
test('R4-ASK-ROW-WAITS: con una domanda aperta la riga dice «aspetta te», anche fra i battiti del giro', async ({ page }) => {
  const sid = 'ask-riga';
  const riga = { sessionId: sid, taskId: 'workspace', nome: 'Prova della domanda', modello: 'z-ai/glm-5.3-flash', avviataAlle: '2026-09-24T13:00:00.000Z',
    conclusa: false, interrotta: false, usage: null, inAttesaApprovazione: false, inAttesaDomanda: false };
  await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [riga] }, meta: { schema: 'talos.harness-ui.api.v1' } }) })
    : route.fallback());
  await apri(page, sid);
  await evento(page, avvio);
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  const voce = page.locator('#sessionList .talos-session-item', { hasText: 'Prova della domanda' });
  await expect(voce).toContainText('in corso');
  riga.inAttesaDomanda = true;
  await evento(page, richiesta('req-riga'));
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  for (let i = 0; i < 3; i += 1) {
    await evento(page, { type: 'CUSTOM', name: 'consumo-fornitore', _sequenza: 10 + i, value: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' } });
    await page.waitForTimeout(600);
  }
  await expect(voce).toContainText('aspetta te');
});

/* ⛔ 27/09/2026, decisione owner 47 (sessione 56066b64): glm-5.3-flash ha mandato `ask_user_question` senza `why`, il kernel l'ha
 * respinta (QUERY_INVALID) e il secondo tentativo è andato. Il rifiuto non è un guasto: riga DISCRETA col motivo in parole,
 * pallino neutro, niente conteggio nel segmento; il testo del kernel resta nel dettaglio. Il testo del rifiuto è quello VERO. */
const RIFIUTO_VERO = 'ask_user_question failed [QUERY_INVALID]: questions[0].why è obbligatorio: una frase che dice perché la risposta conta';
test('R4-ASK-CORRECTED-ROW: la domanda respinta per la forma è una riga discreta col motivo, non un errore; AL CONTRARIO un altro rifiuto resta errore', async ({ page }) => {
  const { scritture } = await apri(page, 'ask-corretta');
  await evento(page, avvio);
  await evento(page, { type: 'ToolCallStart', toolCallId: 'call_senza_perche', toolCallName: 'ask_user_question', _sequenza: 2 });
  await evento(page, { type: 'ToolCallArgs', toolCallId: 'call_senza_perche', _sequenza: 3,
    delta: JSON.stringify({ questions: [{ id: 'strada', question: 'Quale strada prendo?', options: [{ label: 'Veloce' }, { label: 'Completa' }] }] }) });
  await evento(page, { type: 'ToolCallResult', toolCallId: 'call_senza_perche', content: RIFIUTO_VERO, _sequenza: 4 });
  const righe = page.locator('#conversation .talos-tool-row[data-c="ToolRow"]');
  const corretta = righe.nth(0);
  await expect(corretta).toHaveAttribute('data-tool-state', 'corrected');
  await expect(corretta.locator('.tool-note-summary-text')).toHaveText('The model corrected its question: the why was missing'); // la prova gira in inglese (en.js)
  await expect(corretta.locator('.talos-dot')).toHaveAttribute('class', 'talos-dot');
  const colore = await corretta.locator('.tool-note-summary-text').evaluate((n) => {
    const campione = document.createElement('span');
    campione.style.color = 'var(--talos-muted)';
    n.parentElement.append(campione);
    const atteso = getComputedStyle(campione).color;
    campione.remove();
    return { vero: getComputedStyle(n).color, atteso, peso: getComputedStyle(n).fontWeight };
  });
  expect(colore.vero).toBe(colore.atteso);
  expect(colore.peso).toBe('400');
  // e il pallino: il colore del testo attenuato, non il neutro di serie (`--talos-border-strong`, quasi nero in tema chiaro)
  const pallino = await corretta.locator('.talos-dot').evaluate((n) => {
    const campione = document.createElement('span');
    campione.style.backgroundColor = 'var(--talos-muted)';
    n.parentElement.append(campione);
    const atteso = getComputedStyle(campione).backgroundColor;
    campione.remove();
    return { vero: getComputedStyle(n).backgroundColor, atteso, opacita: Number(getComputedStyle(n).opacity) };
  });
  expect(pallino.vero).toBe(pallino.atteso);
  expect(pallino.opacita).toBeLessThan(1);
  // il motivo resta leggibile: il testo del kernel sta nel dettaglio della riga
  await expect(page.locator('#conversation .tool-note-detail').first()).toContainText('questions[0].why è obbligatorio');
  // il secondo tentativo è la domanda vera: il segmento non conta il primo, né come riuscito né come fallito
  await expect(page.locator('#conversation .talos-activity__head')).not.toContainText(/question|failed/iu);

  // AL CONTRARIO: un altro rifiuto della stessa domanda (una già aperta) è un errore, e si dice come prima
  await evento(page, { type: 'ToolCallStart', toolCallId: 'call_doppia', toolCallName: 'ask_user_question', _sequenza: 5 });
  await evento(page, { type: 'ToolCallResult', toolCallId: 'call_doppia', _sequenza: 6,
    content: 'ask_user_question failed [QUESTION_ALREADY_PENDING]: c’è già una domanda aperta' });
  const errore = righe.nth(1);
  await expect(errore).toHaveAttribute('data-tool-state', 'error');
  await expect(errore.locator('.talos-dot')).toHaveClass(/talos-dot--danger/u);
  await expect(errore.locator('.tool-note-summary-text')).not.toContainText('corrected');
  // il riassunto del gruppo conta la sola domanda fallita: il tentativo corretto non è né riuscito né fallito
  await expect(page.locator('#conversation .talos-activity__head .tool-note-summary-text')).toHaveText('Asking the user a question failed');
  await expect(page.locator('#conversation .talos-activity--segment .talos-activity__descrizione')).toHaveText('asking the user a question failed'); // il segmento, con due voci
  expect(scritture).toEqual([]);
});
