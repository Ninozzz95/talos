import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/*
 * IL CANCELLO DI PARITÀ — «non deve cambiare nulla» reso meccanico.
 *
 * Ordine dell'owner (05/09/2026): la app deve essere il mockup approvato,
 * esattamente, con l'unica differenza che funziona. Questo file confronta la
 * app con il mockup schermata per schermata, alle tre viewport desktop, su due
 * piani che non si sostituiscono a vicenda:
 *   1. la STRUTTURA — la sequenza dei blocchi `data-c` e delle classi dentro
 *      ogni schermata deve essere identica (è il contratto dei componenti);
 *   2. i PIXEL — lo screenshot del guscio deve coincidere entro una soglia
 *      che tollera solo l'hinting dei font (pixelmatch).
 * Un rosso qui non si tara: si guarda il diff in `artifacts/parita/` e si
 * corregge la app, mai il mockup — che cambia solo per mano dell'owner.
 *
 * ⛔ Le due pagine si aprono UNA volta per viewport e si riusano: la prima
 * versione le riapriva a ogni prova (54 volte due pagine da 190 KB) ed è
 * andata in timeout dopo dieci minuti senza finire.
 *
 * ⛔ Il mockup si apre dal file in `.claude/` con la sua regia nascosta; la app
 * da `dist/index.html`. Con `TALOS_PARITA_APP` si punta la app a un server
 * vero (fase 2: dati di fixture attraverso `app.js`), e allora la parità
 * misura anche il rendering dei componenti, non solo il markup statico.
 */
const qui = path.dirname(fileURLToPath(import.meta.url));
const radice = path.resolve(qui, '../..');
const MOCKUP = pathToFileURL(path.resolve(radice, '../../.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html')).href;
const APP = process.env.TALOS_PARITA_APP || pathToFileURL(path.resolve(radice, 'dist/index.html')).href;
const APP_CON_JS = Boolean(process.env.TALOS_PARITA_APP);
const ARTEFATTI = path.resolve(radice, 'artifacts/parita');
// R-02: immagini di esecuzione, mai quelle approvate e committate.
test.beforeAll(async () => { await mkdir(path.resolve(radice, 'artifacts/astra-mockup'), {recursive:true}); });
const FONT_DIR = pathToFileURL(path.resolve(radice, 'dist/fonts')).href;
const FONT_LOCALI = [
  ['Instrument Sans', 400, 'instrument-sans-latin-400-normal'],
  ['Instrument Sans', 500, 'instrument-sans-latin-500-normal'],
  ['Instrument Sans', 600, 'instrument-sans-latin-600-normal'],
  ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal'],
  ['JetBrains Mono', 500, 'jetbrains-mono-latin-500-normal'],
].map(([famiglia, peso, file]) => `@font-face{font-family:'${famiglia}';font-weight:${peso};font-style:normal;font-display:block;src:url('${FONT_DIR}/${file}.woff2') format('woff2')}`).join('');

const SCHERMATE = ['schermoChat', 'schermoVuota', 'schermoTerminale', 'schermoReview', 'schermoCapability', 'schermoBoard', 'schermoMemoria', 'schermoAttivita', 'schermoImpostazioni', 'schermoDoctor', 'schermoLibreria', 'schermoRicerca', 'schermoOfficina', 'schermoAutomazioni', 'schermoBrowser', 'schermoModelLab'];
const DIALOGHI = ['veloNuova', 'veloPermessi', 'veloAlbero', 'veloComandi', 'veloIntro', 'veloModello', 'veloAmbiente', 'veloRinomina', 'veloRiferimenti', 'veloFile', 'veloRinominaFile', 'veloEliminaFile', 'veloEliminaSessione', 'veloCreaFile', 'veloEsporta'];
/* Soglia: differenza per pixel (0..1) e quota massima di pixel diversi. */
const SOGLIA_PIXEL = 0.12;
const QUOTA_MASSIMA = 0.004;

async function apri(browser, url, { js, viewport }) {
  /*
   * ⛔ Il JS resta ACCESO anche per la app statica: con `javaScriptEnabled:false`
   * Playwright rifiuta ogni `evaluate`, e senza `evaluate` non si può né
   * mostrare una schermata né leggere la struttura. La app «senza il suo
   * cervello» si ottiene bloccando la richiesta di `app.js`, non spegnendo il
   * motore della pagina.
   */
  const contesto = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'it-IT' }); // it-IT: la regia del mockup traduce da navigator.language
  if (!js) await contesto.route('**/app.js', (rotta) => rotta.abort());
  /*
   * ⛔ STESSI FONT da entrambe le parti. Il mockup chiede Instrument Sans e
   * JetBrains Mono a Google; la app li ha in locale (regola local-first). Le
   * due consegne non sono identiche al pixel (istanze e hinting diversi) e il
   * primo giro segnava 1,93% di pixel diversi TUTTI su testo piccolo, mono e
   * maiuscoletto — cioè font, non disegno. Qui la richiesta a Google si blocca
   * e al mockup si danno i font locali della app: il cancello confronta il
   * DISEGNO, non chi consegna i caratteri.
   */
  await contesto.route(/fonts\.(googleapis|gstatic)\.com/, (rotta) => rotta.abort());
  /*
   * ⛔ STESSA MODALITÀ DI RENDERING. Il file del mockup è un frammento senza
   * `<!doctype html>` (l'artefatto lo aggiunge alla pubblicazione), quindi
   * aperto dal disco il browser lo rende in QUIRKS MODE; la app ha il doctype
   * e va in standards mode. La differenza vale pochi pixel di altezza di riga
   * — i dialoghi risultavano 4-6 px più alti nella app, e una fascia costante
   * di ~20.000 pixel divergeva su ogni schermata di sessione. Il file non si
   * tocca: si serve al browser con il doctype davanti, come fa la pubblicazione.
   */
  if (url === MOCKUP) {
    const corpo = await readFile(fileURLToPath(MOCKUP));
    await contesto.route(MOCKUP, (rotta) => rotta.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: Buffer.concat([Buffer.from('<!doctype html>\n'), corpo]) }));
  }
  const pagina = await contesto.newPage();
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.addStyleTag({ content: FONT_LOCALI + ' .talos-regia{display:none!important} *{transition:none!important;animation:none!important;caret-color:transparent!important}' });
  await pagina.evaluate(() => document.fonts.ready);
  return { contesto, pagina };
}

/** Mostra UNA schermata (e nasconde le altre e i dialoghi) allo stesso modo in entrambe le pagine. */
/*
 * ⛔ Una schermata NON è solo un `hidden`: la regia del mockup scrive sulla
 * radice `data-vista` («sessione» per chat/vuota/terminale/review, «pagina»
 * per il resto) e `data-schermo`, e il CSS ci si appoggia —
 * `:root[data-vista="pagina"]` nasconde la colonna dei dettagli e cambia la
 * griglia. Senza questi due attributi il cancello confrontava una Board con
 * l'inspector aperto contro una senza: 4-5% di pixel diversi che non erano
 * disegno. Qui si fa ESATTAMENTE ciò che fa `mostra()` nel mockup, e in Fase 1
 * `setView()` di `app.js` farà lo stesso.
 */
const DI_SESSIONE = new Set(['chat', 'vuota', 'terminale', 'review', 'browser']);
const nomeBreve = (id) => id.replace(/^schermo/, '').toLowerCase();
async function mostra(pagina, id, velo = null) {
  const nome = nomeBreve(id);
  await pagina.evaluate(({ mostrata, veloAperto, nome, sessione }) => {
    for (const el of document.querySelectorAll('[id^="schermo"]')) el.hidden = el.id !== mostrata;
    for (const v of document.querySelectorAll('[id^="velo"]')) v.hidden = v.id !== veloAperto;
    document.documentElement.setAttribute('data-vista', sessione ? 'sessione' : 'pagina');
    document.documentElement.setAttribute('data-schermo', nome);
    for (const t of document.querySelectorAll('[data-vistetab] [role=tab]')) { t.setAttribute('aria-selected',String(t.dataset.vaia===nome)); t.tabIndex=t.dataset.vaia===nome?0:-1; }
  }, { mostrata: id, veloAperto: velo, nome, sessione: DI_SESSIONE.has(nome) });
}

/** La struttura di un elemento: sequenza dei data-c e delle classi, in ordine di documento. */
async function struttura(pagina, selettore) {
  return pagina.evaluate((sel) => {
    const radice = document.querySelector(sel);
    if (!radice) return null;
    const righe = [];
    for (const el of radice.querySelectorAll('*')) {
      const c = el.getAttribute('data-c');
      const classi = [...el.classList].filter((k) => k.startsWith('talos-')).sort().join(' ');
      if (c || classi) righe.push(`${el.tagName.toLowerCase()}${c ? '[' + c + ']' : ''}${classi ? '.' + classi : ''}`);
    }
    return righe;
  }, selettore);
}

async function confrontaPixel(nome, a, b) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  await mkdir(ARTEFATTI, { recursive: true });
  if (pa.width !== pb.width || pa.height !== pb.height) {
    await writeFile(path.join(ARTEFATTI, `${nome}-mockup.png`), a);
    await writeFile(path.join(ARTEFATTI, `${nome}-app.png`), b);
    return { ok: false, motivo: `dimensioni diverse: mockup ${pa.width}×${pa.height}, app ${pb.width}×${pb.height}` };
  }
  const diff = new PNG({ width: pa.width, height: pa.height });
  const diversi = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: SOGLIA_PIXEL });
  const quota = diversi / (pa.width * pa.height);
  const ok = quota <= QUOTA_MASSIMA;
  if(nome.startsWith('schermoBrowser')){
    const consegna=path.resolve(radice,'artifacts/astra-mockup');
    await mkdir(consegna,{recursive:true});
    await writeFile(path.join(consegna,'browser-'+pa.width+'.png'),a);
  }
  // Le differenze si conservano sul rosso.
  if (!ok) {
    await writeFile(path.join(ARTEFATTI, `${nome}-mockup.png`), a);
    await writeFile(path.join(ARTEFATTI, `${nome}-app.png`), b);
    await writeFile(path.join(ARTEFATTI, `${nome}-diff.png`), PNG.sync.write(diff));
  }
  return { ok, motivo: `${diversi} pixel diversi (${(quota * 100).toFixed(3)}%)`, quota };
}

/*
 * ⛔ NON `.serial`: in modalità seriale un rosso ferma tutto il resto («16 did
 * not run»), e il cancello deve dire QUALI schermate divergono, non solo la
 * prima. Le pagine condivise reggono lo stesso: `workers: 1` nel config tiene
 * l'ordine, e ogni prova rimostra da sé la sua schermata.
 */
test.describe('parità app ↔ mockup', () => {
  let m;
  let a;
  test.beforeAll(async ({ browser }, info) => {
    const viewport = info.project.use.viewport;
    m = await apri(browser, MOCKUP, { js: true, viewport });
    a = await apri(browser, APP, { js: APP_CON_JS, viewport });
  });
  test.afterAll(async () => {
    await m?.contesto.close();
    await a?.contesto.close();
  });

  test('PARITA guscio: sidebar e colonna dei dettagli hanno la stessa struttura', async () => {
    // Stessa modalità di rendering, altrimenti ogni pixel dopo è un confronto falso.
    expect(await m.pagina.evaluate(() => document.compatMode), 'mockup in quirks mode').toBe('CSS1Compat');
    expect(await a.pagina.evaluate(() => document.compatMode), 'app in quirks mode').toBe('CSS1Compat');
    for (const sel of ['.talos-sidebar', '.talos-inspector']) {
      expect(await struttura(a.pagina, sel), `struttura di ${sel}`).toEqual(await struttura(m.pagina, sel));
    }
  });

  for (const schermata of SCHERMATE) {
    test(`PARITA ${schermata}: stessa struttura e stessi pixel`, async ({}, info) => {
      await mostra(m.pagina, schermata);
      await mostra(a.pagina, schermata);
      const sa = await struttura(a.pagina, `#${schermata}`);
      expect(sa, `la app non ha #${schermata}`).not.toBeNull();
      expect(sa, `struttura di #${schermata} diversa dal mockup`).toEqual(await struttura(m.pagina, `#${schermata}`));
      const nome = `${schermata}-${info.project.name}`;
      const esito = await confrontaPixel(nome, await m.pagina.locator('.talos-shell').screenshot(), await a.pagina.locator('.talos-shell').screenshot());
      expect(esito.ok, `${nome}: ${esito.motivo} — vedi artifacts/parita/${nome}-diff.png`).toBe(true);
    });
  }

  for(const pannello of ['catalogo','hf','download','runtime','prova']){
    test('PARITA Model Lab '+pannello,async({},info)=>{
      for(const p of [m.pagina,a.pagina]){await mostra(p,'schermoModelLab');await p.evaluate(n=>{document.querySelectorAll('#schermoModelLab [role=tabpanel]').forEach(x=>x.hidden=x.id!=='panel-'+n);document.querySelectorAll('#labTabs [role=tab]').forEach(x=>x.setAttribute('aria-selected',String(x.id==='tab-'+n)));},pannello);}
      expect(await struttura(a.pagina,'#panel-'+pannello)).toEqual(await struttura(m.pagina,'#panel-'+pannello));
      const esito=await confrontaPixel('modellab-'+pannello+'-'+info.project.name,await m.pagina.locator('.talos-shell').screenshot(),await a.pagina.locator('.talos-shell').screenshot());expect(esito.ok,esito.motivo).toBe(true);
    });
  }
  for(const id of ['regioneToast','pannelloNotifiche']){test('PARITA blocco '+id,async({},info)=>{try{for(const p of [m.pagina,a.pagina]){await mostra(p,'schermoChat');await p.locator('#'+id).evaluate(e=>{e.hidden=false;if(e.id==='pannelloNotifiche'){e.style.top='60px';e.style.left='20px';}});}expect(await struttura(a.pagina,'#'+id)).toEqual(await struttura(m.pagina,'#'+id));const esito=await confrontaPixel(id+'-'+info.project.name,await m.pagina.locator('#'+id).screenshot(),await a.pagina.locator('#'+id).screenshot());expect(esito.ok,esito.motivo).toBe(true);}finally{for(const p of [m.pagina,a.pagina])await p.locator('#'+id).evaluate(e=>e.hidden=true);}});}
  test('PARITA rail File aperta',async({},info)=>{try{for(const p of [m.pagina,a.pagina]){await mostra(p,'schermoChat');await p.evaluate(()=>{document.querySelector('.talos-shell').classList.add('details-open');document.querySelectorAll('.talos-inspector__body').forEach(e=>e.hidden=e.id!=='railFile');document.querySelectorAll('[data-rail]').forEach(e=>e.setAttribute('aria-selected',String(e.dataset.rail==='file')));});}expect(await struttura(a.pagina,'#railFile')).toEqual(await struttura(m.pagina,'#railFile'));const r=await confrontaPixel('railFile-'+info.project.name,await m.pagina.locator('#railFile').screenshot(),await a.pagina.locator('#railFile').screenshot());expect(r.ok,r.motivo).toBe(true);}finally{for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{document.querySelector('.talos-shell').classList.remove('details-open');document.querySelectorAll('.talos-inspector__body').forEach(e=>e.hidden=e.id!=='railContesto');document.querySelectorAll('[data-rail]').forEach(e=>e.setAttribute('aria-selected',String(e.dataset.rail==='contesto')));});}});
  for (const velo of DIALOGHI) {
    test(`PARITA dialogo ${velo}`, async ({}, info) => {
      await mostra(m.pagina, 'schermoChat', velo);
      await mostra(a.pagina, 'schermoChat', velo);
      if(velo==='veloIntro')await expect(a.pagina.locator('#introAlbero [role=treeitem]')).toHaveCount(7);
      expect(await struttura(a.pagina, `#${velo}`)).toEqual(await struttura(m.pagina, `#${velo}`));
      if(['veloComandi','veloNuova'].includes(velo)){const d=path.resolve(radice,'artifacts/astra-mockup');await mkdir(d,{recursive:true});await m.pagina.screenshot({path:path.join(d,(velo==='veloComandi'?'palette-':'nuova-riferimento-')+info.project.use.viewport.width+'.png')});}
      const nome = `${velo}-${info.project.name}`;
      const esito = await confrontaPixel(nome, await m.pagina.locator(`#${velo} .talos-dialog`).screenshot(), await a.pagina.locator(`#${velo} .talos-dialog`).screenshot());
      expect(esito.ok, `${nome}: ${esito.motivo} — vedi artifacts/parita/${nome}-diff.png`).toBe(true);
    });
  }
});

 test('ASTRA Browser navigazione, letture e permessi', async ({browser}, info) => {
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 const errori=[];p.on('pageerror',e=>errori.push(e.message));
 try {
  await expect(p.locator('#schermoBrowser')).toHaveCount(1);
  await p.locator('#schermoChat [data-vaia="browser"]').click();
  await expect(p.locator('#schermoBrowser')).toBeVisible();
  await expect(p.locator('#schermoBrowser [data-vaia=browser]')).toHaveAttribute('aria-selected','true');
  await expect(p.locator('#browserTesto')).toContainText('registro raccoglie');
  await p.locator('[data-browser-demo="back"]').click();
  await expect(p.locator('#browserTesto')).toContainText('<button id="astra-untrusted">');
  await expect(p.locator('#astra-untrusted')).toHaveCount(0);
  await expect(p.locator('[data-browser-demo="back"]')).toBeDisabled();
  await p.locator('#statoBrowser').evaluate(s=>{s.value='bloccata';s.dispatchEvent(new Event('change'));});
  await p.locator('[data-action="negaBrowser"]').click();
  await expect(p.locator('#urlBrowser')).toHaveValue('https://example.org/');
  await p.locator('#statoBrowser').evaluate(s=>{s.value='bloccata';s.dispatchEvent(new Event('change'));});
  await p.locator('[data-action="consentiBrowser"]').click();
  await expect(p.locator('#urlBrowser')).toHaveValue('https://example.org/documentazione');
  await p.locator('#statoBrowser').evaluate(s=>{s.value='vuoto';s.dispatchEvent(new Event('change'));});
  await expect(p.locator('#browserVuoto')).toBeVisible();
  await expect(p.locator('[data-browser-demo="annotate"]')).toBeDisabled();
  await p.locator('#statoBrowser').evaluate(s=>{s.value='pagina';s.dispatchEvent(new Event('change'));});
  await p.locator('[data-browser-demo="reload"]').click();
  await expect(p.locator('#browserCaricamento')).toBeVisible();
  await p.locator('[data-action="annullaBrowser"]').click();
  await p.locator('[data-browser-demo="note"]').click();
  await p.locator('#browserNotaInput').fill('Nota conservata');
  await p.locator('[data-action="conservaNotaBrowser"]').click();
  await expect(p.locator('#browserNotaSalvata')).toContainText('Nota conservata');
  expect(await p.locator('#schermoBrowser').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await p.locator('[data-browser-demo="annotate"]').click();
  await expect(p.locator('#schermoChat')).toBeVisible();
  await expect(p.locator('#composerInput')).toHaveValue(/Riguardo alla pagina https:/);
  expect(errori).toEqual([]);
 } finally {await contesto.close();}
 });

test('ASTRA Palette 15 comandi ricerca tastiera',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 try{
  await p.keyboard.press('Control+k');
  await expect(p.locator('#veloComandi')).toBeVisible();
  await expect(p.locator('#veloComandi [data-command]')).toHaveCount(15);
  const nomi=await p.locator('#veloComandi [data-command] .talos-list-row__title').allTextContents();
  for(const nome of nomi){await p.locator('#cercaComando').fill(nome);await expect(p.locator('#veloComandi [data-command]:visible')).toHaveCount(1);}
  await p.locator('#cercaComando').fill('inesistente-xyz');await expect(p.locator('#comandiVuoti')).toBeVisible();
  await p.locator('#cercaComando').fill('browser');await p.locator('#cercaComando').press('Enter');await expect(p.locator('#schermoBrowser')).toBeVisible();
  await p.keyboard.press('Control+k');await p.locator('#cercaComando').press('ArrowDown');await expect(p.locator('#cercaComando')).toHaveAttribute('aria-activedescendant','comando-resume');
  await p.keyboard.press('Escape');await expect(p.locator('#veloComandi')).toBeHidden();
 }finally{await contesto.close();}
});

test('ASTRA Intro quattro passi e quattro politiche',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 const dir=path.resolve(radice,'artifacts/astra-mockup');await mkdir(dir,{recursive:true});
 const foto=async nome=>p.screenshot({path:path.join(dir,'intro-'+nome+'-'+info.project.use.viewport.width+'.png')});
 try{
  await p.goto(MOCKUP+'#intro');
  await expect(p.locator('#veloIntro')).toBeVisible();
  await foto('cartella');
  await p.locator('#introCartella').fill('C:/progetti/esempio');await p.locator('#introAvanti').click();
  await expect(p.locator('#passoIntroModello')).toBeVisible();await foto('modello');
  await p.locator('#introFornitore').selectOption('OpenRouter');await p.locator('#introChiave').fill('chiave-fittizia');await p.locator('#introProvaAccesso').click();await expect(p.locator('#introChiave')).toHaveValue('');await expect(p.locator('#introAccessoStato')).toContainText('Accesso da verificare');
  await p.locator('#introModello').selectOption('claude-opus-5');await p.locator('#introAvanti').click();
  await expect(p.locator('#veloIntro [data-intro-policy]')).toHaveCount(4);await expect(p.locator('#introAvanti')).toBeDisabled();
  await p.locator('[data-intro-policy="Workspace write"]').click();await foto('permessi');
  await p.locator('#introIndietro').click();await expect(p.locator('#introModello')).toHaveValue('claude-opus-5');await p.locator('#introAvanti').click();
  await p.locator('#introAvanti').click();await expect(p.locator('#introRiepilogo')).toContainText('C:/progetti/esempio');await foto('fine');
  await p.locator('#introAvanti').click();await expect(p.locator('#veloIntro')).toBeHidden();await expect(p.locator('#schermoVuota')).toBeVisible();
 }finally{await contesto.close();}
});

test('ASTRA Model Lab sei schede e recupero funzioni',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 const d=path.resolve(radice,'artifacts/astra-mockup');await mkdir(d,{recursive:true});
 try{
 await p.goto(MOCKUP+'#modellab');await expect(p.locator('#schermoModelLab')).toBeVisible();
 await expect(p.locator('#labTabs [role=tab]')).toHaveCount(6);
 for(const s of ['installati','catalogo','hf','download','runtime','prova']){await p.locator('#tab-'+s).click();await expect(p.locator('#panel-'+s)).toBeVisible();await p.screenshot({path:path.join(d,'modellab-'+s+'-'+info.project.use.viewport.width+'.png')});}
 await p.locator('#tab-installati').click();await expect(p.getByRole('button',{name:'Importa .gguf',exact:true})).toBeVisible();
 await p.locator('#tab-hf').click();await expect(p.locator('#ordineHf option')).toHaveText(['Download','Preferiti','Più recenti','Aggiornati']);
 await p.locator('#autoreHf').fill('nessun-autore');await expect(p.locator('#vuotoHf')).toBeVisible();await p.locator('#autoreHf').fill('');
 await p.locator('#tagHf').fill('gguf');await p.locator('#altriHf').click();await expect(p.locator('#listaHf [data-hf]')).toHaveCount(3);
 await p.locator('#hfTuttiFile').click();await expect(p.locator('#veloFileModello')).toBeVisible();await p.locator('#veloFileModello [data-chiudi]').click();
 await p.locator('#hfScarica').click();await expect(p.locator('#panel-download')).toBeVisible();await expect(p.locator('#downloadAggiunto')).toContainText('.gguf');
 await p.locator('#downloadPausa').click();await expect(p.locator('#downloadStato')).toContainText('pausa');
 await p.locator('#tab-runtime').click();await p.locator('#runtimeBackend').selectOption('ollama');await expect(p.locator('#runtimeBackendNome')).toHaveText('Ollama');
 await p.getByRole('button',{name:'Fornitori e accessi',exact:true}).click();await expect(p.getByRole('button',{name:'Prova tutti',exact:true})).toBeVisible();await expect(p.locator('#providerIndirizzo')).toBeVisible();await expect(p.locator('#providerTimeout')).toBeVisible();await expect(p.getByRole('button',{name:'Rimuovi chiave',exact:true})).toBeVisible();
 }finally{await contesto.close();}
});

test('ASTRA Model Lab sélection cohérente',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 try{await p.goto(MOCKUP+'#modellab');await p.locator('#tab-catalogo').click();await p.locator('[data-catalog="aion-labs/aion-3.0"]').click();await expect(p.locator('#catalogoId')).toHaveText('aion-labs/aion-3.0');await expect(p.locator('#catalogoPrezzoInput')).toHaveText('3 USD');await expect(p.locator('#catalogoStato')).toContainText('non verifica le credenziali');await p.locator('[data-catalog="aion-labs/aion-3.0-mini"]').click();await expect(p.locator('#catalogoId')).toHaveText('aion-labs/aion-3.0-mini');await expect(p.locator('#catalogoPrezzoInput')).toHaveText('0,7 USD');await expect(p.locator('#catalogoIngresso')).toHaveText('Testo');await expect(p.locator('[data-catalog][aria-pressed="true"]')).toHaveCount(1);await p.locator('#tab-hf').click();await p.locator('[data-hf="gemma"]').click();await expect(p.locator('#hfTuttiFile')).toBeDisabled();await p.locator('#tab-installati').click();await p.locator('#azioneModello').click();await expect(p.locator('[data-model="qwen8"]')).not.toContainText('Caricato');}finally{await contesto.close();}
});

test('ASTRA Intro decisioni H16 H20 e avvio condizionale',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 try{
 await expect(p.locator('#veloIntro')).toBeHidden();await p.goto(MOCKUP+'#impostazioni');
 await p.getByRole('button',{name:'Ripeti il primo avvio',exact:true}).click();
 await p.locator('#introAvanti').click();await expect(p.locator('#introFornitore')).toHaveValue('local');await expect(p.locator('#introPrivacy')).toContainText('Nessuna telemetria, niente esce da questa macchina');
 await p.locator('#introFornitore').selectOption('OpenRouter');await expect(p.locator('#introAccesso')).toBeVisible();await expect(p.locator('#introPrivacyRemoto')).toBeVisible();await expect(p.locator('#introEsitoAccesso')).toHaveCount(0);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/intro-remoto-'+info.project.use.viewport.width+'.png')});
 await p.locator('#introFornitore').selectOption('local');await p.locator('#introModello').selectOption('qwen-local');await p.locator('#introAvanti').click();await p.locator('[data-intro-policy="Full access"]').click();await expect(p.locator('#introAvanti')).toBeDisabled();await p.locator('#introConfermaPieno').check();await p.locator('#introAvanti').click();await p.locator('#introAvanti').click();await expect(p.locator('#schermoVuota')).toBeVisible();await expect(p.locator('#schermoVuota textarea')).toHaveValue(/Esamina/);
 await p.goto(MOCKUP);await expect(p.locator('#veloIntro')).toBeHidden();
 await p.evaluate(()=>localStorage.setItem('talos.mockup.intro.v1',JSON.stringify({provider:{pronto:false},modello:'',politica:'',esito:'da-completare'})));await p.reload();await expect(p.locator('#veloIntro')).toBeVisible();await p.locator('#introSalta').click();await p.reload();await expect(p.locator('#veloIntro')).toBeHidden();
 }finally{await contesto.close();}
});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale Intro dati 4179',async({browser},info)=>{
 const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();
 try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});const d=path.resolve(radice,'artifacts/astra-mockup');await p.screenshot({path:path.join(d,'originale-intro-modello-'+info.project.use.viewport.width+'.png')});await p.locator('#introBack').click();await p.screenshot({path:path.join(d,'originale-intro-accesso-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}
});

test('ASTRA Palette testata e alias',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 try{const comando=p.locator('#schermoChat [data-azione="comandi"]');if(await comando.isVisible())await comando.click();else await p.keyboard.press('Control+k');await expect(p.locator('#veloComandi')).toBeVisible();await p.locator('#cercaComando').fill('Agents, hooks e doctor');await expect(p.locator('[data-command="control"]')).toBeVisible();await p.locator('#cercaComando').fill('');await p.locator('#cercaComando').press('End');await expect(p.locator('#cercaComando')).toHaveAttribute('aria-activedescendant','comando-share');await p.locator('#cercaComando').press('Home');await expect(p.locator('#cercaComando')).toHaveAttribute('aria-activedescendant','comando-new');await expect(p.locator('#veloComandi')).not.toContainText('esempio interattivo');}finally{await contesto.close();}
});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale Palette 15 comandi',async({browser},info)=>{
 const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();
 try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.keyboard.press('Control+k');await expect(p.locator('#commandDialog')).toBeVisible();await expect(p.locator('#commandResults [data-command]')).toHaveCount(15);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-palette-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}
});

test('ASTRA Model Lab linguaggio prodotto',async({browser},info)=>{
 const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});
 try{await p.goto(MOCKUP+'#modellab');await expect(p.locator('#providerEsito')).toHaveCount(0);await expect(p.locator('#schermoModelLab')).not.toContainText(/fixture|dimostrativ|di esempio/);await p.getByRole('button',{name:'Fornitori e accessi',exact:true}).click();await expect(p.locator('#veloFornitori')).not.toContainText(/fixture|dimostrativ|di esempio/);await p.locator('#providerChiave').fill('');await p.locator('[data-provider-action=salva]').click();await expect(p.locator('#providerStato')).toContainText('Inserisci');}finally{await contesto.close();}
});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale Model Lab dati 4179',async({browser},info)=>{
 const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();
 try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('button',{name:'Impostazioni',exact:true}).click();await p.locator('[data-settings-tab=models]').click();for(const tab of ['overview','providers','catalog','installed','huggingface','downloads']){await p.locator('[data-model-lab-tab='+tab+']').click();await expect(p.locator('[data-model-lab-panel='+tab+']')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-modellab-'+tab+'-'+info.project.use.viewport.width+'.png')});}}finally{await c.close();}
});

test('ASTRA Model Lab fornitori completi',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#modellab');await p.getByRole('button',{name:'Fornitori e accessi',exact:true}).click();await expect(p.locator('#providerLab option')).toHaveCount(7);await p.locator('#providerChiave').fill('chiave-di-test');await p.locator('#providerLab').selectOption('DeepSeek');await expect(p.locator('#providerChiave')).toHaveValue('');await expect(p.locator('#providerIndirizzo')).toHaveValue('');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/modellab-fornitori-'+info.project.use.viewport.width+'.png')});}finally{await contesto.close();}});

test('ASTRA Browser senza controlli di prototipo',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#browser');await expect(p.locator('#schermoBrowser #statoBrowser')).toHaveCount(0);await expect(p.locator('#schermoBrowser [data-vaia=terminale]')).toContainText('2');await expect(p.locator('#schermoBrowser [data-vaia=review]')).toContainText('3');await expect(p.locator('#schermoBrowser')).not.toContainText(/dimostrativ|di esempio|simulazion/i);}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale Browser dati 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.keyboard.press('Control+k');await p.locator('#commandResults [data-command=browser]').click();await expect(p.locator('#commandDialog')).toBeHidden();await expect(p.locator('#harnessDialogBackdrop')).toBeHidden();await expect(p.locator('.view-pane[data-view=browser]')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-browser-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Toast toni azione chiusura',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#toast');expect(await p.evaluate(()=>{const rules=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules];}catch{return [];}}).filter(r=>/talos-toast|talos-notification-panel/.test(r.selectorText||''));return rules.flatMap(r=>[...r.cssText.matchAll(/var\((--[\w-]+)/g)].map(m=>m[1])).filter(v=>!getComputedStyle(document.documentElement).getPropertyValue(v).trim());})).toEqual([]);await expect(p.locator('#regioneToast [role=status]:visible')).toHaveCount(3);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/toast-'+info.project.use.viewport.width+'.png')});await p.locator('[data-toast-chiudi=nota]').click();await expect(p.locator('#regioneToast [role=status]:visible')).toHaveCount(2);await p.locator('[data-toast-action=download]').click();await expect(p.locator('#panel-download')).toBeVisible();await p.locator('#campanella').click();await expect(p.locator('#pannelloNotifiche')).toBeVisible();await expect(p.locator('#campanella')).toHaveAttribute('aria-expanded','true');await expect(p.locator('#pannelloNotifiche [data-notifica]')).toHaveCount(1);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/campanella-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');await expect(p.locator('#pannelloNotifiche')).toBeHidden();await expect(p.locator('#campanella')).toBeFocused();await p.locator('#campanella').click();await expect(p.locator('#pannelloNotifiche')).toBeVisible();await p.locator('[data-notifica]').click();await expect(p.locator('#veloPermessi')).toBeVisible();}finally{await contesto.close();}});

if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale notifiche e toast 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.locator('#notificationsBtn').click();await expect(p.locator('.notifications-menu')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-notifiche-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');await expect(p.getByText('Nessuna sessione',{exact:true}).first()).toBeVisible();await p.keyboard.press('Control+k');await p.locator('#commandResults [data-command=resume]').click();await expect(p.locator('#commandDialog')).toBeHidden();await expect(p.locator('#harnessDialogBackdrop')).toBeHidden();await expect(p.locator('.toast')).toContainText('Nessuna sessione reale');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-toast-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Albero rail e tastiera',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{if(info.project.use.viewport.width<=1240)await p.locator('#schermoChat [data-azione=dettagli]').click();await p.locator('[data-rail=file]').click();await expect(p.locator('#alberoCartella')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/albero-file-'+info.project.use.viewport.width+'.png')});const root=p.locator('#alberoFile [role=treeitem]').first();await root.focus();await p.keyboard.press('ArrowRight');await expect(p.locator('#alberoFile [role=treeitem][data-path="src"]')).toBeFocused();await p.keyboard.press('ArrowRight');await expect(p.locator('#alberoFile [data-path="src/session-registry.mjs"]')).toBeFocused();await p.keyboard.press('Shift+F10');await expect(p.locator('#menuFile')).toBeVisible();await expect(p.locator('#menuFile [role=menuitem]:visible')).toHaveCount(7);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/menu-file-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');await expect(p.locator('#alberoFile [data-path="src/session-registry.mjs"]')).toBeFocused();await p.locator('#fileTreeFilter').fill('session-registry.test');await expect(p.locator('#alberoFile [data-path="tests/session-registry.test.mjs"]')).toBeVisible();await expect(p.locator('#alberoFile [data-path="README.md"]')).toBeHidden();await p.locator('#fileTreeFilter').fill('introuvable');await expect(p.locator('#alberoVuoto')).toBeVisible();await p.locator('#fileTreeFilter').fill('');await p.locator('#fileTreeCollapse').click();await expect(root).toHaveAttribute('aria-expanded','false');await p.locator('#fileTreeUp').click();await expect(p.locator('#alberoFuori')).toBeVisible();await p.locator('#fileTreeUp').click();await p.locator('#toggleAlbero').click();await expect(p.locator('#alberoCartella')).toBeHidden();if(info.project.use.viewport.width<=1240){await p.locator('#chiudiDettagli').click();await expect(p.locator('#schermoChat [data-azione=dettagli]')).toBeFocused();}}finally{await contesto.close();}});

if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale albero file 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await expect(p.locator('#harnessDialogBackdrop')).toBeHidden();if(info.project.use.viewport.width<=1240)await p.locator('.desktop-context-toggle').click();await p.locator('#inspector-tab-files').click();await expect(p.locator('#inspector-files')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-albero-file-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo Modello',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.locator('#composerForm [data-open-sheet=model]').click();await expect(p.locator('#veloModello')).toBeVisible();await expect(p.locator('#mostraRagionamentoDialogo')).toBeInViewport({ratio:1});await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-modello-'+info.project.use.viewport.width+'.png')});await p.locator('#cercaModelloDialogo').fill('non-esiste');await expect(p.locator('#modelliDialogoVuoti')).toBeVisible();await p.locator('#cercaModelloDialogo').fill('');await p.locator('#ragionamentoDialogo').focus();await p.keyboard.press('End');await expect(p.locator('#valoreRagionamentoDialogo')).toHaveText('Massimo');await expect(p.locator('#ragionamentoDialogo')).toHaveAttribute('aria-valuetext','Massimo');await p.locator('#ragionamentoAutomatico').click();await expect(p.locator('#valoreRagionamentoDialogo')).toHaveText('Automatico');await p.locator('[data-fonte-modello=locali]').click();await expect(p.locator('#modelliDialogoLocali')).toBeVisible();await p.locator('[data-modello-dialogo="local:qwen3-8b"]').click();await expect(p.locator('#veloModello')).toBeHidden();await expect(p.locator('#composerForm [data-open-sheet=model] .talos-chip__label')).toHaveText('Qwen3 8B');await expect(p.locator('#composerForm [data-open-sheet=model]')).toBeFocused();await p.keyboard.press('Control+Shift+m');await expect(p.locator('#veloModello')).toBeVisible();await p.locator('#apriLaboratorioDaModello').click();await expect(p.locator('#schermoModelLab')).toBeVisible();}finally{await contesto.close();}});

if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Modello 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await expect(p.locator('#harnessDialogBackdrop')).toBeHidden();await p.locator('[data-open-sheet=model]').first().click();await expect(p.locator('#modelPickerMount')).toBeVisible();await expect(p.locator('.effort-picker-range')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-modello-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialoghi misura persistita',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.locator('#composerForm [data-open-sheet=model]').click();const dialog=p.locator('#veloModello .talos-dialog'),handle=p.locator('#veloModello [data-dialog-resize=both]');await expect(handle).toBeVisible();expect(await p.locator('.overlay-layer .talos-dialog').evaluateAll(ds=>ds.every(d=>d.querySelectorAll('[data-dialog-resize]').length===3))).toBe(true);const before=await dialog.boundingBox();await handle.focus();await p.keyboard.press('ArrowRight');await expect.poll(async()=>Math.round((await dialog.boundingBox()).width)).toBe(Math.round(before.width+16));const r=await handle.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+24,r.y+r.height/2-24,{steps:4});await p.mouse.up();const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('talos-harness-modal-sizes-v1'))['sheet:model']);expect(saved.width).toBeGreaterThan(before.width+16);await p.reload();await p.locator('#composerForm [data-open-sheet=model]').click();await expect.poll(async()=>Math.round((await dialog.boundingBox()).width)).toBe(saved.width);await p.locator('#veloModello [data-c=SettingRow]').scrollIntoViewIfNeeded();await p.locator('#mostraRagionamentoDialogo').uncheck();await expect(p.locator('#mostraRagionamentoDialogo')).not.toBeChecked();await expect(p.locator('#mostraRagionamentoDialogo')).toBeInViewport({ratio:1});await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-misura-'+info.project.use.viewport.width+'.png')});await handle.dblclick();await expect.poll(async()=>Math.round((await dialog.boundingBox()).width)).toBe(Math.round(before.width));expect(await p.evaluate(()=>JSON.parse(localStorage.getItem('talos-harness-modal-sizes-v1'))['sheet:model'])).toBeUndefined();}finally{await contesto.close();}});

test('ASTRA Intro chooser compatto',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#intro');await expect(p.locator('#introAlbero')).toBeVisible();await expect(p.locator('#introCartellaScelta')).toBeInViewport({ratio:1});await expect(p.locator('#introPrivacy')).toBeInViewport({ratio:1});const pathBox=await p.locator('#introCartella').boundingBox(),openBox=await p.locator('#introApriCartella').boundingBox();expect(Math.abs(pathBox.y-openBox.y)).toBeLessThan(8);await expect(p.locator('[data-intro-luogo]')).toHaveCount(3);await p.locator('#introAlbero [role=treeitem]').first().focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await expect(p.locator('#introCartella')).toHaveValue('C:/progetti/AVM');await p.keyboard.press('ArrowRight');await expect(p.locator('#introAlbero')).toContainText('src');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/intro-chooser-albero-'+info.project.use.viewport.width+'.png')});await p.locator('#introCercaCartella').fill('nessun-risultato');await expect(p.locator('#introCartelleStato')).toContainText('Nessuna cartella');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/intro-chooser-vuoto-'+info.project.use.viewport.width+'.png')});await p.locator('#introCercaCartella').fill('');await p.locator('#introAggiornaCartelle').click();await expect(p.locator('#introCartelleStato')).toContainText('scelta conservata');await p.locator('#introCopiaPercorso').click();await expect(p.locator('#introCartelleStato')).toContainText(/copiat|selezionat/);await p.locator('#introComprimiCartelle').click();await expect(p.locator('#introAlbero [role=treeitem]').first()).toHaveAttribute('aria-expanded','false');await p.locator('[data-intro-luogo=rapide]').click();await p.locator('[data-intro-cartella="C:/Documenti"]').click();await expect(p.locator('#introCartella')).toHaveValue('C:/Documenti');await p.locator('#introNuovaCartella').click();await p.locator('#introNomeCartella').fill('../vietata');await p.locator('#introCreaCartella').click();await expect(p.locator('#introCreaStato')).toContainText('nome');await p.locator('#introNomeCartella').fill('Appunti');await p.locator('#introCreaCartella').click();await expect(p.locator('#introAlbero')).toContainText('Appunti');await p.locator('#introAvanti').click();await p.locator('#introIndietro').click();await expect(p.locator('#introCartella')).toHaveValue('C:/Documenti/Appunti');}finally{await contesto.close();}});

if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale chooser cartelle 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('button',{name:'Nuova',exact:true}).click();await expect(p.locator('#workspaceChooserTree [role=treeitem]').first()).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-chooser-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo Ambiente',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#ambiente');await expect(p.locator('#veloAmbiente')).toBeVisible();await expect(p.locator('#ambienteRadice')).toHaveValue('C:/progetti/AVM-harness-desktop');await expect(p.locator('#ambienteWorktree')).toContainText('Non osservata');await expect(p.locator('#ambienteRepoAnnidati')).toContainText('Fiducia separata');await expect(p.locator('#ambienteNuova')).toBeInViewport({ratio:1});await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-ambiente-'+info.project.use.viewport.width+'.png')});await p.locator('#ambienteCopia').click();await expect(p.locator('#ambienteStato')).toContainText(/copiat|selezionat/);await p.locator('#ambienteNuova').click();await expect(p.locator('#veloAmbiente')).toBeHidden();await expect(p.locator('#veloNuova')).toBeVisible();await expect(p.locator('#veloNuova input').first()).toBeFocused();}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Ambiente 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.setViewportSize({width:1440,height:900});await p.locator('[data-open-sheet=environment]').first().click();await p.setViewportSize(info.project.use.viewport);await expect(p.locator('[data-environment-choice]')).toHaveCount(5);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-ambiente-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo Rinomina',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.keyboard.press('Control+k');await p.locator('#cercaComando').fill('rinomina');await p.keyboard.press('Enter');const input=p.locator('#rinominaSessioneNome');await expect(input).toBeVisible();await expect(input).toBeFocused();await expect(input).toHaveAttribute('maxlength','80');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-rinomina-'+info.project.use.viewport.width+'.png')});await input.fill('   ');await p.locator('#rinominaSessioneSalva').click();await expect(p.locator('#rinominaSessioneErrore')).toContainText('Scrivi');await expect(input).toHaveAttribute('aria-invalid','true');await input.fill('  Prova <img>  ');await p.keyboard.press('Enter');await expect(p.locator('#veloRinomina')).toBeHidden();await expect(p.locator('#toast-riuscito')).toContainText('Prova <img>');await p.keyboard.press('Control+k');await p.locator('#cercaComando').fill('rinomina');await p.keyboard.press('Enter');await expect(input).toHaveValue('Prova <img>');await input.fill('Annullato');await p.locator('#veloRinomina').getByRole('button',{name:'Annulla',exact:true}).click();await p.goto(MOCKUP+'#rinomina');await expect(input).toHaveValue('Prova <img>');await input.fill('Store sessioni: pulizia');await p.keyboard.press('Enter');await expect(p.locator('#toast-riuscito')).toContainText('Store sessioni: pulizia-2');}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Rinomina 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('button',{name:'Comandi',exact:true}).click();await p.getByRole('button',{name:'Rinomina sessione N',exact:true}).click();await expect(p.locator('#renameSessionInput')).toBeFocused();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-rinomina-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo Riferimenti',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.locator('#composerInput').fill('Controlla @');await expect(p.locator('#veloRiferimenti')).toBeVisible();await expect(p.locator('#cercaRiferimenti')).toBeFocused();expect(await p.locator('#veloRiferimenti use').evaluateAll(uses=>uses.every(u=>Boolean(document.querySelector(u.getAttribute('href')))))).toBe(true);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-riferimenti-'+info.project.use.viewport.width+'.png')});await p.locator('#cercaRiferimenti').fill('inesistente');await expect(p.locator('#riferimentiVuoto')).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/riferimenti-vuoto-'+info.project.use.viewport.width+'.png')});await p.locator('#cercaRiferimenti').fill('registry');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await expect(p.locator('#composerInput')).toHaveValue('Controlla @tests/session-registry.test.mjs ');await expect(p.locator('#composerInput')).toBeFocused();await expect(p.locator('#veloRiferimenti')).toBeHidden();await p.locator('#composerInput').fill('Controlla @');await p.locator('#riferimentiAlbero').click();await expect(p.locator('#veloRiferimenti')).toBeHidden();await expect(p.locator('#railFile')).toBeVisible();}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Riferimenti 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.locator('#composerInput').fill('@');await expect(p.getByRole('dialog',{name:'Aggiungi file con @',exact:true})).toBeVisible();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-riferimenti-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo File',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#file');await expect(p.locator('#veloFile')).toBeVisible();await expect(p.locator('#fileAnteprimaCodice')).toBeFocused();await expect(p.locator('#fileAnteprimaCodice')).toContainText('sessioni');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-file-'+info.project.use.viewport.width+'.png')});await p.locator('#fileAnteprimaCopia').click();await expect(p.locator('#fileAnteprimaStato')).toContainText(/copiat|selezionat/);await p.locator('#fileAnteprimaAllega').click();await expect(p.locator('#veloFile')).toBeHidden();await expect(p.locator('#composerInput')).toContainText('');await expect(p.locator('#composerInput')).toHaveValue(/@src\/session-registry.mjs/);await p.goto(MOCKUP+'#file-guasto');await expect(p.locator('#fileAnteprimaErrore')).toBeVisible();await expect(p.locator('#fileAnteprimaPercorso')).toBeVisible();await expect(p.locator('#fileAnteprimaCopia')).toBeDisabled();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/file-guasto-'+info.project.use.viewport.width+'.png')});await p.locator('#fileAnteprimaRiprova').click();await expect(p.locator('#fileAnteprimaErrore')).toBeHidden();await expect(p.locator('#fileAnteprimaCodice')).toBeVisible();await p.keyboard.press('Escape');if(info.project.use.viewport.width<=1240)await p.locator('#schermoChat [data-azione=dettagli]').click();await p.locator('[data-rail=file]').click();await p.locator('#alberoFile [data-path="README.md"]').focus();await p.keyboard.press('Shift+F10');await p.locator('#menuFile').getByRole('menuitem',{name:'Apri',exact:true}).click();await expect(p.locator('#fileAnteprimaPercorso')).toHaveText('README.md');await expect(p.locator('#fileAnteprimaCodice')).toContainText('# TALOS');await expect(p.locator('#fileAnteprimaCodice')).not.toContainText('new Map');}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo File 4179',async({browser},info)=>{const c=await browser.newContext({viewport:{width:1440,height:900},locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('tab',{name:'Files',exact:true}).click();await p.getByRole('treeitem',{name:'csb.log',exact:true}).click();await p.getByRole('button',{name:'Azioni su csb.log',exact:true}).click();await p.getByRole('menuitem',{name:'Apri',exact:true}).click();await expect(p.getByRole('dialog',{name:'csb.log',exact:true}).locator('code')).toContainText('finish');await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-file-'+info.project.use.viewport.width+'.png')});}finally{await c.close();}});

test('ASTRA Dialogo Rinomina file',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#rinomina-file');const input=p.locator('#rinominaFileNome');await expect(input).toBeFocused();await expect(input).toHaveValue('session-registry.mjs');await expect(input).toHaveAttribute('maxlength','255');expect((await input.boundingBox()).width).toBeGreaterThan(500);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-rinomina-file-'+info.project.use.viewport.width+'.png')});await input.fill('');await p.keyboard.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await input.fill('../altro.mjs');await p.keyboard.press('Enter');await expect(p.locator('#rinominaFileErrore')).toContainText('percorso');await input.fill('http-app.mjs');await p.keyboard.press('Enter');await expect(p.locator('#rinominaFileErrore')).toContainText('Esiste');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/rinomina-file-errore-'+info.project.use.viewport.width+'.png')});await input.fill('registro-sessioni.mjs');await p.keyboard.press('Enter');await expect(p.locator('#veloRinominaFile')).toBeHidden();await expect(p.locator('#alberoFile [data-path="src/registro-sessioni.mjs"]')).toHaveCount(1);await expect(p.locator('#toast-riuscito')).toContainText('src/registro-sessioni.mjs');await p.goto(MOCKUP+'#chat');await p.goto(MOCKUP+'#rinomina-file');await expect(input).toHaveValue('registro-sessioni.mjs');await input.fill('annullato.mjs');await p.locator('#veloRinominaFile').getByRole('button',{name:'Annulla',exact:true}).click();await expect(p.locator('#alberoFile [data-path="src/registro-sessioni.mjs"]')).toHaveCount(1);}finally{await contesto.close();}});
async function apriOriginaleMenuFile(browser,azione){const c=await browser.newContext({viewport:{width:1440,height:900},locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('tab',{name:'Files',exact:true}).click();await p.getByRole('treeitem',{name:'csb.log',exact:true}).click();await p.getByRole('button',{name:'Azioni su csb.log',exact:true}).click();await p.getByRole('menuitem',{name:azione,exact:true}).click();return {c,p};}
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Rinomina file 4179',async({browser},info)=>{const {c,p}=await apriOriginaleMenuFile(browser,'Rinomina');try{await expect(p.getByRole('textbox',{name:'Nuovo nome',exact:true})).toHaveValue('csb.log');await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-rinomina-file-'+info.project.use.viewport.width+'.png')});await p.getByRole('button',{name:'Annulla',exact:true}).click();}finally{await c.close();}});

test('ASTRA Dialogo Elimina file',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#elimina-file');await expect(p.locator('#eliminaFileAnnulla')).toBeFocused();await expect(p.locator('#eliminaFilePercorso')).toHaveText('src/session-registry.mjs');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-elimina-file-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Enter');await expect(p.locator('#veloEliminaFile')).toBeHidden();await expect(p.locator('#alberoFile [data-path="src/session-registry.mjs"]')).toHaveCount(1);await p.goto(MOCKUP+'#elimina-file-guasto');await p.locator('#eliminaFileConferma').click();await expect(p.locator('#eliminaFileErrore')).toBeVisible();await expect(p.locator('#veloEliminaFile')).toBeVisible();await p.locator('#eliminaFileConferma').click();await expect(p.locator('#veloEliminaFile')).toBeHidden();await expect(p.locator('#alberoFile [data-path="src/session-registry.mjs"]')).toHaveCount(0);if(info.project.use.viewport.width<=1240)await p.locator('#schermoChat [data-azione=dettagli]').click();await p.locator('[data-rail=file]').click();await p.locator('#alberoFile [data-path="src"]').focus();await p.keyboard.press('Shift+F10');await p.locator('#menuFile').getByRole('menuitem',{name:'Elimina…',exact:true}).click();await expect(p.locator('#eliminaFileMessaggio')).toContainText('tutto il suo contenuto');await expect(p.locator('#eliminaFileAnnulla')).toBeFocused();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-elimina-cartella-'+info.project.use.viewport.width+'.png')});await p.locator('#eliminaFileConferma').click();await expect(p.locator('#alberoFile [data-path="src"]')).toHaveCount(0);await expect(p.locator('#alberoFile [data-path="src/http-app.mjs"]')).toHaveCount(0);await expect(p.locator('#toast-riuscito')).toContainText('src');}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Elimina file 4179',async({browser},info)=>{const {c,p}=await apriOriginaleMenuFile(browser,'Elimina');try{await expect(p.getByRole('dialog',{name:'Elimina file',exact:true})).toContainText('non si annulla');await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-elimina-file-'+info.project.use.viewport.width+'.png')});await p.getByRole('button',{name:'Annulla',exact:true}).click();}finally{await c.close();}});

test('ASTRA Dialogo Elimina sessione',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#elimina-sessione');await expect(p.locator('#eliminaSessioneAnnulla')).toBeFocused();await expect(p.locator('#eliminaSessioneNome')).toHaveText('Cancello ricerca web');const nr=await p.locator('#eliminaSessioneNome').boundingBox(),sr=await p.locator('#eliminaSessioneStato').boundingBox();expect(sr.x-nr.x-nr.width).toBeGreaterThanOrEqual(8);await expect(p.locator('#eliminaSessioneMessaggio')).toContainText('file del progetto');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-elimina-sessione-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Enter');await expect(p.locator('#veloEliminaSessione')).toBeHidden();await p.goto(MOCKUP+'#elimina-sessione-in-corso');await expect(p.locator('#eliminaSessioneConferma')).toBeDisabled();await expect(p.locator('#eliminaSessioneBlocco')).toContainText('in corso');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/elimina-sessione-in-corso-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');await p.goto(MOCKUP+'#elimina-sessione-guasto');await p.locator('#eliminaSessioneConferma').click();await expect(p.locator('#eliminaSessioneErrore')).toBeVisible();await p.locator('#eliminaSessioneConferma').click();await expect(p.locator('#veloEliminaSessione')).toBeHidden();await expect(p.locator('#toast-riuscito')).toContainText('Cancello ricerca web');await p.goto(MOCKUP+'#board');await expect(p.locator('#schermoBoard tbody tr').filter({hasText:'Cancello ricerca web'})).toHaveCount(0);}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Elimina sessione 4179',async({browser},info)=>{const c=await browser.newContext({viewport:{width:1440,height:900},locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.locator('.real-session-item:not(.is-pending)').first().click({button:'right'});await p.getByRole('menuitem',{name:'Elimina',exact:true}).click();await expect(p.getByRole('dialog',{name:'Elimina sessione',exact:true})).toContainText('trascrizione');await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-elimina-sessione-'+info.project.use.viewport.width+'.png')});await p.getByRole('button',{name:'Annulla',exact:true}).click();}finally{await c.close();}});

test('ASTRA Dialogo Crea file cartella',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.goto(MOCKUP+'#crea-file');const input=p.locator('#creaFileNome');await expect(input).toBeFocused();await expect(input).toHaveAttribute('maxlength','255');expect((await input.boundingBox()).width).toBeGreaterThan(500);await expect(p.locator('#creaFileBase')).toHaveText('src');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-crea-file-'+info.project.use.viewport.width+'.png')});await input.fill('');await p.keyboard.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await input.fill('../altro');await p.keyboard.press('Enter');await expect(p.locator('#creaFileErrore')).toContainText('percorso');await input.fill('http-app.mjs');await p.keyboard.press('Enter');await expect(p.locator('#creaFileErrore')).toContainText('Esiste');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/crea-file-errore-'+info.project.use.viewport.width+'.png')});await input.fill('appunti.txt');await p.keyboard.press('Enter');await expect(p.locator('#alberoFile [data-path="src/appunti.txt"]')).toBeFocused();await expect(p.locator('#toast-riuscito')).toContainText('src/appunti.txt');await p.locator('#fileTreeNewFolder').click();await expect(p.locator('#titoloveloCreaFile')).toHaveText('Nuova cartella');await expect(p.locator('#creaFileBase')).toHaveText('src');await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-crea-cartella-'+info.project.use.viewport.width+'.png')});await input.fill('prove');await p.keyboard.press('Enter');await expect(p.locator('#alberoFile [data-path="src/prove"]')).toHaveAttribute('aria-expanded','true');await p.locator('#fileTreeNewFile').click();await expect(p.locator('#creaFileBase')).toHaveText('src/prove');await input.fill('idee.txt');await p.keyboard.press('Enter');await expect(p.locator('#alberoFile [data-path="src/prove/idee.txt"]')).toBeFocused();await p.locator('#fileTreeNewFile').click();await input.fill('annullato.txt');await p.locator('#veloCreaFile').getByRole('button',{name:'Annulla',exact:true}).click();await expect(p.locator('#alberoFile [data-path="src/prove/annullato.txt"]')).toHaveCount(0);}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)for(const tipo of ['file','cartella'])test('ASTRA Originale dialogo Crea '+tipo+' 4179',async({browser},info)=>{const c=await browser.newContext({viewport:{width:1440,height:900},locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('tab',{name:'Files',exact:true}).click();await p.locator(tipo==='file'?'#fileTreeNewFile':'#fileTreeNewFolder').click();await expect(p.locator('#createFileInput')).toBeVisible();await expect(p.locator('#createFileInput')).toHaveAttribute('maxlength','255');await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-crea-'+tipo+'-'+info.project.use.viewport.width+'.png')});await p.getByRole('button',{name:'Annulla',exact:true}).click();}finally{await c.close();}});

test('ASTRA Dialogo Esporta',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{await p.keyboard.press('Control+k');await p.locator('#cercaComando').fill('esporta');await p.keyboard.press('Enter');await expect(p.locator('#veloEsporta')).toBeVisible();await expect(p.locator('#esportaMarkdown')).toBeFocused();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/dialogo-esporta-'+info.project.use.viewport.width+'.png')});const mdReady=p.waitForEvent('download');await p.locator('#esportaMarkdown').click();const md=await mdReady;expect(md.suggestedFilename()).toBe('talos-sessione-mockup.md');const markdown=await readFile(await md.path(),'utf8');expect(markdown).toContain('Dati dimostrativi');expect(markdown).toContain('Errore di esempio');await p.goto(MOCKUP+'#esporta-guasto');await p.locator('#esportaJson').click();await expect(p.locator('#esportaErrore')).toBeVisible();await expect(p.locator('#esportaJson')).toBeEnabled();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/esporta-errore-'+info.project.use.viewport.width+'.png')});const jsonReady=p.waitForEvent('download');await p.locator('#esportaJson').click();const json=await jsonReady;expect(json.suggestedFilename()).toBe('talos-sessione-mockup.json');const payload=JSON.parse(await readFile(await json.path(),'utf8'));expect(payload.mockup).toBe(true);expect(payload.eventi).toHaveLength(4);expect(payload.eventi.at(-1).type).toBe('RunFailed');await expect(p.locator('#veloEsporta')).toBeHidden();await expect(p.locator('#toast-riuscito')).toContainText('JSON');}finally{await contesto.close();}});
if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale dialogo Esporta 4179',async({browser},info)=>{const c=await browser.newContext({viewport:{width:1440,height:900},locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();await p.getByRole('button',{name:'Comandi',exact:true}).click();await p.getByRole('button',{name:'Esporta sessione E',exact:true}).click();await expect(p.getByRole('dialog',{name:'Esporta sessione',exact:true})).toBeVisible();await expect(p.locator('[data-export-choice]')).toHaveCount(2);await p.setViewportSize(info.project.use.viewport);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-dialogo-esporta-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');}finally{await c.close();}});

if(process.env.ASTRA_ORIGINALE_URL)test('ASTRA Originale menu file cartella radice 4179',async({browser},info)=>{const c=await browser.newContext({viewport:info.project.use.viewport,locale:'it-IT',reducedMotion:'reduce'});const p=await c.newPage();p.setDefaultTimeout(10000);try{await p.goto(process.env.ASTRA_ORIGINALE_URL);await expect(p.locator('#introDialog')).toBeVisible({timeout:15000});await p.locator('#introSkip').click();if(info.project.use.viewport.width<=1040)await p.locator('.desktop-context-toggle').click({timeout:5000});await p.getByRole('tab',{name:'Files',exact:true}).click();await expect(p.getByRole('treeitem',{name:'csb.log',exact:true})).toBeVisible();const rows=[['file',p.getByRole('treeitem',{name:'csb.log',exact:true}),6],['cartella',p.locator('#inspector-files .ft-node[aria-expanded] > .ft-row').first(),7],['radice',p.locator('#inspector-files .tree-root'),2]];for(const [tipo,row,count] of rows){if(info.project.use.viewport.width<=1040&&await p.locator('.inspector-panel.open').count()===0)await p.locator('.desktop-context-toggle').click();await row.click({button:'right'});await expect(p.locator('.ft-actions-menu [role=menuitem]')).toHaveCount(count);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/originale-menu-'+tipo+'-'+info.project.use.viewport.width+'.png')});await p.keyboard.press('Escape');}}finally{await c.close();}});

test('ASTRA Menu file cartella radice',async({browser},info)=>{const {contesto,pagina:p}=await apri(browser,MOCKUP,{js:true,viewport:info.project.use.viewport});try{if(info.project.use.viewport.width<=1240)await p.locator('#schermoChat [data-azione=dettagli]').click();await p.locator('[data-rail=file]').click();const menu=p.locator('#menuFile');const open=async(route)=>{await p.locator('#alberoFile [data-path="'+route+'"]').focus();await p.keyboard.press('Shift+F10');await expect(menu).toBeVisible();};const choices=()=>menu.locator('[role=menuitem]:visible');expect(await menu.locator('svg use').evaluateAll(uses=>uses.every(u=>document.querySelector(u.getAttribute('href'))))).toBe(true);await open('package.json');await expect(choices()).toHaveText(['Apri','Allega alla chat','Rinomina…','Copia','Copia percorso','Rivela in Esplora File','Elimina…']);await p.keyboard.press('End');await expect(menu.locator('[data-file-action=elimina]')).toBeFocused();await p.keyboard.press('Home');await expect(menu.locator('[data-file-action=apri]')).toBeFocused();await menu.getByRole('menuitem',{name:'Copia',exact:true}).click();await expect(p.locator('#alberoFile [data-path="package (copia).json"]')).toBeFocused();await open('package.json');await menu.getByRole('menuitem',{name:'Copia',exact:true}).click();await expect(p.locator('#alberoFile [data-path="package (copia 2).json"]')).toBeFocused();await open('src');await expect(choices()).toHaveText(['Nuovo file…','Nuova cartella…','Rinomina…','Copia','Copia percorso','Imposta come radice','Rivela in Esplora File','Elimina…']);await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/menu-cartella-'+info.project.use.viewport.width+'.png')});const box=await menu.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(info.project.use.viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(info.project.use.viewport.height);await menu.getByRole('menuitem',{name:'Copia',exact:true}).click();await expect(p.locator('#alberoFile [data-path="src (copia)/session-registry.mjs"]')).toHaveCount(1);await expect(p.locator('#alberoFile [data-path="src/session-registry.mjs"]')).toHaveCount(1);await open('src (copia)/session-registry.mjs');await menu.getByRole('menuitem',{name:'Apri',exact:true}).click();await expect(p.locator('#fileAnteprimaCodice')).toContainText('sessioni');await p.keyboard.press('Escape');await expect(p.locator('#alberoFile [data-path="src (copia)/session-registry.mjs"]')).toBeFocused();await expect(p.locator('#alberoFile')).toBeInViewport();await open('src');await menu.getByRole('menuitem',{name:'Nuovo file…',exact:true}).click();await expect(p.locator('#creaFileBase')).toHaveText('src');await p.keyboard.press('Escape');await open('src');await menu.getByRole('menuitem',{name:'Rivela in Esplora File',exact:true}).click();await expect(p.locator('#toast-riuscito')).toContainText('Anteprima');await open('src');await menu.getByRole('menuitem',{name:'Imposta come radice',exact:true}).click();await expect(p.locator('#toast-riuscito')).toContainText('nuova sessione');await expect(p.locator('#veloAmbiente')).toBeHidden();await open('.');await expect(choices()).toHaveText(['Nuovo file…','Nuova cartella…']);await expect(menu.locator('[data-file-action=nuovo-file]')).toBeFocused();await p.keyboard.press('ArrowUp');await expect(menu.locator('[data-file-action=nuova-cartella]')).toBeFocused();await p.screenshot({path:path.resolve(radice,'artifacts/astra-mockup/menu-radice-'+info.project.use.viewport.width+'.png')});await menu.getByRole('menuitem',{name:'Nuovo file…',exact:true}).click();await expect(p.locator('#creaFileBase')).toHaveText('.');await p.locator('#creaFileNome').fill('.env');await p.keyboard.press('Enter');await open('.env');await menu.getByRole('menuitem',{name:'Copia',exact:true}).click();await expect(p.locator('#alberoFile [data-path=".env (copia)"]')).toBeFocused();await open('.env (copia)');await menu.getByRole('menuitem',{name:'Apri',exact:true}).click();await expect(p.locator('#fileAnteprimaCodice')).toHaveText('');}finally{await contesto.close();}});
