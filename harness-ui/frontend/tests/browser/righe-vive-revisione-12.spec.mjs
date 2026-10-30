import { test, expect } from '@playwright/test';

/*
 * Revisione avversaria del blocco 12 (27/10/2026), ramo feat/righe-vive-desktop. Stesse scene di `righe-vive.spec.mjs`
 * (eventi dati alla finestra, ogni non-GET fermato). Ogni prova qui dice un difetto che il ramo NON copre.
 */
async function apri(page, { sessioni = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } })));
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.abort();
    const percorso = new URL(req.url()).pathname;
    if (/\/sessions\/rv-[a-z0-9-]+\/events$/.test(percorso)) return undefined;
    if (sessioni && percorso === '/api/v1/sessions') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: sessioni } }) });
    if (/\/sessions\/rv-[a-z0-9-]+\/children$/.test(percorso)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: [] } }) });
    return r.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
}
async function eventi(page, id, lista, { permessi = 'Full access', rigiocata = false, meta = {} } = {}) {
  await page.evaluate(({ id, lista, permessi, rigiocata, meta }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Live rows', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi, ...meta });
    const g = r.realSessionState.generation;
    if (!rigiocata) r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    for (const e of lista) r.handleRealEvent(e, g);
    if (rigiocata) r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
  }, { id, lista, permessi, rigiocata, meta });
}

/*
 * RV-REV-01 — il permesso cambia A METÀ GIRO (Piano approvato con «procedi con conferma», o il selettore toccato mentre il giro
 *   lavora): il kernel rilegge i permessi a OGNI attrezzo (`talosHarness.mjs`, `permessiCorrentiFn`), e il registro manda
 *   `talos.impostazioni-sessione`. La carta nata DOPO il cambio deve spiegarsi col permesso in vigore quando è nata («On request»),
 *   non con quello del RunStarted («Full access»). Sulla base (b377932e7) dal vivo era giusta.
 */
test('RV-REV-01 a permission changed mid-turn: the card born after the change explains itself with the permission in force', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-rev-meta', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Plan then do it' }, contesto: { permessi: 'Full access', modello: 'z-ai/glm-5.3-flash' }, timestamp: adesso - 20_000, _sequenza: 1 },
    { type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { motivo: 'piano-approvato', permessi: 'On request', modalitaOperativa: 'normale' }, _sequenza: 2 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', _sequenza: 3 },
    { type: 'ApprovalRequested', requestId: 'a1', azione: { tipo: 'shell', toolCallId: 'c1', comando: 'npm test' }, _sequenza: 4 },
  ], { permessi: 'Full access' });
  const carta = page.locator('.real-approval-card').last();
  await expect(carta).toBeVisible();
  console.log('RV-REV-01 card:', (await carta.innerText()).replace(/\s+/gu, ' ').slice(0, 400));
  await expect(carta).toContainText(/every action that changes something goes through you/u);
});

/*
 * RV-REV-02 — un giro morto senza evento terminale (il server è caduto a metà comando) rigiocato dalla storia: la testa
 *   dell'attività conta da `at` di DUE GIORNI FA e continua a contare.
 */
test('RV-REV-02 a turn killed by a server restart, replayed (session interrotta, no terminal event) shows no ticking counter', async ({ page }) => {
  await apri(page);
  const dueGiorniFa = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
  await eventi(page, 'rv-rev-morto', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run' }, at: dueGiorniFa, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', at: dueGiorniFa, _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'npm test' }), _sequenza: 3 },
  ], { rigiocata: true, meta: { interrotta: true } }); // il registro al ripristino la dice interrotta, senza evento terminale
  await expect(page.locator('.tool-note-summary-text').first()).toBeVisible();
  await page.waitForTimeout(1500);
  const testo = await page.locator('.talos-activity__tempo-vivo').allTextContents();
  console.log('RV-REV-02 header counter:', JSON.stringify(testo));
  expect(testo, 'a two-day-old dead call must not tick as if alive').toEqual([]);
});

/*
 * RV-REV-02b — lo stesso, dal vivo: il giro finisce con RunError (Stop, errore del fornitore) e la chiamata non riceve mai il suo
 *   ToolCallResult. Il contatore deve sparire con la fine del giro.
 */
test('RV-REV-02b a turn that ends (RunError) with a call still open stops the header counter', async ({ page }) => {
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-rev-errore', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run' }, timestamp: adesso - 30_000, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', avviatoA: adesso - 20_000, _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'npm test' }), _sequenza: 3 },
    { type: 'RunError', message: 'Stopped', code: 'STOPPED', _sequenza: 4 },
  ]);
  await page.waitForTimeout(1500);
  const testo = await page.locator('.talos-activity__tempo-vivo').allTextContents();
  console.log('RV-REV-02b header counter after RunError:', JSON.stringify(testo));
  expect(testo).toEqual([]);
});

/*
 * RV-REV-03 — chiuso il foglio dell'albero, l'orologio non si ferma (i nodi restano nel `<dialog>`, `isConnected` resta vero).
 */
test('RV-REV-03 the branch-tree clock stops when the sheet is closed', async ({ page }) => {
  const adesso = Date.now();
  const riga = { sessionId: 'rv-rev-albero', taskId: 'workspace', nome: 'Live rows', modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false,
    avviataAlle: new Date(adesso - 300_000).toISOString(), inizioGiroAlle: new Date(adesso - 95_000).toISOString(), fineGiroAlle: null };
  await apri(page, { sessioni: [riga] });
  await eventi(page, 'rv-rev-albero', [{ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Go' }, timestamp: adesso - 95_000, _sequenza: 1 }]);
  await page.locator('.talos-topbar__actions [data-open-sheet="sessionTree"]').click();
  const tempo = page.locator('#veloAlberoNodi .talos-tree__tempo').first();
  await expect(tempo).toHaveText(/^for 1m \d+s$/u, { timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#veloAlbero')).toBeHidden();
  const a = await page.evaluate(() => document.querySelector('#veloAlberoNodi .talos-tree__tempo')?.textContent ?? null);
  await page.waitForTimeout(2500);
  const b = await page.evaluate(() => document.querySelector('#veloAlberoNodi .talos-tree__tempo')?.textContent ?? null);
  console.log('RV-REV-03 closed-sheet text', a, '->', b);
  expect(b, 'a closed sheet must not keep a 1 s interval writing into it').toBe(a);
});

/*
 * RV-REV-04 — un giro lungo (ricerca approfondita, /goal: ore) nell'elenco: le ore non esistono nella forma
 *   (`durataBreveRigaViva`: solo minuti e secondi).
 */
test('RV-REV-04 a two-hour turn in the session list reads in hours, not «for 120m»', async ({ page }) => {
  const adesso = Date.now();
  const viva = { sessionId: 'rv-rev-lunga', taskId: 'workspace', nome: 'Long research', modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false,
    avviataAlle: new Date(adesso - 3 * 3600_000).toISOString(), inizioGiroAlle: new Date(adesso - 2 * 3600_000 - 5_000).toISOString(), fineGiroAlle: null };
  await apri(page, { sessioni: [viva] });
  const tempo = page.locator('.talos-session-item[data-real-session-id="rv-rev-lunga"] .talos-session-item__tempo');
  await expect(tempo).toBeVisible({ timeout: 5_000 });
  const testo = await tempo.textContent();
  console.log('RV-REV-04', testo);
  expect(testo).not.toMatch(/\d{3}m/u);
});

/*
 * RV-REV-05 — owner, decisione del 02/09 e del 24/09 (memoria `animazioni-si-provano-col-movimento-ridotto`): col movimento ridotto un
 *   indicatore di stato SI CALMA, non si ferma; e la macchina dell'owner ha il movimento ridotto acceso a livello di Windows. Il ramo
 *   scrive `@media (prefers-reduced-motion: reduce){ … {animation:none} }` (index.css, righe vive): sul suo schermo nessun pallino pulsa.
 */
test('RV-REV-05 with reduced motion the live dot of a running process calms down but keeps pulsing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await apri(page);
  const adesso = Date.now();
  await eventi(page, 'rv-rev-ridotto', [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Run the tests' }, timestamp: adesso - 90_000, _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', parentMessageId: 'm1', avviatoA: adesso - 72_000, timestamp: adesso - 72_000, _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'npm test', descrizione: 'Run the suite' }), _sequenza: 3 },
  ]);
  await page.locator('[data-rail="processi"]').first().click();
  /* pannello v2 (29/10/2026): il segno vivo è l'anello del comando (`.pn-segno[data-vivo]`, disegnato col suo ::after): le animazioni
     si leggono con `subtree: true`, che porta anche quelle dei pseudo-elementi */
  const pallino = page.locator('#railProcessi .pn-segno[data-vivo]').first();
  await expect(pallino).toBeVisible();
  /* la scheda si ridisegna quando arrivano dati: un segno letto un attimo prima di essere sostituito è staccato e non ha animazioni.
     Si rilegge finché quello A SCHERMO risponde (rosso vero se l'anello resta fermo: nessun giro lo farebbe ripartire) */
  const leggi = () => pallino.evaluate((el) => el.isConnected ? el.getAnimations({ subtree: true }).map((a) => ({ nome: a.animationName, stato: a.playState })) : null);
  await expect.poll(async () => ((await leggi()) ?? []).filter((a) => a.stato === 'running').length, { message: 'calm, never frozen' }).toBeGreaterThan(0);
  console.log('RV-REV-05', JSON.stringify(await leggi()));
});
