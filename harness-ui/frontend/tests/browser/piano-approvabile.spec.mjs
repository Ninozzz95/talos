import { expect, test } from '@playwright/test';

/*
 * ⛔ 24/09/2026 — il PIANO APPROVABILE nell'interfaccia (fetta F3-30), decisioni owner 3, 36-39 (memoria
 * `decisioni-owner-f3-workflow-plan-ask-23-09.md`): le quattro scelte sulla scheda del piano, la scelta mandata con richiesta e
 * impronta, la ricevuta scritta dall'evento del server, il permesso scelto che resta alla sessione, e il testo finale di un giro
 * col piano presentato dall'attrezzo che NON diventa un secondo piano. Le prove girano sul server di prova, mai sul 4174.
 */
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const HASH = 'sha256:' + '7'.repeat(64);
const PIANO = '## Piano\n\n1. Leggo `a.txt`.\n2. Scrivo `b.txt` con il riassunto.';
const avvio = (_sid) => ({ type: 'RunStarted', _sequenza: 1, input: { consegna: 'pianifica' },
  contesto: { cartella: 'C:\\p', modalitaOperativa: 'piano', permessi: 'Read only', pianoConAttrezzo: true } });
const proposta = (sid, extra = {}) => ({ type: 'CUSTOM', name: 'talos.plan', _sequenza: 2, value: {
  schema: 'talos.plan.v1', planId: 'piano-1', sessionId: sid, revision: 1, status: 'proposed', content: PIANO,
  at: '2026-09-24T15:00:00.000Z', requestId: 'req-piano', hash: HASH, toolCallId: 'call_piano', ripristinabile: true, ...extra } });
const decisione = (sid, value, seq = 3) => ({ type: 'CUSTOM', name: 'talos.plan', _sequenza: seq, value: {
  schema: 'talos.plan.v1', planId: 'piano-1', sessionId: sid, revision: 1, requestId: 'req-piano', hash: HASH,
  toolCallId: 'call_piano', at: '2026-09-24T15:01:00.000Z', da: 'persona', ...value } });
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

async function apri(page, sid, { replay = [], impostazioni = { conclusa: false, permessi: 'Read only', modalitaOperativa: 'piano' }, risposta = null } = {}) {
  const bodies = [];
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse(replay) }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/plan-decision`, async (route) => {
    bodies.push({ body: JSON.parse(route.request().postData() || '{}'), headers: route.request().headers() });
    if (risposta) return route.fulfill(risposta);
    return route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  // Nessuna scrittura oltre la scelta sul piano (intercettata sopra): il resto dei non-GET si ferma e si conta.
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && !r.url().endsWith(`/sessions/${sid}/plan-decision`)) { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([sid, impostazioni]) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Piano', 'z-ai/glm-5.3-flash', impostazioni), [sid, impostazioni]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return { bodies, scritture };
}

test('R4-PLAN-APPROVE-LIVE: le quattro scelte sulla scheda; «accettando le modifiche» manda la scelta, la ricevuta arriva dal server', async ({ page }) => {
  const sid = 'piano-approva';
  const { bodies, scritture } = await apri(page, sid);
  await evento(page, avvio(sid));
  await evento(page, proposta(sid));
  const card = page.locator('#conversation [data-c="PlanArtifact"][data-plan-id="piano-1"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.talos-plan-artifact__state')).toHaveText('Aspetta la tua scelta · rev. 1');
  const scelte = card.locator('.talos-plan-artifact__choice');
  await expect(scelte).toHaveCount(4);
  await expect(scelte.locator('.talos-plan-artifact__choice-title')).toHaveText([
    'Procedi chiedendo conferma', 'Procedi accettando le modifiche', 'Procedi in una conversazione pulita', 'Continua a pianificare']);
  await expect(card.getByRole('group', { name: 'Come vuoi procedere con il piano' })).toBeVisible();
  await card.getByRole('button', { name: /Procedi accettando le modifiche/u }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].body).toEqual({ requestId: 'req-piano', decisione: 'procedi-accetta-modifiche', hash: HASH });
  expect(bodies[0].headers['content-type']).toMatch(/application\/json/u);
  // Fino all'evento del server la scheda non si dichiara approvata.
  await expect(card).toHaveAttribute('data-status', 'proposed');
  const chip = page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label');
  await expect(chip).toContainText('Solo lettura');
  await evento(page, decisione(sid, { status: 'approved', decisione: 'procedi-accetta-modifiche' }));
  await evento(page, { type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: 4,
    value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'piano-approvato' } });
  await expect(card).toHaveAttribute('data-status', 'approved');
  await expect(card.locator('.talos-plan-artifact__state')).toHaveText('Approvato · rev. 1');
  await expect(card.locator('.talos-plan-artifact__heading h3')).toHaveText('Piano approvato');
  await expect(card.locator('.talos-plan-artifact__choice')).toHaveCount(0);
  await expect(card.locator('.talos-plan-artifact__receipt')).toContainText('scrive nel progetto senza chiedere');
  await expect(card.locator('.talos-plan-artifact__receipt')).toContainText('Impronta 777777777777');
  await expect(chip).toContainText('Scrive nel progetto');
  expect(scritture).toEqual([]);
});

test('R4-PLAN-KEEP-PLANNING: «continua a pianificare» apre il campo e manda la correzione; la ricevuta la riporta', async ({ page }) => {
  const sid = 'piano-continua';
  const { bodies } = await apri(page, sid);
  await evento(page, avvio(sid));
  await evento(page, proposta(sid));
  const card = page.locator('#conversation [data-c="PlanArtifact"][data-plan-id="piano-1"]');
  const continua = card.getByRole('button', { name: /Continua a pianificare/u });
  await continua.click();
  await expect(continua).toHaveAttribute('aria-expanded', 'true');
  const campo = card.getByLabel('Che cosa cambiare nel piano');
  await expect(campo).toBeFocused();
  // Il testo parte dal bordo del campo, non rientrato come in una riga con icona.
  expect(await campo.evaluate((n) => parseFloat(getComputedStyle(n).paddingLeft))).toBeLessThanOrEqual(16);
  await campo.fill('Aggiungi i test prima di scrivere il file.');
  await card.getByRole('button', { name: 'Invia la correzione' }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].body).toEqual({ requestId: 'req-piano', decisione: 'continua-a-pianificare', hash: HASH, feedback: 'Aggiungi i test prima di scrivere il file.' });
  await evento(page, decisione(sid, { status: 'changes-requested', decisione: 'continua-a-pianificare', feedback: 'Aggiungi i test prima di scrivere il file.' }));
  await expect(card.locator('.talos-plan-artifact__state')).toHaveText('Da rivedere · rev. 1');
  await expect(card.locator('.talos-plan-artifact__receipt')).toContainText('«Aggiungi i test prima di scrivere il file.»');
});

test('R4-PLAN-ERROR-STAYS: un rifiuto del server resta sulla scheda con le sue parole, e le scelte si riaccendono', async ({ page }) => {
  const sid = 'piano-errore';
  const { bodies } = await apri(page, sid, { risposta: { status: 409, json: { ok: false, error: { code: 'PLAN_STALE',
    message: 'Il piano a schermo non è più l’ultimo: leggi la versione aggiornata e scegli su quella' } } } });
  await evento(page, avvio(sid));
  await evento(page, proposta(sid));
  const card = page.locator('#conversation [data-c="PlanArtifact"][data-plan-id="piano-1"]');
  await card.getByRole('button', { name: /Procedi chiedendo conferma/u }).click();
  await expect.poll(() => bodies.length).toBe(1);
  const errore = card.getByRole('alert');
  await expect(errore).toBeVisible();
  await expect(errore).toContainText('La scelta non è arrivata');
  await expect(card.getByRole('button', { name: /Procedi chiedendo conferma/u })).toBeEnabled();
  await expect(card).toHaveAttribute('data-status', 'proposed');
});

test('R4-PLAN-REPLAY-AND-CLOSED: in rigiocata la ricevuta è una sola; un piano chiuso dal riavvio non offre scelte', async ({ page }) => {
  const sid = 'piano-rigiocata';
  const chiuso = decisione(sid, { status: 'cancelled', motivo: 'interrotta', da: 'sistema' });
  // Un cambio di permesso VECCHIO nella storia non torna indietro sopra il contratto di adesso (Solo lettura).
  const vecchioCambio = { type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: 4,
    value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'piano-approvato' } };
  const { bodies } = await apri(page, sid, { replay: [avvio(sid), proposta(sid), chiuso, vecchioCambio] });
  await expect(page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label')).toContainText('Solo lettura');
  const schede = page.locator('#conversation [data-c="PlanArtifact"]');
  await expect(schede).toHaveCount(1);
  await expect(schede.locator('.talos-plan-artifact__state')).toHaveText('Chiuso senza scelta');
  await expect(schede.locator('.talos-plan-artifact__receipt')).toContainText('server si è riavviato');
  await expect(schede.locator('.talos-plan-artifact__choice')).toHaveCount(0);
  await evento(page, chiuso); // lo stesso evento che torna (riconnessione) non duplica niente
  await expect(schede).toHaveCount(1);
  expect(bodies).toEqual([]);
});

test('R4-PLAN-NO-FINAL-TEXT-PLAN: col piano presentato dall’attrezzo, il testo finale del giro non diventa un secondo piano', async ({ page }) => {
  const sid = 'piano-niente-doppio';
  await apri(page, sid);
  await evento(page, avvio(sid));
  await evento(page, proposta(sid));
  await evento(page, decisione(sid, { status: 'approved', decisione: 'conversazione-pulita', nuovaSessionId: 'sessione-nuova' }));
  await evento(page, { type: 'RunFinished', _sequenza: 5, result: { detto: 'Va bene: il lavoro prosegue nella conversazione nuova.' } });
  const schede = page.locator('#conversation [data-c="PlanArtifact"]');
  await expect(schede).toHaveCount(1);
  await expect(schede.getByRole('button', { name: 'Apri la conversazione nuova' })).toBeVisible();
  // Al contrario: senza l'attrezzo (contesto senza `pianoConAttrezzo`) il testo finale resta il piano da leggere, come prima.
  const altra = 'piano-vecchio';
  await apri(page, altra);
  await evento(page, { ...avvio(altra), contesto: { cartella: 'C:\\p', modalitaOperativa: 'piano' } });
  await evento(page, { type: 'RunFinished', _sequenza: 2, result: { detto: '## Piano\n\n1. Un passo.' } });
  await expect(page.locator('#conversation [data-c="PlanArtifact"][data-source="legacy"]')).toHaveCount(1);
});

/* ⛔ 24/09/2026, visto nella foto del giro vero: con un piano che aspetta la scelta la riga della sessione aperta diceva «in corso»,
 * perché la riga viva (riscritta a ogni battito del giro) si tratteneva solo per le approvazioni. Il piano, come una domanda,
 * aspetta la persona: «aspetta te», anche dopo altri battiti.
 * ⛔ 24/09 sera: qui la prova pretendeva «Invio indirizza» anche col piano, ma l’Invio indirizza solo con una domanda Ask in
 *   attesa (`reindirizzoConsentito`, `src/legacy/invio-durante-il-giro.js`): col piano apre il bivio. La frase era falsa, e la guardia di corsia1 l’ha presa. */
test('R4-PLAN-ROW-WAITS: la riga della sessione dice «aspetta te» finché il piano aspetta, anche fra i battiti del giro', async ({ page }) => {
  const sid = 'piano-riga';
  const riga = { sessionId: sid, taskId: 'workspace', nome: 'Prova del piano', modello: 'z-ai/glm-5.3-flash', avviataAlle: '2026-09-24T15:00:00.000Z',
    conclusa: false, interrotta: false, usage: null, inAttesaApprovazione: false, inAttesaDomanda: false, inAttesaPiano: false,
    permessi: 'Read only', modalitaOperativa: 'piano' };
  await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [riga] }, meta: { schema: 'talos.harness-ui.api.v1' } }) })
    : route.fallback());
  await apri(page, sid, { impostazioni: riga });
  await evento(page, avvio(sid));
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  const voce = page.locator('#sessionList .talos-session-item', { hasText: 'Prova del piano' });
  await expect(voce).toContainText('in corso');
  riga.inAttesaPiano = true;
  await evento(page, proposta(sid));
  await expect(voce).toContainText('aspetta te');
  // Altri battiti del giro (uso del fornitore) riscrivono la riga viva: non deve tornare «in corso».
  for (let i = 0; i < 3; i += 1) {
    await evento(page, { type: 'CUSTOM', name: 'consumo-fornitore', _sequenza: 10 + i, value: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' } });
    await page.waitForTimeout(600);
  }
  await expect(voce).toContainText('aspetta te');
  await expect(page.locator('#composerInput')).toHaveAttribute('placeholder', /Invio per scegliere/u);
  riga.inAttesaPiano = false;
  await evento(page, decisione(sid, { status: 'approved', decisione: 'procedi-con-conferma' }, 20));
  await expect(voce).toContainText('in corso');
});

/* 24/09/2026, visto nella foto del giro vero: un «## Passi» del modello usciva a taglia di pagina dentro la scheda. */
test('R4-PLAN-HEADINGS-SCALED: i titoli Markdown del piano non superano il titolo della scheda', async ({ page }) => {
  const sid = 'piano-titoli';
  await apri(page, sid);
  await evento(page, avvio(sid));
  await evento(page, proposta(sid, { content: '# Obiettivo\n\nContare i file.\n\n## Passi\n\n1. Elenco.\n\n### Verifica\n\nSolo lettura.' }));
  const card = page.locator('#conversation [data-c="PlanArtifact"][data-plan-id="piano-1"]');
  const taglia = (sel) => card.locator(sel).first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  const titoloScheda = await taglia('.talos-plan-artifact__heading h3');
  for (const sel of ['.talos-plan-artifact__body h1', '.talos-plan-artifact__body h2', '.talos-plan-artifact__body h3']) {
    expect(await taglia(sel), sel).toBeLessThanOrEqual(titoloScheda);
  }
});
