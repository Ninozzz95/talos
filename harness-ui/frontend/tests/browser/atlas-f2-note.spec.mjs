/*
 * ATLAS-F2 — la famiglia 2 del refactor «TALOS UI Atlas» (24/09/2026): la schermata NOTE.
 *
 * ⛔ NON DEPLOYABILE finché la review avversaria del coordinatore non la accetta e l'owner non la valuta sul 4174
 *   (human gate, owner 24/09/2026).
 *
 * CHE COSA PROVA. La schermata Note vera della app (server isolato di `playwright.config.mjs`: 4176, store temporaneo),
 * con una sessione e tre note FINTE servite dal browser (`page.route`: nessuna scrittura, nessun modello), misurata con
 * `getComputedStyle` contro le voci `NotesScreen`, `NoteCard` e `NoteEditor` dell'Atlas:
 *   `source/atlas.js:36` `noteCard` · `:37` `editor` · `:146` `pageHeader` · `:148` `case'notes'`;
 *   `source/atlas.css` (ID di `registri/CSS-ATLAS.json`): CSS-0346/0347/0348 testata · CSS-0349/0350 strumenti ·
 *   CSS-0152/0154/0159 + CSS-0188 riga della selezione · CSS-0235/0236/0237/0239/0241/0243 card · CSS-0353/0354/0357
 *   dettaglio · CSS-0116 etichetta · CSS-0174 etichetta di campo · CSS-0176 campo · CSS-0355 area di testo.
 * Decisioni dell'owner in gioco: Q-01 (contorni e fondi dei campi 0.1.15), Q-06 (mai sotto gli 11 px), Q-10 (il
 * conteggio dell'editor è in parole).
 *
 * I due piani, provati al contrario:
 *   - ATLAS-F2-01…07 sono ROSSE sul codice di prima (misurato) e verdi col porting;
 *   - ATLAS-F2-08 (le funzioni della sezione) e ATLAS-F2-09 (le altre cinque sezioni della ricetta `td-*` NON cambiano)
 *     sono verdi PRIMA e DOPO: dicono che il porting non ha tolto niente e non è uscito dalla sezione Note.
 * Ogni prova chiude con `expect(nonGet).toEqual([])`: il server non riceve una sola scrittura.
 */
import { expect, test } from '@playwright/test';

test.use({ locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1440, height: 900 } });

const SID = 'atlas-f2';
const MODELLO = 'z-ai/glm-5.3-flash';
const NOTE = [
  { id: 'n1', titolo: 'Principi del workspace', contenuto: 'Un ambiente che lascia spazio al pensiero.\n\nDistingui i comandi dal contenuto. Mantieni visibili le informazioni importanti. Ogni stato deve avere una spiegazione. Una riga in più per provare il taglio a tre righe dell’estratto.', aggiornataAlle: '2026-09-24T08:24:00.000Z' },
  { id: 'n2', titolo: 'Revisione del laboratorio', contenuto: 'Catalogo, provider e runtime sono tre aspetti diversi. La pagina deve renderli leggibili senza confonderli.', aggiornataAlle: '2026-09-23T14:08:00.000Z' },
  { id: 'n3', titolo: 'Checklist di rilascio', contenuto: 'Verificare layout, contrasto, tastiera, temi e ripristino.', aggiornataAlle: '2026-09-22T07:45:00.000Z' },
];
const MEMORIE = [
  { id: 'm1', titolo: 'I commit non portano co-authoring', contenuto: 'Mai firme di co-autore.', genere: 'policy_note', creataAlle: '2026-09-04T08:00:00.000Z', aggiornataAlle: '2026-09-04T18:00:00.000Z' },
];
const intera = (n) => ({ ...n, formato: 'testo', creataAlle: n.aggiornataAlle, origine: 'persona' });
const sse = (ev) => `retry: 3600000\n${ev.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;
const EVENTI = [{ type: 'RunStarted', input: { consegna: 'Prova' }, _sequenza: 1 }, { type: 'RunFinished', _sequenza: 2 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];

async function apri(page, schermata = 'note') {
  const nonGet = [];
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' } })); } catch { /* */ } });
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${SID}/events`) return route.fulfill({ contentType: 'text/event-stream', body: sse(EVENTI) });
    if (req.method() === 'GET' && url.pathname === `/api/v1/sessions/${SID}/notes`) return route.fulfill({ json: { ok: true, data: { note: NOTE, errore: null }, note: NOTE, meta: {} } });
    const una = url.pathname.match(new RegExp(`^/api/v1/sessions/${SID}/notes/([^/]+)$`));
    if (req.method() === 'GET' && una) { const n = NOTE.find((x) => x.id === decodeURIComponent(una[1])); return route.fulfill({ json: { ok: true, data: { nota: intera(n) }, nota: intera(n), meta: {} } }); }
    if (req.method() === 'GET' && url.pathname === `/api/v1/sessions/${SID}/memory`) return route.fulfill({ json: { ok: true, data: { memorie: MEMORIE, errore: null }, memorie: MEMORIE, meta: {} } });
    const m = req.method();
    if (m !== 'GET' && m !== 'HEAD') { nonGet.push(`${m} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.talos-nav-item[data-vaia="chat"]').first()).toBeVisible();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.evaluate(({ SID, M }) => window.__talosHarnessUiRuntime.passaASessione(SID, 'workspace', 'Note di prova', M, { conclusa: true, modello: M }), { SID, M: MODELLO });
  await page.waitForTimeout(600);
  await page.evaluate((d) => document.querySelector(`.talos-sidebar [data-vaia="${d}"]`).click(), schermata);
  return nonGet;
}

/** Stili calcolati di un elemento, più il suo rettangolo. */
const stili = (loc, props) => loc.evaluate((el, props) => {
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, ...Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])) };
}, props);
/** Il colore che un token risolve nella pagina (stesso formato di `getComputedStyle`). */
const token = (page, nome, prop = 'color') => page.evaluate(({ nome, prop }) => { const s = document.createElement('span'); s.style.setProperty(prop, `var(${nome})`); document.body.append(s); const v = getComputedStyle(s).getPropertyValue(prop); s.remove(); return v; }, { nome, prop });

const NOTA = '#schermoNote .td-section[data-section="note"]';

test('ATLAS-F2-01 · Testata: titolo e frase dell\'Atlas, niente marchio, «Nuova nota» piccola a destra', async ({ page }) => {
  const nonGet = await apri(page);
  await expect(page.locator(`${NOTA} .td-card`).first()).toBeVisible();
  const h2 = await stili(page.locator(`${NOTA} .td-intro h2`), ['font-size', 'font-weight', 'line-height', 'margin-bottom']);
  expect([h2['font-size'], h2['font-weight'], h2['line-height'], h2['margin-bottom']]).toEqual(['22px', '550', '33px', '4px']); // CSS-0347 + radice 1.5
  expect((await stili(page.locator(`${NOTA} .td-intro p:not([role="status"])`).first(), ['font-size']))['font-size']).toBe('11px'); // CSS-0348
  await expect(page.locator(`${NOTA} .td-intro-mark`)).toBeHidden();
  const nuova = page.locator(`${NOTA} .td-intro > [data-nuova]`);
  await expect(nuova, 'il pulsante sta nella testata della pagina (atlas.js:148)').toHaveCount(1);
  await expect(page.locator('#schermoNote .talos-topbar [data-nuova]'), 'e non anche nella barra in alto').toHaveCount(0);
  await expect(nuova).toHaveClass(/talos-button--primary/);
  await expect(nuova).toHaveClass(/talos-button--sm/);
  expect(await nuova.locator('svg').count()).toBe(1);
  const intro = await stili(page.locator(`${NOTA} .td-intro`), ['justify-content', 'margin-bottom']);
  expect([intro['justify-content'], intro['margin-bottom']]).toEqual(['space-between', '18px']); // CSS-0346
  const bNuova = await nuova.boundingBox(); const bIntro = await page.locator(`${NOTA} .td-intro`).boundingBox();
  expect(Math.abs(bIntro.x + bIntro.width - (bNuova.x + bNuova.width)), 'a filo del margine destro della testata').toBeLessThanOrEqual(1);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-02 · Strumenti: gap 8, 14 sopra e sotto, ricerca che cresce, select dei controlli', async ({ page }) => {
  const nonGet = await apri(page);
  await expect(page.locator(`${NOTA} .td-card`).first()).toBeVisible();
  const barra = await stili(page.locator(`${NOTA} .td-toolbar`), ['gap', 'margin-top', 'margin-bottom']);
  expect([barra.gap, barra['margin-top'], barra['margin-bottom']]).toEqual(['8px', '14px', '14px']); // CSS-0349
  const cerca = await stili(page.locator(`${NOTA} .td-search`), ['flex-grow', 'min-width', 'max-width']);
  expect([cerca['flex-grow'], cerca['min-width'], cerca['max-width']]).toEqual(['1', '170px', 'none']); // CSS-0350
  await expect(page.locator(`${NOTA} .td-toolbar > .talos-grow`)).toBeHidden();
  const sel = await stili(page.locator(`${NOTA} .td-select`), ['font-size', 'padding-left']);
  expect([Math.round(sel.h), sel['font-size'], sel['padding-left']]).toEqual([36, '12px', '11px']); // CSS-0176 (F1)
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-03 · Riga della selezione: niente cornice, testo 11, margini 12 · 16', async ({ page }) => {
  const nonGet = await apri(page);
  await expect(page.locator(`${NOTA} .td-card`).first()).toBeVisible();
  const riga = await stili(page.locator(`${NOTA} .td-bulk`), ['border-top-width', 'padding-top', 'margin-top', 'margin-bottom', 'font-size', 'background-color']);
  expect([riga['border-top-width'], riga['padding-top'], riga['margin-top'], riga['margin-bottom'], riga['font-size'], riga['background-color']])
    .toEqual(['0px', '0px', '12px', '16px', '11px', 'rgba(0, 0, 0, 0)']); // atlas.js:148 + CSS-0159
  expect((await stili(page.locator(`${NOTA} .td-bulk-select`), ['gap'])).gap).toBe('9px'); // CSS-0188
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-04 · Card: 13 di padding, raggio 10, titolo 12 · 550, estratto 11 a tre righe, piede con orologio', async ({ page }) => {
  const nonGet = await apri(page);
  const card = page.locator(`${NOTA} .td-card`).first();
  await expect(card).toBeVisible();
  expect((await stili(page.locator(`${NOTA} .td-grid`), ['row-gap']))['row-gap']).toBe('12px'); // CSS-0351
  const c = await stili(card, ['border-top-left-radius']);
  expect(c['border-top-left-radius']).toBe('10px'); // CSS-0235
  expect(c.h, 'altezza del contenuto, non un minimo di 250').toBeLessThan(200);
  const apri2 = await stili(card.locator('.td-card-open'), ['padding-top', 'padding-left', 'min-height']);
  expect([apri2['padding-top'], apri2['padding-left'], apri2['min-height']]).toEqual(['13px', '13px', '0px']);
  const t = await stili(card.locator('h3'), ['font-size', 'font-weight', 'margin-top']);
  expect([t['font-size'], t['font-weight'], t['margin-top']]).toEqual(['12px', '550', '12px']); // .demo h4 + CSS-0237
  const e = await stili(card.locator('.td-excerpt'), ['font-size', 'line-height', 'color', '-webkit-line-clamp', 'margin-top']);
  expect([e['font-size'], e['line-height'], e['-webkit-line-clamp'], e['margin-top']]).toEqual(['11px', '18.7px', '3', '7px']); // CSS-0241
  expect(e.color).toBe(await token(page, '--talos-muted'));
  const p = await stili(card.locator('.td-card-bottom'), ['margin-top', 'padding-top', 'font-size']);
  expect([p['margin-top'], p['padding-top'], p['font-size']]).toEqual(['12px', '0px', '11px']); // CSS-0239/0243, Q-06
  await expect(card.locator('.td-card-bottom .td-card-quando svg use')).toHaveAttribute('href', '#i-clock');
  expect(await card.evaluate((n) => getComputedStyle(n, '::after').display)).toBe('none');
  const casella = await card.locator('.td-card-select').boundingBox(); const bCard = await card.boundingBox();
  expect(Math.round(casella.x - bCard.x), 'la casella sta a sinistra: bordo 1 + padding 13 della card (CSS-0235, atlas.js:36)').toBe(14);
  expect([Math.round(casella.width), Math.round(casella.height)], 'la casella nativa della card dell\'Atlas: 13 × 13 (misurata)').toEqual([13, 13]);
  expect(await card.locator('.td-card-quando svg').evaluate((n) => [n.getBoundingClientRect().width, n.getBoundingClientRect().height]), 'l\'orologio è l\'icona di serie dell\'Atlas (CSS-0024)').toEqual([18, 18]);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-05 · Card aperta: fondo d\'accento, bordo di serie, nessuna ombra', async ({ page }) => {
  const nonGet = await apri(page);
  await page.locator(`${NOTA} .td-card-open`).first().click();
  const aperta = page.locator(`${NOTA} .td-card[data-selected="true"]`);
  await expect(aperta).toHaveCount(1);
  /* ⛔ 24/09 notte (review del coordinatore): 1 corsa su 3 leggeva `""` — la card viene ridisegnata subito dopo il clic e
     `getComputedStyle` di un nodo appena staccato è vuoto. Si ASPETTA il valore (asserzione che riprova, Playwright
     `expect.poll`) invece di leggerlo una volta sola nel mezzo di un ridisegno. */
  const accentoTenue = await token(page, '--talos-accent-soft', 'background-color');
  await expect.poll(async () => (await stili(aperta, ['background-color']))['background-color']).toBe(accentoTenue); // CSS-0236
  const s = await stili(aperta, ['background-color', 'border-top-color', 'box-shadow']);
  expect(s['border-top-color']).toBe(await token(page, '--talos-border', 'border-top-color'));
  expect(s['box-shadow']).toBe('none');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-06 · Dettaglio: una scheda col bordo e raggio 11, etichetta 11 maiuscola, 18 dall\'elenco', async ({ page }) => {
  const nonGet = await apri(page);
  await page.locator(`${NOTA} .td-card-open`).first().click();
  const det = page.locator(`${NOTA} .td-detail`);
  await expect(det).toBeVisible();
  const d = await stili(det, ['border-top-width', 'border-left-width', 'border-top-left-radius', 'margin-right']);
  expect([d['border-top-width'], d['border-left-width'], d['border-top-left-radius'], d['margin-right']]).toEqual(['1px', '1px', '11px', '28px']); // CSS-0353
  const et = await stili(page.locator(`${NOTA} .td-detail-head > span:first-child`), ['font-size', 'text-transform', 'letter-spacing']);
  expect([et['font-size'], et['text-transform'], et['letter-spacing']]).toEqual(['11px', 'uppercase', '1.32px']); // CSS-0116, Q-06
  const testa = await stili(page.locator(`${NOTA} .td-detail-head`), ['padding-top', 'padding-bottom']);
  expect([testa['padding-top'], testa['padding-bottom']]).toEqual(['18px', '14px']); // CSS-0353 + CSS-0354
  const master = await stili(page.locator(`${NOTA} .td-master`), ['padding-right']);
  const divisorio = await page.locator(`${NOTA} .td-divider`).boundingBox();
  expect(Number.parseFloat(master['padding-right']) + divisorio.width, 'fra l\'elenco e la scheda: 18 (CSS-0352 gap)').toBe(18);
  expect(await page.locator(`${NOTA} .td-divider`).evaluate((n) => getComputedStyle(n, '::before').backgroundColor), 'nessuna riga fra elenco e scheda (l\'Atlas non ne ha)').toBe('rgba(0, 0, 0, 0)');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-07 · Editor: campi dell\'Atlas coi contorni 0.1.15, parole che si contano mentre si scrive, Annulla poi Salva', async ({ page }) => {
  const nonGet = await apri(page);
  await expect(page.locator(`${NOTA} .td-card`).first()).toBeVisible();
  await page.locator(`${NOTA} .td-intro > [data-nuova]`).click();
  const titolo = page.locator(`${NOTA} .td-edit-title`);
  await expect(titolo).toBeVisible();
  const et = await stili(page.locator(`${NOTA} .td-field-label`).first(), ['font-size', 'color', 'margin-bottom']);
  expect([et['font-size'], et['margin-bottom']]).toEqual(['11px', '7px']); // CSS-0174
  expect(et.color).toBe(await token(page, '--talos-text'));
  const t = await stili(titolo, ['font-size', 'padding-top', 'padding-left', 'border-top-width', 'border-top-left-radius', 'background-color']);
  expect([Math.round(t.h), t['font-size'], t['padding-top'], t['padding-left'], t['border-top-width'], t['border-top-left-radius']]).toEqual([36, '12px', '8px', '11px', '1px', '11px']); // CSS-0176 + Q-01
  expect(t['background-color']).toBe(await token(page, '--talos-panel-soft', 'background-color'));
  const area = page.locator(`${NOTA} .td-edit-body`);
  const a = await stili(area, ['font-size', 'line-height', 'min-height']);
  expect([a['font-size'], a['line-height'], a['min-height']]).toEqual(['12px', '21.6px', '170px']); // CSS-0355
  const titoletto = page.locator(`${NOTA} .td-detail-body > h2`);
  await expect(titoletto, 'il titoletto resta per lo screen reader…').toHaveText('Nuova nota');
  expect((await titoletto.boundingBox()).width, '…ma non si vede').toBeLessThanOrEqual(1);
  const stato = page.locator(`${NOTA} .td-detail-footer > .td-save-status`);
  await expect(stato).toHaveText('0 parole · Non ancora salvata');
  await area.click();
  await page.keyboard.type('uno due tre');
  await expect(stato, 'Q-10: il conteggio in PAROLE, mentre si scrive').toHaveText('3 parole · Non ancora salvata');
  expect(await area.evaluate((n) => document.activeElement === n), 'il modulo non si è ridisegnato: il fuoco è ancora lì').toBe(true);
  const bottoni = page.locator(`${NOTA} .td-detail-footer > .talos-button`);
  expect(await bottoni.allTextContents()).toEqual(['Annulla', 'Salva']); // ordine del DOM = ordine visivo (W3C C27)
  await expect(bottoni.nth(0)).toHaveClass(/talos-button--secondary/);
  await expect(bottoni.nth(1)).toHaveClass(/talos-button--primary/);
  await expect(bottoni.nth(1).locator('svg use')).toHaveAttribute('href', '#i-check');
  const bStato = await stato.boundingBox(); const bAnnulla = await bottoni.nth(0).boundingBox();
  expect(bStato.x, 'il conteggio a sinistra, i bottoni a destra (atlas.js:37)').toBeLessThan(bAnnulla.x);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-08 · Le funzioni della sezione ci sono tutte (verde prima e dopo)', async ({ page }) => {
  const nonGet = await apri(page);
  await expect(page.locator(`${NOTA} .td-card`)).toHaveCount(3);
  await page.locator(`${NOTA} .td-search input`).fill('laboratorio');
  await expect(page.locator(`${NOTA} .td-card`)).toHaveCount(1);
  await page.locator(`${NOTA} .td-search input`).fill('');
  await expect(page.locator(`${NOTA} .td-card`)).toHaveCount(3);
  await page.locator(`${NOTA} .td-select`).selectOption('titolo');
  await expect(page.locator(`${NOTA} .td-card h3`).first()).toHaveText('Checklist di rilascio');
  await expect(page.locator(`${NOTA} .td-segment button`)).toHaveCount(2);
  await expect(page.locator(`${NOTA} [data-aggiorna]`)).toBeVisible();
  await expect(page.locator(`${NOTA} .td-card .td-card-azioni`)).toHaveCount(3);
  await page.locator(`${NOTA} [data-seleziona-visibili]`).check();
  await expect(page.locator(`${NOTA} .td-bulk-count`)).toContainText('3');
  await page.locator(`${NOTA} [data-seleziona-visibili]`).uncheck();
  await page.locator(`${NOTA} .td-card-open`).first().click();
  const divisorio = page.locator(`${NOTA} .td-divider`);
  await expect(divisorio).toHaveAttribute('role', 'separator');
  const prima = await divisorio.getAttribute('aria-valuenow');
  await divisorio.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(divisorio).not.toHaveAttribute('aria-valuenow', prima);
  await expect(page.locator(`${NOTA} .td-detail-head .talos-icon-button`)).toHaveCount(2); // espandi, chiudi
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-09 · La ricetta td-* delle altre sezioni NON cambia (Memoria, verde prima e dopo)', async ({ page }) => {
  const nonGet = await apri(page, 'memoria');
  const mem = '#schermoMemoria .td-section';
  await expect(page.locator(`${mem} .td-card`).first()).toBeVisible();
  expect((await stili(page.locator(`${mem} .td-intro h2`), ['font-size']))['font-size']).toBe('26px');
  await expect(page.locator(`${mem} .td-intro-mark`)).toBeVisible();
  const c = await stili(page.locator(`${mem} .td-card`).first(), ['border-top-left-radius']);
  expect(c['border-top-left-radius']).toBe('12px');
  expect((await stili(page.locator(`${mem} .td-card-open`).first(), ['padding-top']))['padding-top']).toBe('20px');
  await expect(page.locator(`${mem} .td-intro > [data-nuova]`), 'la «Nuova» della Memoria resta dov\'era').toHaveCount(0);
  const bulk = await stili(page.locator(`${mem} .td-bulk`), ['border-top-width']);
  expect(bulk['border-top-width']).toBe('1px');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-10 · La scheda del dettaglio non tocca i bordi: finestra stretta (solo dettaglio) ed espansa', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  const nonGet = await apri(page);
  await page.locator(`${NOTA} .td-card-open`).first().click();
  const det = page.locator(`${NOTA} .td-detail`);
  await expect(det).toBeVisible();
  // il dettaglio ENTRA da destra (translateX 14 → 0, `disegna` in sezione-elenco-dettaglio.js): si misura a moto finito
  const fermo = () => det.evaluate((n) => Promise.all(n.getAnimations().map((a) => a.finished)));
  await fermo();
  const sezione = await page.locator(NOTA).boundingBox();
  let b = await det.boundingBox();
  // sotto gli 850 px di sezione l'elenco si nasconde (mockup-td.css:364-368): la scheda prende il margine dell'elenco
  expect(Math.round(b.x - sezione.x), 'margine a sinistra, non a filo della barra laterale').toBe(24);
  expect(Math.round(sezione.x + sezione.width - (b.x + b.width)), 'margine a destra').toBe(24);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(`${NOTA} .td-detail-head .talos-icon-button`).first().click(); // espandi
  await expect(page.locator(`${NOTA} .td-workspace`)).toHaveAttribute('data-expanded', 'true');
  await fermo();
  const sezione2 = await page.locator(NOTA).boundingBox();
  b = await det.boundingBox();
  expect([Math.round(b.x - sezione2.x), Math.round(sezione2.x + sezione2.width - (b.x + b.width))], 'espansa: 28 per parte, niente che sborda').toEqual([28, 28]);
  expect(nonGet).toEqual([]);
});

/*
 * ⛔ REVIEW AVVERSARIA DEL 24/09 SERA — due difetti di F2 trovati dal coordinatore, qui le loro prove, ROSSE prima della
 *   cura (misurato) e verdi dopo.
 */
test('ATLAS-F2-11 · A 1024 con una nota aperta «Nuova nota» resta raggiungibile (un solo bottone visibile) e apre il modulo', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const nonGet = await apri(page);
  await page.locator(`${NOTA} .td-card-open`).first().click();
  await expect(page.locator(`${NOTA} .td-detail`)).toBeVisible();
  await expect(page.locator(`${NOTA} .td-master`), 'la scena: l\'elenco è nascosto dal dettaglio').toBeHidden();
  const nuove = page.locator('#schermoNote [data-nuova]');
  await expect(nuove.filter({ visible: true }), 'un solo «Nuova nota» visibile').toHaveCount(1);
  expect(await nuove.count(), 'e uno solo nel DOM: niente doppioni').toBe(1);
  await nuove.filter({ visible: true }).click({ timeout: 5000 });
  await expect(page.locator(`${NOTA} .td-edit-title`), 'il clic apre il modulo di creazione').toBeVisible();
  await expect(page.locator(`${NOTA} .td-detail-head > span:first-child`)).toHaveText(/Nuova nota/i);
  // «Annulla» chiude il modulo, e con lui il dettaglio (la bozza non è una voce: `disegnaCrudo` chiude una selezione
  // che non c'è). L'elenco torna, e il bottone torna nella testata della pagina (atlas.js:148).
  await page.locator(`${NOTA} .td-detail-footer .talos-button`, { hasText: 'Annulla' }).click();
  await expect(page.locator(`${NOTA} .td-detail`)).toBeHidden();
  await expect(page.locator(`${NOTA} .td-master`)).toBeVisible();
  await expect(page.locator(`${NOTA} .td-intro > [data-nuova]`), 'di nuovo nella testata').toBeVisible();
  expect(await nuove.count()).toBe(1);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F2-12 · L\'estratto della card è testo continuo: tre righe piene, nessuna riga vuota fra i paragrafi', async ({ page }) => {
  const nonGet = await apri(page);
  for (const [w, h] of [[1440, 900], [1024, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    const estratto = page.locator(`${NOTA} .td-grid .td-card`).first().locator('.td-excerpt');
    await expect(estratto).toBeVisible();
    const righe = await estratto.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(el);
      const tops = [...r.getClientRects()].filter((q) => q.width > 1 && q.top >= box.top - 1 && q.bottom <= box.bottom + 1).map((q) => Math.round(q.top - box.top));
      return { tops: [...new Set(tops)].sort((a, b) => a - b), interlinea: Number.parseFloat(getComputedStyle(el).lineHeight) };
    });
    expect(righe.tops.length, `${w}: tre righe con del testo (la nota ha due paragrafi)`).toBe(3);
    const salti = righe.tops.slice(1).map((t, i) => t - righe.tops[i]);
    for (const s of salti) expect(s, `${w}: righe consecutive, nessuna vuota in mezzo`).toBeLessThanOrEqual(Math.ceil(righe.interlinea));
  }
  expect(nonGet).toEqual([]);
});
