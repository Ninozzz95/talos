/*
 * REVIEW AVVERSARIA — QUARTO GIRO, 18/09/2026. File NUOVO, temporaneo, del revisore.
 * NON tocca nessun sorgente e nessuna prova esistente. Non scrive mai sul 4174:
 * gira sul server di prova della suite (4176/4187, store isolato).
 *
 * Le DUE cure sotto esame, dal commit `a07bced8`:
 *   · `src/styles/index.css:1680`   soglia della media query di `.talos-toolbar--hf`: 1100 → 1500
 *   · `tests/browser/intelaiatura-impostazioni.spec.mjs` INTELAIATURA-10, terza misura: `barra.top`
 *
 * IPOTESI DEL REVISORE (le mie, non quelle del brief):
 *   A. la soglia è in px di FINESTRA, ma la larghezza della riga è quella del CONTENITORE —
 *      e il contenitore si stringe senza che la finestra cambi, quando la scala dell'interfaccia
 *      è sopra 1: `.talos-shell{zoom:var(--talos-ui-font-scale,1)}` (index.css:651) e la scala la
 *      scrive l'app dalle impostazioni (`app.js:14910`, `UI_FONT_SCALE_FACTORS`, fino a 1.3).
 *   B. la posizione ASSOLUTA della barra non è stabile: la barra vive in una colonna `sticky`.
 *   C. la citazione corretta (il 220 non è del mockup) è corretta?
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';

const breve = (o) => JSON.stringify(o);
const B = (v) => Math.round(v);

async function apriLaboratorio(page, { lingua = 'it' } = {}) {
  await page.addInitScript((l) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: l, colorMode: 'dark' }, chat: {}, workspaces: {} }));
  }, lingua);
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models', { persist: false });
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#labSchedaModels')).toBeVisible({ timeout: 15_000 });
  await page.locator('#labSchedaModels').click();
  await expect(page.locator('.talos-toolbar--hf')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(350);
}

/** La stessa fotografia della riga della sonda del terzo revisore, più la catena dei contenitori
 *  e lo ZOOM davvero applicato: è la grandezza che la media query non vede. */
const MISURA = () => {
  const B = Math.round;
  const riga = document.querySelector('.talos-toolbar--hf');
  const controllo = riga.querySelector('.calm-control--select');
  const valore = controllo?.querySelector('.calm-select__value');
  const campo = document.getElementById('modelLabHfSearch');
  const cs = getComputedStyle(campo);
  const tela = document.createElement('canvas').getContext('2d');
  tela.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const segnaposto = tela.measureText(campo.placeholder).width;
  const utile = campo.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
  const rectRiga = riga.getBoundingClientRect();
  const rectControllo = controllo.getBoundingClientRect();
  // La catena: chi decide la larghezza della riga, e con che zoom.
  const catena = [];
  for (let n = riga.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    catena.push(`${String(n.className || n.tagName).slice(0, 26)}=${B(n.getBoundingClientRect().width)} z=${s.zoom}`);
  }
  const shell = document.querySelector('.talos-shell');
  return {
    viewport: window.innerWidth,
    zoomShell: shell ? getComputedStyle(shell).zoom : '(no shell)',
    varScala: getComputedStyle(document.documentElement).getPropertyValue('--talos-ui-font-scale').trim() || '(non impostata)',
    riga: B(rectRiga.width),
    rigaScroll: riga.scrollWidth,
    sfonda: riga.scrollWidth > riga.clientWidth + 1,
    fuoriDi: B(rectControllo.right - rectRiga.right),
    controlloVisibile: rectControllo.right <= rectRiga.right + 1 && rectControllo.left >= rectRiga.left - 1,
    wrap: getComputedStyle(riga).flexWrap,
    ordine: B(rectControllo.width),
    etichetta: valore ? { testo: (valore.textContent || '').trim(), tagliata: valore.scrollWidth > valore.clientWidth + 1, larga: B(valore.getBoundingClientRect().width), serve: B(tela.measureText((valore.textContent || '').trim()).width) } : null,
    campo: { w: B(campo.getBoundingClientRect().width), utile: B(utile), serve: B(segnaposto), segnapostoTagliato: segnaposto > utile },
    catena,
  };
};

/** Applica la scala dell'interfaccia come la applica l'APP: dal selettore vero delle Impostazioni.
 *  Ritorna come è andata, così il referto può dire se lo stato è raggiungibile dall'utente. */
async function applicaScala(page, valore) {
  return page.evaluate((v) => {
    const sel = document.getElementById('uiFontScaleSelect');
    if (!sel) return { via: 'nessun selettore', applicata: false };
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const shell = document.querySelector('.talos-shell');
    return { via: 'selettore #uiFontScaleSelect', valore: v, applicata: Boolean(shell) && getComputedStyle(shell).zoom !== '1' };
  }, valore);
}

/** ⛔ Sostituisce il numero dentro la media query di `.talos-toolbar--hf`, nello STESSO momento
 *  e sullo stesso pacchetto: è l'A/B fra «prima» (1100) e «dopo» (1500) chiesto dal brief.
 *  ⛔ Si cerca la regola per CONTENUTO (una media query che contiene `.talos-toolbar--hf`), non per
 *  il numero: cercandola per `1500px` la seconda passata non trovava più niente, perché la prima
 *  l'aveva già riscritta — e l'A/B misurava due volte lo stesso stato (successo in questo giro). */
async function soglia(page, px) {
  return page.evaluate((n) => {
    const trova = () => {
      for (const foglio of document.styleSheets) {
        let regole; try { regole = foglio.cssRules; } catch { continue; }
        if (!regole) continue;
        for (let i = 0; i < regole.length; i += 1) {
          const r = regole[i];
          if (r.type !== CSSRule.MEDIA_RULE) continue;
          if (![...r.cssRules].some((x) => x.selectorText && /talos-toolbar--hf/.test(x.selectorText))) continue;
          return r;
        }
      }
      return null;
    };
    const r = trova();
    if (!r) return 0;
    r.media.mediaText = `(max-width:${n}px)`;
    return 1;
  }, px);
}

/** Bisecta la fascia ROTTA verso l'alto: la riga è `nowrap` sopra la soglia. Ritorna la prima
 *  larghezza sana partendo dal basso noto rotto. */
async function primaSana(page, partenzaRotta, tetto) {
  let basso = partenzaRotta, alto = tetto;
  for (let i = 0; i < 11; i += 1) {
    const mezzo = Math.floor((basso + alto) / 2);
    await page.setViewportSize({ width: mezzo, height: 900 });
    await page.waitForTimeout(160);
    const m = await page.evaluate(MISURA);
    if (m.controlloVisibile) alto = mezzo; else basso = mezzo;
  }
  return { ultimaRotta: basso, primaSana: alto };
}

/* ══════════════════════════════════════════════════════════════════════════
 * C4-A — LA SOGLIA È IN px DI FINESTRA, LA RIGA È IN px DI CONTENITORE.
 *        La scala dell'interfaccia (Impostazioni › Aspetto › «Dimensione
 *        interfaccia», fino a 1.3) stringe il contenitore e NON muove la
 *        finestra: la media query non scatta e la riga resta `nowrap`.
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-A · la scala dell’interfaccia stringe la riga senza muovere la finestra: la soglia 1500 non la vede', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await page.waitForTimeout(200);

  const righe = [];
  for (const scala of ['default', 'large', 'xlarge']) {
    const esito = await applicaScala(page, scala);
    await page.waitForTimeout(350);
    for (const w of [1920, 1700, 1600, 1501]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(MISURA);
      righe.push({ scala, w, zoom: m.zoomShell, riga: m.riga, fuoriDi: m.fuoriDi, dentro: m.controlloVisibile, wrap: m.wrap, sfonda: m.sfonda, segnapostoTagliato: m.campo.segnapostoTagliato, etichettaTagliata: m.etichetta?.tagliata, esito });
    }
  }
  for (const r of righe) console.log('C4-A ' + breve(r));

  // Il verso che DEVE restare verde: a scala predefinita il controllo sta dentro.
  const sanzione = righe.filter((r) => r.scala === 'default' && !r.dentro);
  expect(sanzione.map((r) => r.w), `a scala predefinita il controllo esce dalla riga: ${breve(sanzione)}`).toEqual([]);

  // E il verso che il brief chiede di sfondare: stessa finestra, scala diversa.
  const rotte = righe.filter((r) => r.scala !== 'default' && !r.dentro);
  console.log('C4-A-rotte ' + breve(rotte.map((r) => ({ scala: r.scala, w: r.w, zoom: r.zoom, riga: r.riga, fuoriDi: r.fuoriDi, wrap: r.wrap }))));
  expect(rotte.map((r) => `${r.scala}@${r.w}`), `a scala dell'interfaccia > 1 il selettore dell'ordine esce dalla riga: ${breve(rotte)}`).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * C4-B — L'A/B DELLA SOGLIA, nello stesso momento: 1100 (prima) contro 1500
 *        (dopo), a scala dell'interfaccia 1.15. Dice se il difetto ESISTEVA
 *        PRIMA e se la cura lo chiude o solo lo restringe.
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-B · A/B della soglia (1100 · 1500) alla stessa scala: la cura restringe la fascia o la chiude?', async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 900 });
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await applicaScala(page, 'large');
  await page.waitForTimeout(400);

  const esito = [];
  for (const px of [1100, 1500, 1100]) {
    const toccate = await soglia(page, px);
    await page.waitForTimeout(250);
    for (const w of [1501, 1560, 1620, 1700, 1800, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200);
      const m = await page.evaluate(MISURA);
      esito.push({ soglia: px, toccate, w, riga: m.riga, fuoriDi: m.fuoriDi, dentro: m.controlloVisibile, wrap: m.wrap });
    }
  }
  for (const r of esito) console.log('C4-B ' + breve(r));
  const conta = (px, giro) => esito.filter((r, i) => r.soglia === px && Math.floor(i / 6) === giro && !r.dentro).map((r) => r.w);
  const prima = conta(1100, 0);
  const dopo = conta(1500, 1);
  const ancoraPrima = conta(1100, 2);
  console.log('C4-B-fasce ' + breve({ prima_1100: prima, dopo_1500: dopo, ritorno_1100: ancoraPrima }));
  expect(esito[0].toccate, 'la sonda non ha trovato la media query: la misura non vale').toBeGreaterThan(0);
  expect(ancoraPrima, 'la sonda non è ripetibile: due passate con lo stesso numero danno esiti diversi').toEqual(prima);
  expect(dopo, `a scala 1.15 il controllo esce dalla riga SOPRA la soglia della cura: dopo_1500=${breve(dopo)} · prima_1100=${breve(prima)}`).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * C4-B2 — DOVE FINISCE LA FASCIA, a ogni scala dell'interfaccia. È il numero
 *         che dice se la cura ha CHIUSO il difetto o solo lo ha spostato.
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-B2 · la fascia rotta a ogni scala: dove finisce, e dove finiva con la soglia 1100', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  const esito = [];
  for (const scala of ['default', 'large', 'xlarge']) {
    await applicaScala(page, scala);
    await page.waitForTimeout(350);
    for (const px of [1500, 1100]) {
      await soglia(page, px);
      await page.waitForTimeout(250);
      const rotte = [];
      for (const w of [1501, 1550, 1600, 1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000, 2100, 2200, 2400]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(140);
        const m = await page.evaluate(MISURA);
        if (!m.controlloVisibile) rotte.push({ w, fuoriDi: m.fuoriDi, riga: m.riga });
      }
      esito.push({ scala, soglia: px, rotte });
    }
  }
  for (const r of esito) console.log('C4-B2 ' + breve(r));
  const conCura = esito.filter((r) => r.soglia === 1500);
  console.log('C4-B2-fasce ' + breve(conCura.map((r) => ({ scala: r.scala, larghezzeRotte: r.rotte.map((x) => x.w), fuoriDiMax: Math.max(0, ...r.rotte.map((x) => x.fuoriDi)) }))));
  expect(conCura.filter((r) => r.scala === 'default').flatMap((r) => r.rotte.map((x) => x.w)), 'a scala predefinita la soglia 1500 lascia una fascia rotta (doveva chiuderla)').toEqual([]);
  expect(conCura.flatMap((r) => r.rotte.map((x) => `${r.scala}@${x.w}`)), `con la soglia della cura (1500) il selettore dell'ordine esce dalla riga a queste larghezze: ${breve(conCura.map((r) => ({ scala: r.scala, rotte: r.rotte.map((x) => `${x.w} (fuori di ${x.fuoriDi}px su una riga di ${x.riga})`) })))}`).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * C4-C — LA TERZA MISURA DI INTELAIATURA-10 È STABILE?
 *        `barra.top` è una posizione ASSOLUTA dentro una colonna `sticky`:
 *        se la pagina scorre, o se qualcosa sopra la barra cambia, la misura
 *        si muove anche su codice SANO. Qui si prova il verso del FALSO ROSSO.
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-C · la posizione assoluta della barra: falsi rossi su codice sano', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 });
  await apriLaboratorio(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false }));
  await expect(page.locator('#schermoImpostazioni .settings-toolbar')).toBeVisible();

  const stato = () => page.evaluate(() => {
    const barra = document.querySelector('#schermoImpostazioni .settings-toolbar').getBoundingClientRect();
    const voce = document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]').getBoundingClientRect();
    const bottone = document.querySelector('#schermoImpostazioni .settings-nav__search')?.getBoundingClientRect();
    const pagina = document.querySelector('#schermoImpostazioni .talos-page');
    const nav = document.querySelector('#schermoImpostazioni .settings-nav');
    /*
     * ⛔ LA SCOMPOSIZIONE, ed è il punto di questa sonda: `barra.top` è una coordinata ASSOLUTA nel
     *   viewport, quindi contiene DUE cose diverse — dove sta la barra nel documento, e quanto la
     *   pagina ha scorso. Solo la prima è il «salto della colonna» che la prova dichiara di
     *   misurare. `docTop` è la barra rispetto al contenuto (scrollTop + top), ed è quella che
     *   non si muove quando è il viewport a muoversi.
     */
    const nodoBarra = document.querySelector('#schermoImpostazioni .settings-toolbar');
    return {
      /* ⛔ LE DUE METRICHE, A FIANCO, perché questa prova esiste per confrontarle:
         `barraTop` è la coordinata del VIEWPORT (contiene lo scorrimento) e `barraOffset` è la
         posizione della barra nel suo contenuto (non lo contiene). La cura di `771201c1` è il
         passaggio dalla prima alla seconda. */
      barraOffset: nodoBarra.offsetTop,
      altezzaBarra: Math.round(barra.height), barraTop: Math.round(barra.top),
      relativa: Math.round(voce.top - barra.top), voceVisibile: voce.height > 0,
      altezzaBottone: bottone ? Math.round(bottone.height) : null,
      scrollPagina: Math.round(pagina.scrollTop),
      docTop: Math.round(barra.top + pagina.getBoundingClientRect().top + pagina.scrollTop * 0),
      barraTopNelContenuto: Math.round(barra.top + pagina.scrollTop - pagina.getBoundingClientRect().top),
      altezzaContenuto: Math.round(pagina.scrollHeight),
      navPosition: getComputedStyle(nav).position,
      barraDentroNav: Boolean(document.querySelector('#schermoImpostazioni .settings-nav .settings-toolbar')),
    };
  });

  const sana0 = await stato();
  await page.locator('#settingsSearch').fill('tema');
  await page.waitForTimeout(250);
  const durante = await stato();
  console.log('C4-C-cerca ' + breve({ sana0, durante }));
  await page.locator('#settingsSearch').fill('');
  await page.waitForTimeout(250);

  /* IL VERSO DEL FALSO ROSSO — prima forma: la pagina scorre, POI si cerca.
     ⛔ E la ricerca si fa SENZA `fill`: `fill` porta l'elemento in vista da solo e lo scorrimento
     che ne segue è di Playwright, non dell'app — una sonda che accusa l'app per un gesto suo non
     vale. Qui l'evento si spedisce a mano, sulla pagina ferma dove l'ha messa l'utente. */
  await page.locator('#schermoImpostazioni .talos-page').evaluate((el) => el.scrollTo(0, 400));
  await page.waitForTimeout(300);
  const scorsa = await stato();
  await page.evaluate(() => {
    const campo = document.getElementById('settingsSearch');
    campo.value = 'tema';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(350);
  const scorsaEDurante = await stato();
  console.log('C4-C-scroll ' + breve({ scorsa, scorsaEDurante }));
  const vecchia = {
    senzaScroll: Math.abs(durante.barraTop - sana0.barraTop),
    conScroll: Math.abs(scorsaEDurante.barraTop - scorsa.barraTop),
  };
  const nuova = {
    senzaScroll: Math.abs(durante.barraOffset - sana0.barraOffset),
    conScroll: Math.abs(scorsaEDurante.barraOffset - scorsa.barraOffset),
  };
  console.log('C4-C-asserzione ' + breve({ vecchia, nuova, scrollPrima: scorsa.scrollPagina, scrollDopo: scorsaEDurante.scrollPagina }));
  /*
   * ⛔ QUESTA PROVA È STATA CONVERTITA — era rossa di proposito, perché asseriva la vecchia metrica
   *   e ne misurava il falso rosso. Dopo la cura (`771201c1`) la metrica di prodotto è `offsetTop`:
   *   ora si asserisce che **la nuova** non si muove su codice sano (nei due casi), e si DOCUMENTA
   *   che la vecchia sì — così il motivo del cambio resta scritto in una prova che morde.
   *   Se qualcuno tornasse a `barra.top` in `INTELAIATURA-10`, la prima asserzione non se ne
   *   accorgerebbe: è la seconda, sulla vecchia metrica, a dire PERCHÉ non si torna indietro.
   */
  expect(nuova.senzaScroll, 'codice sano, nessuno scroll: la colonna non deve saltare').toBeLessThanOrEqual(8);
  expect(nuova.conScroll, `codice sano, pagina scorsa: la barra non deve muoversi (misura ${nuova.conScroll} px)`).toBeLessThanOrEqual(8);
  expect(vecchia.conScroll, 'la metrica del VIEWPORT deve invece muoversi con lo scorrimento: è il falso rosso documentato').toBeGreaterThan(8);
});

/* ══════════════════════════════════════════════════════════════════════════
 * C4-D — LA FORMA A DUE RIGHE SOTTO I 1500: è sensata, o è un campo enorme e
 *        tre controlli sparsi? E la riga a capo sfonda a sua volta?
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-D · la forma a capo sotto i 1500: altezze, trabocchi, e la soglia vista da vicino', async ({ page }) => {
  await page.setViewportSize({ width: 1501, height: 900 });
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await page.waitForTimeout(250);
  const esito = [];
  for (const w of [1501, 1500, 1499, 1440, 1280, 1101, 1100, 900, 660, 560, 480]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(220);
    const m = await page.evaluate(() => {
      const riga = document.querySelector('.talos-toolbar--hf');
      const r = riga.getBoundingClientRect();
      const figli = [...riga.children].filter((el) => el.getBoundingClientRect().width > 0);
      const tops = [...new Set(figli.map((el) => Math.round(el.getBoundingClientRect().top)))];
      const controllo = riga.querySelector('.calm-control--select');
      return {
        riga: Math.round(r.width), altezza: Math.round(r.height), righeDiFigli: tops.length,
        sfonda: riga.scrollWidth > riga.clientWidth + 1,
        fuoriDi: Math.round(controllo.getBoundingClientRect().right - r.right),
        campo: Math.round(document.getElementById('modelLabHfSearch').getBoundingClientRect().width),
        controllo: Math.round(controllo.getBoundingClientRect().width),
      };
    });
    esito.push({ w, ...m });
  }
  for (const r of esito) console.log('C4-D ' + breve(r));
  expect(esito.filter((r) => r.sfonda).map((r) => r.w), `la riga sfonda a queste larghezze: ${breve(esito.filter((r) => r.sfonda))}`).toEqual([]);
  expect(esito.filter((r) => r.fuoriDi > 1).map((r) => r.w), `il controllo esce dalla riga a queste larghezze: ${breve(esito.filter((r) => r.fuoriDi > 1))}`).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * C4-E — LA CITAZIONE CORRETTA È CORRETTA? Alla fonte, in
 *        `prototypes/calm-lab/TALOS-Calm-Lab.html`: quante regole parlano di
 *        `.catalog-sorting`, quante di `.catalog-sort`, e quanto è largo
 *        DAVVERO il controllo dell'ordine nella scena.
 * ══════════════════════════════════════════════════════════════════════════ */
test('C4-E · la citazione del mockup: `.catalog-sorting` contro `.catalog-sort`', async ({ page }) => {
  /* ⛔ Il mockup NON è dentro `public/`, quindi non è servito dal server di prova: si apre dal
     disco (il test può leggere, non scrivere: nessun sorgente viene toccato). */
  const mockup = pathToFileURL('C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend/prototypes/calm-lab/TALOS-Calm-Lab.html').href;
  await page.goto(mockup);
  await page.waitForTimeout(1200);
  // Il mockup disegna il catalogo con il suo JS: si aspetta la scena, non il tempo.
  await page.locator('.catalog-sort').first().waitFor({ timeout: 10_000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const testi = [];
    for (const f of document.styleSheets) {
      let regole; try { regole = f.cssRules; } catch { continue; }
      const gira = (lista, dentro) => { for (const r of lista) { if (r.cssRules) gira(r.cssRules, true); else if (r.selectorText && /catalog-sort/i.test(r.selectorText)) testi.push(r.cssText.slice(0, 160)); } };
      gira(regole, false);
    }
    const ordina = document.querySelector('.catalog-sort');
    const sel = document.querySelector('.catalog-sort select, #catalog-sort');
    const calm = document.querySelector('.catalog-sort .calm-control');
    return {
      elementiCatalogSorting: document.querySelectorAll('.catalog-sorting').length,
      elementiCatalogSort: document.querySelectorAll('.catalog-sort').length,
      regoleCheParlanoDiSort: testi,
      larghezzaNativo: sel ? Math.round(sel.getBoundingClientRect().width) : null,
      selMaxWidth: sel ? getComputedStyle(sel).maxWidth : null,
      larghezzaCalm: calm ? Math.round(calm.getBoundingClientRect().width) : null,
      calmMaxWidth: calm ? getComputedStyle(calm).maxWidth : null,
      ordinaWidth: ordina ? Math.round(ordina.getBoundingClientRect().width) : null,
    };
  });
  console.log('C4-E ' + breve(m));
  expect(m.elementiCatalogSorting, '`.catalog-sorting` esiste nel mockup: la correzione della citazione sarebbe sbagliata').toBe(0);
});
