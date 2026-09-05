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
const FONT_DIR = pathToFileURL(path.resolve(radice, 'dist/fonts')).href;
const FONT_LOCALI = [
  ['Instrument Sans', 400, 'instrument-sans-latin-400-normal'],
  ['Instrument Sans', 500, 'instrument-sans-latin-500-normal'],
  ['Instrument Sans', 600, 'instrument-sans-latin-600-normal'],
  ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal'],
  ['JetBrains Mono', 500, 'jetbrains-mono-latin-500-normal'],
].map(([famiglia, peso, file]) => `@font-face{font-family:'${famiglia}';font-weight:${peso};font-style:normal;font-display:block;src:url('${FONT_DIR}/${file}.woff2') format('woff2')}`).join('');

const SCHERMATE = ['schermoChat', 'schermoVuota', 'schermoTerminale', 'schermoReview', 'schermoCapability', 'schermoBoard', 'schermoMemoria', 'schermoAttivita', 'schermoImpostazioni', 'schermoDoctor', 'schermoLibreria', 'schermoRicerca', 'schermoOfficina', 'schermoAutomazioni', 'schermoBrowser'];
const DIALOGHI = ['veloNuova', 'veloPermessi', 'veloAlbero'];
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
    const consegna=path.resolve(radice,'../../.claude/immagini/astra-mockup');
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

  for (const velo of DIALOGHI) {
    test(`PARITA dialogo ${velo}`, async ({}, info) => {
      await mostra(m.pagina, 'schermoChat', velo);
      await mostra(a.pagina, 'schermoChat', velo);
      expect(await struttura(a.pagina, `#${velo}`)).toEqual(await struttura(m.pagina, `#${velo}`));
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
  await p.locator('#statoBrowser').selectOption('bloccata');
  await p.locator('[data-action="negaBrowser"]').click();
  await expect(p.locator('#urlBrowser')).toHaveValue('https://example.org/');
  await p.locator('#statoBrowser').selectOption('bloccata');
  await p.locator('[data-action="consentiBrowser"]').click();
  await expect(p.locator('#urlBrowser')).toHaveValue('https://example.org/documentazione');
  await p.locator('#statoBrowser').selectOption('vuoto');
  await expect(p.locator('#browserVuoto')).toBeVisible();
  await expect(p.locator('[data-browser-demo="annotate"]')).toBeDisabled();
  await p.locator('#statoBrowser').selectOption('pagina');
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
