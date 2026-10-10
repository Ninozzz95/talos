/*
 * F3-42 (25/09/2026) e refactor dei grafi (decisioni owner 24-31, 26/09/2026) — il diagramma del workflow al centro della
 * chat, sulle rotte v2 (fixture dichiarate in `aiuto-workflow-v2.mjs`, con archi, storia degli stati e discendenza nelle forme
 * vere). Prova ciò che le unitarie non vedono: la porta vera (rail v2 → «Apri diagramma»), la tela con i gruppi aperti sul
 * posto (sottografo fino a 12 passi, griglia oltre), le celle pigre a 5.000 con il DOM limitato, la vista Tempo, la
 * riproduzione fedele dalla storia, percorso e focus, la Lettura come albero ARIA con la tastiera dell'APG, il dal vivo in
 * loco, D30 (senza run si vede il grafo classico) e che niente scrive.
 */
import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

/* gli errori di QUESTA superficie: eccezioni della pagina, errori di console che non sono risorse mancanti, e ogni risposta
   ≥ 400 delle rotte del diagramma (grafo, pagine, archi, storia, discendenza) o del worker di ELK. Le altre rotte della app che
   la scena non instrada rispondono 404/503 nell'ambiente di prova, e non sono il diagramma. */
const errori = (page) => {
  const visti = [];
  page.on('pageerror', (e) => visti.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) visti.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && /\/workflows\/|\/vendor\/elk\//u.test(new URL(r.url()).pathname)) visti.push(`${r.status()} ${r.url()}`); });
  return visti;
};
const statoDelDiagramma = (page) => page.evaluate(() => window.__talosHarnessUiRuntime.statoDiagrammaWorkflow());

test('WF-UI-14: every phase open as a subgraph, one card per step, edges drawn, the principal session on top and not counted', async ({ page }) => {
  const visti = errori(page);
  const scena = costruisciScena(14, { sessionId: 'wf-ui-14' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo).toHaveAttribute('data-sorgente', 'workflow');
  await expect(grafo.locator('.gv-corsia[data-phase-id]')).toHaveCount(3);
  // una card per passo nella disposizione (la tela monta solo le visibili: a 14 passi, adattati in larghezza, lo sono tutte)
  expect((await statoDelDiagramma(page)).passi).toBe(14);
  await expect(grafo.locator('.gv-passo[data-nodo-id]')).toHaveCount(14);
  await expect(grafo.locator('.gv-gruppo')).toHaveCount(0);
  await expect(grafo.locator('[data-coordinatore]')).toHaveCount(1);
  await expect(grafo.locator('[data-coordinatore]')).toContainText('W1-02 registro processi');
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('14 agenti organizzati in 3 fasi, coordinati dalla sessione principale');
  await expect(grafo.locator('.talos-wfg__fase-nome').first()).toHaveText('Fase 1 — Analisi');
  // gli archi fra passi (dentro le fasi e fra fasi aperte), nessun arco fuso: tutte le fasi sono sottografi
  expect(await grafo.locator('.gv-arco--passo').count()).toBeGreaterThan(10);
  await expect(grafo.locator('.gv-arco--fase')).toHaveCount(0);
  // il passo in esecuzione è scelto all'apertura; il dettaglio mostra i fatti derivati, le evidenze e il compito
  const scelto = grafo.locator('.gv-passo[aria-pressed="true"]');
  await expect(scelto).toContainText('Agente 06 - Sviluppo');
  await expect(scelto).toContainText('In esecuzione');
  const dettaglio = grafo.locator('.talos-wfg__dettaglio');
  await expect(dettaglio).toContainText('Agente 06 - Sviluppo');
  await expect(dettaglio.locator('.talos-wfg__evidenza')).toHaveCount(2);
  await expect(dettaglio.locator('.talos-wfg__evidenza').first()).toContainText('src/agents/processor.py');
  await expect(dettaglio).toContainText('Implementa il passo Agente 06 - Sviluppo.');
  await expect(dettaglio).not.toContainText('%', { useInnerText: true }); // D27: nessuna percentuale per il singolo passo
  // la discendenza dal server: «Da cosa dipende» e «Cosa aspetta» coi loro conti
  await expect(dettaglio.getByRole('button', { name: /^Da cosa dipende \(\d+\)$/ })).toBeVisible();
  // un altro passo si sceglie col clic
  await grafo.locator('.gv-passo[data-nodo-id="analisi-0001"]').click();
  await expect(dettaglio).toContainText('Agente 03 - Contesto');
  await expect(dettaglio).toContainText('Concluso');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  // «Torna alla chat» chiude e restituisce la chat
  await grafo.getByRole('button', { name: 'Torna alla chat' }).click();
  await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toHaveCount(0);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-OPENING-VIEW: a small run opens with every card inside the canvas, fitted after the detail took its room', async ({ page }) => {
  // ⛔ giro vero del 26/09/2026 sul 4174 (3 fasi, 5 passi): la vista d'apertura si calcolava PRIMA che la scelta iniziale aprisse
  //   il dettaglio; il dettaglio accorcia la tela e il contenuto, centrato sull'altezza di prima, usciva tagliato in basso
  const visti = errori(page);
  const scena = costruisciScena(5, { sessionId: 'wf-ui-5' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.talos-wfg__dettaglio')).toBeVisible();
  await expect(grafo.locator('.gv-passo[data-nodo-id]')).toHaveCount(5);
  await expect.poll(() => grafo.locator('.gv-tela').evaluate((tela) => {
    const r = tela.getBoundingClientRect();
    return [...tela.querySelectorAll('.gv-passo, [data-coordinatore]')]
      .filter((carta) => { const b = carta.getBoundingClientRect(); return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 || b.left < r.left - 0.5 || b.right > r.right + 0.5; })
      .map((carta) => carta.textContent.trim().slice(0, 40));
  }), 'carte tagliate dal bordo della tela all\'apertura').toEqual([]);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-PHASE-NAME-WHOLE: a phase name in a one-step column wraps instead of «Decis…», and the header never covers a step', async ({ page }) => {
  // ⛔ Owner 26/09/2026 («nome intero»): nella colonna larga un passo (268 px) «Fase 2 — Decisioni» diventava «Fase 2 — Decis…».
  //   Qui un nome che su UNA riga non entra (misurato: al nome restano ~130 px) e su due sì.
  const scena = costruisciScena(3, { sessionId: 'wf-ui-3-nome' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.gv-passo[data-nodo-id]')).toHaveCount(3);
  /* ⛔ I passi NON stanno dentro l'elemento della colonna: sono carte a parte sulla tela. La prima stesura li cercava dentro la
     colonna, non li trovava mai, e «copre» era sempre falso — l'ha smascherata una mutazione rimasta verde. Qui si prendono per
     identificativo (nella scena, `<fase>-000N`). */
  const misure = await grafo.evaluate((radice) => [...radice.querySelectorAll('.gv-corsia[data-phase-id]')].map((corsia) => {
    const nome = corsia.querySelector('.gv-testa-nome');
    const testa = corsia.querySelector('.gv-testa').getBoundingClientRect();
    const passi = [...radice.querySelectorAll(`.gv-passo[data-nodo-id^="${corsia.dataset.phaseId}-"]`)];
    const cimaPassi = Math.min(...passi.map((p) => p.getBoundingClientRect().top));
    return {
      fase: corsia.dataset.phaseId,
      testo: nome.textContent,
      titolo: nome.title,
      passi: passi.length,
      tagliato: nome.scrollHeight > nome.clientHeight + 1 || nome.scrollWidth > nome.clientWidth + 1,
      copre: testa.bottom > cimaPassi + 0.5,
    };
  }));
  expect(misure.map((m) => m.passi), 'ogni colonna ha il suo passo da confrontare').toEqual([1, 1, 1]);
  const decisioni = misure.find((m) => m.fase === 'decisioni');
  expect(decisioni.testo).toBe('Fase 2 — Decisioni condivise');
  expect(decisioni.titolo).toBe('Fase 2 — Decisioni condivise');
  expect(misure.filter((m) => m.tagliato).map((m) => m.testo), 'nomi di fase tagliati').toEqual([]);
  expect(misure.filter((m) => m.copre).map((m) => m.fase), 'testate che coprono il primo passo').toEqual([]);
  expect(scritture).toEqual([]);
});

test('WF-UI-200: closed phases are counted group cards, the busiest one opens in place as a grid, another opens with a click', async ({ page }) => {
  const visti = errori(page);
  const scena = costruisciScena(200, { sessionId: 'wf-ui-200' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('200 agenti organizzati in 6 fasi, coordinati dalla sessione principale');
  // si apre dove si lavora di più (verifica: 12 in esecuzione), come griglia (36 passi > 12)
  const aperta = grafo.locator('.gv-corsia[data-phase-id="verifica"]');
  await expect(aperta).toHaveAttribute('data-forma', 'griglia');
  await expect(grafo.locator('.gv-gruppo')).toHaveCount(5);
  const implementazione = grafo.locator('.gv-gruppo[data-phase-id="implementazione"]');
  await expect(implementazione).toContainText('40 agenti');
  await expect(implementazione).toContainText('65%');
  await expect(implementazione.locator('.talos-wfg__conto').first()).toContainText('Conclusi26');
  // le celle della griglia arrivano con la loro pagina e dicono nome e stato
  await expect(grafo.locator('.gv-passo[data-forma="mini"][data-nodo-id]').first()).toBeVisible();
  await expect(grafo.locator('.gv-passo[data-carica="true"]')).toHaveCount(0);
  // fra fasi non aperte entrambe come sottografo: archi FUSI e contati
  expect(await grafo.locator('.gv-arco--fase').count()).toBeGreaterThan(0);
  await expect(grafo.locator('.gv-arco-conto').first()).toBeAttached();
  // un altro gruppo si apre sul posto dalla sua carta (prima si guarda tutto: «Adatta»)
  await grafo.getByRole('button', { name: 'Adatta il diagramma alla finestra' }).click();
  await implementazione.click();
  await expect(grafo.locator('.gv-corsia[data-phase-id="implementazione"]')).toHaveAttribute('data-forma', 'griglia');
  await expect(grafo.locator('.gv-gruppo')).toHaveCount(4);
  // …e si richiude dalla sua testata
  await grafo.getByRole('button', { name: 'Chiudi il gruppo Implementazione' }).click();
  await expect(grafo.locator('.gv-gruppo[data-phase-id="implementazione"]')).toHaveCount(1);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-5000: the open grid loads only the pages it shows, and the DOM stays bounded', async ({ page }) => {
  test.setTimeout(60_000);
  const visti = errori(page);
  const scena = costruisciScena(5000, { sessionId: 'wf-ui-5000' });
  const pagine = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/\/workflows\/run-5000\/groups\//u.test(u.pathname)) pagine.push(`${u.pathname.split('/').pop()}:${u.searchParams.get('offset')}`); });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('5.000 agenti organizzati in 6 fasi, coordinati dalla sessione principale');
  await expect(grafo.locator('.gv-corsia[data-phase-id="implementazione"]')).toHaveAttribute('data-forma', 'griglia');
  await expect(grafo.locator('.gv-gruppo[data-phase-id="ricerca"]')).toContainText('824 agenti');
  await expect(grafo.locator('.gv-passo[data-forma="mini"][data-nodo-id]').first()).toBeVisible();
  // il DOM non cresce coi passi: solo le celle visibili, e di 23 pagine se ne chiedono poche
  expect(await grafo.locator('.gv-passo').count()).toBeLessThan(150);
  expect(await grafo.locator('*').count()).toBeLessThan(2500);
  const diImplementazione = new Set(pagine.filter((p) => p.startsWith('implementazione:')));
  expect(diImplementazione.size).toBeLessThan(8);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-READING: the Reading view is an ARIA tree driven by the keyboard (D32, APG Tree View)', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-ui-lettura' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await grafo.getByRole('radio', { name: 'Lettura' }).click();
  const albero = grafo.getByRole('tree', { name: 'Workflow per fasi e agenti' });
  await expect(albero).toBeVisible();
  await expect(grafo.locator('.gv-tela')).toBeHidden();
  const fasi = albero.locator('[role="treeitem"][aria-level="1"]');
  await expect(fasi).toHaveCount(3);
  await expect(albero.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1); // fuoco itinerante
  await fasi.nth(2).focus();
  await page.keyboard.press('ArrowRight'); // apre la fase
  await expect(fasi.nth(2)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight'); // scende al primo passo
  await expect(page.locator(':focus')).toHaveAttribute('aria-level', '2');
  await expect(page.locator(':focus')).toContainText('Agente 11 - Test');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toContainText('Agente 12 - Sicurezza');
  await page.keyboard.press('Enter');
  await expect(grafo.locator('.talos-wfg__dettaglio')).toContainText('Agente 12 - Sicurezza');
  await expect(page.locator(':focus')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft'); // risale alla fase
  await expect(page.locator(':focus')).toHaveAttribute('aria-level', '1');
  await page.keyboard.press('Home');
  await expect(page.locator(':focus')).toContainText('Analisi');
  await page.keyboard.press('v'); // ricerca per iniziale
  await expect(page.locator(':focus')).toContainText('Validazione');
  // una vista sola nel DOM: tornando alle Dipendenze l'albero sparisce
  await grafo.getByRole('radio', { name: 'Dipendenze' }).click();
  await expect(grafo.getByRole('tree')).toHaveCount(0);
  await expect(grafo.locator('.gv-corsia[data-phase-id]')).toHaveCount(3);
  expect(scritture).toEqual([]);
});

test('WF-UI-LIVE: a run-update frame changes the step in place, without rebuilding the diagram', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-ui-live' });
  const riga = scena.righe.get('implementazione')[3]; // «Agente 09 - Build», in attesa
  const frame = { ...scena.panoramica, fromSeq: 101, lastSeq: 101, resync: false, resyncReason: null,
    nodes: [{ ...riga, state: 'running', startedAt: '2026-09-25T10:20:00.000Z', effectiveModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' } }] };
  const { scritture } = await instradaScena(page, scena, { frame });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const card = grafo.locator(`.gv-passo[data-nodo-id="${riga.nodeId}"]`);
  await expect(card).toContainText('In esecuzione');
  expect((await statoDelDiagramma(page)).passi).toBe(14); // in loco: la disposizione non è stata rifatta
  expect(scritture).toEqual([]);
});

/*
 * F3-52, giro VERO sul 4174 (25/09): le testate delle fasi restavano indietro di 1-3 s rispetto alle card, perché i conteggi
 * per fase arrivavano solo con la rilettura della panoramica. Qui la rilettura dopo il fotogramma arriva dopo 4 s: se la
 * testata si muove entro 1,5 s dalla card, l'ha mossa il fotogramma (`spostaConteggi`), non la rilettura.
 */
test('WF-UI-LIVE-HEADER: the phase header moves with the card, without waiting for the re-read', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-ui-live-header' });
  const riga = scena.righe.get('implementazione')[3]; // «Agente 09 - Build», in attesa: la fase passa da 2/5 a 3/5 terminati
  const frame = { runId: scena.runId, status: 'running', fromSeq: 101, lastSeq: 101, resync: false, resyncReason: null,
    nodes: [{ ...riga, state: 'succeeded', startedAt: '2026-09-25T10:20:00.000Z', finishedAt: '2026-09-25T10:21:00.000Z' }] };
  // ⛔ il fotogramma parte a mano: il flusso è condiviso col rail, che si iscrive per primo (vedi `frameAMano`)
  const { scritture, rilasciaFrame } = await instradaScena(page, scena, { frame, frameAMano: true, ritardaRiletturaDopoFrame: 4000 });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const testata = grafo.locator('.gv-corsia[data-phase-id="implementazione"] .gv-testa');
  const card = grafo.locator(`.gv-passo[data-nodo-id="${riga.nodeId}"]`);
  await expect(testata).toContainText('40%');
  await expect(card).not.toContainText('Concluso');
  rilasciaFrame();
  await expect(card).toContainText('Concluso', { timeout: 10_000 });
  await expect(testata).toContainText('60%', { timeout: 1500 });
  expect(scritture).toEqual([]);
});

test('WF-UI-TIME: the Time view draws one bar per attempt from the state history, with the «now» line', async ({ page }) => {
  const visti = errori(page);
  const scena = costruisciScena(14, { sessionId: 'wf-ui-tempo' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await grafo.getByRole('radio', { name: 'Tempo' }).click();
  const tempo = grafo.locator('.gv-tempo');
  await expect(tempo).toBeVisible();
  await expect(tempo.locator('.gv-tempo-riga--fase')).toHaveCount(3);
  // 7 passi partiti nella scena (4 conclusi in Analisi, 2 conclusi e 1 in corso in Implementazione): 7 barre
  await expect(tempo.locator('button.gv-tempo-barra')).toHaveCount(7);
  await expect(tempo.locator('.gv-tempo-barra[data-stato="running"]')).toHaveCount(1);
  await expect(tempo.locator('.gv-tempo-adesso')).toContainText('adesso');
  // un clic sulla barra sceglie il passo
  await tempo.locator('button.gv-tempo-barra[data-stato="running"]').click();
  await expect(grafo.locator('.talos-wfg__dettaglio')).toContainText('Agente 06 - Sviluppo');
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-REPLAY: the replay rewinds to the start from the state history and comes back live', async ({ page }) => {
  const visti = errori(page);
  const scena = costruisciScena(14, { sessionId: 'wf-ui-rip' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await expect(grafo.locator('.gv-passo[data-stato="running"]')).toHaveCount(1);
  await grafo.getByRole('slider', { name: 'Istante del run' }).focus();
  await page.keyboard.press('Home'); // all'avvio del run: nessuno lavora ancora, nessuno è concluso
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('.gv-passo[data-stato="running"]')).toHaveCount(0);
  await expect(grafo.locator('.gv-passo[data-stato="succeeded"]')).toHaveCount(0);
  await expect(grafo.locator('.talos-wfg__aggiornato-ora')).toContainText('Riproduzione alle');
  await grafo.getByRole('button', { name: 'Torna al vivo' }).click();
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  await expect(grafo.locator('.gv-passo[data-stato="running"]')).toHaveCount(1);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-FOCUS-PATH: focus dims everything outside the lineage the server gives, Path dims the unexecuted', async ({ page }) => {
  const visti = errori(page);
  const scena = costruisciScena(14, { sessionId: 'wf-ui-focus' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const dettaglio = grafo.locator('.talos-wfg__dettaglio');
  await grafo.locator('.gv-passo[data-nodo-id="analisi-0000"]').click();
  const valle = dettaglio.getByRole('button', { name: /^Cosa aspetta \(\d+\)$/ });
  await expect(valle).toBeVisible();
  await valle.click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Cosa aspetta Agente 02 - Ricerca');
  await expect(valle).toHaveAttribute('aria-pressed', 'true');
  expect(await grafo.locator('.gv-passo[data-spento="true"]').count()).toBeGreaterThan(0);
  await grafo.getByRole('button', { name: 'Togli il focus' }).click();
  await expect(grafo.locator('.gv-fuoco')).toBeHidden();
  await expect(grafo.locator('.gv-passo[data-spento="true"]')).toHaveCount(0);
  // Percorso: si spengono i passi che non sono né eseguiti né al lavoro — i passi in attesa, e solo loro
  await grafo.getByRole('button', { name: 'Percorso' }).click();
  const inAttesa = await grafo.locator('.gv-passo[data-stato="pending"], .gv-passo[data-stato="blocked"]').count();
  expect(inAttesa).toBeGreaterThan(0);
  await expect(grafo.locator('.gv-passo[data-spento="true"]')).toHaveCount(inAttesa);
  await expect(grafo.locator('.gv-passo[data-stato="running"][data-spento="false"]')).toHaveCount(1);
  expect(scritture).toEqual([]);
  expect(visti).toEqual([]);
});

test('WF-UI-D30-LEGACY: a session without runs or proposals keeps the classic delegation graph', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-ui-vuota' });
  const { scritture } = await instradaScena(page, scena, { vuota: true });
  const grafo = await apriDiagrammaDellaScena(page, scena, { vuota: true });
  await expect(page.locator('#railAgenti [data-c="WorkflowRail"]')).toHaveCount(0); // D30: niente rail v2 senza workflow
  await expect(grafo).not.toHaveAttribute('data-sorgente', 'workflow');
  await expect(grafo.locator('.talos-grafo__canvas')).toHaveCount(1);
  expect(scritture).toEqual([]);
});

test('WF-UI-SEARCH-ESC: Esc stays in the search field — it clears, then closes — and never reaches the chat during a run', async ({ page }) => {
  // ⛔ 02/10/2026, misurato: con un giro in corso Esc nel campo risaliva alla catena degli Esc della app e apriva «Fermo il giro?»
  const scena = costruisciScena(5, { sessionId: 'wf-ui-5' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', _sequenza: 99001, input: { consegna: 'prova' }, contesto: {} }, r.realSessionState.generation); });
  const lente = grafo.getByRole('button', { name: 'Cerca nel diagramma' }), campo = grafo.getByRole('searchbox', { name: 'Cerca fra agenti e fasi del diagramma' });
  await lente.click(); await expect(campo).toBeFocused();
  await page.keyboard.type('Agente 02');
  await page.keyboard.press('Escape'); await expect(campo).toHaveValue(''); await expect(campo).toBeFocused();
  await page.keyboard.press('Escape'); await expect(campo).toHaveCount(0); await expect(lente).toBeFocused();
  await page.waitForTimeout(300); // il velo si aprirebbe a fine catena degli Esc
  await expect(page.getByText('Fermo il giro?').filter({ visible: true })).toHaveCount(0);
  expect(scritture).toEqual([]);
});

test('WF-UI-SESSION-CARD-ONE-LINE: a long model name stays inside the principal session card, whole in its title', async ({ page }) => {
  // ⛔ 09/10/2026, foto dell'owner (app installata, «Sessione principale · xiaomi/mimo-v2.6-flash»): la carta è alta 96 px per
  //   la disposizione e la riga del modello andava a capo, uscendo SOTTO il bordo (misurato: 66→102 px).
  const modello = 'xiaomi/mimo-v2.6-flash';
  const scena = costruisciScena(5, { sessionId: 'wf-ui-carta-modello' });
  const { scritture } = await instradaScena(page, scena);
  const grafo = await apriDiagrammaDellaScena(page, scena, { modello });
  const carta = grafo.locator('.gv-sessione');
  const riga = carta.locator('.talos-wfg__passo-modello');
  await expect(riga).toHaveText(`Sessione principale · ${modello}`);
  await expect(riga).toHaveAttribute('title', `Sessione principale · ${modello}`);
  // nello spazio della carta (offset*, non la scala della tela): ogni riga sta dentro il bordo, e il modello è UNA riga
  const misura = await carta.evaluate((c) => [...c.querySelectorAll('span')].map((s) => {
    let top = 0; for (let n = s; n && n !== c; n = n.offsetParent) top += n.offsetTop;
    return { cls: s.className, basso: top + s.offsetHeight, alto: s.offsetHeight };
  }).concat([{ cls: 'carta', basso: c.offsetHeight }]));
  const altezza = misura.at(-1).basso;
  expect(misura.filter((m) => m.basso > altezza), 'righe che escono dalla carta').toEqual([]);
  const rigaModello = misura.find((m) => m.cls === 'talos-wfg__passo-modello');
  expect(rigaModello.alto, 'la riga del modello è una sola').toBeLessThan(24);
  expect(scritture).toEqual([]);
});
