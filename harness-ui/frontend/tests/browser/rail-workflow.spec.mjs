/*
 * F3-50 (25/09/2026) — il rail «Agenti» del workflow nella colonna di destra, sulle rotte v2 (fixture dei mockup R4,
 * `aiuto-workflow-v2.mjs`: dimostrative, non dati di produzione). Prova ciò che le unitarie non vedono: il rail montato
 * nella scheda vera (D30), i due modi (agenti fino a 25, gruppi oltre), i filtri delle card (decisioni owner 16-18), la porta
 * del diagramma (19), il legame rail → diagramma (apre su un passo o un gruppo, senza rimontare se è già aperto) e diagramma →
 * rail (la selezione si evidenzia), e che niente scrive.
 * Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`, sezione F3-50.
 */
import { expect, test } from '@playwright/test';
import { apriRailDellaScena, cambiaStati, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

const railV2 = (page) => page.locator('#railAgenti [data-c="WorkflowRail"]');
const testi = async (locator) => (await locator.allInnerTexts()).map((t) => t.replace(/\s+/gu, ' ').trim());

test('WF-RAIL-UI-14: up to 25 steps the rail lists the agents, attention holds only what needs the person (mockup 14)', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-rail-14' });
  const { scritture } = await instradaScena(page, scena);
  await apriRailDellaScena(page, scena);
  const rail = railV2(page);
  await expect(rail).toHaveAttribute('data-modo', 'agenti');
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(14);
  await expect(rail.locator('.talos-wfr__agente').nth(4)).toHaveText(/Agente 06 - Sviluppo\s*In esecuzione/u);
  // quattro passi «In attesa» dietro un'attività precedente non chiedono attenzione (decisione 16); gli errori a zero sì (17)
  expect(await testi(rail.locator('.talos-wfr__voce-attenzione'))).toEqual(['0 errori Nessun errore attivo']);
  await expect(rail.getByRole('button', { name: /^Vedi tutto/u })).toBeHidden();
  expect(await testi(rail.locator('.talos-wfr__totale'))).toEqual(['Totale agenti 14', 'In esecuzione 1', 'Completati 6', 'In attesa 7']);
  await expect(page.locator('#railTabs [data-rail="agenti"]')).toContainText('1'); // il numero della scheda: i passi al lavoro
  // un clic su un agente apre il diagramma su di lui, e il rail lo evidenzia; la porta sparisce a diagramma aperto
  await expect(rail.getByRole('button', { name: 'Apri diagramma', exact: true })).toBeVisible();
  const porta = rail.locator('.talos-wfr__porta');
  const riga = rail.locator('.talos-wfr__agente', { hasText: 'Agente 09 - Build' });
  /* la posizione DENTRO il contenuto del rail (non nella finestra): se il bersaglio è coperto un istante — qui dal toast
     «Collegato di nuovo» della fixture — il clic di Playwright riprova facendo scorrere il contenitore, e una misura nella
     finestra accuserebbe il test invece del layout (sonda `sonda-scorre-rail.mjs`, 25/09: 581 → 581, nessuno scroll nostro) */
  const nelContenuto = () => riga.evaluate((n) => { const r = n.closest('#railAgenti'); const rect = r.getBoundingClientRect(); const scala = rect.width / r.offsetWidth; return n.getBoundingClientRect().top - rect.top + r.scrollTop * scala; });
  const prima = await nelContenuto();
  await riga.click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(grafo.locator('.gv-passo[aria-pressed="true"]')).toContainText('Agente 09 - Build');
  // decisione owner 20: la riga cliccata non si sposta quando la porta si nasconde (mezzo pixel: l'arrotondamento sub-pixel
  // del browser, 0,017 px misurati; il salto che la regola impedisce era di ~22 px)
  expect(await nelContenuto()).toBeCloseTo(prima, 0);
  await expect(rail.locator('.talos-wfr__agente[aria-current="true"]')).toHaveText(/Agente 09 - Build/u);
  await expect(porta).toBeHidden();
  // a diagramma aperto un altro clic lo porta su un altro passo SENZA rimontarlo
  await grafo.evaluate((nodo) => { nodo.__marcaDiProva = 'stesso'; });
  await rail.locator('.talos-wfr__agente', { hasText: 'Agente 03 - Contesto' }).click();
  await expect(grafo.locator('.gv-passo[aria-pressed="true"]')).toContainText('Agente 03 - Contesto');
  expect(await grafo.evaluate((nodo) => nodo.__marcaDiProva)).toBe('stesso');
  await expect(rail.locator('.talos-wfr__agente[aria-current="true"]')).toHaveText(/Agente 03 - Contesto/u);
  // e il verso opposto: un clic nel diagramma sposta l'evidenza del rail
  await grafo.locator('.gv-passo', { hasText: 'Agente 12' }).click();
  await expect(rail.locator('.talos-wfr__agente[aria-current="true"]')).toHaveText(/Agente 12/u);
  await grafo.getByRole('button', { name: 'Torna alla chat' }).click();
  await expect(porta).toBeVisible();
  await expect(rail.locator('.talos-wfr__agente[aria-current="true"]')).toHaveCount(0);
  expect(await page.locator('#railAgenti').evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  expect(scritture).toEqual([]);
});

test('WF-RAIL-UI-200: beyond 25 steps the rail shows the groups; a group opens in the diagram (mockup 200)', async ({ page }) => {
  const scena = costruisciScena(200, { sessionId: 'wf-rail-200' });
  const { scritture } = await instradaScena(page, scena);
  await apriRailDellaScena(page, scena);
  const rail = railV2(page);
  await expect(rail).toHaveAttribute('data-modo', 'gruppi');
  expect(await testi(rail.locator('.talos-wfr__gruppo'))).toEqual([
    'Ricerca 32 agenti 100%', 'Implementazione 40 agenti 65%', 'Verifica 36 agenti 41%', 'Integrazione 28 agenti 28%', 'Test 34 agenti 11%', 'Documentazione 30 agenti 0%',
  ]);
  expect(await testi(rail.locator('.talos-wfr__totale'))).toEqual(['Totale agenti logici 200', 'Gruppi visibili 6']);
  await rail.locator('.talos-wfr__gruppo[data-phase-id="verifica"]').click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  // refactor dei grafi: il gruppo si apre SUL POSTO nella tela (una corsia), e chi ci lavora diventa la selezione
  await expect(grafo.locator('.gv-corsia[data-phase-id="verifica"]')).toBeVisible();
  await expect(rail.locator('.talos-wfr__gruppo[aria-current="true"]')).toHaveAttribute('data-phase-id', 'verifica');
  await grafo.evaluate((nodo) => { nodo.__marcaDiProva = 'stesso'; });
  await rail.locator('.talos-wfr__gruppo[data-phase-id="test"]').click();
  await expect(grafo.locator('.gv-corsia[data-phase-id="test"]')).toBeAttached();
  expect(await grafo.evaluate((nodo) => nodo.__marcaDiProva)).toBe('stesso');
  await expect(rail.locator('.talos-wfr__gruppo[aria-current="true"]')).toHaveAttribute('data-phase-id', 'test');
  // l'interruttore passa agli agenti: 25 alla volta, e la ricerca dice quanti fra quelli caricati
  await rail.getByRole('button', { name: 'Agenti', exact: true }).click();
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(25);
  await expect(rail.getByRole('button', { name: 'Mostra altri (175 ancora)' })).toBeVisible();
  await rail.getByRole('button', { name: 'Mostra altri (175 ancora)' }).click();
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(50);
  await rail.getByRole('searchbox', { name: 'Cerca agenti, gruppi o stato' }).fill('in esecuzione');
  await expect(rail.locator('.talos-wfr__esito')).toHaveText(/^\d+ agent[ei] fra i 50 caricati$/u);
  expect(scritture).toEqual([]);
});

test('WF-RAIL-UI-ATTENTION: decisions and errors filter the list from the head of the pages sorted by state (decisions 16-18)', async ({ page }) => {
  const scena = cambiaStati(costruisciScena(200, { sessionId: 'wf-rail-att' }), [
    ['verifica-0030', 'waiting_human'], ['verifica-0031', 'waiting_human'], ['test-0020', 'failed'], ['test-0021', 'reconciling'],
  ]);
  const lette = [];
  page.on('request', (r) => { if (r.url().includes('/groups/') && r.url().includes('sort=stato')) lette.push(new URL(r.url()).pathname + new URL(r.url()).search); });
  const { scritture } = await instradaScena(page, scena);
  await apriRailDellaScena(page, scena);
  const rail = railV2(page);
  await expect(rail.locator('.talos-wfr__voce-attenzione')).toHaveCount(2);
  expect(await testi(rail.locator('.talos-wfr__voce-attenzione'))).toEqual(['2 decisioni in attesa Attende una decisione', '1 errore Richiede intervento']);
  await expect(rail.getByRole('button', { name: 'Vedi tutto (3)' })).toBeVisible();
  await rail.locator('.talos-wfr__voce-attenzione[data-chiave="errori"]').click();
  await expect(rail).toHaveAttribute('data-modo', 'agenti');
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(1);
  await expect(rail.locator('.talos-wfr__agente')).toHaveText(/Non riuscito/u);
  await expect(rail.locator('.talos-wfr__testa--elenco')).toContainText('Errori');
  await expect(rail.locator('.talos-wfr__voce-attenzione[data-chiave="errori"]')).toHaveAttribute('aria-pressed', 'true');
  // si legge solo la testa dei gruppi che ne hanno: il gruppo «test» (1 errore), mai i conclusi
  expect(lette).toEqual(['/api/v1/sessions/wf-rail-att/workflows/run-200/groups/test?offset=0&limit=1&sort=stato']);
  await rail.getByRole('button', { name: 'Vedi tutto (3)' }).click();
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(3);
  expect(await testi(rail.locator('.talos-wfr__agente .talos-wfr__stato'))).toEqual(['Aspetta te', 'Aspetta te', 'Non riuscito']);
  await rail.getByRole('button', { name: 'Togli il filtro e mostra tutti gli agenti' }).click();
  await expect(rail.locator('.talos-wfr__agente')).toHaveCount(25);
  await expect(rail.locator('.talos-wfr__testa--elenco')).toContainText('Agenti della sessione');
  expect(scritture).toEqual([]);
});

/* 09/10/2026 (bugfixer; visto dal desktop nella prova dal vivo della C3 tappa 5, foto scura a 1920×1080): un passo dal nome
   lungo («Confronta i due elenchi e dichiara il massimo») spingeva la riga oltre il rail. Lo stato a destra («Concluso») usciva
   e il rail, più largo del suo contenitore, scorreva di lato: le prime lettere dei titoli tagliate. In una griglia un `li` ha
   `min-width: auto`, cioè il min-content della riga, e un testo in `nowrap` lo rende lungo quanto il nome (CSS-Tricks
   «Preventing a Grid Blowout»; makandra «How to prevent a 1fr grid column overflow», lette il 09/10/2026). */
const NOME_LUNGO = 'Confronta i due elenchi e dichiara il massimo valore trovato nei sei documenti della cartella';
function rinomina(scena, nodeId, label) {
  for (const elenco of [...scena.righe.values(), scena.tutte]) {
    const i = elenco.findIndex((r) => r.nodeId === nodeId);
    if (i >= 0) elenco[i] = { ...elenco[i], label };
  }
  return scena;
}

test('WF-RAIL-NOME-LUNGO: un nome lungo si accorcia coi puntini, lo stato resta dentro e il rail non scorre di lato', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const scena = rinomina(costruisciScena(14, { sessionId: 'wf-rail-lungo' }), 'implementazione-0003', `Agente 99 - ${NOME_LUNGO}`);
  const { scritture } = await instradaScena(page, scena);
  await apriRailDellaScena(page, scena);
  const rail = railV2(page);
  const riga = rail.locator('.talos-wfr__agente', { hasText: 'Agente 99' });
  await expect(riga).toBeVisible();
  const misura = () => riga.evaluate((b) => {
    const contenitore = b.closest('#railAgenti');
    const r = contenitore.getBoundingClientRect(), s = b.querySelector('.talos-wfr__stato').getBoundingClientRect();
    const nome = b.querySelector('.talos-wfr__nome');
    return { trabocca: contenitore.scrollWidth - contenitore.clientWidth, scorso: contenitore.scrollLeft,
      statoFuori: Math.round(s.right - r.right), nomeAccorciato: nome.scrollWidth > nome.clientWidth };
  });
  const prima = await misura();
  expect(prima.trabocca, `il rail non è più largo di sé: ${JSON.stringify(prima)}`).toBeLessThanOrEqual(0);
  expect(prima.statoFuori, 'lo stato resta dentro il rail').toBeLessThanOrEqual(0);
  expect(prima.nomeAccorciato, 'il nome si accorcia coi puntini').toBe(true);
  // il clic (fuoco e selezione dal diagramma) non sposta il rail di lato
  await riga.click();
  await expect(rail.locator('.talos-wfr__agente[aria-current="true"]')).toContainText('Agente 99');
  expect((await misura()).scorso).toBe(0);
  expect(scritture).toEqual([]);
});

/* 09/10/2026 (bugfixer; stessa prova del desktop): la «Cronologia automazioni» diceva «Richiede attenzione · 2/3 passi» col run
   già «Riuscito · 3 di 3» nella testata. Si rileggeva solo quando il rail si rimontava; adesso anche quando lo stato del run,
   che il rail segue già, cambia. */
test('WF-HISTORY-SEGUE-IL-RUN: quando lo stato del run cambia, la cronologia delle automazioni si rilegge', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const scena = costruisciScena(14, { sessionId: 'wf-history-segue' });
  const frame = { lastSeq: (scena.panoramica.lastSeq ?? 0) + 1, nodes: [] };
  const { scritture, rilasciaFrame } = await instradaScena(page, scena, { frame, frameAMano: true });
  let statoCronologia = 'running';
  await page.route(`**/api/v1/sessions/${scena.sessionId}/workflows?*`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
    items: [{ runId: scena.runId, workflowId: scena.workflowId, version: 1, status: statoCronologia, title: 'Run di prova',
      createdAt: '2026-10-09T15:00:00.000Z', steps: { total: 14, terminal: statoCronologia === 'succeeded' ? 14 : 6 }, model: 'z-ai/glm-5.3-flash' }],
    total: 1, nextOffset: null } }) }));
  await apriRailDellaScena(page, scena);
  const history = page.locator('#railAgenti .talos-wfh');
  await expect(history.locator('.talos-wfh__open')).toHaveCount(1);
  await expect(history).toContainText('6/14');
  // il server finisce il run: la panoramica riletta dice «succeeded», e la cronologia lo deve dire anche lei
  scena.panoramica.status = 'succeeded';
  statoCronologia = 'succeeded';
  rilasciaFrame();
  await expect(history).toContainText('14/14', { timeout: 15_000 });
  expect(scritture).toEqual([]);
});
