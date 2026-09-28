/*
 * F5 File reader (26/09/2026) — il LETTORE dei file, dal vivo, sul server di prova: una sessione VERA la cui cartella contiene
 * un file per ogni formato (generati da `fixtures/lettore-file.mjs` con le librerie vere) e la cui Libreria è seminata con
 * nove voci. Le rotte sono quelle del prodotto: byte, PDF in linea, lasciapassare delle pagine HTML, pagina ospite dei
 * documenti Office. Niente è finto tranne il fornitore (una chiave finta: la consegna fallisce subito e non costa niente).
 *
 * ⛔ Contro il 4174 (TALOS_HARNESS_UI_BASE_URL) non gira: salva una chiave e crea una sessione, cioè scrive.
 * ⛔ «Apri con l'app del sistema» NON si preme mai qui: sul server di prova lancerebbe davvero `explorer.exe` sul desktop.
 * ⛔ Il lettore PDF di Chromium non esiste nella shell headless di Playwright (misurato il 26/09): del PDF si prova la rotta
 *   (200, `application/pdf`, in linea) e la cornice che la punta; la foto del PDF si fa nel guscio Electron.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { immaginiDalBrowser, scriviFileDelLettore } from './fixtures/lettore-file.mjs';

test.use({ locale: 'it-IT' });
test.describe.configure({ mode: 'serial' });
test.skip(Boolean(process.env.TALOS_HARNESS_UI_BASE_URL?.trim()), 'crea una sessione e salva una chiave finta: gira solo sul server di prova');

const MODELLO = 'z-ai/glm-5.3-flash';
const rootWorkspace = process.env.TALOS_HARNESS_UI_PROJECT_DIRS?.split(';')[0]?.trim() || tmpdir();
let sessione = null; // { id, cartella, voci }

test.beforeAll(async ({ browser, playwright, baseURL }) => {
  test.setTimeout(120_000);
  const pagina = await browser.newPage();
  const immagini = await immaginiDalBrowser(pagina);
  await pagina.close();
  const cartella = mkdtempSync(join(rootWorkspace, 'f5-lettore-'));
  const { voci } = await scriviFileDelLettore(cartella, { immagini });
  const api = await playwright.request.newContext({ baseURL });
  const chiave = await api.post('/api/v1/providers/openrouter/key', { data: { key: 'sk-f5-lettore-fixture' } });
  expect(chiave.ok(), 'chiave finta del banco').toBe(true);
  const r = await api.post('/api/v1/sessions/custom', { data: { cartellaLibera: cartella, consegna: 'prova F5 del lettore: non fare nulla', modello: MODELLO } });
  expect(r.ok(), `creazione della sessione: ${await r.text()}`).toBe(true);
  const id = (await r.json()).data.sessionId;
  /* la Libreria nasce dalla cartella `.harness-ui-library/` del progetto, spostata dal server al primo tocco (PO-26) */
  await expect.poll(async () => {
    const elenco = await api.get(`/api/v1/sessions/${encodeURIComponent(id)}/library`);
    if (!elenco.ok()) return -1;
    const corpo = await elenco.json();
    return (corpo.data?.voci ?? corpo.data?.items ?? []).length;
  }, { message: 'la Libreria seminata non è comparsa', timeout: 20_000 }).toBe(voci.length);
  await api.dispose();
  sessione = { id, cartella, voci };
});

async function apri(page, { larghezza = 1440, altezza = 900, tema = 'dark' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: tema });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'z-ai/glm-5.3-flash' } })); } catch { /* finestra privata */ }
  }, { colorMode: tema });
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Lettore F5', modello, { conclusa: true, modello }), [sessione.id, MODELLO]);
  return errori;
}

const lettoreNelRail = (page) => page.locator('#railFileLettore .talos-lettore');

async function apriFile(page, percorso) {
  await page.evaluate((p) => window.__talosHarnessUiRuntime.apriFileAlbero(p, p.split('/').pop()), percorso);
  const lettore = lettoreNelRail(page);
  await expect(lettore, `${percorso}: il lettore non è nel rail`).toBeVisible();
  await expect(lettore.locator('.talos-lettore__nome')).toHaveText(percorso.split('/').pop());
  await expect(lettore, `${percorso}: la lettura non è finita`).not.toHaveAttribute('data-stato', 'caricando', { timeout: 10_000 });
  return lettore;
}

test('LETTORE-01 — ogni formato si apre nel rail col suo tipo e il suo contenuto vero; i casi limite lo dicono', async ({ page }) => {
  test.setTimeout(240_000);
  /* ⛔ 26/09 pomeriggio (owner «ora, prima di F6»): Word e PowerPoint costruiti nella pagina di TALOS facevano scattare la
     sua CSP a ogni attributo `style` (39 + 59 avvisi misurati sul 4174). Ora si costruiscono nella pagina ospite: zero. */
  const avvisiCsp = [];
  page.on('console', (m) => { if (m.text().includes('Applying inline style')) avvisiCsp.push(m.text().slice(0, 120)); });
  const errori = await apri(page);
  const larghezzaImmagine = async (l) => l.locator('.talos-lettore__immagine').evaluate((img) => (img.complete ? img.naturalWidth : new Promise((ok) => { img.onload = () => ok(img.naturalWidth); img.onerror = () => ok(-1); })));

  let l = await apriFile(page, 'Leggimi.md');
  await expect(l).toHaveAttribute('data-tipo', 'markdown');
  await expect(l.locator('.talos-lettore__prosa h1')).toHaveText('Relazione del progetto');
  await expect(l.locator('.talos-lettore__prosa table')).toHaveCount(1);
  await l.getByRole('tab', { name: 'Testo', exact: true }).click();
  await expect(l.locator('.talos-lettore__corpo')).toContainText('# Relazione del progetto');
  await expect(page.locator('#railFile > [data-c="FileTree"]'), 'col lettore aperto l’albero non si vede').toBeHidden();

  l = await apriFile(page, 'sorgente/registro.mjs');
  await expect(l).toHaveAttribute('data-tipo', 'testo');
  await expect(l.locator('.talos-lettore__corpo')).toContainText('export class Registro');
  expect(await l.locator('.talos-lettore__corpo .token').count(), 'il codice è evidenziato (Prism)').toBeGreaterThan(5);
  await expect(l.locator('.talos-lettore__modi'), 'un testo ha una vista sola: niente interruttore').toBeHidden();

  l = await apriFile(page, 'dati/vendite.csv');
  await expect(l).toHaveAttribute('data-tipo', 'tabella');
  await expect(l.locator('tbody tr')).toHaveCount(200);
  await expect(l.locator('td', { hasText: 'Rossi, Mario' }).first(), 'la virgola fra virgolette resta nella cella').toBeVisible();
  await l.getByRole('button', { name: 'Mostra tutte le 250 righe' }).click();
  await expect(l.locator('tbody tr')).toHaveCount(250);

  l = await apriFile(page, 'dati/config.json');
  await expect(l).toHaveAttribute('data-tipo', 'testo');
  await expect(l.locator('.talos-lettore__corpo')).toContainText('"talos-prova"');

  for (const [percorso, larghezza] of [['immagini/grafico.png', 480], ['immagini/punto.gif', 160], ['immagini/mappa.bmp', 240], ['immagini/foto.jpg', 640], ['immagini/foto.webp', 640], ['immagini/schema.svg', 320]]) {
    l = await apriFile(page, percorso);
    await expect(l).toHaveAttribute('data-tipo', 'immagine');
    expect(await larghezzaImmagine(l), `${percorso}: il browser l’ha decodificata`).toBe(larghezza);
    await expect(l.locator('.talos-lettore__zoom'), `${percorso}: lo zoom c’è`).toBeVisible();
  }
  await l.getByRole('tab', { name: 'Testo', exact: true }).click();
  await expect(l.locator('.talos-lettore__corpo'), 'l’SVG ha anche la vista Testo').toContainText('<svg');

  const risposta = page.waitForResponse((r) => r.url().includes('/file/anteprima?percorso=documenti%2Frelazione.pdf'));
  l = await apriFile(page, 'documenti/relazione.pdf');
  await expect(l).toHaveAttribute('data-tipo', 'pdf');
  const pdf = await risposta;
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect(pdf.headers()['content-disposition'] ?? '', 'il PDF si apre in linea, non si scarica').not.toMatch(/attachment/u);
  await expect(l.locator('iframe.talos-lettore__cornice--pdf')).toHaveAttribute('src', /\/file\/anteprima\?percorso=documenti%2Frelazione\.pdf$/u);

  l = await apriFile(page, 'documenti/relazione.docx');
  await expect(l).toHaveAttribute('data-tipo', 'documento');
  const word = page.frameLocator('#railFileLettore iframe.talos-lettore__office');
  await expect(word.locator('body'), 'il documento Word è arrivato nella pagina ospite').toContainText('Relazione del trimestre', { timeout: 15_000 });
  await expect(word.locator('table').first()).toContainText('docx-preview');
  await expect(word.locator('img').first(), 'l’immagine incorporata c’è').toBeVisible();
  expect(await word.locator('a[href], form, iframe').count(), 'niente collegamenti, moduli o cornici nel documento ripulito').toBe(0);
  /* la pagina (21 cm) nel rail stretto si rimpicciolisce per stare in larghezza, invece di scorrere di lato (foto 26/09) */
  await expect.poll(async () => Number(await word.locator('html').getAttribute('data-zoom')), { message: 'la pagina Word è adattata alla larghezza del rail' }).toBeLessThan(1);

  l = await apriFile(page, 'documenti/budget.xlsx');
  await expect(l).toHaveAttribute('data-tipo', 'foglio');
  await expect(l.getByRole('tab')).toHaveText(['Vendite', 'Riepilogo', 'Appunti (nascosto)']);
  /* 321 righe del foglio: l'intestazione «Data, Cliente…» è la riga 1 del foglio (come in Excel), più le 320 di dati */
  await expect(l.locator('.talos-lettore__foglio-pannello tbody tr')).toHaveCount(321, { timeout: 15_000 });
  /* come lo mostra Excel in italiano: data breve gg/mm/aaaa e virgola decimale (foto 26/09: «1/1/26» e «49.9») */
  await expect(l.locator('.talos-lettore__foglio-pannello tbody tr').nth(1)).toContainText('01/01/2026');
  await expect(l.locator('.talos-lettore__foglio-pannello tbody tr').nth(1)).toContainText('49,9');
  await l.getByRole('tab', { name: 'Riepilogo' }).click();
  await expect(l.locator('.talos-lettore__foglio-pannello')).toContainText('Q3');

  l = await apriFile(page, 'documenti/presentazione.pptx');
  await expect(l).toHaveAttribute('data-tipo', 'presentazione');
  const slide = page.frameLocator('#railFileLettore iframe.talos-lettore__office');
  await expect(slide.locator('.talos-slide'), 'tre slide').toHaveCount(3, { timeout: 20_000 });
  await expect(slide.locator('.talos-slide').first()).toContainText('Il lettore di TALOS');
  await expect(slide.locator('.talos-slide').nth(2).locator('img'), 'l’immagine della terza slide c’è').toHaveCount(1);

  l = await apriFile(page, 'casi-limite/finto.docx');
  await expect(l).toHaveAttribute('data-tipo', 'binario');
  await expect(l.locator('.talos-lettore__avviso')).toContainText('ha il nome sbagliato');
  l = await apriFile(page, 'casi-limite/senza-estensione');
  await expect(l, 'un file senza estensione si riconosce dai byte').toHaveAttribute('data-tipo', 'pdf');
  l = await apriFile(page, 'casi-limite/immagine-rinominata.pdf');
  await expect(l).toHaveAttribute('data-tipo', 'immagine');
  await expect(l.locator('.talos-lettore__avviso')).toContainText('il contenuto è un\'immagine PNG');
  l = await apriFile(page, 'casi-limite/con-macro.docm');
  await expect(l).toHaveAttribute('data-tipo', 'documento');
  await expect(l.locator('.talos-lettore__avviso')).toContainText('le macro non si eseguono');
  l = await apriFile(page, 'casi-limite/archivio.zip');
  await expect(l).toHaveAttribute('data-tipo', 'binario');
  await expect(l.getByRole('button', { name: 'Apri con l’app del sistema' }), 'ciò che non si mostra offre l’app del sistema (qui non si preme)').toBeVisible();
  /* uno ZIP col nome di un Word: la firma dice Office, la resa (nella pagina ospite) fallisce e lo DICE — il lettore mostra la
     sua carta d'errore, non una cornice vuota (26/09 pomeriggio: la resa ora vive nella cornice e riporta i fallimenti) */
  l = await apriFile(page, 'casi-limite/rotto.docx');
  await expect(l).toHaveAttribute('data-tipo', 'documento');
  await expect(l.locator('.talos-lettore__corpo')).toContainText('Questo documento Word non si apre qui: il file è rotto', { timeout: 15_000 });
  /* parole da persona a schermo; il messaggio tecnico della libreria solo nel suggerimento (foto 26/09: era a schermo) */
  await expect(l.locator('.talos-lettore__corpo')).not.toContainText('Cannot');
  /* ⛔ 27/09: il `title` diventa `data-tip` al PASSAGGIO del mouse (`tooltip.js`, `migraTitle` in `suEntrata`): nella suite
     intera il puntatore era sopra la frase e la prova leggeva `title` a vuoto. Si accetta l'uno o l'altro, mai nessuno. */
  await expect.poll(() => l.locator('.talos-lettore__fuori p').evaluate((p) => (p.getAttribute('data-tip') || p.getAttribute('title') || '').trim().length > 0)).toBe(true);
  await expect(l.getByRole('button', { name: 'Apri con l’app del sistema' })).toBeVisible();
  await expect(l.locator('iframe.talos-lettore__office'), 'la cornice fallita non resta a schermo').toHaveCount(0);
  l = await apriFile(page, 'casi-limite/vuoto.txt');
  await expect(l.locator('.talos-lettore__corpo')).toHaveText('Il file è vuoto.');
  l = await apriFile(page, 'casi-limite/registro-grande.log');
  await expect(l).toHaveAttribute('data-stato', 'grande');
  await l.getByRole('button', { name: 'Mostra comunque' }).click();
  await expect(l).toHaveAttribute('data-stato', 'pronto');
  await expect(l.locator('.talos-lettore__nota')).toContainText('Mostrati i primi 400.000 caratteri');

  expect(errori, 'nessun errore JavaScript nella pagina').toEqual([]);
  expect(avvisiCsp, 'nessun avviso della CSP sugli stili in linea: Word e PowerPoint si costruiscono nella pagina ospite').toEqual([]);
});

test('LETTORE-02 — la pagina HTML: i suoi script partono, la rete no; stile e immagine della sua cartella sì; la vista Testo', async ({ page }) => {
  await apri(page);
  const l = await apriFile(page, 'pagina/index.html');
  await expect(l).toHaveAttribute('data-tipo', 'html');
  const cornice = l.locator('iframe.talos-lettore__cornice');
  await expect(cornice).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(cornice).toHaveAttribute('csp', /default-src 'none'/u);
  const dentro = page.frameLocator('#railFileLettore iframe.talos-lettore__cornice');
  await expect(dentro.locator('#script'), 'lo script della pagina è partito').toHaveText('Lo script della pagina è partito.');
  await expect(dentro.locator('#rete'), 'la rete verso fuori è bloccata').toHaveText('La rete è bloccata, come deve.', { timeout: 10_000 });
  expect(await dentro.locator('header').evaluate((h) => getComputedStyle(h).backgroundColor), 'lo stile della sua cartella è arrivato').toBe('rgb(47, 111, 125)');
  expect(await dentro.locator('header img').evaluate((i) => i.naturalWidth), 'il logo della sua cartella è arrivato').toBeGreaterThan(0);
  expect(await dentro.locator('#esterna').evaluate((i) => i.naturalWidth), 'l’immagine esterna no').toBe(0);
  await dentro.locator('#contatore').click();
  await expect(dentro.locator('#contatore')).toHaveText('Cliccato 1 volte');
  await l.getByRole('tab', { name: 'Testo', exact: true }).click();
  await expect(l.locator('.talos-lettore__corpo')).toContainText('<!doctype html>');
});

test('LETTORE-03 — dal menu dell’albero: Apri, Schermo intero e ritorno, Chiudi rimette l’albero col fuoco sulla riga', async ({ page }) => {
  await apri(page);
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(page.locator('#alberoFile .ft-node').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'documenti' }).click();
  const riga = page.locator('#alberoFile .ft-row', { hasText: 'budget.xlsx' });
  await riga.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Apri', exact: true }).click();
  const l = lettoreNelRail(page);
  await expect(l).toHaveAttribute('data-tipo', 'foglio', { timeout: 10_000 });
  await expect(l.locator('.talos-lettore__nome'), 'aperto dal menu, il fuoco va al nome del file e non resta sul corpo della pagina').toBeFocused();

  await l.getByRole('button', { name: 'Schermo intero' }).click();
  const schermo = page.locator('[data-view="chat"] > .talos-lettore-schermo');
  await expect(schermo.locator('.talos-lettore')).toHaveAttribute('data-schermo-intero', 'si');
  await expect(page.locator('[data-view="chat"]')).toHaveClass(/talos-grafo-aperto/u);
  await expect(page.locator('#railFileLettore')).toBeHidden();
  await expect(page.locator('#railFile > [data-c="FileTree"]'), 'a schermo intero il rail torna all’albero').toBeVisible();
  const r = await schermo.boundingBox();
  const chat = await page.locator('[data-view="chat"]').boundingBox();
  expect(r.width, 'occupa l’area della chat').toBeGreaterThan(chat.width - 2);
  await expect(schermo.locator('tbody tr').first()).toBeVisible();

  /* un altro file scelto dall'albero mentre si è a schermo intero si apre lì */
  await page.locator('#alberoFile .ft-row', { hasText: 'relazione.docx' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Apri', exact: true }).click();
  await expect(schermo.locator('.talos-lettore')).toHaveAttribute('data-tipo', 'documento');

  await schermo.getByRole('button', { name: 'Esci dallo schermo intero' }).click();
  await expect(schermo).toHaveCount(0);
  await expect(page.locator('[data-view="chat"]')).not.toHaveClass(/talos-grafo-aperto/u);
  await expect(l).toHaveAttribute('data-schermo-intero', 'no');
  await expect(l.locator('.talos-lettore__nome')).toHaveText('relazione.docx');

  await l.getByRole('button', { name: 'Altre azioni sul file' }).click();
  await expect(page.getByRole('menuitem')).toContainText(['Allega alla chat', 'Scarica', 'Apri con l’app del sistema', 'Mostra in Esplora File']);
  await page.keyboard.press('Escape');

  await l.getByRole('button', { name: 'Chiudi il lettore' }).click();
  await expect(page.locator('#railFileLettore')).toBeHidden();
  await expect(page.locator('#railFile > [data-c="FileTree"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.includes('relazione.docx') ?? false), { message: 'il fuoco torna sulla riga del file' }).toBe(true);
});

test('LETTORE-04 — Libreria: lo stesso lettore nel dettaglio, gli stessi byte della cartella, e un ridisegno non rilegge il file', async ({ page }) => {
  test.setTimeout(120_000);
  const errori = await apri(page);
  const letture = [];
  page.on('request', (rq) => { if (/\/library\/[^/]+\/file$/u.test(new URL(rq.url()).pathname)) letture.push(rq.url()); });

  const lRail = await apriFile(page, 'Leggimi.md');
  const byteRail = await lRail.locator('.talos-lettore__meta').textContent();

  await page.getByRole('button', { name: /^Libreria \d+$/u }).click();
  /* ATLAS F3 (27/09/2026): le card della Libreria leggono i file per disegnare le anteprime quando entrano in vista (la
     card del mobile). Quelle letture sono la BASE: dopo, aprire il dettaglio ne aggiunge UNA (il lettore) ed espandere —
     che ridisegna dettaglio E card — nessuna: né il lettore né le anteprime rileggono al ridisegno. */
  await expect(page.locator('#schermoLibreria .td-grid .td-card').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const radice = document.querySelector('#schermoLibreria');
    const inLettura = radice.querySelectorAll('.td-lib-art[data-art="loading"]').length;
    const immaginiAperte = [...radice.querySelectorAll('img.td-lib-immagine')].filter((img) => !img.complete).length;
    return inLettura + immaginiAperte;
  }), { message: 'le anteprime (letture e immagini) finiscono' }).toBe(0);
  const base = letture.length;
  expect(base, 'le card hanno letto per le anteprime: senza, la base non misura niente').toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Apri Leggimi.md', exact: true }).click();
  const l = page.locator('#schermoLibreria .td-lettore-libreria');
  await expect(l).toHaveAttribute('data-stato', 'pronto', { timeout: 10_000 });
  await expect(l.locator('.talos-lettore__prosa h1')).toHaveText('Relazione del progetto');
  expect(await l.locator('.talos-lettore__meta').textContent(), 'stesso file, stessi byte, dalle due porte').toBe(byteRail);
  expect(letture).toHaveLength(base + 1);
  await page.locator('#schermoLibreria').getByRole('button', { name: 'Espandi il dettaglio' }).click();
  await expect(page.locator('#schermoLibreria .td-lettore-libreria')).toHaveAttribute('data-stato', 'pronto');
  expect(letture, 'espandere il dettaglio lo ridisegna, ma il file non si rilegge').toHaveLength(base + 1);
  await page.locator('#schermoLibreria').getByRole('button', { name: 'Affianca all’elenco' }).click();
  expect(letture, 'tornare all’elenco ridisegna le card: le anteprime restano in memoria').toHaveLength(base + 1);
  await page.locator('#schermoLibreria').getByRole('button', { name: 'Espandi il dettaglio' }).click();
  await page.locator('#schermoLibreria').getByRole('button', { name: 'Affianca all’elenco' }).click();

  await page.getByRole('button', { name: 'Apri Relazione.docx', exact: true }).click();
  await expect(page.frameLocator('#schermoLibreria .td-lettore-libreria iframe.talos-lettore__office').locator('body')).toContainText('Relazione del trimestre', { timeout: 15_000 });
  await expect(page.locator('#schermoLibreria .td-lettore-libreria'), 'nel dettaglio il menu «⋯» non ripete le azioni della riga').not.toContainText('Scarica');

  await page.getByRole('button', { name: 'Apri Pagina.html', exact: true }).click();
  await expect(page.frameLocator('#schermoLibreria .td-lettore-libreria iframe.talos-lettore__cornice').locator('#script')).toHaveText('Lo script della pagina è partito.');

  await page.getByRole('button', { name: 'Apri Budget.xlsx', exact: true }).click();
  await expect(page.locator('#schermoLibreria .td-lettore-libreria').getByRole('tab', { name: 'Vendite' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Apri Presentazione.pptx', exact: true }).click();
  await expect(page.frameLocator('#schermoLibreria .td-lettore-libreria iframe.talos-lettore__office').locator('.talos-slide')).toHaveCount(3, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Apri Relazione trimestrale.pdf', exact: true }).click();
  await expect(page.locator('#schermoLibreria .td-lettore-libreria iframe.talos-lettore__cornice--pdf')).toHaveAttribute('src', /\/library\/lib-lettore-01\/anteprima$/u);
  await expect(page.locator('#schermoLibreria .td-lettore-libreria').getByRole('button', { name: 'Altre azioni sul file' }), 'un PDF in Libreria non ha voci nel «⋯»: il menu non si offre').toBeHidden();
  expect(errori).toEqual([]);
});

test('LETTORE-05 — a 1024 la colonna destra è flottante: lo schermo intero la chiude, e uscendo il lettore ci torna', async ({ page }) => {
  await apri(page, { larghezza: 1024, altezza: 800 });
  const l = await apriFile(page, 'documenti/relazione.docx');
  await expect(page.locator('#inspectorPanel'), 'premessa: a 1024 il lettore apre la colonna flottante').toHaveClass(/\bopen\b/u);
  await l.getByRole('button', { name: 'Schermo intero' }).click();
  const schermo = page.locator('[data-view="chat"] > .talos-lettore-schermo');
  await expect(schermo.locator('.talos-lettore')).toHaveAttribute('data-schermo-intero', 'si');
  await expect(page.locator('#inspectorPanel'), 'a schermo intero la colonna flottante non copre il lettore (foto 26/09)').not.toHaveClass(/\bopen\b/u);
  // coperto dal pannello, questo clic scadeva: è la prova che il comando si raggiunge davvero
  await schermo.getByRole('button', { name: 'Esci dallo schermo intero' }).click({ timeout: 5_000 });
  await expect(schermo).toHaveCount(0);
  await expect(page.locator('#inspectorPanel'), 'uscendo, la colonna si riapre col lettore').toHaveClass(/\bopen\b/u);
  await expect(lettoreNelRail(page)).toHaveAttribute('data-schermo-intero', 'no');

  /* la testata più affollata (un'immagine: zoom + tre comandi) nel rail stretto: il nome resta leggibile e i dati su una
     riga sola — prima il nome spariva e «Immagine · 3,8 kB» andava a capo su quattro righe (foto 26/09) */
  const img = await apriFile(page, 'immagini/grafico.png');
  await expect(img.locator('.talos-lettore__zoom')).toBeVisible();
  const misure = await img.evaluate((r) => {
    const nome = r.querySelector('.talos-lettore__nome').getBoundingClientRect();
    const meta = r.querySelector('.talos-lettore__meta');
    return { nome: Math.round(nome.width), metaRighe: Math.round(meta.getBoundingClientRect().height / parseFloat(getComputedStyle(meta).lineHeight)), testata: Math.round(r.querySelector('.talos-lettore__testata').getBoundingClientRect().width) };
  });
  console.log(`MISURA-TESTATA-1024 ${JSON.stringify(misure)}`);
  expect(misure.nome, 'il nome del file ha spazio per leggersi').toBeGreaterThan(100);
  expect(misure.metaRighe, 'tipo e dimensione su una riga').toBe(1);
});
