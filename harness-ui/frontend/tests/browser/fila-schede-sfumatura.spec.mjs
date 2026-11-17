/*
 * ⭐ 12/11/2026 (giudice v1608; revisore C dell'Assistente, punti 6 e 7) — LA PRIMA SCHEDA DELLA COLONNA TAGLIATA A METÀ PAROLA.
 *   Nelle foto a 340 px la fila delle schede della colonna di destra mostrava «ntesto» / «ntext» a sinistra, senza nessun segno che
 *   la fila continuasse. Misurato sulla candidata (edba3aee8, colonna a 280 px): scelta «A lato», la fila scorre di 50 px e il testo
 *   di «Contesto» va da -44 a 12 px dal bordo; in inglese, all'apertura, «Processes» esce a destra (201-263 su 255). Nessuna
 *   sfumatura: `#railTabs` non aveva `mask-image`.
 * ⇒ Cosa deve valere, a 280/340/1200 px, in italiano e in inglese, all'apertura, dopo ogni cambio di scheda (clic, frecce, codice)
 *   e dopo che la colonna si stringe:
 *   1. una scheda visibile tagliata dal bordo sta sotto una SFUMATURA su quel lato (Hermes `fade-scroll.tsx` `edgeMask`, DeepSeek
 *      `dockkit.module.css:274-284`), la stessa grammatica delle altre file che scorrono nella colonna (`pannello.css:80-82`);
 *   2. una fila che ci sta non sfuma affatto («a list that fits must not be dimmed at all», Hermes `fade-scroll.tsx:15`);
 *   3. la scheda scelta è intera, e FUORI dalla fascia che sfuma (DeepSeek `TabPanel.tsx:177-195`: «with the fade band (24px)
 *      cleared so the chip is not under it»);
 *   4. movimento ridotto: lo scorrimento arriva nello stesso fotogramma del clic, senza animazione.
 * Misura: `getBoundingClientRect` di un Range sul testo della scheda contro il rettangolo della fila.
 */
import { expect, test } from '@playwright/test';

import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

const FASCIA = 24; // la sfumatura della fila (index.css, `.talos-inspector__tabs .talos-tabs__list[data-taglio]`)

async function scena(page, { lingua, tema, larghezza }) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } })); } catch { /* finestra privata */ }
  }, { colorMode: tema, uiLanguage: lingua });
  await page.route('**/api/v1/sessions/fst-*/events*', flussoConConfine);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('fst-uno', 'workspace', 'FST', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' }));
  await attendiFineStoria(page);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await expect(page.locator('#railTabs')).toBeVisible();
  await larghezzaColonna(page, larghezza);
}

async function larghezzaColonna(page, larghezza) {
  await page.evaluate((w) => document.documentElement.style.setProperty('--talos-inspector-w', `${w}px`), larghezza);
  await expect.poll(() => page.locator('.talos-inspector').evaluate((n) => Math.round(n.getBoundingClientRect().width))).toBe(larghezza);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // gli osservatori di misura
}

/** La fila come la vede chi guarda: per ogni scheda il testo contro i bordi della fila, da che parte la fila sfuma e per quanti px. */
const leggi = (page) => page.locator('#railTabs').evaluate((fila) => {
  const v = fila.getBoundingClientRect();
  const mask = getComputedStyle(fila).maskImage;
  const taglio = fila.dataset.taglio || 'nessuno';
  /* Quanto sfuma ogni lato, letto dalla maschera CALCOLATA (non dall'attributo): a sinistra è la lunghezza del primo passo pieno dopo
     il trasparente d'inizio, a destra quella sottratta dal 100% prima del trasparente finale. Una lunghezza scritta con `min()` vale
     il più piccolo dei suoi px. 0 = quel lato non sfuma. */
  const px = (s) => { const n = [...String(s).matchAll(/(-?[\d.]+)px/gu)].map((x) => Number(x[1])); return n.length ? Math.min(...n) : 0; };
  const T = 'rgba(0, 0, 0, 0)';
  const pieno = mask.startsWith(`linear-gradient(to right, ${T}, rgb(0, 0, 0) `) ? mask.slice(`linear-gradient(to right, ${T}, rgb(0, 0, 0) `.length) : null;
  const sinistra = pieno === null ? 0 : px(pieno.split(', rgb(0, 0, 0)')[0].split(`, ${T}`)[0]);
  const fine = mask.lastIndexOf('calc(100% - ');
  const destra = mask.startsWith('linear-gradient(to right, ') && mask.endsWith(`, ${T})`) && fine >= 0 ? px(mask.slice(fine + 'calc(100% - '.length, mask.length - `, ${T})`.length)) : 0;
  const sfuma = { sinistra, destra };
  const nascosto = { sinistra: fila.scrollLeft, destra: fila.scrollWidth - fila.clientWidth - fila.scrollLeft };
  const schede = [...fila.querySelectorAll('.talos-tabs__tab')].filter((b) => b.getClientRects().length).map((b) => {
    const testo = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const range = document.createRange();
    range.selectNodeContents(testo || b);
    const t = range.getBoundingClientRect();
    return { nome: (testo?.textContent || '').trim(), scelta: b.getAttribute('aria-selected') === 'true', da: t.left - v.left, a: t.right - v.left };
  });
  return { larga: v.width, scorre: fila.scrollWidth > fila.clientWidth + 1, scrollLeft: fila.scrollLeft, mask, taglio, sfuma, nascosto, schede };
});

async function controlla(page, momento, { conScelta = true } = {}) {
  const m = await leggi(page);
  const dove = `${momento} (fila ${Math.round(m.larga)} px, scrollLeft ${Math.round(m.scrollLeft)}, nascosti ${Math.round(m.nascosto.sinistra)}|${Math.round(m.nascosto.destra)}, sfuma ${m.sfuma.sinistra}|${m.sfuma.destra}, mask ${m.mask.slice(0, 120)})`;
  for (const s of m.schede) {
    const visibile = s.a > 0.5 && s.da < m.larga - 0.5;
    if (visibile && s.da < -0.5) expect(m.sfuma.sinistra, `«${s.nome}» è tagliata a sinistra (testo da ${Math.round(s.da)} px) e la fila non sfuma su quel lato — ${dove}`).toBeGreaterThan(0);
    if (visibile && s.a > m.larga + 0.5) expect(m.sfuma.destra, `«${s.nome}» è tagliata a destra (testo fino a ${Math.round(s.a)} px su ${Math.round(m.larga)}) e la fila non sfuma su quel lato — ${dove}`).toBeGreaterThan(0);
  }
  if (!m.scorre) expect(m.mask, `la fila ci sta tutta e non deve sfumare — ${dove}`).toBe('none');
  /* la sfumatura cresce con ciò che è nascosto, fino a FASCIA (Hermes `styles.css:1139-1140`): 2 px nascosti non sbiadiscono una scheda intera */
  for (const lato of ['sinistra', 'destra']) {
    if (m.nascosto[lato] > 1.5) expect(Math.abs(m.sfuma[lato] - Math.min(FASCIA, Math.round(m.nascosto[lato]))), `la sfumatura di ${lato} è di ${m.sfuma[lato]} px con ${Math.round(m.nascosto[lato])} px nascosti (attesa ${Math.min(FASCIA, Math.round(m.nascosto[lato]))}) — ${dove}`).toBeLessThanOrEqual(1);
  }
  if (!conScelta) return m;
  const scelta = m.schede.find((s) => s.scelta);
  expect(scelta, `nessuna scheda scelta — ${dove}`).toBeTruthy();
  expect(scelta.da, `la scheda scelta «${scelta.nome}» esce a sinistra — ${dove}`).toBeGreaterThanOrEqual(-0.5);
  expect(scelta.a, `la scheda scelta «${scelta.nome}» esce a destra — ${dove}`).toBeLessThanOrEqual(m.larga + 0.5);
  if (m.sfuma.sinistra) expect(scelta.da, `la scheda scelta «${scelta.nome}» sta sotto la sfumatura di sinistra — ${dove}`).toBeGreaterThanOrEqual(m.sfuma.sinistra - 0.5);
  if (m.sfuma.destra) expect(scelta.a, `la scheda scelta «${scelta.nome}» sta sotto la sfumatura di destra — ${dove}`).toBeLessThanOrEqual(m.larga - m.sfuma.destra + 0.5);
  return m;
}

/** Clic dal codice (come `$('#railTabs [data-rail="…"]')?.click()` in app.js) e scrollLeft letto NELLO STESSO compito del clic.
 *  ⭐ Giro del revisore (giudice v1622, D1): nello stesso compito anche il lato che sfuma deve essere già quello giusto. Prima la fila
 *  scorreva e `data-taglio` restava il vecchio fino al primo fotogramma (l'evento `scroll` arriva dopo): la prova delle frecce, che
 *  controlla subito, era rossa 1 volta su 7 a macchina carica. Qui lo si misura senza dipendere dal carico. */
async function scegli(page, rail) {
  const r = await page.evaluate((rail) => {
    const fila = document.querySelector('#railTabs');
    fila.querySelector(`[data-rail="${rail}"]`).click();
    return { scrollLeft: fila.scrollLeft, taglio: fila.dataset.taglio || 'nessuno', dopo: fila.scrollWidth - fila.clientWidth - fila.scrollLeft };
  }, rail);
  const atteso = r.scrollLeft > 1 && r.dopo > 1 ? 'entrambi' : r.scrollLeft > 1 ? 'prima' : r.dopo > 1 ? 'dopo' : 'nessuno';
  expect(r.taglio, `nello stesso compito del clic su «${rail}» la fila è a ${Math.round(r.scrollLeft)} px (${Math.round(r.dopo)} nascosti a destra): il lato che sfuma deve essere già «${atteso}»`).toBe(atteso);
  return r.scrollLeft;
}

/** ⭐ Giro del revisore (giudice v1622, D2, accessibilità): la scheda col FUOCO da tastiera, anche se non è la scelta, è intera, fuori
 *  dalla sfumatura, e il suo contorno del fuoco non è tagliato dalla fila che scorre (`overflow` taglia ciò che esce dal riquadro della
 *  fila: prima del giro, a 280 px, «Processi» col fuoco aveva l'ultima lettera sbiadita, e su ogni scheda restava solo un pezzo del
 *  contorno). WCAG 2.4.11 «Focus Not Obscured»; Hermes porta in vista la scheda (`tab-strip-scroll.ts`) e DeepSeek la tiene fuori
 *  dalla fascia (`TabPanel.tsx:178`). */
async function controllaFuoco(page, momento) {
  const m = await leggi(page);
  const f = await page.locator('#railTabs').evaluate((fila) => {
    const b = document.activeElement;
    if (!b || !fila.contains(b)) return null;
    const v = fila.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const fuori = cs.outlineStyle === 'none' ? 0 : (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
    const testo = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    /* il bordo esterno del contorno: fuori dalla scheda di larghezza + offset (negativo = disegnato dentro la scheda) */
    return { nome: (testo?.textContent || '').trim(), visibile: b.matches(':focus-visible'), contorno: cs.outlineStyle, fuori, da: r.left - v.left - fuori, a: r.right - v.left + fuori, su: r.top - v.top - fuori, giu: r.bottom - v.bottom + fuori };
  });
  const dove = `${momento} (fila ${Math.round(m.larga)} px, scrollLeft ${Math.round(m.scrollLeft)}, sfuma ${m.sfuma.sinistra}|${m.sfuma.destra}, fuoco ${JSON.stringify(f)})`;
  expect(f, `il fuoco deve stare su una scheda della fila — ${dove}`).toBeTruthy();
  expect(f.visibile && f.contorno !== 'none', `la scheda col fuoco da tastiera deve mostrare il contorno — ${dove}`).toBe(true);
  expect(f.da, `il contorno della scheda col fuoco «${f.nome}» esce a sinistra o sta sotto la sfumatura — ${dove}`).toBeGreaterThanOrEqual(m.sfuma.sinistra - 0.5);
  expect(f.a, `il contorno della scheda col fuoco «${f.nome}» esce a destra o sta sotto la sfumatura — ${dove}`).toBeLessThanOrEqual(m.larga - m.sfuma.destra + 0.5);
  expect(f.su, `il contorno della scheda col fuoco «${f.nome}» è tagliato sopra dalla fila — ${dove}`).toBeGreaterThanOrEqual(-0.5);
  expect(f.giu, `il contorno della scheda col fuoco «${f.nome}» è tagliato sotto dalla fila — ${dove}`).toBeLessThanOrEqual(0.5);
  return f;
}

const dueFotogrammi = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.use({ reducedMotion: 'reduce' });

for (const [lingua, tema] of [['it', 'light'], ['en', 'dark']]) {
  for (const larghezza of [280, 340, 1200]) {
    test(`FILA-SFUMATURA (${lingua}, ${tema}, ${larghezza}) — nessuna scheda tagliata senza sfumatura, la scelta intera e fuori dalla sfumatura`, async ({ page }) => {
      await scena(page, { lingua, tema, larghezza });
      const apertura = await controlla(page, 'apertura');
      console.log(`MISURA-FILA ${lingua} ${larghezza} apertura = ${JSON.stringify(apertura)}`);
      for (const rail of ['lato', 'contesto', 'processi', 'file', 'agenti', 'lato', 'github']) {
        const subito = await scegli(page, rail);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = await controlla(page, `dopo il clic su ${rail}`);
        expect(Math.abs(m.scrollLeft - subito), `movimento ridotto: la fila deve arrivare al suo posto nel compito del clic, non scivolarci (subito ${subito}, poi ${m.scrollLeft})`).toBeLessThanOrEqual(1);
        if (rail === 'lato') console.log(`MISURA-FILA ${lingua} ${larghezza} lato = ${JSON.stringify(m)}`);
      }
      /* le frecce: dalla prima, a sinistra si va all'ultima (il giro), e la fila la porta in vista */
      await page.locator('#railTabs [data-rail="contesto"]').click();
      await page.locator('#railTabs [data-rail="contesto"]').focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#railTabs [data-rail="lato"]')).toHaveAttribute('aria-selected', 'true');
      await controlla(page, 'dopo la freccia a sinistra dalla prima');
      /* ⭐ Giro del revisore (D1, seconda strada): la freccia sposta il FUOCO, e `focus()` di Chrome fa già scorrere la fila verso la
         scheda nascosta prima di chiunque altro; il lato che sfuma deve essere giusto nello stesso compito anche così (prima del giro:
         rossa 2 volte su 7 dopo la freccia, `scrollLeft` 50 e la sfumatura ancora a destra). */
      await scegli(page, 'contesto');
      const r = await page.evaluate(() => {
        const fila = document.querySelector('#railTabs');
        const prima = fila.querySelector('[data-rail="contesto"]');
        prima.focus();
        prima.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
        return { scelta: fila.querySelector('[aria-selected="true"]')?.dataset.rail, scrollLeft: fila.scrollLeft, taglio: fila.dataset.taglio || 'nessuno', dopo: fila.scrollWidth - fila.clientWidth - fila.scrollLeft };
      });
      expect(r.scelta, 'la freccia a sinistra dalla prima sceglie l’ultima').toBe('lato');
      const atteso = r.scrollLeft > 1 && r.dopo > 1 ? 'entrambi' : r.scrollLeft > 1 ? 'prima' : r.dopo > 1 ? 'dopo' : 'nessuno';
      expect(r.taglio, `nello stesso compito della freccia la fila è a ${Math.round(r.scrollLeft)} px (${Math.round(r.dopo)} nascosti a destra): il lato che sfuma deve essere già «${atteso}»`).toBe(atteso);
    });
  }
}

test('FILA-SFUMATURA-STRETTA — la colonna che si stringe con l’ultima scheda scelta la tiene intera e in vista', async ({ page }) => {
  await scena(page, { lingua: 'it', tema: 'light', larghezza: 1200 });
  await scegli(page, 'lato');
  await controlla(page, 'a 1200 con «A lato»');
  await larghezzaColonna(page, 280);
  const m = await controlla(page, 'stretta a 280 con «A lato»');
  expect(m.scorre, 'a 280 la fila deve scorrere, o la prova non prova niente').toBe(true);
  await larghezzaColonna(page, 1200);
  await controlla(page, 'riallargata a 1200');
});

/* ⭐ Giro del revisore (giudice v1622, D3/R9): fatta scorrere a mano fino a 10 px dalla fine, la sfumatura di destra è di 10 px, non
   di tutto ciò che la fila ha di troppo (il nascosto a destra si misura dallo scorrimento). Nessuna scheda scelta da tenere in vista:
   è chi guarda che ha fatto scorrere la fila. */
for (const [lingua, tema] of [['it', 'light'], ['en', 'dark']]) {
  test(`FILA-SFUMATURA-A-MANO (${lingua}, 280) — a 10 px dalla fine la sfumatura di destra è di 10 px`, async ({ page }) => {
    await scena(page, { lingua, tema, larghezza: 280 }); // a 340 in italiano la fila ci sta esatta: non c'è niente da far scorrere
    await page.locator('#railTabs').evaluate((fila) => { fila.scrollLeft = fila.scrollWidth - fila.clientWidth - 10; });
    await dueFotogrammi(page);
    const m = await controlla(page, 'fatta scorrere a mano a 10 px dalla fine', { conScelta: false });
    expect(Math.round(m.nascosto.destra), 'la prova vuole 10 px nascosti a destra').toBe(10);
    expect(m.nascosto.sinistra, 'e qualcosa nascosto a sinistra (la fila scorre davvero)').toBeGreaterThan(10);
  });
}

/* ⭐ Giro del revisore (giudice v1622, D2): col tasto Tab il fuoco passa di scheda in scheda senza sceglierle; ognuna, quando ha il
   fuoco, è intera, fuori dalla sfumatura, e col contorno intero. A 1200 la fila ci sta: conta solo il contorno. */
for (const [lingua, tema] of [['it', 'light'], ['en', 'dark']]) {
  for (const larghezza of [280, 340, 1200]) {
    test(`FILA-FUOCO (${lingua}, ${tema}, ${larghezza}) — la scheda col fuoco da tastiera è intera, fuori dalla sfumatura, col contorno intero`, async ({ page }) => {
      await scena(page, { lingua, tema, larghezza });
      const schede = await page.locator('#railTabs .talos-tabs__tab').evaluateAll((b) => b.filter((x) => x.getClientRects().length).length);
      await page.locator('#railTabs [data-rail="contesto"]').click();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await dueFotogrammi(page);
      await controllaFuoco(page, 'fuoco sulla prima scheda');
      for (let i = 1; i < schede; i += 1) {
        await page.keyboard.press('Tab');
        await dueFotogrammi(page);
        await controllaFuoco(page, `Tab numero ${i}`);
      }
      for (let i = 1; i < schede; i += 1) {
        await page.keyboard.press('Shift+Tab');
        await dueFotogrammi(page);
        await controllaFuoco(page, `Maiusc+Tab numero ${i}`);
      }
    });
  }
}
