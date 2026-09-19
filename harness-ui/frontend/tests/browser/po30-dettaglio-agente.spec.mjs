/*
 * ⛔⛔ PO-30, fetta 2 (18/09/2026) — IL DETTAGLIO DI UN AGENTE nella colonna destra, col disegno del laboratorio della PR #33,
 * sui dati VERI di `GET …/children` (la forma è quella che il backend dà davvero: `tests/attivita-figlia.test.mjs`).
 * Si misura ciò che si VEDE; ogni prova asserisce la sua premessa (le figlie sono arrivate, il dettaglio si è aperto).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'po30-dettaglio-agente');
const ALBERO = { '': [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }], src: [{ nome: 'registro.mjs', cartella: false }] };
const FIGLIE = [
  { sessionId: 'po30d-figlia-a', task: 'Sei un agente delegato.\nCompito: leggi il registro e correggi la guardia di stallo', taskCorto: 'leggi il registro e correggi la guardia', conclusa: false, interrotta: false,
    avviataAlle: new Date(Date.now() - 6 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', collisioni: [], esitoDelega: null,
    attivita: { file: [{ percorso: 'src/registro.mjs', letto: true, scritto: true, creato: false }, { percorso: 'README.md', letto: true, scritto: false, creato: false }], fileTagliati: 0, attrezzoCorrente: 'leggi', chiamate: 3,
      passi: [{ tipo: 'avvio', attrezzo: null, percorso: null, quando: '2026-09-18T01:00:00.000Z' }, { tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'src/registro.mjs', quando: '2026-09-18T01:00:05.000Z' }, { tipo: 'attrezzo', attrezzo: 'shell', percorso: null, quando: '2026-09-18T01:00:20.000Z' }], passiTagliati: 0 } },
  { sessionId: 'po30d-figlia-b', task: 'Compito: controlla i test', taskCorto: 'controlla i test', conclusa: true, interrotta: false, avviataAlle: new Date(Date.now() - 50 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only',
    collisioni: [], esitoDelega: 'I test passano tutti.', attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [{ tipo: 'fine', attrezzo: null, percorso: null, quando: null }], passiTagliati: 0 } },
];

async function scena(page, { larghezza = 1440, altezza = 900, tema = 'dark', figlie = FIGLIE } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ } }, { colorMode: tema });
  await page.route('**/api/v1/sessions/po30d-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/po30d-uno/tree?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[new URL(r.request().url()).searchParams.get('percorso') || ''] ?? [] } }) }));
  await page.route('**/api/v1/sessions/po30d-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: figlie } }) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('po30d-uno', 'workspace', 'PO30D', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9302 }, g);
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9303 }, g);
  });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) {
    const grafo=page.locator('[data-c="GrafoAgenti"]');
    if (await grafo.isVisible()) { const radice=grafo.locator('[data-nodo-id="po30d-uno"] .talos-grafo__nome'); await radice.focus(); await radice.press('Enter'); }
    else await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  }
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]').first(), 'la scena non si è formata: le figlie non sono arrivate alla scheda Agenti').toBeVisible({ timeout: 10_000 });
}
const apri = (page, quale = 0) => page.locator('#railAgenti [data-c="AgentRow"]').nth(quale).click();
const dettaglio = (page) => page.locator('[data-c="DettaglioAgente"]');

test('RIPRESA-GRAFO-INGRESSI — elenco e dettaglio aprono lo stesso grafo centrale con deleghe HTTP', async ({ page }) => {
  await scena(page);
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const grafo = page.locator('[data-c="GrafoAgenti"]');
  await expect(grafo).toBeVisible();
  await expect(grafo.locator('[data-nodo-id]')).toHaveCount(3);
  await expect(grafo.locator('[data-nodo-id="po30d-figlia-a"]')).toContainText('leggi il registro');
  await expect(grafo.locator('[data-arco]')).toHaveCount(2);
  const titoloAgente = grafo.getByRole('button', { name: 'Apri dettaglio leggi il registro e correggi la guardia', exact: true });
  await titoloAgente.hover();
  expect(await titoloAgente.evaluate(n => n.getAttribute('data-tip') || n.title)).toBe('');
  await page.waitForTimeout(450);
  await expect(page.locator('#talosTip')).toBeHidden();
  await grafo.getByRole('button', { name: 'Apri dettaglio leggi il registro e correggi la guardia', exact: true }).click();
  await expect(dettaglio(page)).toBeVisible();
  await expect(grafo).toBeVisible();
  await dettaglio(page).getByRole('button', { name: 'Apri questo agente nel diagramma' }).click();
  await expect(grafo.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-selezionato', 'true');
  await grafo.getByRole('button', { name: 'Chiudi il diagramma' }).click();
  await expect(grafo).toHaveCount(0);
  await expect(page.locator('#conversation')).toBeVisible();
});

test('RIPRESA-GRAFO-SESSIONE-VUOTA — una nuova sessione offline non eredita le deleghe precedenti', async ({ page }) => {
  await scena(page);
  await page.route('**/api/v1/sessions/po30d-vuota/children', r => r.fulfill({ status: 503, json: { ok: false, error: { message: 'Lettura non disponibile' } } }));
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('po30d-vuota', 'workspace', 'Sessione senza snapshot'));
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti').getByRole('status')).toContainText('Dati non aggiornati');
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(0);
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  await expect(page.locator('[data-c="GrafoAgenti"] [data-nodo-id]')).toHaveCount(1);
});

test('RIPRESA-GRAFO-FILTRI — ricerca lista conservata al refresh, filtri grafo e tastiera', async ({ page }) => {
  await scena(page);
  const ricerca = page.getByRole('searchbox', { name: 'Cerca agenti' });
  await ricerca.fill('registro');
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(1);
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9400 }, r.realSessionState.generation); });
  await expect(ricerca).toHaveValue('registro');
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const grafo = page.locator('[data-c="GrafoAgenti"]');
  await grafo.getByRole('searchbox', { name: 'Cerca agente nel diagramma' }).fill('controlla');
  await expect(grafo.locator('[data-nodo-id]')).toHaveCount(1);
  await grafo.getByRole('button', { name: 'Azzera filtri' }).click();
  await expect(grafo.locator('[data-nodo-id]')).toHaveCount(3);
  await grafo.getByRole('button', { name: 'Aumenta zoom' }).focus();
  await page.keyboard.press('Enter');
  await expect(grafo.locator('[data-zoom]')).not.toHaveText('100%');
});

test('RIPRESA-GRAFO-ERRORE — una rilettura fallita conserva nodi e filtro, poi recupera', async ({ page }) => {
  await scena(page);
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const grafo = page.locator('[data-c="GrafoAgenti"]');
  await page.route('**/api/v1/sessions/po30d-uno/children', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Banco temporaneamente offline' } }) }));
  await grafo.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(grafo.locator('.talos-grafo__stato')).toContainText('Dati non aggiornati');
  await expect(grafo.locator('[data-nodo-id]')).toHaveCount(3);
  await page.route('**/api/v1/sessions/po30d-uno/children', r => r.fulfill({ json: { ok: true, data: { figli: FIGLIE.map(a => ({ ...a, conclusa: true })) } } }));
  await grafo.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(grafo.locator('.talos-grafo__stato')).not.toContainText('Dati non aggiornati');
  await expect(grafo.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-stato', 'done');
});

test('RIPRESA-GRAFO-NAVIGAZIONE — ricarica ricorda la ricerca, un’altra sessione non eredita il grafo', async ({ page }) => {
  await scena(page);
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const grafo = page.locator('[data-c="GrafoAgenti"]');
  await grafo.getByRole('searchbox').fill('controlla');
  // Nuovo documento con lo stesso setup HTTP e la stessa sessione, senza ricreare il browser context.
  await scena(page);
  await expect(grafo).toBeVisible();
  await expect(grafo.getByRole('searchbox')).toHaveValue('controlla');
  await expect(grafo.locator('[data-nodo-id]')).toHaveCount(1);
  await page.route('**/api/v1/sessions/po30d-due/children', r => r.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('po30d-due', 'workspace', 'Altra sessione'));
  await expect(grafo).toHaveCount(0);
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(page.locator('#schermoChat')).not.toHaveClass(/talos-grafo-aperto/);
  await expect(page.locator('#conversation')).toHaveCSS('visibility', 'visible');
});

for (const larghezza of [1024, 1440]) for (const tema of ['dark', 'light']) {
  test(`RIPRESA-GRAFO-FOTO ${larghezza} ${tema}`, async ({ page }, testInfo) => {
    await scena(page, { larghezza, altezza: larghezza === 1024 ? 800 : 900, tema });
    await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
    const g = page.locator('[data-c="GrafoAgenti"]');
    await expect(g.locator('[data-nodo-id]')).toHaveCount(3);
    await expect(g).toBeVisible();
    const misure = await g.evaluate(n => { const c = n.querySelector('.talos-grafo__canvas').getBoundingClientRect(); const r = n.getBoundingClientRect(); return { sfonda: n.scrollWidth > n.clientWidth + 1, dentro: r.left >= 0 && r.right <= innerWidth + 1, larghezza: c.width, altezza: c.height }; });
    expect(misure.sfonda).toBe(false); expect(misure.dentro).toBe(true); expect(misure.larghezza).toBeGreaterThan(250); expect(misure.altezza).toBeGreaterThan(150);
    await page.screenshot({ path: testInfo.outputPath('grafo.png'), fullPage: true });
    await g.getByRole('button', { name: 'Apri dettaglio leggi il registro e correggi la guardia', exact: true }).click();
    await expect(dettaglio(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('grafo-dettaglio.png'), fullPage: true });
  });
}

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


test('RIPRESA-GRAFO-MOVIMENTO — tracking reale, pixel animati, identità e movimento ridotto', async ({ page }, testInfo) => {
  await scena(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const g=page.locator('[data-c="GrafoAgenti"]'), a=g.locator('[data-nodo-id="po30d-figlia-a"]');
  await expect(g.locator('[data-statistica="chiamate"] strong')).toHaveText('5');
  await expect(g.locator('[data-statistica="file"] strong')).toHaveText('2');
  await expect(g.locator('.talos-grafo__copertura')).toContainText('conteggi parziali');
  await expect(a).toHaveAttribute('data-operativo','true');
  await a.evaluate(n=>{window.__nodoPrima=n;});
  const arco=g.locator('[data-attivo="true"]').first();
  await expect(arco).toBeVisible();
  await expect(g.locator('[data-arco="delega"][data-attivo="true"]').first()).toHaveCSS('stroke-dasharray', 'none');
  await expect.poll(()=>arco.evaluate(n=>n.getAnimations().filter(a=>a.playState==='running').length)).toBe(1);
  // Stessa area dipinta, durante due fasi reali dell'animazione.
  const box=await arco.boundingBox(); const clip={x:Math.max(0,box.x-3),y:Math.max(0,box.y-3),width:Math.max(8,box.width+6),height:Math.max(8,box.height+6)};
  const prima=PNG.sync.read(await page.screenshot({clip,path:testInfo.outputPath('arco-prima.png')}));
  await page.waitForTimeout(270);
  const dopo=PNG.sync.read(await page.screenshot({clip,path:testInfo.outputPath('arco-durante.png')}));
  let diff=0;for(let i=0;i<prima.data.length;i+=4)if(prima.data[i]!==dopo.data[i]||prima.data[i+1]!==dopo.data[i+1]||prima.data[i+2]!==dopo.data[i+2])diff++;
  expect(diff).toBeGreaterThan(3);
  await g.getByRole('button',{name:'Aumenta zoom'}).click(); const zoom=await g.locator('[data-zoom]').textContent();
  await g.getByRole('button',{name:'Aggiorna',exact:true}).click();
  await expect.poll(()=>a.evaluate(n=>n===window.__nodoPrima)).toBe(true);
  await expect(g.locator('[data-zoom]')).toHaveText(zoom);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(arco).toHaveCSS('animation-name','none');
  await expect(a).toHaveCSS('transition-duration','0s');
  await g.locator('summary').click(); await expect(g.locator('.talos-grafo__eventi button').first()).toBeVisible();
});

test('RIPRESA-AGENTI-EVENTO — nuova delega e strumenti arrivano senza uscire dalla chat',async({page})=>{
 await scena(page);
 await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const nuovo={...FIGLIE[0],sessionId:'po30d-live',padreId:'po30d-uno',taskCorto:'Agente arrivato in diretta',attivita:{chiamate:1,file:[],attrezzoCorrente:'shell',passi:[]}};
 await page.route('**/api/v1/sessions/po30d-uno/children',r=>r.fulfill({json:{ok:true,data:{figli:[...FIGLIE,nuovo]}}}));
 await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,parentId:'po30d-uno',childId:agent.sessionId,reason:'created',agent}},r.realSessionState.generation);},nuovo);
 await expect(page.locator('[data-c="GrafoAgenti"] [data-nodo-id="po30d-live"]')).toBeVisible({timeout:2000});
 await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(3,{timeout:2000});
 await expect(page.locator('[data-nodo-id="po30d-live"]')).toHaveAttribute('data-operativo','true');
});

test('RIPRESA-AGENTI-CONFINI — nipote conserva padre e un evento estraneo non contamina',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const manda=async(value)=>page.evaluate(value=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value},r.realSessionState.generation)},value);
 const agent={...FIGLIE[0],sessionId:'po30d-nipote',padreId:'po30d-figlia-a',taskCorto:'Nipote in diretta'};
 await manda({version:1,sessionId:'po30d-uno',parentId:agent.padreId,childId:agent.sessionId,reason:'updated',agent});
 await expect(page.locator('[data-nodo-id="po30d-nipote"]')).toBeAttached();
 await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(3);
 await manda({version:1,sessionId:'estranea',parentId:'po30d-uno',childId:'intruso',reason:'created',agent:{...agent,sessionId:'intruso',padreId:'po30d-uno'}});
 await expect(page.locator('[data-nodo-id="intruso"]')).toHaveCount(0);
 await page.locator('[data-nodo-id="po30d-figlia-a"]').getByRole('button',{name:/Espandi o collassa/}).click();
 await expect(page.locator('[data-nodo-id="po30d-nipote"]')).toHaveCount(0);
});

test('RIPRESA-GRAFO-MADRE — anche operazioni e fine del padre si aggiornano in diretta',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const nodo=page.locator('[data-nodo-id="po30d-uno"]');
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'ToolCallStart',toolCallId:'madre-live',toolCallName:'leggi',_sequenza:10001},r.realSessionState.generation)});
 await expect(nodo).toHaveAttribute('data-operativo','true',{timeout:1500});
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'ToolCallResult',toolCallId:'madre-live',content:'letto',_sequenza:10002},r.realSessionState.generation);r.handleRealEvent({type:'RunFinished',_sequenza:10003},r.realSessionState.generation)});
 await expect(nodo).toHaveAttribute('data-operativo','false',{timeout:1500});await expect(nodo).toHaveAttribute('data-stato','done');
});

test('RIPRESA-AGENTI-RISULTATO — esito dopo fine padre non impersona TU e non riapre attesa',async({page})=>{
 await scena(page);const prima=await page.locator('#conversation [data-turno=utente]').count();
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime,g=r.realSessionState.generation;r.handleRealEvent({type:'RunFinished',_sequenza:11000},g);r.handleRealEvent({type:'QueuedMessageDelivered',origine:'delega',childId:'figlio',_sequenza:11001,testo:'Avviso\n'+JSON.stringify({schema:'talos.subagent-result.v1',childId:'figlio',stato:'concluso',compito:'Verifica',risultatoNonFidato:'Test passati <script>window.iniettato=true</script>'})},g)});
 const nota=page.locator('#conversation .real-session-status').last();await expect(nota).toContainText('Risultato del sotto-agente');await expect(nota).toContainText('Test passati');
 await expect(page.locator('#conversation [data-turno=utente]')).toHaveCount(prima);expect(await page.evaluate(()=>window.iniettato)).toBeUndefined();
 await expect(page.getByRole('button',{name:'Invia',exact:true}).first()).toBeVisible();
});

test('RIPRESA-GRAFO-RICONNESSIONE — nipote conclusa offline sostituisce snapshot live obsoleto',async({page})=>{
 await scena(page);
 await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const nipote={sessionId:'po30d-nipote',padreId:'po30d-figlia-a',taskCorto:'Verifica offline',conclusa:false,attivita:{chiamate:1,file:[],attrezzoCorrente:'leggi',passi:[]}};
 await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'po30d-uno',parentId:agent.padreId,childId:agent.sessionId,reason:'created',agent}},r.realSessionState.generation)},nipote);
 const nodo=page.locator('[data-nodo-id="po30d-nipote"]');await expect(nodo).toHaveAttribute('data-stato','active');
 await page.route('**/api/v1/sessions/po30d-figlia-a/children',r=>r.fulfill({json:{ok:true,data:{figli:[{...nipote,conclusa:true,attivita:{chiamate:2,file:[],attrezzoCorrente:null,passi:[]}}]}}}));
 await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
 await expect(nodo).toHaveAttribute('data-stato','done',{timeout:3000});await expect(nodo).toHaveAttribute('data-operativo','false');
});

test('RIPRESA-GRAFO-INDICATORI — stato visibile, animato e accessibile nei nodi',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const nodo=page.locator('[data-nodo-id="po30d-figlia-a"]'),pallino=nodo.locator('.talos-grafo__pallino');
 await expect(pallino).toBeVisible();await expect(nodo.locator('.talos-grafo__badge-stato')).toHaveText('In corso');
 expect(await pallino.evaluate(n=>getComputedStyle(n).animationName)).not.toBe('none');
 const colori=[await pallino.evaluate(n=>getComputedStyle(n).backgroundColor)];
 for(const [ultimoEsito,testo,stato] of [['ok','Concluso','done'],['errore','Errore','error']]){
  await page.evaluate(({agent,ultimoEsito})=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'po30d-uno',parentId:'po30d-uno',childId:agent.sessionId,reason:'updated',agent:{...agent,padreId:'po30d-uno',conclusa:true,ultimoEsito}}},r.realSessionState.generation)},{agent:FIGLIE[0],ultimoEsito});
  await expect(nodo).toHaveAttribute('data-stato',stato);await expect(nodo.locator('.talos-grafo__badge-stato')).toHaveText(testo);colori.push(await pallino.evaluate(n=>getComputedStyle(n).backgroundColor));
 }
 expect(new Set(colori).size).toBe(3);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await pallino.evaluate(n=>getComputedStyle(n).animationName)).toBe('none');
});

test('RIPRESA-GRAFO-MOCKUP — minimappa, file affiancato e cronologia osservata reali',async({page})=>{
 const records=[{sessionId:'po30d-uno',conclusa:false}, {...FIGLIE[0],padreId:'po30d-uno'}].map((node,i)=>({schema:'talos.agent-timeline.v1',rootId:'po30d-uno',seq:i+1,at:'2026-09-19T10:00:00Z',event:'created',node}));
 await page.route('**/api/v1/sessions/po30d-uno/agent-timeline*',r=>{const after=Number(new URL(r.request().url()).searchParams.get('after')||0);return r.fulfill({json:{ok:true,data:{schema:'talos.agent-timeline.v1',rootId:'po30d-uno',through:2,next:null,coverage:'complete',persisted:true,items:records.filter(e=>e.seq>after)}}});});
 await scena(page);await page.route('**/api/v1/sessions/po30d-figlia-a/tree/file?*',r=>r.fulfill({json:{ok:true,data:{contenuto:'export const verifica = 42;'}}}));
 await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const g=page.locator('[data-c="GrafoAgenti"]');await expect(g.getByRole('button',{name:'Panoramica del diagramma'})).toBeVisible();
 expect(await g.locator('.talos-grafo__mini [data-mini-nodo]').count()).toBe(3);
 await g.getByRole('button',{name:'Apri dettaglio leggi il registro e correggi la guardia',exact:true}).click();
 await g.getByRole('button',{name:'Affianca file',exact:true}).click();await expect(g.locator('.talos-grafo__anteprima pre')).toHaveText('export const verifica = 42;');
 await g.getByRole('button',{name:'Chiudi affiancamento'}).click();
 await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'po30d-uno',parentId:'po30d-uno',childId:agent.sessionId,reason:'completed',agent:{...agent,padreId:'po30d-uno',conclusa:true,ultimoEsito:'ok'}}},r.realSessionState.generation)},FIGLIE[0]);
 await expect(g.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-stato','done');
 const cursore=g.getByRole('slider',{name:'Cronologia osservata del diagramma'});await expect(cursore).toHaveAttribute('max','1');await cursore.fill('1');
 await expect(g.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-stato','active');await expect(g).toHaveAttribute('data-replay','true');
 await g.getByRole('button',{name:'Torna in diretta',exact:true}).click();await expect(g.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-stato','done');
});

test('RIPRESA-GRAFO-MADRE-ERRORE — errore e stop del padre non diventano successo',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const nodo=page.locator('[data-nodo-id="po30d-uno"]');
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'RunError',code:'provider-error',message:'Errore controllato',_sequenza:12000},r.realSessionState.generation)});
 await expect(nodo).toHaveAttribute('data-stato','error',{timeout:1500});
 await page.evaluate(()=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'RunStarted',_sequenza:12001,input:{consegna:'Riprova'}},r.realSessionState.generation);r.handleRealEvent({type:'RunError',code:'fermato',message:'Fermato',_sequenza:12002},r.realSessionState.generation)});
 await expect(nodo).toHaveAttribute('data-stato','interrupted',{timeout:1500});
});

for(const modalita of ['resume','redirect'])test(`RIPRESA-AGENTI-CODA-MANUALE — ${modalita} preserva fonte e mostra una sola nota`,async({page})=>{
 await scena(page);const prima=await page.locator('#conversation [data-turno=utente]').count();
 await page.evaluate(modalita=>{const r=window.__talosHarnessUiRuntime,g=r.realSessionState.generation;const meta={origine:'delega',childId:'figlio',codaId:'coda-delega-1'};const testo='Avviso\n'+JSON.stringify({schema:'talos.subagent-result.v1',childId:'figlio',stato:'concluso',compito:'Analisi ricevuta',risultatoNonFidato:'Verifica manuale terminata'});
 if(modalita==='redirect')r.handleRealEvent({type:'RunRedirectApplied',redirectId:'redirect-1',testo,...meta,_sequenza:12500},g);
 r.handleRealEvent({type:'RunStarted',input:{seguito:true,consegna:testo,...meta},_sequenza:12501},g);},modalita);
 await expect(page.locator('#conversation [data-turno=utente]')).toHaveCount(prima);await expect(page.locator('#conversation .real-session-status').filter({hasText:'Verifica manuale terminata'})).toHaveCount(1);
});

for (const larghezza of [1440, 390]) {
  test(`RIPRESA-GRAFO-CARD-INTERA ${larghezza} — badge, misure e spazio aprono, collassa resta separato`, async ({ page }) => {
    await scena(page, { larghezza });
    await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
    const grafo = page.locator('[data-c="GrafoAgenti"]');
    const card = grafo.locator('[data-nodo-id="po30d-figlia-a"]');
    // Apri visuale diagramma richiude già il rail mobile.
    for (const parte of ['.talos-grafo__badge-stato', '.talos-grafo__misure']) {
      await card.locator(parte).click();
      await expect(dettaglio(page)).toBeVisible();
      await expect(dettaglio(page)).toHaveAttribute('data-sessione-figlia', 'po30d-figlia-a');
      await dettaglio(page).getByRole('button', { name: 'Tutti gli agenti', exact: true }).click();
      if (larghezza < 600) await page.keyboard.press('Escape');
    }
    const title = card.getByRole('button', { name: /Apri dettaglio/ });
    await title.focus(); await title.press('Enter');
    await expect(dettaglio(page)).toHaveAttribute('data-sessione-figlia', 'po30d-figlia-a');
    await dettaglio(page).getByRole('button', { name: 'Tutti gli agenti', exact: true }).click();
    if (larghezza < 600) await page.keyboard.press('Escape');
    await card.click({ position: { x: 6, y: 6 } });
    await expect(dettaglio(page)).toBeVisible();
    await dettaglio(page).getByRole('button', { name: 'Tutti gli agenti', exact: true }).click();
    if (larghezza < 600) await page.keyboard.press('Escape');
    await grafo.locator('[data-nodo-id="po30d-uno"]').getByRole('button', { name: /Espandi o collassa/ }).click();
    await expect(grafo.locator('[data-nodo-id]')).toHaveCount(1);
    await expect(dettaglio(page)).toHaveCount(0);
  });
  test(`RIPRESA-AGENTE-PANORAMICA-MD ${larghezza} — compito e risultato formattati e contenuti non fidati`, async ({ page }, info) => {
    await scena(page, { larghezza });
    const task = '## Obiettivo\n\nLeggi **registro** e `src/main.js`.\n\n- Primo passo\n- Secondo passo\n\n```js\nconst esempio = 1;\n```\n\n[Documentazione](https://example.com)\n\n<img src=x onerror="window.__unsafe=1">\n\n[Pericolo](javascript:alert(1))';
    await page.route('**/api/v1/sessions/po30d-uno/children', r => r.fulfill({ json: { ok: true, data: { figli: [{ ...FIGLIE[0], task, conclusa: true, esitoDelega: '## Risultato\n\n**Completato**\n\n- Test verificati' }] } } }));
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
  const figli = Array.from({length:4}, (_,i) => ({...FIGLIE[0], sessionId:`po30d-padre-${i}`, padreId:'po30d-uno', taskCorto:`Modulo ${i}`, task:`Compito modulo ${i}`, conclusa:i>1, inAttesaApprovazione:i===1?1:0, ultimoEsito:i===3?'errore':'ok'}));
  const nipoti = figli.map((p,i)=>({...FIGLIE[1],sessionId:`po30d-nipote-${i}`,padreId:p.sessionId,taskCorto:`Verifica ${i}`}));
  const estraneo={...FIGLIE[0],sessionId:'po30d-estraneo',padreId:'altra-sessione',taskCorto:'Non appartiene'};
  await page.route(u=>u.pathname==='/api/v1/sessions',r=>r.fulfill({json:{ok:true,data:{items:[{sessionId:'po30d-uno',nome:'PO30D',conclusa:false},...figli,...nipoti,estraneo]}}}));
  for(const p of figli) await page.route(`**/api/v1/sessions/${p.sessionId}/children`,r=>r.fulfill({json:{ok:true,data:{figli:nipoti.filter(n=>n.padreId===p.sessionId)}}}));
  await scena(page,{larghezza,tema,figlie:figli});
  const rail=page.locator('#railAgenti'),rows=rail.locator('[data-c="AgentRow"]');
  await expect(rows).toHaveCount(8);await expect(rail).not.toContainText('Non appartiene');
  for (const [name,count] of [['Attivi',1],['In attesa',1],['Errori',1],['Terminati',5],['Tutti',8]]) {
   const button=rail.getByRole('button',{name,exact:true});await button.focus();await page.keyboard.press('Enter');
   await expect(button).toHaveAttribute('aria-pressed','true');await expect(rows).toHaveCount(count);
  }
  const cerca=rail.getByRole('searchbox',{name:'Cerca agenti'});await cerca.fill('Verifica');await expect(rows).toHaveCount(4);
  await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(cerca).toHaveValue('Verifica');await expect(rows).toHaveCount(4);await cerca.fill('');
  await rows.first().focus();await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(rows.first()).toBeFocused();
  await expect(rows.first().locator('.talos-agenti-icona')).toBeVisible();
  await expect(rows.first().locator('.talos-agenti-icona svg')).toHaveCSS('fill','none');
  expect(await rows.first().evaluate(n=>n.getBoundingClientRect().height)).toBeLessThan(165);
  await page.screenshot({path:info.outputPath('sidebar-elenco.png'),fullPage:true});
  await rail.getByRole('button',{name:'Apri visuale diagramma'}).click();
  const grafo=page.locator('[data-c="GrafoAgenti"]');await expect(grafo.locator('[data-nodo-id]')).toHaveCount(9);
  await expect(grafo.locator('[data-nodo-id="po30d-estraneo"]')).toHaveCount(0);
  // A 1024 il pannello destro è un overlay: torna alla chat per aprirlo dal comando reale.
  await grafo.getByRole('button',{name:'Chiudi il diagramma'}).click();
  if(!(await rail.isVisible())) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await rows.filter({hasText:'Verifica 0'}).click();await expect(dettaglio(page).locator('.talos-agente__nome')).toHaveText('Verifica 0');
  nipoti[0]={...nipoti[0],attivita:{...nipoti[0].attivita,chiamate:42}};
  await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());
  await expect(dettaglio(page).locator('.talos-kv').filter({hasText:'Attrezzi usati'})).toContainText('42');
  await page.screenshot({path:info.outputPath('sidebar-nipote.png'),fullPage:true});
  await dettaglio(page).getByRole('button',{name:'Tutti gli agenti',exact:true}).click();
  await rail.getByRole('button',{name:'Apri visuale diagramma'}).click();
  await page.route('**/api/v1/sessions/po30d-padre-0/children',r=>r.fulfill({status:503,json:{ok:false,error:{message:'Lettura nipote temporaneamente offline'}}}));
  await grafo.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(grafo.locator('.talos-grafo__stato')).toContainText('Dati non aggiornati');
  await page.evaluate(agent=>{const r=window.__talosHarnessUiRuntime;r.handleRealEvent({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'po30d-uno',parentId:agent.padreId,childId:agent.sessionId,reason:'updated',agent}},r.realSessionState.generation)},figli[1]);
  await expect(grafo.locator('.talos-grafo__stato')).toContainText('Dati non aggiornati');
  const nodoNipote=grafo.getByRole('button',{name:'Apri dettaglio Verifica 0',exact:true});await nodoNipote.focus();await page.keyboard.press('Enter');
  await expect(dettaglio(page).locator('.talos-agente__nome')).toHaveText('Verifica 0');
  await page.route('**/api/v1/sessions/po30d-padre-0/children',r=>r.fulfill({json:{ok:true,data:{figli:[nipoti[0]]}}}));
  await scena(page,{larghezza,tema,figlie:figli});await expect(rows).toHaveCount(8);

 });
}

test('RIPRESA-GRAFO-DENSITA — quattordici nodi leggibili, panoramica e ritorno alla lettura',async({page})=>{
 const figli=Array.from({length:13},(_,i)=>({...FIGLIE[0],sessionId:`po30d-denso-${i}`,taskCorto:`Agente ${i}`}));
 await scena(page,{figlie:figli});await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const g=page.locator('[data-c="GrafoAgenti"]');await expect(g.locator('[data-nodo-id]')).toHaveCount(14);
 const zoom=()=>g.locator('[data-zoom]').innerText().then(s=>parseInt(s));expect(await zoom()).toBeGreaterThanOrEqual(80);
 await g.getByRole('button',{name:'Adatta',exact:true}).click();expect(await zoom()).toBeLessThan(80);
 await g.getByRole('button',{name:'Lettura',exact:true}).click();expect(await zoom()).toBeGreaterThanOrEqual(80);
 const nodo=g.locator('[data-nodo-id="po30d-denso-12"]');await nodo.getByRole('button',{name:'Apri dettaglio Agente 12',exact:true}).focus();
 expect(await nodo.evaluate(n=>{const r=n.getBoundingClientRect(),c=n.closest('.talos-grafo__canvas').getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom})).toBe(true);
 await page.setViewportSize({width:1024,height:800});
 await expect.poll(()=>nodo.evaluate(n=>{const r=n.getBoundingClientRect(),c=n.closest('.talos-grafo__canvas').getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom})).toBe(true);
 await page.keyboard.press('Enter');await expect(dettaglio(page).locator('.talos-agente__nome')).toHaveText('Agente 12');
});


test('RIPRESA-AGENTI-STATO-IGNOTO — dati incompleti non diventano agenti attivi',async({page})=>{
 const {conclusa,...ignoto}=FIGLIE[0];await scena(page,{figlie:[ignoto]});const rail=page.locator('#railAgenti');
 await expect(rail.locator('[data-c="AgentRow"]')).toHaveAttribute('data-stato','ignoto');
 await expect(rail.locator('[data-c="AgentRow"]')).toContainText('Stato non disponibile');
 await rail.getByRole('button',{name:'Attivi',exact:true}).click();await expect(rail.locator('[data-c="AgentRow"]')).toHaveCount(0);
 await rail.getByRole('button',{name:'Non disponibili',exact:true}).click();await expect(rail.locator('[data-c="AgentRow"]')).toHaveCount(1);
});


test('RIPRESA-AGENTI-LETTURA-LENTA — refresh sovrapposti non invalidano lo snapshot',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 let richieste=0,release;const gate=new Promise(r=>release=r);
 await page.route('**/api/v1/sessions/po30d-uno/children',async r=>{richieste++;await gate;await r.fulfill({json:{ok:true,data:{figli:FIGLIE.map(a=>({...a,conclusa:true}))}}})});
 const g=page.locator('[data-c="GrafoAgenti"]');
 try {
  await g.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect.poll(()=>richieste).toBe(1);
  await g.getByRole('button',{name:'Aggiorna',exact:true}).click();await g.getByRole('button',{name:'Aggiorna',exact:true}).click();
  await page.waitForTimeout(5300);expect(richieste).toBe(1);release();
  await expect(g.locator('[data-nodo-id="po30d-figlia-a"]')).toHaveAttribute('data-stato','done');
 } finally {release();}
});


test('RIPRESA-AGENTI-ANNUNCI — refresh invariato non riannuncia il conteggio',async({page})=>{
 await scena(page);await page.locator('#railAgenti [role="status"]').evaluate(n=>{
  window.__annunci=0;window.__observerAnnunci=new MutationObserver(()=>window.__annunci++);window.__observerAnnunci.observe(n,{childList:true,characterData:true,subtree:true});
 });
 const risposta=page.waitForResponse(r=>r.url().includes('/po30d-uno/children'));
 await page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.eventSource.onopen());await risposta;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(await page.evaluate(()=>{window.__observerAnnunci.disconnect();return window.__annunci})).toBe(0);
});


test('RIPRESA-GRAFO-SNAPSHOT-INIZIALE — nessun passo fantasma prima di cambi reali',async({page})=>{
 await scena(page);await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 const g=page.locator('[data-c="GrafoAgenti"]');await expect(g.locator('.talos-grafo__timeline input')).toBeDisabled();
 const mini=g.getByRole('button',{name:'Panoramica del diagramma'});await mini.focus();const prima=await g.locator('[data-zoom]').innerText();
 await page.keyboard.press('Enter');await expect(g.locator('[data-zoom]')).toHaveText(prima);
});
