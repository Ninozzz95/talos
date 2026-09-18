/*
 * REVIEW AVVERSARIA — TERZO GIRO, 18/09/2026. File NUOVO, temporaneo, del revisore.
 * NON tocca nessun sorgente e nessuna prova esistente. Non scrive mai sul 4174:
 * gira sul server di prova della suite (4176/4185, store vuoto).
 *
 * Le tre cure sotto esame:
 *   · `src/styles/index.css:1669`   `.talos-toolbar--hf .calm-control--select{flex:0 0 220px;min-width:0}`
 *   · `tests/browser/intelaiatura-impostazioni.spec.mjs` INTELAIATURA-10 (altezza barra + posizione
 *     relativa) e INTELAIATURA-06 (guardia sul `display` sopra i 660 px di contenitore)
 *   · `tests/browser/_review-cure.spec.mjs` R12/R17 invertite
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const breve = (o) => JSON.stringify(o);
const B = (v) => Math.round(v);

/** Apre le Impostazioni nella lingua data e va in Laboratorio › Hugging Face.
 *  ⛔ Per ATTRIBUTO e non per nome accessibile: in inglese «Laboratorio modelli» è «Model Lab»
 *  e una porta per nome non passa la lingua. */
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

/** La fotografia della riga a una certa larghezza. */
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
  const stile = (el) => { const s = getComputedStyle(el); return `${s.flexGrow} ${s.flexShrink} ${s.flexBasis}`; };
  const rectRiga = riga.getBoundingClientRect();
  const rectControllo = controllo.getBoundingClientRect();
  // Chi taglia: il primo antenato che non lascia uscire il contenuto.
  let chi = null;
  for (let n = riga; n && !chi; n = n.parentElement) {
    const s = getComputedStyle(n);
    const taglia = s.overflowX !== 'visible' || s.overflow !== 'visible';
    if (taglia && n !== riga) chi = { cls: String(n.className).slice(0, 40), overflowX: s.overflowX, scroll: n.scrollWidth, client: n.clientWidth, scorribile: n.scrollWidth > n.clientWidth + 1 };
  }
  return {
    viewport: window.innerWidth,
    contenitore: B(document.querySelector('#schermoImpostazioni').getBoundingClientRect().width),
    riga: B(rectRiga.width),
    rigaScroll: riga.scrollWidth,
    sfonda: riga.scrollWidth > riga.clientWidth + 1,
    fuoriDiQuanto: B(rectControllo.right - rectRiga.right),
    controlloVisibile: rectControllo.right <= rectRiga.right + 1 && rectControllo.left >= rectRiga.left - 1,
    chiTaglia: chi,
    wrap: getComputedStyle(riga).flexWrap,
    figli: [...riga.children].filter((el) => el.getBoundingClientRect().width > 0).map((el) => `${String(el.className).slice(0, 22)}=${B(el.getBoundingClientRect().width)}[${stile(el)}]`),
    ordine: { w: B(rectControllo.width), flex: stile(controllo) },
    etichetta: valore ? { testo: (valore.textContent || '').trim(), w: B(valore.getBoundingClientRect().width), tagliata: valore.scrollWidth > valore.clientWidth + 1, serve: B(tela.measureText((valore.textContent || '').trim()).width) } : null,
    campo: { w: B(campo.getBoundingClientRect().width), utile: B(utile), serve: B(segnaposto), segnapostoTagliato: segnaposto > utile },
  };
};

/** A/B nello stesso momento: si toglie la regola dal CSSOM e si rimisura (come fa R6). */
async function togliRegola(page, selettore) {
  return page.evaluate((sel) => {
    let n = 0;
    // Prima si RACCOLGONO gli indici, poi si cancella: cancellare mentre si scorre
    // sposta le regole e fa leggere `undefined` (già capitato in questa stessa sonda).
    const prese = [];
    for (const foglio of document.styleSheets) {
      let regole; try { regole = foglio.cssRules; } catch { continue; }
      if (!regole) continue;
      for (let i = 0; i < regole.length; i += 1) {
        if (regole[i].selectorText === sel) prese.push([foglio, i, null]);
        const dentro = regole[i].cssRules;
        if (!dentro) continue;
        for (let j = 0; j < dentro.length; j += 1) if (dentro[j].selectorText === sel) prese.push([foglio, i, j]);
      }
    }
    for (const [foglio, i, j] of prese.reverse()) {
      const regole = foglio.cssRules;
      if (j === null) { if (regole[i]?.selectorText === sel) { foglio.deleteRule(i); n += 1; } } else if (regole[i]?.cssRules?.[j]?.selectorText === sel) { regole[i].deleteRule(j); n += 1; }
    }
    return n;
  }, selettore);
}

/* ══════════════════════════════════════════════════════════════════════════
 * P1 — I 220 PX IN OGNI CONDIZIONE. Il buco dichiarato dal revisore precedente:
 *      sotto i 1100 px non aveva misurato nessuno.
 * ══════════════════════════════════════════════════════════════════════════ */
test('P1 · la riga HF a sedici larghezze: chi si comprime, chi sfonda, chi resta a 220', async ({ page }) => {
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await page.waitForTimeout(200);
  const larghezze = [1920, 1600, 1440, 1366, 1280, 1200, 1150, 1101, 1100, 1024, 900, 768, 660, 560, 480, 390];
  for (const w of larghezze) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(220);
    const m = await page.evaluate(MISURA);
    console.log(`P1-${w} ` + breve({ cont: m.contenitore, riga: m.riga, scroll: m.rigaScroll, sfonda: m.sfonda, fuoriDi: m.fuoriDiQuanto, visibile: m.controlloVisibile, chiTaglia: m.chiTaglia, wrap: m.wrap, ordine: m.ordine.w, ordineFlex: m.ordine.flex, etichetta: `${m.etichetta?.testo} ${m.etichetta?.w}px serve ${m.etichetta?.serve} tagliata=${m.etichetta?.tagliata}`, campo: `${m.campo.w} utile ${m.campo.utile} serve ${m.campo.serve} tagliato=${m.campo.segnapostoTagliato}`, figli: m.figli }));
  }
  // La foto dove la suite gira di default (1280) e alla larghezza del confronto col mockup (1440).
  for (const w of [1440, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('#schermoImpostazioni .talos-page').screenshot({ path: path.join(process.env.TEMP, `review3-lab-${w}.png`) });
  }

  /* IL MORSO: il controllo dell'ordine deve stare DENTRO la sua riga a ogni larghezza.
     L'asserzione è UNA SOLA, e la si legge due volte: a 1920 deve essere verde, a 1280 rossa.
     Se è rossa, il numero illeggibile è quello del selettore che comanda l'ordine. */
  const esito = [];
  for (const w of [1920, 1600, 1440, 1366, 1280, 1200, 1150, 1101]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const m = await page.evaluate(MISURA);
    esito.push({ w, fuoriDi: m.fuoriDiQuanto, dentro: m.controlloVisibile, campo: m.campo.w, segnapostoTagliato: m.campo.segnapostoTagliato, riga: m.riga, scroll: m.rigaScroll });
  }
  console.log('P1-morso ' + breve(esito));
  /*
   * ⛔ LA BISEZIONE SI FA SOLO SE UNA FASCIA ESISTE, E ALLORA DEVE ESSERE COERENTE — correzione del
   *   quarto revisore, 18/09/2026. La stesura precedente la eseguiva sempre, dichiarando
   *   `basso = rotto, alto = sano`: dopo la cura, a scala predefinita **1101 è sana**, la bisezione
   *   collassa e stampa `{"ultimaRotta":1101,"primaSana":1101}` — una contraddizione a schermo che
   *   nessuno vedeva, perché era solo un `console.log`.
   * ⛔ E NON si asserisce «la fascia deve esistere»: a codice sano **non deve esistere**. Si asserisce
   *   la coerenza: se qualche larghezza è rotta, allora la prima sana viene DOPO l'ultima rotta.
   */
  const rotte = esito.filter((e) => !e.dentro).map((e) => e.w);
  if (rotte.length) {
    let basso = 1101, alto = 1700; // basso = rotto, alto = sano
    for (let i = 0; i < 12; i += 1) {
      const mezzo = Math.floor((basso + alto) / 2);
      await page.setViewportSize({ width: mezzo, height: 900 });
      await page.waitForTimeout(150);
      const m = await page.evaluate(MISURA);
      if (m.controlloVisibile) alto = mezzo; else basso = mezzo;
    }
    console.log('P1-fascia ' + breve({ ultimaRotta: basso, primaSana: alto }));
    expect(alto, `la bisezione perde la sua premessa: ultimaRotta ${basso}, primaSana ${alto}`).toBeGreaterThan(basso);
  } else {
    console.log('P1-fascia: nessuna larghezza rotta fra quelle misurate — non c\'è fascia da bisecare');
  }
  expect(esito[0].dentro, 'a 1920 il controllo è dentro la riga (il verso che deve restare verde)').toBe(true);
  expect(esito.filter((e) => !e.dentro).map((e) => e.w), `il selettore dell’ordine esce dalla riga a queste larghezze: ${breve(esito.filter((e) => !e.dentro))}`).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * P1b — L'A/B DELLA REGOLA, nello stesso momento e sullo stesso pacchetto:
 *       con la regola nuova (220), senza regola (com'era prima di `be736bc9`),
 *       e con la misura vecchia (150).
 * ══════════════════════════════════════════════════════════════════════════ */
test('P1b · A/B della riga: 220 (cura) · 150 (la misura sbagliata) · senza regola (prima di `be736bc9`)', async ({ page }) => {
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await page.waitForTimeout(200);
  const scorciatoia = (m) => ({ ordine: m.ordine.w, etichetta: m.etichetta?.tagliata, campo: m.campo.w, segnapostoTagliato: m.campo.segnapostoTagliato, sfonda: m.sfonda, fuoriDi: m.fuoriDiQuanto, controlloDentro: m.controlloVisibile });
  for (const w of [1440, 1280]) {
    await apriLaboratorio(page);
    await page.setViewportSize({ width: w, height: 900 });
    await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
    await page.waitForTimeout(250);
    const con220 = await page.evaluate(MISURA);
    // 150 — la misura della prima stesura (`be736bc9`), rimessa con `!important` sopra la cura.
    await page.addStyleTag({ content: '.talos-toolbar--hf .calm-control--select{flex:0 0 150px !important}' });
    await page.waitForTimeout(200);
    const con150 = await page.evaluate(MISURA);
    // Si toglie SOLO il foglio iniettato (l'ultimo): la cura torna quella vera.
    await page.evaluate(() => { for (const f of [...document.styleSheets]) if ([...f.cssRules].some((r) => r.selectorText === '.talos-toolbar--hf .calm-control--select' && r.style.getPropertyPriority('flex') === 'important')) f.ownerNode.remove(); });
    await page.waitForTimeout(200);
    // E ora si toglie la cura dal CSSOM: è lo stato di PRIMA di `be736bc9`.
    const tolte = await togliRegola(page, '.talos-toolbar--hf .calm-control--select');
    await page.waitForTimeout(250);
    const senza = await page.evaluate(MISURA);
    console.log(`P1b-${w} ` + breve({ tolte, con220: scorciatoia(con220), con150: scorciatoia(con150), senza: scorciatoia(senza) }));
    expect(tolte, 'l’A/B non ha tolto nessuna regola: le misure «senza» non valgono').toBeGreaterThan(0);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * P2 — L'ETICHETTA PIÙ LUNGA, in italiano E in inglese.
 * ══════════════════════════════════════════════════════════════════════════ */
test('P2 · le quattro opzioni dell’ordine, in italiano e in inglese', async ({ page }) => {
  for (const lingua of ['it', 'en']) {
    await apriLaboratorio(page, { lingua });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(250);
    const opzioni = await page.$$eval('#modelLabHfSortControl option', (o) => o.map((e) => ({ v: e.value, t: e.text })));
    const esito = [];
    for (const o of opzioni) {
      await page.selectOption('#modelLabHfSortControl', o.v, { force: true });
      await page.waitForTimeout(120);
      const m = await page.evaluate(MISURA);
      esito.push({ v: o.v, opzione: o.t, etichetta: m.etichetta?.testo, larga: m.etichetta?.w, serve: m.etichetta?.serve, tagliata: m.etichetta?.tagliata, controllo: m.ordine.w });
    }
    console.log(`P2-${lingua} ` + breve(esito));
    // La lingua è stata applicata davvero? Se no, la riga sopra è l'italiano travestito.
    const prova = await page.evaluate(() => ({ titolo: document.querySelector('#schermoImpostazioni .settings-section-heading h2')?.textContent, segnaposto: document.getElementById('modelLabHfSearch')?.placeholder, etichettaOrdine: document.querySelector('.talos-toolbar--hf .calm-select__value')?.textContent }));
    console.log(`P2-${lingua}-lingua ` + breve(prova));
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * P3 — LA SOGLIA DELLA GUARDIA NUOVA. `INTELAIATURA-06` dice: sopra i 660 px
 *      di CONTENITORE la disposizione DEVE essere `grid`. La regola vera è
 *      `@container settings (max-width: 660px)`: contenitore = CONTENT BOX di
 *      `#schermoImpostazioni`. Se il border box non coincide col content box
 *      (scrollbar, padding, bordo), le due soglie non sono lo stesso numero e
 *      la guardia diventa rossa su codice SANO.
 * ══════════════════════════════════════════════════════════════════════════ */
test('P3 · la soglia della guardia di INTELAIATURA-06 è lo stesso numero della container query?', async ({ page }) => {
  await apriLaboratorio(page);
  let basso = 700, alto = 1400;
  for (let i = 0; i < 24; i += 1) {
    const mezzo = Math.floor((basso + alto) / 2);
    await page.setViewportSize({ width: mezzo, height: 900 });
    await page.waitForTimeout(120);
    const d = await page.evaluate(() => getComputedStyle(document.querySelector('#schermoImpostazioni .talos-settings')).display);
    if (d === 'block') basso = mezzo; else alto = mezzo;
  }
  const misure = [];
  for (const w of [basso - 1, basso, alto, alto + 1]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    misure.push(await page.evaluate(() => {
      const schermo = document.querySelector('#schermoImpostazioni');
      const cs = getComputedStyle(schermo);
      return {
        viewport: window.innerWidth,
        display: getComputedStyle(schermo.querySelector('.talos-settings')).display,
        rect: Math.round(schermo.getBoundingClientRect().width),
        client: schermo.clientWidth,
        computed: cs.width,
        padding: `${cs.paddingLeft}/${cs.paddingRight}`,
        bordo: `${cs.borderLeftWidth}/${cs.borderRightWidth}`,
        scrollbar: getComputedStyle(schermo).overflowY,
      };
    }));
  }
  console.log('P3-confine ' + breve({ ultimaBlock: basso, primaGrid: alto, misure }));
  const falsiRossi = misure.filter((m) => m.rect > 660 && m.display !== 'grid');
  console.log('P3-falsiRossi ' + breve(falsiRossi));
  expect(falsiRossi.length, `la guardia di INTELAIATURA-06 è rossa su codice SANO a queste larghezze: ${breve(falsiRossi)}`).toBe(0);
});

/* ══════════════════════════════════════════════════════════════════════════
 * P4 — LA METRICA NUOVA DI INTELAIATURA-10 È CIECA A QUALCOSA D'ALTRO?
 *      La barra NON cambia altezza e la prima voce NON si sposta rispetto alla
 *      barra, ma la colonna salta lo stesso: succede quando a cambiare è un
 *      elemento che sta SOPRA la barra dentro la stessa colonna — e ce n'è uno,
 *      `.settings-nav__search` (il bottone «Cerca impostazioni»), inserito
 *      proprio sopra la barra (`settings-view.ts:582/586`).
 * ══════════════════════════════════════════════════════════════════════════ */
const STATO_COLONNA = () => {
  const barra = document.querySelector('#schermoImpostazioni .settings-toolbar').getBoundingClientRect();
  const voce = document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]').getBoundingClientRect();
  const bottone = document.querySelector('#schermoImpostazioni .settings-nav__search').getBoundingClientRect();
  return {
    altezzaBarra: Math.round(barra.height), barraTop: Math.round(barra.top),
    relativa: Math.round(voce.top - barra.top), assoluta: Math.round(voce.top),
    voceVisibile: voce.height > 0, altezzaBottone: Math.round(bottone.height),
  };
};

test('P4 · un salto della colonna che la metrica nuova non vede (sopra i 660 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriLaboratorio(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false }));
  await expect(page.locator('#schermoImpostazioni .settings-toolbar')).toBeVisible();

  const sana0 = await page.evaluate(STATO_COLONNA);
  await page.locator('#settingsSearch').fill('tema');
  await page.waitForTimeout(250);
  const oggi = await page.evaluate(STATO_COLONNA);
  console.log('P4-oggi ' + breve({ sana0, oggi }));
  await page.locator('#settingsSearch').fill('');
  await page.waitForTimeout(200);

  /* LA REGRESSIONE, iniettata a runtime (nessun file toccato): mentre si cerca, il bottone
     «Cerca impostazioni» — che sta SOPRA la barra nella stessa colonna — sparisce. È la stessa
     famiglia del difetto del 18/09 (la colonna che salta), con la causa sopra la barra invece
     che dentro. */
  await page.addStyleTag({ content: '.settings-nav[data-in-ricerca] .settings-nav__search{display:none}' });
  await page.evaluate(() => {
    const nav = document.querySelector('#schermoImpostazioni .settings-nav');
    const campo = document.getElementById('settingsSearch');
    campo.addEventListener('input', () => { if (campo.value) nav.setAttribute('data-in-ricerca', ''); else nav.removeAttribute('data-in-ricerca'); });
  });
  const sana = await page.evaluate(STATO_COLONNA);
  await page.locator('#settingsSearch').fill('tema');
  await page.waitForTimeout(250);
  const rotta = await page.evaluate(STATO_COLONNA);
  const salto = Math.abs(rotta.assoluta - sana.assoluta);
  console.log('P4-regressione ' + breve({ sana, rotta, saltoAssoluto: salto, saltoBarra: Math.abs(rotta.altezzaBarra - sana.altezzaBarra), saltoRelativo: Math.abs(rotta.relativa - sana.relativa) }));

  /* LE DUE ASSERZIONI DI INTELAIATURA-10, ricopiate parola per parola (righe 222-225). */
  const verdeAltezza = Math.abs(rotta.altezzaBarra - sana.altezzaBarra) <= 2;
  const verdeRelativa = Math.abs(rotta.relativa - sana.relativa) <= 8;
  console.log('P4-INTELAIATURA-10 ' + breve({ verdeAltezza, verdeRelativa }));
  expect(salto, 'la regressione iniettata non fa saltare la colonna: la prova sotto è vacua').toBeGreaterThan(8);
  expect(verdeAltezza && verdeRelativa, `INTELAIATURA-10 NON morde un salto di ${salto} px: è la cecità dichiarata`).toBe(true);
});

test('P4b · lo stesso salto SOTTO i 660 px, dove resta solo l’altezza della barra', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriLaboratorio(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false }));
  await expect(page.locator('#schermoImpostazioni .settings-toolbar')).toBeVisible();
  // ⛔ Si apre a 1280 e POI si stringe: a 560 la sidebar dell'app è nascosta e nessuna voce si clicca.
  await page.setViewportSize({ width: 560, height: 900 });
  await page.waitForTimeout(300);
  const stato = () => page.evaluate(() => {
    const barra = document.querySelector('#schermoImpostazioni .settings-toolbar').getBoundingClientRect();
    const voce = document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]').getBoundingClientRect();
    const mobile = document.querySelector('#schermoImpostazioni .settings-mobile-nav').getBoundingClientRect();
    const bottone = document.querySelector('#schermoImpostazioni .settings-nav__search').getBoundingClientRect();
    return {
      altezzaBarra: Math.round(barra.height), barraTop: Math.round(barra.top),
      relativa: Math.round(voce.top - barra.top), voceVisibile: voce.height > 0,
      mobileAltezza: Math.round(mobile.height), bottoneTop: Math.round(bottone.top),
      altezzaBottone: Math.round(bottone.height),
    };
  });
  const sana = await stato();
  await page.addStyleTag({ content: '.settings-nav[data-in-ricerca] .settings-nav__search{display:none}' });
  await page.evaluate(() => {
    const nav = document.querySelector('#schermoImpostazioni .settings-nav');
    const campo = document.getElementById('settingsSearch');
    campo.addEventListener('input', () => { if (campo.value) nav.setAttribute('data-in-ricerca', ''); else nav.removeAttribute('data-in-ricerca'); });
  });
  await page.locator('#settingsSearch').fill('tema');
  await page.waitForTimeout(250);
  const rotta = await stato();
  const saltoBarra = Math.abs(rotta.barraTop - sana.barraTop);
  console.log('P4b ' + breve({ sana, rotta, saltoBarra: saltoBarra, saltoAltezzaBarra: Math.abs(rotta.altezzaBarra - sana.altezzaBarra), voceVisibile: rotta.voceVisibile }));
  // INTELAIATURA-10 sotto i 660 px: `voceVisibile` falso ⇒ resta SOLO l'altezza della barra.
  expect(rotta.voceVisibile, 'sotto i 660 px la voce non è visibile: è il caso che INTELAIATURA-10 sa di non coprire').toBe(false);
  expect(Math.abs(rotta.altezzaBarra - sana.altezzaBarra) <= 2, `l’unica asserzione che resta è verde mentre la colonna sale di ${saltoBarra} px`).toBe(true);
  expect(saltoBarra, 'la regressione non muove la colonna: prova vacua').toBeGreaterThan(8);
});

/* ══════════════════════════════════════════════════════════════════════════
 * P5 — R17, PROVATA NEI DUE VERSI. La forma nuova morde; quella circolare tace.
 * ══════════════════════════════════════════════════════════════════════════ */
test('P5 · R17 morde la regressione, la forma circolare no', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriLaboratorio(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false }));
  await expect(page.locator('#schermoImpostazioni .settings-toolbar')).toBeVisible();
  const misure = () => page.evaluate(() => {
    const c = document.querySelector('#settingsSearch');
    const col = c.closest('.settings-nav').getBoundingClientRect();
    const intel = c.closest('.talos-settings').getBoundingClientRect();
    return { campo: Math.round(c.getBoundingClientRect().width), colonna: Math.round(col.width), intelaiatura: Math.round(intel.width), display: getComputedStyle(c.closest('.talos-settings')).display, contenitore: Math.round(c.closest('#schermoImpostazioni').getBoundingClientRect().width) };
  });
  const sane = await misure();
  await page.addStyleTag({ content: '.talos-settings{display:block !important}' });
  await page.waitForTimeout(250);
  const rotte = await misure();
  const circolare = (m) => (m.colonna < m.intelaiatura - 1 ? m.campo < m.intelaiatura / 2 : false);
  const nuova = (m) => (m.contenitore > 660 ? m.display === 'grid' && m.campo < m.intelaiatura / 2 : true);
  console.log('P5 ' + breve({ sane, rotte, circolareSuSane: circolare(sane), circolareSuRotte: circolare(rotte), nuovaSuSane: nuova(sane), nuovaSuRotte: nuova(rotte) }));
  expect(nuova(sane), 'la guardia nuova è verde sul prodotto sano').toBe(true);
  expect(nuova(rotte), 'la guardia nuova morde la regressione').toBe(false);
  expect(circolare(rotte), 'la forma circolare tace sulla stessa regressione').toBe(false);
});

/* ══════════════════════════════════════════════════════════════════════════
 * P6 — IL 220 È DAVVERO LA MISURA DEL MOCKUP? Alla fonte: il mockup si carica
 *      da `file://` (un solo `<script>` inline, nessun modulo ⇒ niente CORS) e
 *      si CHIEDE al DOM quali elementi portano quella classe.
 * ══════════════════════════════════════════════════════════════════════════ */
test('P6 · il 220 nel mockup: chi porta la classe `.catalog-sorting`?', async ({ page }) => {
  const file = path.resolve(process.cwd(), 'prototypes/calm-lab/TALOS-Calm-Lab.html');
  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  const esito = await page.evaluate(() => {
    const quanti = (sel) => document.querySelectorAll(sel).length;
    const ordina = document.querySelector('#catalog-sort');
    const cs = ordina ? getComputedStyle(ordina) : null;
    const contenitore = ordina?.closest('label') || null;
    return {
      catalogSorting: quanti('.catalog-sorting'),
      catalogSortingNelCss: [...document.styleSheets].flatMap((f) => { try { return [...f.cssRules].map((r) => r.selectorText || ''); } catch { return []; } }).filter((s) => s && s.includes('catalog-sorting')),
      catalogSort: quanti('.catalog-sort'),
      ordina: ordina ? { w: Math.round(ordina.getBoundingClientRect().width), maxWidth: cs.maxWidth, minWidth: cs.minWidth, testo: ordina.selectedOptions?.[0]?.text } : null,
      etichettaOrdina: contenitore ? { cls: contenitore.className, w: Math.round(contenitore.getBoundingClientRect().width), maxWidth: getComputedStyle(contenitore).maxWidth } : null,
      calmSelect: quanti('.calm-control--select'),
      // E il select dell'ordine, quando la scena del catalogo è accesa: chi lo veste, e quanto è largo.
      ordineCalm: (() => {
        const s = document.querySelector('#catalog-sort');
        if (!s) return null;
        const pannello = s.closest('[hidden]') || s.closest('section,div[data-scene]');
        const calm = pannello?.querySelector('.calm-control--select') || null;
        const cs = calm ? getComputedStyle(calm) : null;
        return {
          vestitoDa: s.className, dentroQuale: s.closest('label')?.className,
          pannelloNascosto: Boolean(s.closest('[hidden]')),
          paneW: pannello ? Math.round(pannello.getBoundingClientRect().width) : null,
          calmW: calm ? Math.round(calm.getBoundingClientRect().width) : null,
          calmMaxWidth: cs?.maxWidth, calmWidth: cs?.width,
          regolaVincente: [...document.styleSheets].flatMap((f) => { try { return [...f.cssRules]; } catch { return []; } }).filter((r) => r.selectorText && /catalog-sort/.test(r.selectorText)).map((r) => `${r.selectorText}{${r.style.cssText}}`),
        };
      })(),
    };
  });
  console.log('P6 ' + breve(esito));
  // La regola C'È nel foglio del mockup, ma non ha nessun elemento a cui applicarsi…
  expect(esito.catalogSortingNelCss, 'la regola `.catalog-sorting` non è nemmeno nel foglio del mockup').toContain('.catalog-sorting .calm-control');
  expect(esito.catalogSorting, 'la regola `.catalog-sorting .calm-control` ha trovato un elemento: la misura va rifatta').toBe(0);
  // …e il controllo dell'ordine del mockup è un altro, con un altro numero.
  expect(esito.catalogSort, 'il controllo dell’ordine del mockup è `.catalog-sort`').toBe(1);
  expect(esito.ordina.maxWidth, 'il numero del mockup per il controllo dell’ordine').toBe('245px');
});
