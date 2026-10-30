import { test, expect } from '@playwright/test';

/*
 * Owner 27/10/2026 — «ogni riga in corso animata e col contatore dei secondi; niente deve far sembrare l'interfaccia bloccata»,
 * bozzetto approvato (handoff `mockup-righe-vive-2026-10-27/`). E la carta dei permessi che si spiega col permesso DEL SUO GIRO.
 * La conversazione è data alla finestra come eventi; ogni richiesta non-GET è fermata (nessuna scrittura sul server).
 */

async function apri(page, { sessioni = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } })));
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.abort();
    const percorso = new URL(req.url()).pathname;
    if (/\/sessions\/rv-[a-z0-9-]+\/events$/.test(percorso)) return undefined; // il canale resta in attesa
    if (sessioni && percorso === '/api/v1/sessions') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: sessioni } }) });
    if (/\/sessions\/rv-[a-z0-9-]+\/children$/.test(percorso)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: [] } }) });
    return r.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
}
async function eventi(page, id, lista, { permessi = 'Full access' } = {}) {
  await page.evaluate(({ id, lista, permessi }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Live rows', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    for (const e of lista) r.handleRealEvent(e, g);
  }, { id, lista, permessi });
}

test('RV-01 the summary live row shows the elapsed seconds, and they tick', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-riassunto', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Fix the tests' }, timestamp: adesso - 30_000, _sequenza: 1 },
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', giro: 2, tokenPrima: 182_000, soglia: 160_000, motivo: 'soglia' }, _sequenza: 2 },
    { type: 'CUSTOM', name: 'talos.compattazione-progresso', value: { fase: 'riassunto', motivo: null, trascorsoMs: 23_000 } },
  ]);
  const tempo = page.locator('[data-compattazione-barra] [data-riga-viva-tempo]');
  await expect(tempo).toHaveText(/^· 2[3-4]s$/u);
  await expect(tempo).toHaveText(/^· 2[5-9]s$/u, { timeout: 5_000 });
});

test('RV-02 a running process shows the live dot and a ticking duration from its real start', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-processi', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run the tests' }, timestamp: adesso - 90_000, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', avviatoA: adesso - 72_000, timestamp: adesso - 72_000, _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'npm test', descrizione: 'Run the suite' }), _sequenza: 3 },
  ]);
  await page.locator('[data-rail="processi"]').first().click();
  /* pannello v2 (29/10/2026): la riga del comando vivo ha l'orologio a lato (`[data-dal]`, `durataBreveRigaViva`) e l'anello che gira
     sul suo segno (`.pn-segno[data-vivo]`) */
  const durata = page.locator('#railProcessi .pn-riga [data-dal]').first();
  await expect(durata).toHaveText(/^1m 1[2-3]s$/u);
  await expect(page.locator('#railProcessi .pn-segno[data-vivo]')).toHaveCount(1);
  await expect(durata).toHaveText(/^1m 1[4-9]s$/u, { timeout: 5_000 });
});

test('RV-03 the permission card explains itself with the permission of ITS turn, not the session’s current one', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  // la sessione è ora su «Full access», ma il giro della carta era su «Ask first» (On request)
  await eventi(page, 'rv-carta', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run it' }, contesto: { permessi: 'On request', modello: 'z-ai/glm-5.3-flash' }, timestamp: adesso - 10_000, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', _sequenza: 2 },
    { type: 'ApprovalRequested', requestId: 'a1', azione: { tipo: 'shell', toolCallId: 'c1', comando: 'npm test' }, _sequenza: 3 },
  ], { permessi: 'Full access' });
  const carta = page.locator('.real-approval-card').last();
  await expect(carta).toBeVisible();
  await expect(carta).not.toContainText(/Full access/u);
});

test('RV-03b (reverse) a turn that does not say its permission: the card says no policy sentence, never the current one', async ({ page }) => {
  await apri(page);
  await eventi(page, 'rv-carta-vecchia', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run it' }, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', _sequenza: 2 },
    { type: 'ApprovalRequested', requestId: 'a1', azione: { tipo: 'shell', toolCallId: 'c1', comando: 'npm test' }, _sequenza: 3 },
  ], { permessi: 'Full access' });
  const carta = page.locator('.real-approval-card').last();
  await expect(carta).toBeVisible();
  await expect(carta).not.toContainText(/Full access/u);
});

test('RV-04 a running node of the branch tree pulses and says «for 1m 35s», counted from the turn start', async ({ page }) => {
  const adesso = Date.now();
  const riga = { sessionId: 'rv-albero', taskId: 'workspace', nome: 'Live rows', modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false,
    avviataAlle: new Date(adesso - 300_000).toISOString(), inizioGiroAlle: new Date(adesso - 95_000).toISOString(), fineGiroAlle: null };
  await apri(page, { sessioni: [riga] });
  await eventi(page, 'rv-albero', [{ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Go' }, timestamp: adesso - 95_000, _sequenza: 1 }]);
  await page.locator('.talos-topbar__actions [data-open-sheet="sessionTree"]').click();
  const tempo = page.locator('#veloAlberoNodi .talos-tree__tempo').first();
  await expect(tempo).toHaveText(/^for 1m 3[5-9]s$/u, { timeout: 5_000 });
  await expect(page.locator('#veloAlberoNodi .talos-tree__dot--live').first()).toBeVisible();
  const prima = await tempo.textContent();
  await expect(tempo).not.toHaveText(prima, { timeout: 4_000 });
});

/*
 * Trovato scrivendo RV-04 (27/10/2026): il pulsante «Open the branch tree» del pannello Agenti (`data-apre-velo="veloAlbero"`,
 * index.template.html) apriva il velo SENZA disegnarlo — `apriVeloMockup` non passa da `preparaVeloDaFoglio`, che solo `openSheet`
 * chiama — e la persona leggeva la frase segnaposto del ponte («No branches yet…») anche con i rami veri. Le due porte dell'albero
 * devono mostrare lo stesso albero.
 */
test('RV-04b the side panel’s «Open the branch tree» draws the same tree as the top bar, not the placeholder', async ({ page }) => {
  const adesso = Date.now();
  const riga = { sessionId: 'rv-albero2', taskId: 'workspace', nome: 'Live rows', modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false,
    avviataAlle: new Date(adesso - 300_000).toISOString(), inizioGiroAlle: new Date(adesso - 95_000).toISOString(), fineGiroAlle: null };
  await apri(page, { sessioni: [riga] });
  await eventi(page, 'rv-albero2', [{ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Go' }, timestamp: adesso - 95_000, _sequenza: 1 }]);
  await page.evaluate(() => document.querySelector('[data-apre-velo="veloAlbero"]')?.click());
  await expect(page.locator('#veloAlbero')).toBeVisible();
  await expect(page.locator('#veloAlberoNodi .talos-tree__tempo').first()).toHaveText(/^for 1m 3[5-9]s$/u, { timeout: 5_000 });
  await expect(page.locator('#veloAlberoNodi')).not.toContainText('No branches yet');
});

/* Owner 27/10/2026, «Sì, tutte e due»: le due righe in corso fuori dal bozzetto. */
test('RV-05 the running-commands header says «· 1m 12s» from the oldest running call, ticks, and goes away when the call ends', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-testa', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run the tests' }, timestamp: adesso - 90_000, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', avviatoA: adesso - 72_000, _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'npm test' }), _sequenza: 3 },
  ]);
  const tempo = page.locator('.talos-activity__tempo-vivo').first();
  await expect(tempo).toHaveText(/^· 1m 1[2-4]s$/u);
  await expect(tempo).toHaveText(/^· 1m 1[5-9]s$/u, { timeout: 5_000 });
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c1', role: 'tool', content: 'exit 0\nok', _sequenza: 4 }, r.realSessionState.generation);
  });
  await expect(page.locator('.talos-activity__tempo-vivo')).toHaveCount(0);
});

test('RV-05b (reverse) a call with no start time anywhere and seen only in a replay invents no counter', async ({ page }) => {
  await apri(page);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('rv-testa2', 'workspace', 'Live rows', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'Full access' });
    const g = r.realSessionState.generation;
    for (const e of [
      { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run' }, _sequenza: 1 },
      { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', _sequenza: 2 },
    ]) r.handleRealEvent(e, g);
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
  });
  await expect(page.locator('.tool-note-summary-text').first()).toBeVisible();
  await expect(page.locator('.talos-activity__tempo-vivo')).toHaveCount(0);
});

test('RV-06 a running session in the list says «for 1m 35s» where the start time was, ticking; a finished one shows the time again', async ({ page }) => {
  const adesso = Date.now();
  const viva = { sessionId: 'rv-lista', taskId: 'workspace', nome: 'Live rows', modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false,
    avviataAlle: new Date(adesso - 300_000).toISOString(), inizioGiroAlle: new Date(adesso - 95_000).toISOString(), fineGiroAlle: null };
  const finita = { ...viva, sessionId: 'rv-lista-finita', nome: 'Done one', conclusa: true, fineGiroAlle: new Date(adesso - 10_000).toISOString() };
  await apri(page, { sessioni: [viva, finita] });
  const tempo = page.locator('.talos-session-item[data-real-session-id="rv-lista"] .talos-session-item__tempo');
  await expect(tempo).toHaveText(/^for 1m 3[5-9]s$/u, { timeout: 5_000 });
  const prima = await tempo.textContent();
  await expect(tempo).not.toHaveText(prima, { timeout: 4_000 });
  await expect(page.locator('.talos-session-item[data-real-session-id="rv-lista-finita"] .talos-session-item__tempo')).toHaveCount(0);
  await expect(page.locator('.talos-session-item[data-real-session-id="rv-lista-finita"] .talos-session-item__aside')).toContainText(/\d{1,2}:\d{2}/u);
});
