/*
 * ATLAS F3 (27/09/2026) — la Libreria: la CARD è quella del mobile (owner: «identiche alla versione mobile, non
 * negoziabile»), la pagina e il dettaglio sono quelli dell'Atlas. Contratto: `.claude/ATLAS-F3-CONTRATTO-E-GATE-2026-09-27.md`
 * nel worktree ATLAS. Le decisioni che queste prove fissano, tutte dell'owner del 27/09:
 *  · card: anteprima in alto, nome, riga «Generato · EXT», puntini FUORI dal bottone che apre; data e cartella NON nella card;
 *  · selezione: il cerchio del mobile, al passaggio o col fuoco, fisso su tutte appena una è scelta;
 *  · anteprime: mini-documento col titolo vero, prima pagina del PDF (pdf.js), immagine vera, glifo per il resto;
 *  · solo le card cambiano: la vista a elenco resta quella di prima;
 *  · filtri veri (Q-11) nella tendina; dettaglio Atlas con testata, righe e «Copia percorso» + «Tutte le azioni».
 * La Libreria è VERA: file seminati nella cartella del progetto e letti dal server di prova (stessa via di LETTORE-*).
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ locale: 'it-IT' });
test.describe.configure({ mode: 'serial' });
test.skip(Boolean(process.env.TALOS_HARNESS_UI_BASE_URL?.trim()), 'crea una sessione e salva una chiave finta: gira solo sul server di prova');

const MODELLO = 'z-ai/glm-5.3-flash';
const rootWorkspace = process.env.TALOS_HARNESS_UI_PROJECT_DIRS?.split(';')[0]?.trim() || tmpdir();
const { PNG } = createRequire(import.meta.url)('pngjs');
/* Il PDF «Hello, world!» dell'esempio di pdf.js (`examples/learning/helloworld64.html`): una pagina vera. */
const PDF = Buffer.from('JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSIAogICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIHdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNzkgMDAwMDAgbiAKMDAwMDAwMDE3MyAwMDAwMCBuIAowMDAwMDAwMzAxIDAwMDAwIG4gCjAwMDAwMDAzODAgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDkyCiUlRU9G', 'base64');

function pngABande() {
  const png = new PNG({ width: 160, height: 100 });
  for (let y = 0; y < 100; y += 1) for (let x = 0; x < 160; x += 1) {
    const i = (y * 160 + x) * 4;
    png.data[i] = 40 + x; png.data[i + 1] = 90 + y; png.data[i + 2] = 160; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

const SEME = [
  ['lib-f3-01', 'Architettura TALOS.md', 'text/markdown', 'uploaded', Buffer.from('# Architettura TALOS\n\nIl progetto organizza memoria, strumenti e conversazioni.\n\n## Principi\n\nGerarchia chiara.\n')],
  ['lib-f3-02', 'Report di ricerca.pdf', 'application/pdf', 'generated', PDF],
  ['lib-f3-03', 'schermata.png', 'image/png', 'uploaded', pngABande()],
  ['lib-f3-04', 'backup-note.zip', 'application/zip', 'generated', Buffer.from('PK\u0003\u0004 archivio finto')],
  ['lib-f3-05', 'vendite.csv', 'text/csv', 'generated', Buffer.from('mese,vendite\ngennaio,120\nfebbraio,98\n')],
];
let sessione = null;

test.beforeAll(async ({ playwright, baseURL }) => {
  test.setTimeout(120_000);
  const cartella = mkdtempSync(join(rootWorkspace, 'f3-libreria-'));
  const adesso = new Date().toISOString();
  for (const [id, nome, mediaType, origine, byte] of SEME) {
    const base = join(cartella, '.harness-ui-library', id);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'meta.json'), JSON.stringify({ nome, mediaType, origine, creatoIl: adesso, aggiornatoIl: adesso }, null, 2));
    writeFileSync(join(base, 'contenuto'), byte);
  }
  const api = await playwright.request.newContext({ baseURL });
  expect((await api.post('/api/v1/providers/openrouter/key', { data: { key: 'sk-f3-libreria-fixture' } })).ok()).toBe(true);
  const r = await api.post('/api/v1/sessions/custom', { data: { cartellaLibera: cartella, consegna: 'prova F3 della Libreria: non fare nulla', modello: MODELLO } });
  expect(r.ok(), `creazione della sessione: ${await r.text()}`).toBe(true);
  const id = (await r.json()).data.sessionId;
  await expect.poll(async () => {
    const elenco = await api.get(`/api/v1/sessions/${encodeURIComponent(id)}/library`);
    if (!elenco.ok()) return -1;
    const corpo = await elenco.json();
    return (corpo.data?.voci ?? corpo.data?.items ?? []).length;
  }, { message: 'la Libreria seminata non è comparsa', timeout: 20_000 }).toBe(SEME.length);
  await api.dispose();
  sessione = { id, cartella };
});

async function apriLibreria(page, { larghezza = 1440, altezza = 900, tema = 'dark', preset = null } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: tema });
  await page.addInitScript(({ colorMode, themePreset }) => {
    if (window.top !== window) return;
    const appearance = { colorMode, uiLanguage: 'it', ...(themePreset ? { themePreset, themePresetVersione: 2 } : {}) };
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance, chat: { model: 'z-ai/glm-5.3-flash' } })); } catch { /* finestra privata */ }
  }, { colorMode: tema, themePreset: preset });
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  /* Un'anteprima che non riesce cade sul glifo e lo DICE in console: per queste prove è un errore, con la sua causa. */
  page.on('console', (m) => { if (m.type() === 'warning' && m.text().startsWith('Libreria: anteprima')) errori.push(m.text()); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Libreria F3', modello, { conclusa: true, modello }), [sessione.id, MODELLO]);
  await page.getByRole('button', { name: /^Libreria \d+$/u }).click();
  const schermo = page.locator('#schermoLibreria');
  /* La vista a schede è quella delle card; la preferenza si ricorda, quindi la si sceglie esplicitamente. */
  await schermo.getByRole('button', { name: 'Vista schede' }).click();
  await expect(schermo.locator('.td-grid .td-card')).toHaveCount(SEME.length);
  await expect.poll(() => schermo.locator('.td-lib-art[data-art="loading"]').count(), { message: 'le anteprime finiscono' }).toBe(0);
  return { errori, schermo };
}

const card = (schermo, nome) => schermo.locator('.td-grid .td-card').filter({ has: schermo.page().getByRole('button', { name: `Apri ${nome}`, exact: true }) });

test('ATLAS-F3-01 — la card è quella del mobile: anteprima, nome, «Generato · EXT», puntini fuori dal bottone; niente data né cartella', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  const pdf = card(schermo, 'Report di ricerca.pdf');
  const apri = pdf.locator('.td-card-open');
  /* L'ordine del mobile: sopra si guarda, sotto si legge. */
  expect(await apri.evaluate((b) => [...b.children].map((c) => c.className))).toEqual(['td-card-top', '', 'td-card-bottom']);
  await expect(apri.locator('.td-card-top > .td-lib-art')).toHaveCount(1);
  await expect(apri.locator('h3')).toHaveText('Report di ricerca.pdf');
  await expect(apri.locator('.td-lib-dettaglio')).toHaveText('Generato · PDF');
  await expect(apri.locator('.td-lib-generato')).toHaveText('Generato');
  /* «Caricato» il mobile non lo scrive: un file della persona non ha niente da dire. */
  await expect(card(schermo, 'Architettura TALOS.md').locator('.td-lib-dettaglio')).toHaveText('MD');
  /* I puntini stanno FUORI dal bottone che apre (un bottone dentro un bottone non è HTML valido). */
  await expect(pdf.locator('.td-lib-menu')).toHaveCount(1);
  await expect(apri.locator('.td-lib-menu')).toHaveCount(0);
  /* AL CONTRARIO: data e cartella non sono più nella card (owner 27/09, supera Q-09/BC-38 per la card). */
  await expect(apri).not.toContainText('Aggiornato');
  await expect(apri).not.toContainText(' in ');
  /* Misure del mobile: nome 14/500 su due righe al massimo, riga 12, anteprima alta 160. */
  const misure = await pdf.evaluate((c) => {
    const h3 = getComputedStyle(c.querySelector('h3'));
    return { nome: [h3.fontSize, h3.fontWeight, h3.webkitLineClamp], riga: getComputedStyle(c.querySelector('.td-lib-dettaglio')).fontSize, arte: c.querySelector('.td-lib-art').getBoundingClientRect().height };
  });
  expect(misure).toEqual({ nome: ['14px', '500', '2'], riga: '12px', arte: 160 });
  expect(errori).toEqual([]);
});

test('ATLAS-F3-02 — le anteprime del mobile: mini-documento col titolo vero, prima pagina del PDF, immagine vera, glifo per il resto', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  const md = card(schermo, 'Architettura TALOS.md').locator('.td-lib-art');
  await expect(md).toHaveAttribute('data-art', 'typographic');
  await expect(md.locator('.td-lib-mini-titolo')).toHaveText('Architettura TALOS');
  await expect(md.locator('.td-lib-mini-riga')).toHaveCount(4);
  const csv = card(schermo, 'vendite.csv').locator('.td-lib-art');
  await expect(csv).toHaveAttribute('data-art', 'typographic');
  await expect(csv.locator('.td-lib-mini-titolo')).toHaveText('mese,vendite');
  /* Il PDF: la prima pagina disegnata da pdf.js, tenuta come immagine `data:` (il CSP non ammette `blob:`). */
  const pdf = card(schermo, 'Report di ricerca.pdf').locator('.td-lib-art');
  await expect(pdf, `anteprima del PDF — avvisi: ${errori.join(' | ') || 'nessuno'}`).toHaveAttribute('data-art', 'image');
  await expect(pdf.locator('img')).toHaveAttribute('src', /^data:image\/webp;base64,/u);
  expect(await pdf.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  /* ⛔ Revisione Codex 27/09, rilievo 15: «un'immagine qualunque» non prova la pagina — una tela bianca esportata senza
     disegnare passerebbe. La pagina «Hello, world!» ha testo NERO su fondo BIANCO: si contano i due. */
  const pixel = await pdf.locator('img').evaluate((img) => {
    const tela = document.createElement('canvas');
    tela.width = img.naturalWidth; tela.height = img.naturalHeight;
    const ctx = tela.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, tela.width, tela.height).data;
    let scuri = 0; let chiari = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < 80) scuri += 1; else if (l > 230) chiari += 1; }
    return { scuri, chiari, totale: d.length / 4 };
  });
  expect(pixel.scuri, `la pagina ha il suo testo: ${JSON.stringify(pixel)}`).toBeGreaterThan(20);
  expect(pixel.chiari, `e il suo fondo: ${JSON.stringify(pixel)}`).toBeGreaterThan(pixel.totale / 2);
  /* Le risorse che il worker chiede (owner 27/09: «aggiungi le risorse») sono servite dal server vero. */
  for (const risorsa of ['cmaps/UniJIS-UCS2-H.bcmap', 'standard_fonts/FoxitSerif.pfb', 'standard_fonts/LiberationSans-Regular.ttf', 'wasm/openjpeg_nowasm_fallback.js', 'wasm/jbig2_nowasm_fallback.js']) {
    expect((await page.request.get(`/vendor/pdfjs/${risorsa}`)).status(), risorsa).toBe(200);
  }
  /* L'immagine vera, per indirizzo, dalla stessa origine — e decodificata davvero (rilievo 15: prima non si guardava). */
  const png = card(schermo, 'schermata.png').locator('.td-lib-art');
  await expect(png).toHaveAttribute('data-art', 'image');
  await expect(png.locator('img')).toHaveAttribute('src', /\/library\/lib-f3-03\/file$/u);
  await expect.poll(() => png.locator('img').evaluate((img) => img.complete && img.naturalWidth), { message: 'il PNG si decodifica' }).toBe(160);
  /* AL CONTRARIO: di uno ZIP non si legge una pagina — glifo dell'archivio con l'estensione. */
  const zip = card(schermo, 'backup-note.zip').locator('.td-lib-art');
  await expect(zip).toHaveAttribute('data-art', 'glyph');
  await expect(zip.locator('.td-lib-glifo')).toHaveAttribute('data-famiglia', 'archive');
  await expect(zip.locator('.td-lib-estensione')).toHaveText('ZIP');
  expect(errori).toEqual([]);
});

test('ATLAS-F3-03 — la selezione: il cerchio compare al passaggio e col fuoco, e su tutte appena una è scelta', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  const opacita = (nome) => card(schermo, nome).locator('.td-card-select').evaluate((el) => getComputedStyle(el).opacity);
  await page.mouse.move(2, 2);
  expect(await opacita('vendite.csv'), 'a riposo il cerchio non si vede').toBe('0');
  await card(schermo, 'vendite.csv').hover();
  await expect.poll(() => opacita('vendite.csv'), { message: 'al passaggio compare' }).toBe('1');
  expect(await opacita('backup-note.zip'), 'solo sulla card sotto il puntatore').toBe('0');
  await card(schermo, 'vendite.csv').locator('.td-card-select').check();
  await page.mouse.move(2, 2);
  /* Una scelta ⇒ il cerchio si vede su TUTTE (modo selezione), e la scelta porta la spunta e l'anello. */
  for (const [, nome] of SEME) await expect.poll(() => opacita(nome), { message: `${nome}: cerchio visibile con una scelta` }).toBe('1');
  await expect(card(schermo, 'vendite.csv').locator('.td-lib-spunta')).toBeVisible();
  await expect(card(schermo, 'backup-note.zip').locator('.td-lib-spunta')).toBeHidden();
  await expect(card(schermo, 'vendite.csv')).toHaveAttribute('data-batch-selected', 'true');
  await expect(schermo.locator('.td-bulk-count')).toHaveText('1 selezionata');
  await card(schermo, 'vendite.csv').locator('.td-card-select').uncheck();
  await page.mouse.move(2, 2);
  await expect.poll(() => opacita('backup-note.zip'), { message: 'nessuna scelta: si torna a riposo' }).toBe('0');
  expect(errori).toEqual([]);
});

test('ATLAS-F3-04 — i puntini della card e il tasto destro aprono il menu della riga vera, sul dettaglio di QUEL file', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  await card(schermo, 'Report di ricerca.pdf').locator('.td-lib-menu').click();
  await expect(schermo.locator('.td-detail .td-lib-testata')).toContainText('Report di ricerca.pdf');
  for (const voce of ['Rinomina', 'Elimina', 'Copia percorso']) await expect(page.getByRole('menuitem', { name: voce })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Rinomina' })).toBeHidden();
  await card(schermo, 'vendite.csv').click({ button: 'right' });
  await expect(schermo.locator('.td-detail .td-lib-testata')).toContainText('vendite.csv');
  await expect(page.getByRole('menuitem', { name: 'Rinomina' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errori).toEqual([]);
});

/* ⛔ Revisione Codex 27/09, rilievo 14: la tendina era il `<select>` NATIVO, contro la regola di casa «niente controlli
   nativi» (owner 13/09). Adesso è la tendina a tema di `calm-controls.js` (la stessa delle Impostazioni): la si usa come
   la usa la persona, e il nativo resta solo come sorgente, fuori dalla tastiera e dallo screen reader. */
async function scegliFiltro(page, schermo, etichetta) {
  await schermo.getByRole('combobox', { name: 'Filtri Libreria' }).click();
  await page.getByRole('option', { name: etichetta }).click();
}

test('ATLAS-F3-05 — i filtri veri nella tendina A TEMA, coi conteggi; le pastiglie non ci sono', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  const nativo = schermo.locator('select[data-filtri]');
  expect(await nativo.evaluate((s) => [s.tabIndex, s.getAttribute('aria-hidden')])).toEqual([-1, 'true']);
  const tendina = schermo.getByRole('combobox', { name: 'Filtri Libreria' });
  await expect(tendina).toBeVisible();
  await tendina.click();
  /* Ogni opzione porta il segno «✓» della tendina a tema (visibile solo su quella scelta): si confronta il testo senza. */
  expect((await page.getByRole('listbox').getByRole('option').allTextContents()).map((t) => t.replace(/✓$/u, '').trim())).toEqual(['Tutti (5)', 'Caricati (2)', 'Generati (3)']);
  await page.keyboard.press('Escape');
  await expect(schermo.locator('.td-filters')).toBeHidden();
  /* Anche l'ordinamento della Libreria è a tema: stessa barra, stesso ambito. */
  await expect(schermo.locator('.td-toolbar .td-select:not([data-filtri])')).toHaveAttribute('aria-hidden', 'true');
  await scegliFiltro(page, schermo, 'Generati (3)');
  await expect(schermo.locator('.td-grid .td-card')).toHaveCount(3);
  await scegliFiltro(page, schermo, 'Caricati (2)');
  await expect(schermo.locator('.td-grid .td-card')).toHaveCount(2);
  await scegliFiltro(page, schermo, 'Tutti (5)');
  await expect(schermo.locator('.td-grid .td-card')).toHaveCount(SEME.length);
  expect(errori).toEqual([]);
});

/* ⛔ 27/09 notte, trovato sulle foto del 4174: la cura del rilievo 14 (tendine a tema) ha portato la barra da UNA riga a
   QUATTRO, perché il rivestimento a tema è largo 100% (`calm-controls.css:5`). F3-05 guardava il tema, non la forma. */
for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  test(`ATLAS-F3-12 — la barra della Libreria resta su UNA riga con le tendine a tema: ${larghezza}`, async ({ page }) => {
    const { errori, schermo } = await apriLibreria(page, { larghezza, altezza });
    const righe = await schermo.locator('.td-toolbar').evaluate((barra) => {
      const visibili = [...barra.children].filter((figlio) => { const r = figlio.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const r = visibili.map((figlio) => figlio.getBoundingClientRect());
      /* Stessa riga = tutti si sovrappongono in verticale (le altezze sono diverse: 36, 38, 42 px). */
      return { quanti: visibili.length, cimaPiuBassa: Math.max(...r.map((x) => x.top)), fondoPiuAlto: Math.min(...r.map((x) => x.bottom)) };
    });
    expect(righe.quanti, 'ricerca, due tendine, vista, Aggiorna').toBeGreaterThanOrEqual(5);
    expect(righe.cimaPiuBassa, 'tutti gli elementi della barra sulla stessa riga').toBeLessThan(righe.fondoPiuAlto);
    expect(errori).toEqual([]);
  });
}

test('ATLAS-F3-09 — con la card scelta filtrata via, i cerchi restano accesi: la selezione si legge dallo stato', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  const opacita = (nome) => card(schermo, nome).locator('.td-card-select').evaluate((el) => getComputedStyle(el).opacity);
  await card(schermo, 'vendite.csv').locator('.td-card-select').check();
  await scegliFiltro(page, schermo, 'Caricati (2)');
  await expect(schermo.locator('.td-grid .td-card')).toHaveCount(2);
  await page.mouse.move(2, 2);
  await expect(schermo.locator('.td-bulk-count')).toHaveText('1 selezionata');
  for (const nome of ['Architettura TALOS.md', 'schermata.png']) {
    await expect.poll(() => opacita(nome), { message: `${nome}: il modo selezione resta visibile` }).toBe('1');
  }
  await scegliFiltro(page, schermo, 'Tutti (5)');
  await card(schermo, 'vendite.csv').locator('.td-card-select').uncheck();
  await page.mouse.move(2, 2);
  await expect.poll(() => opacita('schermata.png'), { message: 'senza scelte si torna a riposo' }).toBe('0');
  expect(errori).toEqual([]);
});

test('ATLAS-F3-10 — sotto 850 px di sezione il menu dei puntini si apre DENTRO lo schermo', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page, { larghezza: 1024, altezza: 800 });
  await card(schermo, 'Report di ricerca.pdf').locator('.td-lib-menu').click();
  await expect(schermo.locator('.td-detail .td-lib-testata')).toContainText('Report di ricerca.pdf');
  /* La premessa: con il dettaglio aperto l'elenco è nascosto — se non lo fosse, la prova non misurerebbe il caso. */
  await expect(schermo.locator('.td-master')).toBeHidden();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.x, 'il menu non esce a sinistra').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'né a destra').toBeLessThanOrEqual(1024);
  expect(box.y + box.height, 'né in basso').toBeLessThanOrEqual(800);
  await expect(page.getByRole('menuitem', { name: 'Rinomina' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errori).toEqual([]);
});

/* Owner 27/09: «per tema, come il mobile» (rilievo 13 di Codex). Le misure del mobile a `md`: nome con `space-page` a
   sinistra, `space-section` fra le card, raggio della card del tema. Fonti: `talosThemes.ts`, `design-tokens`. */
for (const [preset, attese] of [
  ['forge', { pagina: '12px', sezione: '12px', raggio: '8px' }],
  ['calm', { pagina: '16px', sezione: '16px', raggio: '12px' }],
  ['terminal', { pagina: '12px', sezione: '12px', raggio: '0px' }],
  ['paper', { pagina: '20px', sezione: '20px', raggio: '8px' }],
]) {
  test(`ATLAS-F3-11 — densità e raggio del tema come il mobile: ${preset}`, async ({ page }) => {
    const { errori, schermo } = await apriLibreria(page, { preset });
    expect(await page.evaluate(() => document.documentElement.dataset.talosTheme), 'il tema è quello chiesto').toBe(preset);
    const misure = await card(schermo, 'vendite.csv').evaluate((c) => ({
      pagina: getComputedStyle(c.querySelector('h3')).paddingLeft,
      sezione: getComputedStyle(c.closest('.td-grid')).columnGap,
      raggio: getComputedStyle(c).borderTopLeftRadius,
    }));
    expect(misure).toEqual(attese);
    expect(errori).toEqual([]);
  });
}

test('ATLAS-F3-06 — il dettaglio dell\'Atlas coi dati di oggi: testata, contenuto, righe, «Copia percorso» + «Tutte le azioni»', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  await page.getByRole('button', { name: 'Apri Architettura TALOS.md', exact: true }).click();
  const dettaglio = schermo.locator('.td-detail');
  await expect(dettaglio.locator('.td-lib-testata')).toContainText('Architettura TALOS.md');
  await expect(dettaglio.locator('.td-lib-simbolo')).toHaveText('MD');
  await expect(dettaglio.locator('.td-lib-testata .talos-badge, .td-lib-testata [class*="badge"], .td-lib-testata span').last()).toHaveText('Caricato');
  /* Il nome grande sparisce: è già in testata. (Figlio DIRETTO del corpo: gli `h2` del Markdown del file sono contenuto.) */
  await expect(dettaglio.locator('.td-detail-body > h2')).toHaveCount(0);
  expect(await dettaglio.locator('.td-lib-righe dt').allTextContents()).toEqual(['Cartella', 'Creato da', 'Sessione', 'Aggiornato']);
  const piede = dettaglio.locator('.td-detail-footer');
  await expect(piede.getByRole('button', { name: /Copia il percorso di Architettura TALOS\.md/u })).toBeVisible();
  await expect(piede.getByText('Tutte le azioni')).toBeVisible();
  /* Riga e menu nello stesso posto: intersezione vuota — il menu del piede NON ripete «Copia percorso». */
  await piede.getByRole('button', { name: /Azioni su Architettura TALOS\.md/u }).click();
  await expect(page.getByRole('menuitem', { name: 'Rinomina' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Copia percorso' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(errori).toEqual([]);
});

test('AL CONTRARIO — ATLAS-F3-07: la vista a ELENCO resta quella di prima (owner: «solo le card»)', async ({ page }) => {
  const { errori, schermo } = await apriLibreria(page);
  await schermo.getByRole('button', { name: 'Vista elenco' }).click();
  await expect(schermo.locator('.td-list .td-card')).toHaveCount(SEME.length);
  await expect(schermo.locator('.td-list .td-lib-art')).toHaveCount(0);
  await expect(schermo.locator('.td-list .td-file-preview')).toHaveCount(SEME.length);
  await expect(schermo.locator('.td-list .td-card').first().locator('.td-card-bottom')).toContainText('Aggiornato il');
  await schermo.getByRole('button', { name: 'Vista schede' }).click();
  expect(errori).toEqual([]);
});

test('AL CONTRARIO — ATLAS-F3-08: le altre sezioni td non prendono niente della Libreria', async ({ page }) => {
  const { errori } = await apriLibreria(page);
  const fogliDellaLibreria = await page.evaluate(() => {
    const trovate = [];
    for (const foglio of document.styleSheets) {
      let regole = [];
      try { regole = [...foglio.cssRules]; } catch { continue; }
      const visita = (lista) => {
        for (const r of lista) {
          if (r.cssRules) visita([...r.cssRules]);
          /* Le classi NUOVE di F3 (`td-lib-*`, la tendina `[data-filtri]`): «filtri» da solo prenderebbe regole di Attività e Agenti. */
          if (r.selectorText && /td-lib-|\[data-filtri\]/u.test(r.selectorText) && !/data-section="libreria"|#schermoLibreria/u.test(r.selectorText)) trovate.push(r.selectorText);
        }
      };
      visita(regole);
    }
    return trovate;
  });
  expect(fogliDellaLibreria, 'ogni regola nuova di F3 sta sotto la Libreria').toEqual([]);
  /*
   * ⛔ Revisione Codex 27/09, rilievo 16: la prova sopra guardava solo le classi NUOVE, e un selettore separato da virgole
   *   passava se UNA parte nominava la Libreria. Qui il blocco F3 del sorgente, regola per regola (anche dentro
   *   `@container`), e ogni PARTE di ogni selettore: deve stare sotto `.td-section[data-section="libreria"]` o
   *   `#schermoLibreria`. Togliere il prefisso a `.td-grid`, `.td-intro` o `.td-toolbar` la fa cadere.
   */
  const sorgente = readFileSync(new URL('../../src/styles/mockup-td.css', import.meta.url), 'utf8');
  const inizio = sorgente.indexOf('ATLAS F3 — LIBRERIA');
  expect(inizio, 'il blocco F3 esiste').toBeGreaterThan(0);
  const blocco = sorgente.slice(sorgente.indexOf('*/', inizio) + 2).replace(/\/\*[\s\S]*?\*\//gu, '');
  const fuori = [];
  let selettori = 0;
  for (const [, lista] of blocco.matchAll(/([^{}]+)\{[^{}]*\}/gu)) {
    const pulita = lista.trim();
    if (!pulita || pulita.startsWith('@')) continue;
    /* le virgole contano solo a profondità zero: `:is(a, b)` e `:has(:not(x), y)` sono UNA parte */
    const parti = [];
    let profondita = 0; let corrente = '';
    for (const c of pulita) {
      if (c === '(') profondita += 1;
      if (c === ')') profondita -= 1;
      if (c === ',' && profondita === 0) { parti.push(corrente); corrente = ''; } else corrente += c;
    }
    parti.push(corrente);
    for (const parte of parti) {
      /* i passi di un @keyframes (`from`, `to`, `50%`) non sono selettori */
      if (/^\s*(from|to|\d+(\.\d+)?%)\s*$/u.test(parte)) continue;
      selettori += 1;
      if (!/\.td-section\[data-section="libreria"\]|#schermoLibreria/u.test(parte)) fuori.push(parte.trim());
    }
  }
  expect(selettori, 'il blocco è stato letto davvero').toBeGreaterThan(60);
  expect(fuori, 'ogni selettore del blocco F3 sta sotto la Libreria').toEqual([]);
  expect(errori).toEqual([]);
});
