/*
 * ATLAS-F1 — la famiglia 1 del refactor «TALOS UI Atlas» (24/09/2026): i controlli di base.
 *
 * ⛔ NON DEPLOYABILE finché la review avversaria del coordinatore non la accetta e l'owner non la
 *   valuta sul 4174 (human gate, owner 24/09/2026).
 *
 * CHE COSA PROVA. La RICETTA dei controlli (i fogli davvero serviti a 4176, `dist/styles.css`), misurata
 * col `getComputedStyle` del DOM vivo della app, secondo le decisioni dell'owner del 24/09/2026:
 *   · Q-01  fondi e contorni della Desktop 0.1.15 (spessore, colore, raggio), tutto il resto dell'Atlas
 *           (misure, testo, stati);
 *   · Q-01b niente ombra interna chiara sul primario;
 *   · Q-06  testo minimo 11 px dove l'Atlas ne ha 10;
 *   · Q-08  caselle e cursori restano le facce custom di oggi, con le misure dell'Atlas;
 *   · Q-12  la forma «chip» va sulle pastiglie degli allegati.
 * I valori Atlas sono letti dal mockup (`TALOS-UI-ATLAS-INTERATTIVO.html`, sha256 40a8bb58…395db):
 * `source/atlas.css` `.btn` (36 px, 12 px, 1.35, padding 7/13), `.btn.tiny` (29, 5/9, 10→11 px), `.btn.icon-only`
 * (34×34 — qui 36×36 per il cancello dei 36 px, Q-16), `.btn .icon` (15), `button:disabled` (opacità .45), `.text-input` (36, 8/11, 12 px),
 * `.input-wrap` (38, icona 16 + gap 7), `.text-input:disabled` (.45), `.text-input[aria-invalid]`
 * (bordo danger), `.chip` (raggio 6, 4/7), `.well` (16, raggio 10), `.toolbar-demo` (gap 7, campo
 * flex 1 / min 160); lo slider e la casella nativi misurati sulle foto (traccia 8, pomello 16, casella 15).
 *
 * ⛔ Il gate 10×4 di questa modifica è in `.claude/ATLAS-F1-CONTRATTO-E-GATE-2026-09-24.md` §7
 *   (consultato il 24/09/2026): Hermes `apps/desktop/src/components/ui/control.ts:3-23` e
 *   `styles.css:1390-1414` (testo 12 px, cromo condiviso, `aria-invalid` = bordo distruttivo,
 *   disabilitato .5), W3C «Understanding 1.4.11» (15/06/2026) e «2.4.13» (10/08/2026), MDN
 *   `forced-colors` (20/04/2026: i bordi trasparenti diventano visibili, box-shadow → none), MDN
 *   `aria-invalid` (02/06/2025), shadcn `button.tsx`/`input.tsx` (c257f68, 04/09/2026).
 *
 * ⛔ La CSP del server (style-src 'self') blocca gli attributi style=: nelle sonde si usa il CSSOM.
 *
 * COME. Le sonde sono controlli COSTRUITI nella pagina vera (stesse classi del prodotto, dentro un
 * contenitore neutro), così si misura la ricetta e non un contesto che la sovrascrive; più due
 * istanze vere (Home) per provare che il contesto non la annulla. Niente scritture: ogni richiesta
 * non-GET/HEAD viene fermata e contata, e ogni test chiude con `expect(nonGet).toEqual([])`.
 * Server: quello isolato di `playwright.config.mjs` (4176, store temporaneo). MAI il 4174.
 */
import { expect, test } from '@playwright/test';

// La app sceglie la lingua dal browser: le etichette cercate qui sono quelle italiane.
test.use({ locale: 'it-IT' });

async function apri(page) {
  const nonGet = [];
  await page.route('**/*', (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') { nonGet.push(`${m} ${new URL(route.request().url()).pathname}`); return route.abort(); }
    return route.continue();
  });
  /* ⛔ 09/10/2026 (bugfixer): le misure sono quelle dell'Atlas, che ha UNA densità — la comoda. Dal 29/09 (0.1.19, 14086c7b4) la
     densità di serie è «compatta», e lì il piccolo misura 28,84 (interlinea 14,85 contro 15): la prova lo leggeva come 29 mancato.
     Si misura il mockup nella sua densità; lo scarto in compatta è registrato a parte, non nascosto qui. */
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiDensity: 'comoda' } })); } catch { /* finestra privata */ }
  });
  await page.goto('/');
  await expect(page.locator('.talos-nav-item[data-vaia="chat"]').first()).toBeVisible();
  return nonGet;
}

/** Costruisce le sonde e restituisce le misure calcolate. */
async function misura(page, html, selettori, props) {
  return page.evaluate(({ html, selettori, props }) => {
    const box = document.createElement('div');
    box.id = 'atlasF1Sonde';
    box.style.cssText = 'position:fixed;left:8px;top:8px;width:720px;z-index:99999;display:flex;flex-direction:column;gap:12px;align-items:flex-start';
    box.innerHTML = html;
    document.body.append(box);
    const out = {};
    for (const [nome, sel] of Object.entries(selettori)) {
      const el = box.querySelector(sel);
      if (!el) { out[nome] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out[nome] = { h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10 };
      for (const p of props) out[nome][p] = cs.getPropertyValue(p);
    }
    box.remove();
    return out;
  }, { html, selettori, props });
}

/** Il colore di un token risolto dal browser (lo stesso formato di `getComputedStyle`). */
async function token(page, nome, proprieta = 'color') {
  return page.evaluate(({ nome, proprieta }) => {
    const s = document.createElement('span');
    s.style.setProperty(proprieta, `var(${nome})`);
    document.body.append(s);
    const v = getComputedStyle(s).getPropertyValue(proprieta);
    s.remove();
    return v;
  }, { nome, proprieta });
}

const P = ['font-size', 'font-weight', 'line-height', 'padding-top', 'padding-left', 'padding-right', 'gap', 'border-top-width', 'border-top-style',
  'border-top-color', 'border-top-left-radius', 'background-color', 'box-shadow', 'color', 'opacity', 'transition-property', 'min-height', 'flex-grow', 'min-width'];

const BOTTONI = `
  <button type="button" class="talos-button talos-button--secondary" data-s="sec"><svg class="i" data-s="secIcona" aria-hidden="true"><use href="#i-plus"/></svg>Secondario</button>
  <button type="button" class="talos-button talos-button--primary" data-s="pri">Primario</button>
  <button type="button" class="talos-button talos-button--ghost" data-s="ghost">Fantasma</button>
  <button type="button" class="talos-button talos-button--danger" data-s="danger">Elimina</button>
  <button type="button" class="talos-button talos-button--secondary talos-button--sm" data-s="sm">Piccolo</button>
  <button type="button" class="talos-button talos-button--secondary talos-icon-button" aria-label="Icona" data-s="icon"><svg class="i" data-s="iconIcona" aria-hidden="true"><use href="#i-plus"/></svg></button>
  <button type="button" class="talos-button talos-button--secondary" disabled data-s="secOff">Spento</button>
  <button type="button" class="talos-button talos-button--primary" disabled data-s="priOff">Primario spento</button>`;
const SEL_BOTTONI = Object.fromEntries(['sec', 'secIcona', 'pri', 'ghost', 'danger', 'sm', 'icon', 'iconIcona', 'secOff', 'priOff'].map((k) => [k, `[data-s="${k}"]`]));

test('ATLAS-F1-01 · Bottoni: misure e testo dell\'Atlas, contorno e fondo della 0.1.15', async ({ page }) => {
  const nonGet = await apri(page);
  const m = await misura(page, BOTTONI, SEL_BOTTONI, P);
  const bordo = await token(page, '--talos-border');
  const fondoSoft = await token(page, '--talos-panel-soft', 'background-color');
  const accento = await token(page, '--talos-accent', 'background-color');
  const testo = await token(page, '--talos-text');
  // Secondario: Atlas `.btn` (36, 7/13, 12 px, 400, gap 8, icona 15) sopra il contorno 0.1.15.
  expect(m.sec.h).toBe(36);
  expect(m.sec['font-size']).toBe('12px');
  expect(m.sec['font-weight']).toBe('400');
  expect(m.sec['padding-top']).toBe('7px');
  expect(m.sec['padding-left']).toBe('13px');
  expect(m.sec.gap).toBe('8px');
  expect(m.secIcona.w).toBe(15);
  expect(m.sec['border-top-width']).toBe('2px');            // 0.1.15, non l'1 px dell'Atlas
  expect(m.sec['border-top-color']).toBe(bordo);
  expect(m.sec['border-top-left-radius']).toBe('9px');      // 0.1.15, non il 12 dell'Atlas
  expect(m.sec['background-color']).toBe(fondoSoft);        // Q-01: fondo 0.1.15
  expect(m.sec['transition-property']).toBe('background-color, border-color'); // Atlas: solo fondo e bordo
  // Primario: 36, 600, SENZA ombra interna (Q-01b), contorno trasparente di 2 px.
  expect(m.pri.h).toBe(36);
  expect(m.pri['font-weight']).toBe('600');
  expect(m.pri['box-shadow']).toBe('none');
  expect(m.pri['border-top-width']).toBe('2px');
  expect(m.pri['border-top-color']).toBe('rgba(0, 0, 0, 0)');
  expect(m.pri['border-top-left-radius']).toBe('9px');
  expect(m.pri['background-color']).toBe(accento);
  // Fantasma: colore del testo pieno (Atlas), peso 400.
  expect(m.ghost.h).toBe(36);
  expect(m.ghost.color).toBe(testo);
  expect(m.ghost['font-weight']).toBe('400');
  expect(m.ghost['background-color']).toBe('rgba(0, 0, 0, 0)');
  // Distruttivo: peso 400 (Atlas), fondo 0.1.15 (nessuno).
  expect(m.danger['font-weight']).toBe('400');
  expect(m.danger['background-color']).toBe('rgba(0, 0, 0, 0)');
  // Piccolo: Atlas `.tiny` 29 e 5/9, testo 11 (Q-06), raggio 8 della 0.1.15.
  expect(m.sm.h).toBe(29);
  expect(m.sm['font-size']).toBe('11px');
  expect(m.sm['padding-top']).toBe('5px');
  expect(m.sm['padding-left']).toBe('9px');
  expect(m.sm['border-top-left-radius']).toBe('8px');
  expect(m.sm['border-top-width']).toBe('2px');
  // Icona: l'Atlas la vuole 34×34, ma il cancello dei 36 px (baseline-shell.spec.mjs:1274, «la soglia resta 36,
  // non si tocca») vince finché l'owner non decide (Q-16): 36×36, contorno 0.1.15.
  expect([m.icon.w, m.icon.h]).toEqual([36, 36]);
  expect(m.icon['padding-top']).toBe('0px');                // Atlas `.icon-only` padding 0
  expect(m.icon['border-top-left-radius']).toBe('9px');
  expect(m.iconIcona.w).toBe(15);
  // Spento: Atlas `button:disabled` (.45, colore del testo invariato); il primario spento resta 0.1.15.
  expect(m.secOff.opacity).toBe('0.45');
  expect(m.secOff.color).toBe(testo);
  expect(m.priOff['background-color']).toBe(fondoSoft);
  expect(m.priOff.opacity).toBe('0.75');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-02 · Campi e select: misure e stati dell\'Atlas, contorno e fondo della 0.1.15', async ({ page }) => {
  const nonGet = await apri(page);
  const html = `
    <div class="talos-field" style="width:320px"><svg class="i talos-field__icon" aria-hidden="true"><use href="#i-search"/></svg><input class="talos-field__input" type="search" data-s="cerca" placeholder="Cerca"></div>
    <div class="talos-field talos-field--sm" style="width:320px"><svg class="i talos-field__icon" aria-hidden="true"><use href="#i-search"/></svg><input class="talos-field__input" type="search" data-s="cercaSm" placeholder="Cerca"></div>
    <div class="talos-field" style="width:320px"><input class="talos-field__input" type="text" data-s="nudo" placeholder="Nome"></div>
    <div class="talos-field" style="width:320px"><input class="talos-field__input" type="text" disabled data-s="spento" placeholder="Nome"></div>
    <div class="talos-field" style="width:320px"><input class="talos-field__input" type="text" aria-invalid="true" data-s="errore" value="x"></div>
    <select class="talos-select" data-s="select"><option>Più recenti</option></select>
    <textarea class="talos-textarea" data-s="area" rows="3"></textarea>`;
  const m = await misura(page, html, { cerca: '[data-s="cerca"]', cercaSm: '[data-s="cercaSm"]', nudo: '[data-s="nudo"]', spento: '[data-s="spento"]', errore: '[data-s="errore"]', select: '[data-s="select"]', area: '[data-s="area"]' }, P);
  const bordo = await token(page, '--talos-border');
  const danger = await token(page, '--talos-danger');
  const fondoSoft = await token(page, '--talos-panel-soft', 'background-color');
  // Campo con icona = `.input-wrap` dell'Atlas: 38 di altezza, testo a 34 (11 + icona 16 + 7), 12 px.
  for (const k of ['cerca', 'cercaSm']) {
    expect(m[k].h, k).toBe(38);
    expect(m[k]['font-size'], k).toBe('12px');
    expect(m[k]['padding-left'], k).toBe('34px');
    expect(m[k]['padding-right'], k).toBe('11px');
    expect(m[k]['border-top-width'], k).toBe('1px');
    expect(m[k]['border-top-color'], k).toBe(bordo);
    expect(m[k]['border-top-left-radius'], k).toBe('11px');   // 0.1.15
    expect(m[k]['background-color'], k).toBe(fondoSoft);      // Q-01
  }
  // Campo senza icona = `.text-input`: 36, 8/11.
  expect(m.nudo.h).toBe(36);
  expect(m.nudo['padding-left']).toBe('11px');
  // Stati dell'Atlas che il prodotto oggi non ha.
  expect(m.spento.opacity).toBe('0.45');
  expect(m.errore['border-top-color']).toBe(danger);
  // Select: 36, 12 px, 11 a sinistra; contorno e fondo 0.1.15.
  expect(m.select.h).toBe(36);
  expect(m.select['font-size']).toBe('12px');
  expect(m.select['padding-left']).toBe('11px');
  expect(m.select['border-top-left-radius']).toBe('9px');
  expect(m.select['background-color']).toBe(fondoSoft);
  // Area di testo: 12 px, 8/11; raggio e fondo invariati.
  expect(m.area['font-size']).toBe('12px');
  expect(m.area['padding-top']).toBe('8px');
  expect(m.area['padding-left']).toBe('11px');
  expect(m.area['background-color']).toBe(fondoSoft);
  expect(m.area['border-top-color']).toBe(bordo);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-03 · Fuoco del campo: niente anello-ombra né bordo accento, solo il contorno di fuoco', async ({ page }) => {
  const nonGet = await apri(page);
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.id = 'atlasF1Fuoco';
    box.style.cssText = 'position:fixed;left:8px;top:8px;width:320px;z-index:99999';
    box.innerHTML = '<div class="talos-field"><svg class="i talos-field__icon" aria-hidden="true"><use href="#i-search"/></svg><input class="talos-field__input" type="search" placeholder="Cerca"></div>';
    document.body.append(box);
  });
  await page.locator('#atlasF1Fuoco input').focus();
  const s = await page.locator('#atlasF1Fuoco input').evaluate((el) => { const c = getComputedStyle(el); return { shadow: c.boxShadow, bordo: c.borderTopColor, outline: c.outlineWidth, stile: c.outlineStyle }; });
  expect(s.shadow).toBe('none');
  expect(s.bordo).toBe(await token(page, '--talos-border'));
  expect(s.stile).toBe('solid');
  expect(s.outline).toBe('2px');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-04 · Casella e cursore: facce custom con le misure dell\'Atlas (Q-08)', async ({ page }) => {
  const nonGet = await apri(page);
  // Casella nuda (controls.css) e faccia calm (calm-controls.js monta le facce dentro [data-calm-controls]).
  await page.evaluate(() => {
    // ⛔ La casella «nuda» sta FUORI da [data-calm-controls]: dentro, calm-controls.js la nasconderebbe
    //   (0×0, aria-hidden) e al suo posto metterebbe la faccia.
    const nuda = document.createElement('div');
    nuda.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
    nuda.innerHTML = '<label><input type="checkbox" id="atlasF1Nuda"> nuda</label>';
    document.body.append(nuda);
    const box = document.createElement('div');
    box.id = 'atlasF1Facce';
    box.setAttribute('data-calm-controls', '');
    box.style.cssText = 'position:fixed;left:8px;top:60px;width:420px;z-index:99999;display:grid;gap:12px';
    box.innerHTML = '<label><span>Calm</span> <input type="checkbox" id="atlasF1Calm" aria-label="Casella calm"></label>'
      + '<label><span>Velocità</span> <input type="range" id="atlasF1Range" min="0" max="100" value="60" aria-label="Velocità"></label>';
    document.body.append(box);
  });
  await expect(page.locator('#atlasF1Facce .calm-check:not([role="switch"])')).toHaveCount(1);
  await expect(page.locator('#atlasF1Facce .calm-range')).toHaveCount(1);
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const r = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    const nuda = q('#atlasF1Nuda'); const calm = q('#atlasF1Facce .calm-check'); const range = q('#atlasF1Facce .calm-range');
    const traccia = range.querySelector('.calm-range__track'); const pomello = range.querySelector('.calm-range__thumb');
    return {
      nuda: { ...r(nuda), raggio: getComputedStyle(nuda).borderTopLeftRadius, bordo: getComputedStyle(nuda).borderTopWidth, spunta: getComputedStyle(nuda, '::before').width },
      calm: { ...r(calm), raggio: getComputedStyle(calm).borderTopLeftRadius },
      range: r(range), traccia: { ...r(traccia), raggio: getComputedStyle(traccia).borderTopLeftRadius }, pomello: r(pomello),
    };
  });
  expect([m.nuda.w, m.nuda.h]).toEqual([15, 15]);
  expect(m.nuda.bordo).toBe('1px');
  expect(m.nuda.raggio).toBe('4px');
  expect(m.nuda.spunta).toBe('8px');
  expect([m.calm.w, m.calm.h]).toEqual([15, 15]);
  expect(m.calm.raggio).toBe('4px');
  expect(m.traccia.h).toBe(8);
  expect(m.traccia.raggio).toBe('4px');
  expect([m.pomello.w, m.pomello.h]).toEqual([16, 16]);
  expect(m.range.h).toBe(24);   // area di presa ≥ 24 (WCAG 2.5.8); traccia e pomello come l'Atlas
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-05 · Pastiglie degli allegati, scelte a schede, barra degli strumenti', async ({ page }) => {
  const nonGet = await apri(page);
  const html = `
    <ul class="talos-allegati__lista"><li class="talos-allegati__voce" data-s="chip"><span class="talos-allegati__nome">note.md</span><button type="button" class="talos-allegati__togli" aria-label="Togli">×</button></li></ul>
    <div class="talos-choice-grid" role="radiogroup" aria-label="Prova" style="width:640px">
      <button type="button" class="talos-choice" role="radio" aria-checked="true" data-s="scelta"><span class="talos-choice__title" data-s="sceltaTitolo">Locale</span><p>Sul dispositivo</p></button>
      <button type="button" class="talos-choice" role="radio" aria-checked="false" data-s="altra"><span class="talos-choice__title">API</span><p>Con chiave</p></button>
    </div>
    <div class="talos-toolbar" data-s="barra" style="width:700px"><div class="talos-field" data-s="barraCampo"><svg class="i talos-field__icon" aria-hidden="true"><use href="#i-search"/></svg><input class="talos-field__input" type="search"></div><select class="talos-select"><option>Ordina</option></select></div>`;
  const m = await misura(page, html, { chip: '[data-s="chip"]', scelta: '[data-s="scelta"]', sceltaTitolo: '[data-s="sceltaTitolo"]', altra: '[data-s="altra"]', barra: '[data-s="barra"]', barraCampo: '[data-s="barraCampo"]' }, P);
  // Chip (Atlas `.chip`): raggio 6, 4/7, testo 11 (Q-06); contorno e fondo di oggi.
  expect(m.chip['border-top-left-radius']).toBe('6px');
  expect(m.chip['padding-top']).toBe('4px');
  expect(m.chip['padding-left']).toBe('7px');
  expect(m.chip['font-size']).toBe('11px');
  expect(m.chip['border-top-color']).toBe(await token(page, '--talos-border'));
  expect(m.chip['background-color']).toBe(await token(page, '--talos-panel', 'background-color'));
  // Scelta (Atlas `.well` + stato premuto): 16 di padding, raggio 10, titolo in accento se scelta;
  // fondo 0.1.15 e bordo accento della scelta mantenuto (indicatore di stato, WCAG 1.4.11).
  expect(m.scelta['padding-left']).toBe('16px');
  expect(m.scelta['border-top-left-radius']).toBe('10px');
  expect(m.sceltaTitolo.color).toBe(await token(page, '--talos-accent-text'));
  expect(m.scelta['border-top-color']).toBe(await token(page, '--talos-accent-border'));
  expect(m.scelta['background-color']).toBe(await token(page, '--talos-accent-soft', 'background-color'));
  expect(m.altra['border-top-color']).toBe(await token(page, '--talos-border'));
  // Barra (Atlas `.toolbar-demo`): gap 7, il campo cresce (flex 1) con un minimo di 160.
  expect(m.barra.gap).toBe('7px');
  expect(m.barraCampo['flex-grow']).toBe('1');
  expect(m.barraCampo['min-width']).toBe('160px');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-06 · Contorni e fondi della 0.1.15 in tutti i 14 temi × chiaro/scuro (non regressione)', async ({ page }) => {
  const nonGet = await apri(page);
  const temi = ['calm', 'forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'telemetry'];
  const fuori = [];
  for (const t of temi) for (const modo of ['dark', 'light']) {
    const r = await page.evaluate(({ t, modo }) => {
      const root = document.documentElement;
      root.dataset.talosTheme = t;
      if (modo === 'light') root.dataset.theme = 'light'; else delete root.dataset.theme;
      const box = document.createElement('div');
      // ⛔ Gli attributi style= li blocca la CSP del server (style-src 'self'): i token si leggono via CSSOM.
      box.innerHTML = '<button class="talos-button talos-button--secondary">x</button><input class="talos-field__input"><span></span><span></span>';
      box.children[2].style.setProperty('color', 'var(--talos-border)');
      box.children[3].style.setProperty('background-color', 'var(--talos-panel-soft)');
      document.body.append(box);
      const [b, i, sb, sf] = box.children;
      const cb = getComputedStyle(b); const ci = getComputedStyle(i);
      const out = { bw: cb.borderTopWidth, bc: cb.borderTopColor, br: cb.borderTopLeftRadius, bg: cb.backgroundColor, iw: ci.borderTopWidth, ic: ci.borderTopColor, ir: ci.borderTopLeftRadius, ibg: ci.backgroundColor, bordo: getComputedStyle(sb).color, soft: getComputedStyle(sf).backgroundColor, tema: root.dataset.talosTheme };
      box.remove();
      return out;
    }, { t, modo });
    const atteso = { bw: '2px', bc: r.bordo, br: '9px', bg: r.soft, iw: '1px', ic: r.bordo, ir: '11px', ibg: r.soft };
    for (const [k, v] of Object.entries(atteso)) if (r[k] !== v) fuori.push(`${t}/${modo} ${k}: ${r[k]} ≠ ${v}`);
    expect(r.tema).toBe(t);
  }
  expect(fuori).toEqual([]);
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-07 · Alto contrasto: il contorno del bottone resta visibile (MDN forced-colors)', async ({ page }) => {
  const nonGet = await apri(page);
  await page.emulateMedia({ forcedColors: 'active' });
  const m = await misura(page, '<button class="talos-button talos-button--secondary" data-s="b">x</button><input class="talos-field__input" data-s="i">', { b: '[data-s="b"]', i: '[data-s="i"]' }, P);
  for (const k of ['b', 'i']) {
    expect(m[k]['border-top-style'], k).toBe('solid');
    expect(m[k]['border-top-color'], k).not.toBe('rgba(0, 0, 0, 0)');
  }
  expect(m.b['border-top-width']).toBe('2px');
  expect(nonGet).toEqual([]);
});

test('ATLAS-F1-08 · Le istanze vere della Home seguono la ricetta (nessun contesto la annulla)', async ({ page }) => {
  const nonGet = await apri(page);
  await page.locator('.talos-sidebar [data-vaia="home"]').click();
  // Il bottone lo disegna features/navigation/workspace-chrome.ts (button2 «Nuova conversazione»).
  const nuova = page.locator('.talos-button--secondary:visible', { hasText: 'Nuova conversazione' }).first();
  await expect(nuova).toBeVisible();
  const b = await nuova.evaluate((el) => { const c = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), fs: c.fontSize, fw: c.fontWeight, bw: c.borderTopWidth }; });
  expect(b).toEqual({ h: 36, fs: '12px', fw: '400', bw: '2px' });
  const cerca = page.locator('#sessionSearch');
  const c = await cerca.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), fs: getComputedStyle(el).fontSize }));
  expect(c).toEqual({ h: 38, fs: '12px' });
  expect(nonGet).toEqual([]);
});
