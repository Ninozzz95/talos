import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { nuoviConfini } from '../../../desktop/bolla-finestra.mjs';

/*
 * Giro 6 della bolla (owner 14/11 15:46, giudice v1884; ROSSO della prova dal vivo, punto 3): la finestra della bolla restava 720×96 px (480×64 DIP al 150%),
 *   cioè la misura di serie. La carta di consenso c'era nel DOM ma non si vedeva né si cliccava, il campo del messaggio non si raggiungeva e la pillola era
 *   tagliata in alto. Il guscio prende la misura dal contenuto (`enablePreferredSizeMode` + `preferred-size-changed`, `desktop/bolla-finestra.mjs`): la
 *   misura preferita di Chromium è quella del contenuto NEL FLUSSO, e la scena era `position: fixed; inset: 0`, cioè fuori dal flusso e alta quanto la
 *   finestra (0 di contenuto ⇒ la misura di serie, sempre). In più `max-height: 56vh` / `85vh` legavano la carta all'altezza della finestra stessa.
 * Qui la pagina vera della bolla, in una finestra che fa ciò che fa il guscio: legge la misura del contenuto (larghezza della scena se è nel flusso, altezza
 *   del documento), la passa a `nuoviConfini` (lo stesso codice del guscio) e si ridimensiona; poi si guarda che cosa si vede e che cosa si clicca.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/bolla-cresce/', import.meta.url)));
const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const CONSENSO = { tipo: 'domanda', id: 'q1', porta: 'consenso', dati: { obiettivo: 'Premi il pulsante Conferma prova nella finestra TALOS-PROVA-CTRL3', domini: [], app: [{ nome: 'TALOS-PROVA-CTRL3' }], accessi: [], posso: { pagare: true, inviare: false, cancellare: false, tetto: null } } };

/**
 * La misura preferita come la legge il guscio: il contenuto nel flusso (0 se la scena è fuori dal flusso, come una finestra senza contenuto).
 * Larghezza (misurata il 15/11 alle 00:02 in Electron 44.3.0, finestre con le opzioni della bolla e pagine data: col corpo della bolla): Chromium dà
 *   larghezza 0 finché la radice è larga quanto la finestra (`width: auto`), e la larghezza vera del contenuto solo se la radice si stringe al contenuto
 *   (`html { width: max-content }` o `fit-content`: 464 la pillola, 584 con la carta). Con 0 il guscio tiene 480 e la carta da 584 resta tagliata a destra.
 *   Qui: la larghezza del contenuto solo se la radice è larga quanto la scena, altrimenti 0.
 */
const misuraPreferita = (pagina) => pagina.evaluate(() => {
  const scena = document.querySelector('.scena');
  const fuori = ['fixed', 'absolute'].includes(getComputedStyle(scena).position);
  const larga = Math.ceil(scena.getBoundingClientRect().width);
  const radiceStretta = Math.ceil(document.documentElement.getBoundingClientRect().width) === larga;
  return { width: fuori || !radiceStretta ? 0 : larga, height: Math.ceil(document.documentElement.getBoundingClientRect().height) };
});

/** Il guscio: tre giri di `preferred-size-changed` (la misura nuova può cambiare l'impaginazione), col fondo e il centro fermi. */
async function comeIlGuscio(pagina, area = AREA) {
  let confini = { x: 720, y: area.height - 24 - 64, width: 480, height: 64 };
  for (let i = 0; i < 3; i += 1) {
    confini = nuoviConfini(confini, await misuraPreferita(pagina), area);
    await pagina.setViewportSize({ width: confini.width, height: confini.height });
    await pagina.waitForTimeout(50);
  }
  /* le entrate (la pillola sale con un rimbalzo di 320 ms, `barra-entra`) finiscono prima di guardare: quelle infinite (l'orlo che pensa) no */
  await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  return confini;
}

/** Vero se il centro di `sel` è dentro la finestra e il clic lì arriva proprio a lui (non a un altro elemento, non fuori dalla finestra). */
const cliccabile = (pagina, sel) => pagina.evaluate((s) => {
  const n = document.querySelector(s);
  if (!n) return 'manca';
  const r = n.getBoundingClientRect();
  const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  if (r.width === 0 || r.height === 0) return 'vuoto';
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return `fuori (${Math.round(x)},${Math.round(y)} in ${innerWidth}×${innerHeight})`;
  const sotto = document.elementFromPoint(x, y);
  return sotto === n || n.contains(sotto) ? 'sì' : `coperto da ${sotto?.className || sotto?.tagName}`;
}, sel);
const dentro = (pagina, sel) => pagina.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5; }, sel);
/** Le misure che spiegano un «fuori»: finestra, documento, scena, pillola, animazioni ancora in corso. */
const geometria = (pagina) => pagina.evaluate(() => {
  const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
  const cs = (s, ...p) => { const n = document.querySelector(s); if (!n) return null; const c = getComputedStyle(n); return p.map((k) => c[k]).join(' '); };
  const cs0 = document.querySelector('.cs');
  return JSON.stringify({ finestra: [innerWidth, innerHeight], html: r('html'), body: r('body'), scena: r('.scena'), pillola: r('.pillola'), carta: r('.cu-bolla__carta'),
    cs: r('.cs'), csAlto: cs0 ? cs0.scrollHeight : null, stileCs: cs('.cs', 'maxHeight', 'flexShrink', 'minHeight', 'overflowY'), stileScena: cs('.scena', 'height', 'maxHeight', 'display'),
    stileBody: cs('body', 'height', 'display', 'overflow'), tetto: document.documentElement.style.getPropertyValue('--bolla-tetto'),
    animazioni: document.getAnimations().filter((a) => a.playState === 'running').length });
});

async function apri(browser, { locale = 'it-IT', screen = { width: 1920, height: 1080 }, area = AREA } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 64 }, screen, locale });
  /* in Electron `screen.availHeight` è l'area di lavoro dello schermo (senza la barra delle applicazioni); Chromium di Playwright la lega alla finestra emulata */
  await ctx.addInitScript((h) => { Object.defineProperty(window.screen, 'availHeight', { get: () => h, configurable: true }); }, area.height);
  const bolla = await ctx.newPage();
  const errori = [];
  bolla.on('pageerror', (e) => errori.push(e.message));
  await bolla.goto('bolla.html');
  const voce = await ctx.newPage();
  await voce.goto('segno.html');
  const sulCanale = (m) => voce.evaluate((x) => { const c = new BroadcastChannel('talos-bolla'); c.postMessage(x); c.close(); }, m);
  return { ctx, bolla, errori, sulCanale };
}

for (const locale of ['it-IT', 'en-US']) {
  test(`BOL-CRESCE-01 RED ${locale}: la carta di consenso nella bolla si vede e si clicca, la pillola resta intera, dopo la risposta il campo si raggiunge`, async ({ browser }) => {
    const { ctx, bolla, errori, sulCanale } = await apri(browser, { locale });
    const riposo = await comeIlGuscio(bolla);
    expect(riposo.width, `a riposo la finestra larga quanto la pillola con i suoi margini: ${await geometria(bolla)}`).toBe(464);
    expect(await dentro(bolla, '.pillola'), `a riposo la pillola intera nella finestra: ${await geometria(bolla)}`).toBe(true);
    expect(await cliccabile(bolla, 'textarea.campo'), 'il campo si raggiunge').toBe('sì');

    await sulCanale(CONSENSO);
    await expect(bolla.locator('.cs')).toHaveCount(1);
    const confini = await comeIlGuscio(bolla);
    expect(confini.height, `la finestra cresce oltre la pillola: ${await geometria(bolla)}`).toBeGreaterThan(160);
    expect(confini.width, `la finestra larga quanto la carta da 560 coi margini: ${await geometria(bolla)}`).toBe(584);
    expect(await dentro(bolla, '.cs'), 'la carta intera nella finestra').toBe(true);
    expect(await dentro(bolla, '.pillola'), 'la pillola intera, non tagliata in alto').toBe(true);
    for (const sel of ['.cs-bott .cs-si', '.cs-bott .cs-sempre', '.cs-bott button:last-child']) expect(await cliccabile(bolla, sel), sel).toBe('sì');
    await bolla.screenshot({ path: path.join(FOTO, `consenso-${locale}.png`) });

    await bolla.locator('.cs-bott .cs-si').click();
    await expect(bolla.locator('.cs')).toHaveCount(0);
    const dopo = await comeIlGuscio(bolla);
    expect(dopo.height, 'senza carta la finestra torna piccola').toBeLessThan(120);
    expect(await cliccabile(bolla, 'textarea.campo'), 'il campo si raggiunge dopo la risposta').toBe('sì');
    expect(errori).toEqual([]);
    await ctx.close();
  });
}

test('BOL-CRESCE-02 RED: su uno schermo basso la bolla resta entro il bordo: carta che scorre dentro, pillola e pulsanti sempre interi e cliccabili', async ({ browser }) => {
  const area = { x: 0, y: 0, width: 1280, height: 420 };
  const { ctx, bolla, errori, sulCanale } = await apri(browser, { screen: { width: 1280, height: 460 }, area });
  await sulCanale({ ...CONSENSO, dati: { ...CONSENSO.dati, domini: Array.from({ length: 30 }, (_, i) => ({ nome: `sito-${i}.example` })) } });
  await expect(bolla.locator('.cs')).toHaveCount(1);
  const confini = await comeIlGuscio(bolla, area);
  expect(confini.height).toBeLessThanOrEqual(area.height);
  expect(await dentro(bolla, '.pillola'), 'la pillola intera').toBe(true);
  expect(await dentro(bolla, '.cs'), 'la carta entro la finestra').toBe(true);
  expect(await cliccabile(bolla, '.cs-bott .cs-si'), 'Consenti si clicca').toBe('sì');
  expect(errori).toEqual([]);
  await ctx.close();
});
