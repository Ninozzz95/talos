/*
 * ⛔⛔ PO-30, fetta 2 (18/09/2026) — IL DETTAGLIO DI UN AGENTE nella colonna destra, col disegno del laboratorio della PR #33,
 * sui dati VERI di `GET …/children` (la forma è quella che il backend dà davvero: `tests/attivita-figlia.test.mjs`).
 * Si misura ciò che si VEDE; ogni prova asserisce la sua premessa (le figlie sono arrivate, il dettaglio si è aperto).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/* 14/10/2026 — le deleghe stanno sul diagramma nuovo (quello del Workflow): la vista classica è stata tolta. Le prove che erano
   SUE sono passate in `deleghe-sul-diagramma.spec.mjs`, `deleghe-diagramma-parita.spec.mjs`, `-memoria`, `-dati-fermi`, `-vuoto`
   e `-registro-vero` (chi copre che cosa: handoff `TABELLA-PROVE-CLASSICA-2026-10-13.md`). Qui restano il dettaglio dell'agente e
   il pannello Agenti; dove aprono il diagramma, è quello nuovo. */

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'po30-dettaglio-agente');
const ALBERO = { '': [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }], src: [{ nome: 'registro.mjs', cartella: false }] };
const FIGLIE = [
  { sessionId: 'po30d-figlia-a', task: 'Sei un agente delegato.\nCompito: leggi il registro e correggi la guardia di stallo', taskCorto: 'leggi il registro e correggi la guardia', conclusa: false, interrotta: false,
    avviataAlle: new Date(Date.now() - 6 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', collisioni: [], esitoDelega: null,
    attivita: { file: [{ percorso: 'src/registro.mjs', letto: true, scritto: true, creato: false }, { percorso: 'README.md', letto: true, scritto: false, creato: false }], fileTagliati: 0, attrezzoCorrente: 'leggi', chiamate: 3,
      passi: [{ tipo: 'avvio', attrezzo: null, percorso: null, quando: '2026-09-18T01:00:00.000Z' }, { tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'src/registro.mjs', quando: '2026-09-18T01:00:05.000Z' }, { tipo: 'attrezzo', attrezzo: 'shell', percorso: null, quando: '2026-09-18T01:00:20.000Z' }], passiTagliati: 0 } },
  { sessionId: 'po30d-figlia-b', task: 'Compito: controlla i test', taskCorto: 'controlla i test', conclusa: true, interrotta: false, avviataAlle: new Date(Date.now() - 50 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only',
    // 0.1.23: lo stato e il resoconto come li manda il server (`snapshotFiglio`): `esitoDelega` è uno stato, mai il testo
    collisioni: [], esitoDelega: 'concluso', riassuntoDelega: 'I test passano tutti.', attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [{ tipo: 'fine', attrezzo: null, percorso: null, quando: null }], passiTagliati: 0 } },
];

async function scena(page, { larghezza = 1440, altezza = 900, tema = 'dark', figlie = FIGLIE } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ } }, { colorMode: tema });
  /* VELO-SPEC-3 (08/10/2026, bugfixer): flusso APERTO E MUTO e il confine dopo l'apertura, come VELO-SPEC e c2b-coordinazione. Con un
     corpo vuoto e nessun confine la chat restava sotto il velo («Apro una cronologia lunga…») e la scheda Agenti diceva «0 di 0
     agenti»: 37 prove su 41 rosse l'08/10 sera, misurate identiche anche su 36a1346f7. */
  await page.route('**/api/v1/sessions/po30d-*/events*', () => { /* resta pending: aperto e muto */ });
  await page.route('**/api/v1/sessions/po30d-uno/tree?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[new URL(r.request().url()).searchParams.get('percorso') || ''] ?? [] } }) }));
  await page.route('**/api/v1/sessions/po30d-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: figlie } }) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('po30d-uno', 'workspace', 'PO30D', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g); // VELO-SPEC-3: il confine che il server manda sempre, prima degli eventi vivi
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9302 }, g);
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9303 }, g);
  });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) {
    // a finestra stretta la colonna destra è chiusa: col diagramma aperto la apre la scheda in cima (è la conversazione), se no «Dettagli»
    const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
    if (await grafo.isVisible()) await grafo.locator('.gv-sessione').click();
    else await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  }
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]').first(), 'la scena non si è formata: le figlie non sono arrivate alla scheda Agenti').toBeVisible({ timeout: 10_000 });
}
/* pannello v2 (29/10/2026): la riga si apre sul posto, la conversazione dell'agente col pulsante del suo dettaglio */
const apri = async (page, quale = 0) => { const r = page.locator('#railAgenti [data-c="AgentRow"]').nth(quale); if ((await r.getAttribute('aria-expanded')) !== 'true') await r.click(); await r.locator('[data-controllo="apri-conversazione"]').click(); };
const dettaglio = (page) => page.locator('[data-c="DettaglioAgente"]');

test('PO30-AGENTE-01 — si apre sulla Panoramica: compito intero, fatti veri in parole umane, niente righe vuote', async ({ page }) => {
  await scena(page);
  await apri(page);
  const d = dettaglio(page);
  await expect(d).toBeVisible();
  await expect(d).toHaveAttribute('data-sezione', 'panoramica');
  await expect(d.locator('.talos-agente__nome')).toHaveText('leggi il registro e correggi la guardia');
  await expect(d.locator('.talos-agente__chi [role="status"]')).toHaveText('In corso');
  await expect(d.locator('.talos-agente__compito').first()).toContainText('correggi la guardia di stallo');
  const fatti = await d.locator('[data-pannello="panoramica"] .talos-kv').evaluateAll((righe) => Object.fromEntries(righe.map((r) => [r.querySelector('.talos-kv__k').textContent, r.querySelector('.talos-kv__v').textContent])));
  expect(fatti.Modello).toBe('z-ai/glm-5.3-flash');
  expect(fatti.Permessi).toBe('Scrive nel progetto');
  expect(fatti['Attrezzi usati']).toBe('3');
  expect(fatti.Partito).toMatch(/min fa$/);
  expect(fatti['Sta usando'], 'il nome dell’attrezzo è quello UMANO, mai quello tecnico').not.toBe('leggi');
  expect(Object.values(fatti).every((v) => v && v.trim() !== '' && v.trim() !== '—'), `una riga senza dato non si disegna: ${JSON.stringify(fatti)}`).toBe(true);
  await expect(d.getByText(/dimostrativ|demo|fixture/i), 'niente stati «demo» nel prodotto').toHaveCount(0);
});

/* ⛔ TACCUINO (09/10/2026, bugfixer) — la riga VERA di `…/children` di una figlia fermata con `POST …/stop` (misurata sulla 4176):
   `interrotta:false`, `esitoDelega:'fallito'`, `motivoChiusura:'fermata'`. Il dettaglio diceva «Non riuscito» in rosso, l'elenco
   «Interrotta». */
const FERMATA = { ...FIGLIE[1], sessionId: 'po30d-figlia-f', taskCorto: 'crea il file', task: 'Compito: crea il file', esitoDelega: 'fallito', riassuntoDelega: null,
  ultimoEsito: 'errore', motivoChiusura: 'fermata' };
const IGNOTA = { ...FIGLIE[1], sessionId: 'po30d-figlia-i', taskCorto: 'stato perso', task: 'Compito: stato perso', conclusa: undefined, esitoDelega: null };

test('TACCUINO-AGENTE-FERMATO — una figlia fermata dalla persona: «Interrotto» nel dettaglio come nell’elenco, mai «Non riuscito»', async ({ page }) => {
  await scena(page, { figlie: [FERMATA] });
  await expect(page.locator('#railAgenti [data-c="AgentRow"]').first(), 'pannello v2: la parola di stato del prodotto («Interrotto», come il diagramma, owner 14/10)').toContainText('Interrotto');
  await apri(page);
  const stato = dettaglio(page).locator('.talos-agente__chi [role="status"]');
  await expect(stato).toHaveText('Interrotto');
  await expect(stato).not.toHaveClass(/talos-badge--danger/);
});

/* ⛔ TACCUINO (09/10/2026, bugfixer) — la riga dei filtri andava a capo da sola: «Tutti … Terminati» a y=180 e «Interrotti» a y=210
   (misurato sulla 4176, colonna di ~307 px). Ora una riga sola che scorre, col bordo che sfuma solo dove c'è un filtro tagliato
   (Hermes `pane-tab.tsx`/`fade-scroll.tsx`), e la rotella verticale la fa scorrere finché c'è qualcosa da mostrare. */
test('TACCUINO-FILTRI — i filtri degli agenti stanno su UNA riga anche stretti e coi filtri rari; se non ci stanno scorrono e lo dicono', async ({ page }) => {
  await scena(page, { larghezza: 1024, altezza: 800, figlie: [...FIGLIE, FERMATA, IGNOTA] });
  /* pannello v2 (29/10/2026): i filtri stanno nella ricerca della testa (`.pn-chips`); il filtro raro «Interrotti» è `filtro-fermati` */
  await page.locator('#railAgenti [data-controllo="apri-cerca"]').click();
  const riga = page.locator('#railAgenti .pn-chips');
  await expect(riga.locator('[data-controllo="filtro-fermati"]'), 'la premessa: il filtro raro c’è').toBeVisible();
  const m = await riga.evaluate((r) => ({ cime: [...new Set([...r.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => b.offsetTop))],
    client: r.clientWidth, scroll: r.scrollWidth, taglio: r.dataset.taglio }));
  expect(m.cime, `una riga sola: cime dei bottoni ${JSON.stringify(m.cime)}`).toHaveLength(1);
  if (m.scroll <= m.client + 1) {
    expect(m.taglio, 'ci sta: nessun bordo sfuma («a list that fits must not be dimmed at all»)').toBe('nessuno');
    /* il caso che deve scorrere si prova SEMPRE, non solo quando la colonna è stretta per caso: si stringe la riga */
    await riga.evaluate((r) => { r.style.width = '160px'; r.style.flex = 'none'; });
  }
  await expect.poll(() => riga.evaluate((r) => r.scrollWidth > r.clientWidth + 1), { message: 'la premessa: la riga trabocca' }).toBe(true);
  await expect.poll(() => riga.evaluate((r) => r.dataset.taglio), { message: 'trabocca: sfuma il lato destro, solo quello' }).toBe('dopo');
  expect(await riga.evaluate((r) => [...new Set([...r.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => b.offsetTop))].length), 'stretta, ancora una riga sola').toBe(1);
  const box = await riga.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => riga.evaluate((r) => r.scrollLeft), { message: 'la rotella verticale fa scorrere la riga' }).toBeGreaterThan(0);
  await expect.poll(() => riga.evaluate((r) => r.dataset.taglio)).toMatch(/^(prima|entrambi)$/u);
});

/* C3 tappa 4 (owner 09/10, «fatti strutturati + nota»): una figlia che poteva modificare e non ha scritto niente resta
   «Conclusa», e la scheda lo dice con la nota; una figlia senza nota non la mostra. */
test('C3-AGENTE-NOTA — «no change made» is said on a concluded agent, never as a failure', async ({ page }) => {
  const figlie = [FIGLIE[0], { ...FIGLIE[1], notaDelega: 'nessuna-modifica', verdettoDelega: 'strutturato' }];
  await scena(page, { figlie });
  { const r = page.locator('#railAgenti [data-c="AgentRow"]').filter({ hasText: 'controlla i test' }); await r.click(); await r.locator('[data-controllo="apri-conversazione"]').click(); }
  const d = dettaglio(page);
  await expect(d.locator('.talos-agente__chi [role="status"]')).toHaveText('Concluso');
  await expect(d.locator('[data-nota-delega="nessuna-modifica"]')).toHaveText('Nessuna modifica fatta: questo agente poteva modificare i file ma non ne ha scritto nessuno. Controlla se una modifica serviva.');
  // al contrario: la figlia senza nota non la mostra (scena di nuovo: col dettaglio aperto l'elenco è coperto)
  await scena(page, { figlie });
  { const r = page.locator('#railAgenti [data-c="AgentRow"]').filter({ hasText: 'leggi il registro' }); await r.click(); await r.locator('[data-controllo="apri-conversazione"]').click(); }
  await expect(dettaglio(page).locator('.talos-agente__nome')).toHaveText('leggi il registro e correggi la guardia');
  await expect(dettaglio(page).locator('[data-nota-delega]')).toHaveCount(0);
});

test('PO30-AGENTE-02 — un file coinvolto porta AL FILE: scheda File scelta, riga selezionata', async ({ page }) => {
  await scena(page);
  await apri(page);
  const file = dettaglio(page).locator('[data-pannello="panoramica"] .talos-agente__file');
  await expect(file).toHaveCount(2);
  await expect(file.first().locator('.talos-agente__file-segno')).toHaveText('Modificato');
  await expect(file.nth(1).locator('.talos-agente__file-segno')).toHaveText('Letto');
  await file.first().click();
  await expect(page.locator('#railTabs [data-rail="file"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#alberoFile .ft-row.ft-selected'), 'il file dell’agente è stato portato in vista e selezionato nell’albero').toContainText('registro.mjs');
  await expect(dettaglio(page), 'cambiando scheda il dettaglio NON resta a schermo (guardia della PR #33)').toBeHidden();
});

test('PO30-AGENTE-03 — le sezioni: File ed Eventi dai dati veri, la Conversazione è quella di sempre, e la sezione si RICORDA', async ({ page }) => {
  await scena(page);
  await apri(page);
  const d = dettaglio(page);
  await d.locator('[data-sezione="eventi"]').click();
  await expect(d.locator('[data-pannello="panoramica"]')).toBeHidden();
  const frasi = await d.locator('[data-pannello="eventi"] .talos-agente__frase').allTextContents();
  expect(frasi[0]).toBe('Compito assegnato');
  expect(frasi[1]).toMatch(/· src\/registro\.mjs$/);
  expect(frasi.join(' '), 'nessun nome tecnico di attrezzo a schermo').not.toMatch(/\b(leggi|shell|delega_sottotask)\b/);
  await d.locator('[data-sezione="file"]').click();
  await expect(d.locator('[data-pannello="file"] .talos-agente__file')).toHaveCount(2);
  await d.locator('[data-sezione="conversazione"]').click();
  await expect(d.locator('.talos-figlia')).toBeVisible();
  await expect(d.locator('.talos-figlia__head'), 'dentro il dettaglio la testata della conversazione non si ripete').toBeHidden();

  await d.locator('[data-azione="tutti-gli-agenti"]').click();
  await expect(page.locator('#railAgenti')).toBeVisible();
  await expect(dettaglio(page)).toHaveCount(0);
  await apri(page);
  await expect(dettaglio(page), 'riaprendo lo stesso agente si torna alla sezione che si stava guardando').toHaveAttribute('data-sezione', 'conversazione');
  await dettaglio(page).locator('[data-azione="tutti-gli-agenti"]').click();
  await apri(page, 1);
  await expect(dettaglio(page), 'un ALTRO agente si apre sulla Panoramica').toHaveAttribute('data-sezione', 'panoramica');
  await expect(dettaglio(page).locator('.talos-agente__chi [role="status"]')).toHaveText('Concluso');
  await expect(dettaglio(page).getByText('I test passano tutti.')).toBeVisible();
  await expect(dettaglio(page).getByText('Non ha letto né scritto file.')).toBeVisible();
});

for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  for (const tema of ['dark', 'light']) {
    test(`PO30-AGENTE-FOTO ${larghezza}x${altezza} ${tema}`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      await apri(page);
      await expect(dettaglio(page)).toBeVisible();
      await page.waitForTimeout(300);
      mkdirSync(FOTO, { recursive: true });
      await page.screenshot({ path: join(FOTO, `panoramica-${larghezza}x${altezza}-${tema}.png`) });
      await dettaglio(page).locator('[data-sezione="eventi"]').click();
      await page.screenshot({ path: join(FOTO, `eventi-${larghezza}x${altezza}-${tema}.png`) });
      const sfonda = await page.evaluate(() => { const p = document.querySelector('[data-c="DettaglioAgente"]'); const c = p.closest('.talos-inspector'); return { largo: p.scrollWidth > p.clientWidth + 1, alto: Math.round(p.getBoundingClientRect().bottom) > Math.round(c.getBoundingClientRect().bottom) + 1 }; });
      expect(sfonda, 'il dettaglio non sfonda la colonna, né in larghezza né in altezza').toEqual({ largo: false, alto: false });
    });
  }
}


test('RIPRESA-AGENTI-EVENTO — nuova delega e strumenti arrivano senza uscire dalla chat',async({page})=>{
 await scena(page);
 await page.locator('#railAgenti [data-controllo="apri-diagramma"]').click();
 const grafo=page.locator('#schermoChat > [data-c="GrafoAgenti"]');await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
 const nuovo={...FIGLIE[0],sessionId:'po30d-live',padreId:'po30d-uno',taskCorto:'Agente arrivato in diretta',attivita:{chiamate:1,file:[],attrezzoCorrente:'shell',passi:[]}};
 await page.route('**/api/v1/sessions/po30d-uno/children',r=>r.fulfill({json:{ok:true,data:{figli:[...FIGLIE,nuovo]}}}));
 await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,parentId:'po30d-uno',childId:agent.sessionId,reason:'created',agent}},r.realSessionState.generation);},nuovo);
 await expect(grafo.locator('[data-sessione="po30d-live"]')).toBeVisible({timeout:2000});
 await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(3,{timeout:2000});
 await expect(grafo.locator('[data-sessione="po30d-live"]')).toHaveAttribute('data-stato','running');
});

test('RIPRESA-AGENTI-RISULTATO — esito dopo fine padre non impersona TU e non riapre attesa',async({page})=>{
 await scena(page);const prima=await page.locator('#conversation [data-turno=utente]').count();
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime,g=r.realSessionState.generation;r.handleRealEvent({type:'RunFinished',_sequenza:11000},g);r.handleRealEvent({type:'QueuedMessageDelivered',origine:'delega',childId:'figlio',_sequenza:11001,testo:'Avviso\n'+JSON.stringify({schema:'talos.subagent-result.v1',childId:'figlio',stato:'concluso',compito:'Verifica',risultatoNonFidato:'Test passati <script>window.iniettato=true</script>'})},g)});
 const nota=page.locator('#conversation .real-session-status').last();await expect(nota).toContainText('Risultato del sotto-agente');await expect(nota).toContainText('Test passati');
 await expect(page.locator('#conversation [data-turno=utente]')).toHaveCount(prima);expect(await page.evaluate(()=>window.iniettato)).toBeUndefined();
 await expect(page.getByRole('button',{name:'Invia',exact:true}).first()).toBeVisible();
});

for(const modalita of ['resume','redirect'])test(`RIPRESA-AGENTI-CODA-MANUALE — ${modalita} preserva fonte e mostra una sola nota`,async({page})=>{
 await scena(page);const prima=await page.locator('#conversation [data-turno=utente]').count();
 await page.evaluate(modalita=>{const r=window.__talosHarnessUiRuntime,g=r.realSessionState.generation;const meta={origine:'delega',childId:'figlio',codaId:'coda-delega-1'};const testo='Avviso\n'+JSON.stringify({schema:'talos.subagent-result.v1',childId:'figlio',stato:'concluso',compito:'Analisi ricevuta',risultatoNonFidato:'Verifica manuale terminata'});
 if(modalita==='redirect')r.handleRealEvent({type:'RunRedirectApplied',redirectId:'redirect-1',testo,...meta,_sequenza:12500},g);
 r.handleRealEvent({type:'RunStarted',input:{seguito:true,consegna:testo,...meta},_sequenza:12501},g);},modalita);
 await expect(page.locator('#conversation [data-turno=utente]')).toHaveCount(prima);await expect(page.locator('#conversation .real-session-status').filter({hasText:'Verifica manuale terminata'})).toHaveCount(1);
});

for (const larghezza of [1440, 390]) {
  test(`RIPRESA-AGENTE-PANORAMICA-MD ${larghezza} — compito e risultato formattati e contenuti non fidati`, async ({ page }, info) => {
    await scena(page, { larghezza });
    const task = '## Obiettivo\n\nLeggi **registro** e `src/main.js`.\n\n- Primo passo\n- Secondo passo\n\n```js\nconst esempio = 1;\n```\n\n[Documentazione](https://example.com)\n\n<img src=x onerror="window.__unsafe=1">\n\n[Pericolo](javascript:alert(1))';
    await page.route('**/api/v1/sessions/po30d-uno/children', r => r.fulfill({ json: { ok: true, data: { figli: [{ ...FIGLIE[0], task, conclusa: true, esitoDelega: 'concluso', riassuntoDelega: '## Risultato\n\n**Completato**\n\n- Test verificati' }] } } }));
    await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'md', toolCallName: 'delega_sottotask', _sequenza: 9994 }, r.realSessionState.generation); r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'md', content: 'ok', _sequenza: 9995 }, r.realSessionState.generation); });
    await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(1);
    await apri(page);
    const p = dettaglio(page).locator('[data-pannello="panoramica"]');
    await expect(p.getByRole('heading', { name: 'Obiettivo' })).toBeVisible();
    await expect(p.locator('strong').filter({ hasText: 'registro' })).toBeVisible();
    await expect(p.locator('li')).toHaveCount(3);
    await expect(p.locator('pre code')).toContainText('const esempio = 1;');
    await expect(p.getByRole('heading', { name: 'Risultato' })).toHaveCount(1);
    const link = p.getByRole('link', { name: 'Documentazione', exact: true });
    await expect(link).toHaveAttribute('href', 'https://example.com');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(p).toContainText('Pericolo');
    await expect(p.locator('script,img,iframe,[onerror],a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
    expect(await p.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await info.attach(`panoramica-md-${larghezza}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}


for (const larghezza of [1024, 1440]) for (const tema of ['dark', 'light']) {
 test(`RIPRESA-AGENTI-DISCENDENTI / SIDEBAR-DESTRA-MOCKUP ${larghezza} ${tema}`, async ({page}, info) => {
  const figli = Array.from({length:4}, (_,i) => ({...FIGLIE[0], sessionId:`po30d-padre-${i}`, padreId:'po30d-uno', taskCorto:`Modulo ${i}`, task:`Compito modulo ${i}`, conclusa:i>1, inAttesaApprovazione:i===1 /* 24/10: il server manda un vero/falso (`session-registry.mjs`, `Boolean(voce.approvazionePendente)`), non un numero */, ultimoEsito:i===3?'errore':'ok'}));
  const nipoti = figli.map((p,i)=>({...FIGLIE[1],sessionId:`po30d-nipote-${i}`,padreId:p.sessionId,taskCorto:`Verifica ${i}`}));
  const estraneo={...FIGLIE[0],sessionId:'po30d-estraneo',padreId:'altra-sessione',taskCorto:'Non appartiene'};
  await page.route(u=>u.pathname==='/api/v1/sessions',r=>r.fulfill({json:{ok:true,data:{items:[{sessionId:'po30d-uno',nome:'PO30D',conclusa:false},...figli,...nipoti,estraneo]}}}));
  for(const p of figli) await page.route(`**/api/v1/sessions/${p.sessionId}/children`,r=>r.fulfill({json:{ok:true,data:{figli:nipoti.filter(n=>n.padreId===p.sessionId)}}}));
  await scena(page,{larghezza,tema,figlie:figli});
  const rail=page.locator('#railAgenti'),rows=rail.locator('[data-c="AgentRow"]');
  await expect(rows).toHaveCount(8);await expect(rail).not.toContainText('Non appartiene');
  /* pannello v2 (29/10/2026): i filtri di oggi stanno nella ricerca della testa; stessi confini (Attivi = In corso, Terminati = Conclusi) */
  await rail.locator('[data-controllo="apri-cerca"]').click();
  for (const [filtro,count] of [['in-corso',1],['attesa',1],['errori',1],['conclusi',5],['tutti',8]]) {
   const button=rail.locator(`[data-controllo="filtro-${filtro}"]`);await button.focus();await page.keyboard.press('Enter');
   await expect(rail.locator(`[data-controllo="filtro-${filtro}"]`)).toHaveAttribute('aria-pressed','true');await expect(rows).toHaveCount(count);
  }
  const cerca=rail.getByRole('searchbox');await cerca.fill('Verifica');await expect(rows).toHaveCount(4);
  await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(cerca).toHaveValue('Verifica');await expect(rows).toHaveCount(4);await cerca.fill('');
  await expect(rows).toHaveCount(8); // la ricerca vuota ridisegna al fotogramma dopo: prima si leggerebbe la prima riga del filtro (nipote-0)
  /* pannello v2: dopo la riconnessione l'ordine può cambiare (chi chiede attenzione sale in cima); il fuoco resta sulla STESSA riga */
  const chiaveFuoco=await rows.first().getAttribute('data-chiave');
  await rows.first().focus();await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(rail.locator(`[data-c="AgentRow"][data-chiave="${chiaveFuoco}"]`)).toBeFocused();
  await expect(rows.first().locator('.pn-segno')).toBeVisible();
  await expect(rows.first().locator('.pn-segno svg')).toHaveCSS('fill','none');
  expect(await rows.first().evaluate(n=>n.getBoundingClientRect().height)).toBeLessThan(165);
  await page.screenshot({path:info.outputPath('sidebar-elenco.png'),fullPage:true});
  await rail.locator('[data-controllo="apri-diagramma"]').click();
  const grafo=page.locator('#schermoChat > [data-c="GrafoAgenti"]');await expect(grafo).toHaveAttribute('data-sorgente','deleghe');
  // quattro agenti e i loro quattro nipoti: tutti nel diagramma (un lotto della conversazione, quattro degli agenti); l'estraneo no
  await expect(grafo.locator('.talos-wfg__cima')).toContainText('8 agenti in 5 lotti');
  await expect(grafo.locator('[data-sessione="po30d-estraneo"]')).toHaveCount(0);
  // A 1024 il pannello destro è un overlay: torna alla chat per aprirlo dal comando reale.
  await grafo.locator('.talos-wfg__torna').click();
  if(!(await rail.isVisible())) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  { const r=rows.filter({hasText:'Verifica 0'}); if((await r.getAttribute('aria-expanded'))!=='true') await r.click(); await r.locator('[data-controllo="apri-conversazione"]').click(); } await expect(dettaglio(page).locator('.talos-agente__nome')).toHaveText('Verifica 0');
  nipoti[0]={...nipoti[0],attivita:{...nipoti[0].attivita,chiamate:42}};
  await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(dettaglio(page).locator('.talos-kv').filter({hasText:'Attrezzi usati'})).toContainText('42');
  await page.screenshot({path:info.outputPath('sidebar-nipote.png'),fullPage:true});
  await dettaglio(page).getByRole('button',{name:'Tutti gli agenti',exact:true}).click();
  await rail.locator('[data-controllo="apri-diagramma"]').click();
  await page.route('**/api/v1/sessions/po30d-padre-0/children',r=>r.fulfill({status:503,json:{ok:false,error:{message:'Lettura nipote temporaneamente offline'}}}));
  // il diagramma nuovo non ha «Aggiorna»: rilegge da solo; qui la rilettura la porta la riconnessione del flusso
  await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());await expect(grafo.locator('.talos-wfg__avviso')).toContainText('Dati non aggiornati',{timeout:9000});
  await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'po30d-uno',parentId:agent.padreId,childId:agent.sessionId,reason:'updated',agent}},r.realSessionState.generation)},figli[1]);
  await expect(grafo.locator('.talos-wfg__avviso')).toContainText('Dati non aggiornati');
  const schedaNipote=grafo.locator('[data-sessione="po30d-nipote-0"]');await schedaNipote.focus();await page.keyboard.press('Enter');
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa')).toContainText('Verifica 0');
  await page.route('**/api/v1/sessions/po30d-padre-0/children',r=>r.fulfill({json:{ok:true,data:{figli:[nipoti[0]]}}}));
  await scena(page,{larghezza,tema,figlie:figli});await expect(rows).toHaveCount(8);

 });
}

test('RIPRESA-AGENTI-STATO-IGNOTO — dati incompleti non diventano agenti attivi',async({page})=>{
 const {conclusa,...ignoto}=FIGLIE[0];await scena(page,{figlie:[ignoto]});const rail=page.locator('#railAgenti');
 /* pannello v2: lo stato non noto è `unknown` (oggi `ignoto`), con la stessa parola e il suo filtro raro */
 await expect(rail.locator('[data-c="AgentRow"]')).toHaveAttribute('data-stato','unknown');
 await expect(rail.locator('[data-c="AgentRow"]')).toContainText('Stato non disponibile');
 await rail.locator('[data-controllo="apri-cerca"]').click();
 await expect(rail.locator('[data-controllo="filtro-in-corso"]'), 'nessun agente «in corso»: il filtro non compare nemmeno').toHaveCount(0);
 await rail.locator('[data-controllo="filtro-ignoti"]').click();await expect(rail.locator('[data-c="AgentRow"]')).toHaveCount(1);
 await expect(page.locator('#railTabs [data-rail="agenti"] .talos-tabs__count'), 'dati incompleti non diventano un agente attivo nel numero').toHaveCount(0);
});


test('RIPRESA-AGENTI-LETTURA-LENTA — riletture sovrapposte non si accumulano e non invalidano lo stato',async({page})=>{
 test.setTimeout(45_000);
 await scena(page);await page.locator('#railAgenti [data-controllo="apri-diagramma"]').click();
 const g=page.locator('#schermoChat > [data-c="GrafoAgenti"]');await expect(g.locator('[data-sessione]')).toHaveCount(2);
 let richieste=0,release;const gate=new Promise(r=>release=r);
 await page.route('**/api/v1/sessions/po30d-uno/children',async r=>{richieste++;await gate;await r.fulfill({json:{ok:true,data:{figli:FIGLIE.map(a=>({...a,conclusa:true,esitoDelega:'concluso'}))}}})});
 try {
  // il diagramma rilegge da solo ogni 5 s (non ha più «Aggiorna»): con la prima lettura ancora in volo le successive non partono
  await expect.poll(()=>richieste,{timeout:9000}).toBe(1);
  await page.waitForTimeout(11_000);expect(richieste,'due battiti dopo, la lettura in volo è ancora una sola').toBe(1);release();
  await expect(g.locator('[data-sessione="po30d-figlia-a"]')).toHaveAttribute('data-stato','succeeded',{timeout:9000});
 } finally {release();}
});


/* pannello v2: il conto sta nella testa, che NON è una regione viva; le sole regioni vive sono la barra delle pagine e gli esiti.
   Con due agenti non c'è nessuna delle due: una rilettura invariata non deve farne nascere una (che si annuncerebbe). */
test('RIPRESA-AGENTI-ANNUNCI — refresh invariato non riannuncia il conteggio',async({page})=>{
 await scena(page);
 await expect(page.locator('#railAgenti [role="status"], #railAgenti [aria-live]')).toHaveCount(0);
 await page.locator('#railAgenti').evaluate(n=>{
  window.__annunci=0;window.__observerAnnunci=new MutationObserver((m)=>{for(const r of m)for(const x of r.addedNodes)if(x.nodeType===1&&(x.matches('[role="status"],[aria-live]')||x.querySelector('[role="status"],[aria-live]')))window.__annunci++;});window.__observerAnnunci.observe(n,{childList:true,subtree:true});
 });
 const risposta=page.waitForResponse(r=>r.url().includes('/po30d-uno/children'));
 await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());await risposta;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(await page.evaluate(()=>{window.__observerAnnunci.disconnect();return window.__annunci})).toBe(0);
});


