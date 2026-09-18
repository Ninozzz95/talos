/*
 * REVIEW AVVERSARIA — 18/09/2026, commit `bb148037` (la × dentro il campo) e `be736bc9`
 * (la regola delle faccette). File NUOVO, temporaneo, creato dal revisore.
 * NON tocca nessun sorgente e nessuna prova esistente.
 *
 * Fonti consultate prima di scrivere (regola di casa: ricerca PRIMA):
 *  · W3C, «Understanding SC 2.5.8 Target Size (Minimum)» — 24×24 CSS px minimi; un controllo
 *    piccolo sopra un bersaglio grande passa SOLO se è lui stesso ≥24×24.
 *  · Stack Overflow «How to get the clear 'X' button inside the input field?» + php.cn
 *    «How to accurately locate the icon in the search bar» — wrapper `position:relative` +
 *    bottone `position:absolute` + `padding-inline-end` di riserva (32-48 px negli esempi).
 *  · Chromium code review 15838011 — la × nativa si disegna rispetto all'input.
 *  · care_fe PR #13737 e Compiler PR #1081 — due riparazioni reali di «cross icon overlapping text».
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const breve = (o) => JSON.stringify(o);

async function apriImpostazioni(page, sezione = 'appearance') {
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} }));
  });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
}

/** La porta di OGGI: la scheda del guscio si chiama «Hugging Face» (il port l'ha rinominata). */
async function apriLaboratorio(page) {
  await apriImpostazioni(page, 'models');
  await page.getByRole('tab', { name: 'Laboratorio modelli', exact: true }).click();
  await page.getByRole('tab', { name: 'Hugging Face', exact: true }).click();
  await expect(page.locator('.talos-toolbar--hf')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/*
 * ==========================================================================
 * R5 — LA RIGA DELLE FACCETTE: com'è fatta DAVVERO (misure, non letture).
 * ==========================================================================
 */
test('R5 · la riga delle faccette: figli, larghezze, troncamenti', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriLaboratorio(page);
  const riga = await page.evaluate(() => {
    const r = document.querySelector('.talos-toolbar--hf');
    const cs = getComputedStyle(r);
    const misura = (el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        tag: el.tagName, id: el.id, cls: String(el.className),
        w: Math.round(b.width), h: Math.round(b.height),
        flex: `${s.flexGrow} ${s.flexShrink} ${s.flexBasis}`, minW: s.minWidth,
        tronca: el.scrollWidth > el.clientWidth + 1,
        testo: (el.textContent || '').trim().slice(0, 30),
      };
    };
    return {
      rigaW: Math.round(r.getBoundingClientRect().width), wrap: cs.flexWrap,
      figli: [...r.children].map(misura),
      calm: [...r.querySelectorAll('.calm-control--select')].map(misura),
      dentro: [...r.querySelectorAll('.calm-control--select *')].map((el) => ({
        tag: el.tagName, cls: String(el.className), w: Math.round(el.getBoundingClientRect().width),
        scrollW: el.scrollWidth, clientW: el.clientWidth, tronca: el.scrollWidth > el.clientWidth + 1,
        testo: (el.textContent || '').trim().slice(0, 30), ws: getComputedStyle(el).whiteSpace, ov: getComputedStyle(el).overflow,
      })),
    };
  });
  for (const f of riga.figli) console.log('R5-figlio ' + breve(f));
  for (const f of riga.calm) console.log('R5-calm ' + breve(f));
  for (const f of riga.dentro) console.log('R5-dentro ' + breve(f));
  console.log('R5-riga ' + breve({ rigaW: riga.rigaW, wrap: riga.wrap, nCalm: riga.calm.length }));
});

/*
 * ==========================================================================
 * R6 — L'ETICHETTA PIÙ LUNGA DEL SELETTORE DELL'ORDINE, a 150 px.
 * Ipotesi: la cura inchioda il controllo a 150 px; «Aggiornati di recente» è
 * l'opzione più lunga. Prima della cura il controllo cresceva con lo spazio che
 * avanzava, quindi la stringa lunga entrava SEMPRE. Ora?
 * ==========================================================================
 */
test('R6 · l’etichetta più lunga dell’ordine entra nei 150 px?', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriLaboratorio(page);
  const leggi = () => page.evaluate(() => {
    const c = document.querySelector('.talos-toolbar--hf .calm-control--select');
    const v = c.querySelector('.calm-select__value');
    const tela = document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(v);
    tela.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return {
      controllo: Math.round(c.getBoundingClientRect().width),
      valore: (v.textContent || '').trim(),
      w: Math.round(v.getBoundingClientRect().width),
      serve: Math.round(tela.measureText((v.textContent || '').trim()).width),
      scrollW: v.scrollWidth, clientW: v.clientWidth,
      tagliato: v.scrollWidth > v.clientWidth + 1,
    };
  });
  const opzioni = await page.$$eval('#modelLabHfSortControl option', (o) => o.map((e) => ({ v: e.value, t: e.text })));
  const esito = [];
  for (const o of opzioni) {
    /* ⛔ La porta vera: il select nativo non è visibile (è vestito), quindi `force`.
       Passare da `selectOption` e non da `sel.value = …` perché è il percorso che il
       componente ascolta davvero — con l'assegnazione diretta l'etichetta NON cambiava. */
    await page.selectOption('#modelLabHfSortControl', o.v, { force: true });
    await page.waitForTimeout(150);
    esito.push({ opzione: o.t, ...(await leggi()) });
  }
  expect(esito[esito.length - 1].valore, 'la porta non ha cambiato l’etichetta: la misura sotto è falsa').toContain('Aggiornati');
  for (const e of esito) console.log('R6 ' + breve(e));
  // La FOTO del difetto, con l'etichetta lunga selezionata: la misura da sola non mostra
  // cosa vede l'occhio (ellissi o testo tagliato a metà).
  await page.locator('.talos-toolbar--hf').screenshot({ path: path.join(process.env.TEMP, 'review-cure-ordine-tagliato.png') });
  await page.locator('.talos-toolbar--hf .calm-control--select').screenshot({ path: path.join(process.env.TEMP, 'review-cure-ordine-solo.png') });

  // ⛔ L'A/B: si toglie la regola nuova dal CSSOM e si rimisura la STESSA etichetta.
  const tolte = await page.evaluate(() => {
    let n = 0;
    for (const foglio of document.styleSheets) {
      let regole; try { regole = foglio.cssRules; } catch { continue; }
      if (!regole) continue;
      for (let i = regole.length - 1; i >= 0; i -= 1) {
        if (regole[i].selectorText === '.talos-toolbar--hf .calm-control--select') { foglio.deleteRule(i); n += 1; }
      }
    }
    return n;
  });
  await page.waitForTimeout(250);
  const prima = await leggi();
  console.log('R6-prima ' + breve({ tolte, ...prima }));

  // Il verso che deve essere vero: l'opzione più lunga non deve essere tagliata.
  const lungo = esito.find((e) => e.opzione.startsWith('Aggiornati'));
  expect(lungo, 'l’opzione «Aggiornati di recente» non esiste più').toBeTruthy();
  expect(prima.tagliato, `l’A/B non è riprodotto: senza la regola l’etichetta è tagliata lo stesso: ${breve(prima)}`).toBe(false);
  expect(lungo.tagliato, `l’etichetta «${lungo.valore}» è TAGLIATA a ${lungo.controllo} px (serve ${lungo.serve} px, ne ha ${lungo.w}): ${breve(lungo)}`).toBe(false);
  expect(lungo.serve, `il testo non entra davvero: ${breve(lungo)}`).toBeLessThanOrEqual(lungo.w);
});

/*
 * ==========================================================================
 * R7 — L'A/B DELLA REGOLA DELLE FACCETTE: il difetto esisteva PRIMA?
 * Si cancella la regola dal CSSOM (come fa `_review-barra.spec.mjs` con RIGHE_PRIMA)
 * e si rimisura tutto: riga, campo, selettore, e il segnaposto.
 * ==========================================================================
 */
test('R7 · A/B delle faccette: senza la regola nuova il segnaposto è tagliato?', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriLaboratorio(page);
  const misura = () => page.evaluate(() => {
    const r = document.querySelector('.talos-toolbar--hf');
    const campo = document.getElementById('modelLabHfSearch');
    const cs = getComputedStyle(campo);
    const tela = document.createElement('canvas').getContext('2d');
    tela.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const serve = tela.measureText(campo.placeholder).width;
    const utile = campo.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
    const sel = document.querySelector('.talos-toolbar--hf .calm-control--select');
    return {
      riga: Math.round(r.getBoundingClientRect().width),
      campo: Math.round(campo.getBoundingClientRect().width), utile: Math.round(utile),
      segnaposto: campo.placeholder, serve: Math.round(serve), tagliato: serve > utile,
      ordine: sel ? Math.round(sel.getBoundingClientRect().width) : null,
    };
  });
  const dopo = await misura();
  const tolte = await page.evaluate(() => {
    let n = 0;
    for (const foglio of document.styleSheets) {
      let regole; try { regole = foglio.cssRules; } catch { continue; }
      if (!regole) continue;
      for (let i = regole.length - 1; i >= 0; i -= 1) {
        if (regole[i].selectorText === '.talos-toolbar--hf .calm-control--select') { foglio.deleteRule(i); n += 1; }
      }
    }
    return n;
  });
  await page.waitForTimeout(250);
  const prima = await misura();
  console.log('R7-dopo  ' + breve({ tolte, ...dopo }));
  console.log('R7-prima ' + breve({ tolte, ...prima }));
  // Il verso che deve essere vero: la regola nuova deve CAMBIARE qualcosa (altrimenti è inerte).
  expect(tolte, 'la regola nuova non è nel CSS servito: cura INERTE').toBeGreaterThan(0);
  expect(prima.campo, 'senza la regola il campo non cambia: la regola non tocca questa riga').not.toBe(dopo.campo);
  // E il difetto dichiarato nel commit: senza la regola il segnaposto NON ci sta.
  expect(prima.tagliato, `il segnaposto dichiarato tagliato non lo è: ${breve(prima)}`).toBe(true);
  expect(dopo.tagliato, `con la cura il segnaposto è ancora tagliato: ${breve(dopo)}`).toBe(false);
});

/*
 * ==========================================================================
 * R3 — LA × DENTRO IL CAMPO A LARGHEZZE STRETTE (a campo PIENO, non vuoto).
 * ==========================================================================
 */
test('R3 · la × a 1024/660/390 px, con testo dentro', async ({ page }) => {
  for (const larghezza of [1024, 660, 390]) {
    // ⛔ Si entra LARGHI e poi si stringe: sotto i 900 px la barra laterale sparisce e la
    //    porta delle impostazioni non è più cliccabile — è il layout, non un difetto.
    await page.setViewportSize({ width: 1280, height: 900 });
    await apriImpostazioni(page, 'appearance');
    await page.setViewportSize({ width: larghezza, height: 900 });
    await page.locator('#settingsSearch').fill('tema');
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const campo = document.querySelector('#settingsSearch');
      const clear = document.querySelector('[data-settings-clear]');
      const a = campo.getBoundingClientRect();
      const c = clear.getBoundingClientRect();
      const cs = getComputedStyle(campo);
      return {
        campoW: Math.round(a.width), campoH: Math.round(a.height), x: `${Math.round(c.width)}x${Math.round(c.height)}`,
        dentro: c.left >= a.left - 1 && c.right <= a.right + 1 && c.top >= a.top - 1 && c.bottom <= a.bottom + 1,
        sopraIlTesto: Math.round((a.right - Number.parseFloat(cs.borderRightWidth) - Number.parseFloat(cs.paddingRight)) - c.left),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        display: getComputedStyle(clear).display,
      };
    });
    console.log(`R3@${larghezza} ` + breve(m));
    expect(m.dentro, `a ${larghezza} px la × esce dal campo: ${breve(m)}`).toBe(true);
    expect(m.display, `a ${larghezza} px la × non è disegnata`).toBe('grid');
    expect(m.sopraIlTesto, `a ${larghezza} px la × invade la fascia del testo`).toBeLessThanOrEqual(0);
    expect(m.overflowX, `a ${larghezza} px la pagina scorre in orizzontale`).toBe(false);
  }
});

/*
 * ==========================================================================
 * R8 — LA × COL CARATTERE INGRANDITO (200%) E A DIMENSIONI DI TESTO AL 200%.
 * ==========================================================================
 */
test('R8 · la × col carattere al 200%', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriImpostazioni(page, 'appearance');
  const esito = await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
    document.documentElement.style.setProperty('--talos-font-scale', '2');
    const campo = document.querySelector('#settingsSearch');
    campo.value = 'tema chiaro scuro';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    const clear = document.querySelector('[data-settings-clear]');
    const a = campo.getBoundingClientRect();
    const c = clear.getBoundingClientRect();
    const cs = getComputedStyle(campo);
    return {
      campoH: Math.round(a.height), x: `${Math.round(c.width)}x${Math.round(c.height)}`,
      dentro: c.left >= a.left - 1 && c.right <= a.right + 1 && c.top >= a.top - 1 && c.bottom <= a.bottom + 1,
      centroY: Math.abs((c.top + c.bottom) / 2 - (a.top + a.bottom) / 2),
      sopraIlTesto: Math.round((a.right - Number.parseFloat(cs.borderRightWidth) - Number.parseFloat(cs.paddingRight)) - c.left),
      paddingRight: cs.paddingRight, fontSize: cs.fontSize,
    };
  });
  console.log('R8 ' + breve(esito));
  expect(esito.dentro, `col carattere al 200% la × esce dal campo: ${breve(esito)}`).toBe(true);
  expect(esito.centroY, 'la × non è più centrata col carattere al 200%').toBeLessThanOrEqual(1);
});

/*
 * ==========================================================================
 * R9 — TASTIERA: la × è raggiungibile, ha un nome, e il clic riporta il fuoco.
 * ==========================================================================
 */
test('R9 · la × da tastiera', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const campo = page.locator('#settingsSearch');
  await campo.click();
  await campo.fill('tema');
  await page.keyboard.press('Tab');
  const fuoco = await page.evaluate(() => {
    const el = document.activeElement;
    return { cls: el ? String(el.className) : null, nome: el ? el.getAttribute('aria-label') : null };
  });
  console.log('R9-fuoco ' + breve(fuoco));
  expect(fuoco.cls, 'il Tab dal campo non arriva alla ×').toContain('settings-search__clear');
  await page.keyboard.press('Enter');
  const dopo = await page.evaluate(() => ({
    valore: document.querySelector('#settingsSearch').value,
    fuoco: String(document.activeElement?.id || document.activeElement?.className),
    xNascosta: getComputedStyle(document.querySelector('[data-settings-clear]')).display,
  }));
  console.log('R9-dopo ' + breve(dopo));
  expect(dopo.valore, 'Invio sulla × non svuota il campo').toBe('');
  expect(dopo.fuoco, 'dopo la × il fuoco non torna al campo').toContain('settingsSearch');
  expect(dopo.xNascosta, 'la × resta disegnata a campo vuoto').toBe('none');
});

/*
 * ==========================================================================
 * R10 — COLORI FORZATI: la × si vede ancora?
 * ==========================================================================
 */
test('R10 · la × in forced-colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await apriImpostazioni(page, 'appearance');
  await page.locator('#settingsSearch').fill('tema');
  const m = await page.evaluate(() => {
    const clear = document.querySelector('[data-settings-clear]');
    const svg = clear.querySelector('svg');
    const cs = getComputedStyle(clear);
    const s = getComputedStyle(svg);
    return {
      display: cs.display, colore: cs.color, fondo: cs.backgroundColor, bordo: cs.borderTopWidth,
      svgW: s.width, svgH: s.height, stroke: s.stroke,
      scatola: (() => { const b = svg.getBBox ? svg.getBBox() : null; return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; })(),
    };
  });
  console.log('R10 ' + breve(m));
  expect(m.display, 'in forced-colors la × non è disegnata').toBe('grid');
  expect(m.scatola?.w ?? 0, `l’icona della × non disegna nulla in forced-colors: ${breve(m)}`).toBeGreaterThan(0);
});

/*
 * ==========================================================================
 * R11 — LA MISURA DELL'ICONA: `.settings-search__clear-icon` è una dichiarazione
 *   che VINCE, o la batte `.i { width: var(--talos-icon-size) }`?
 * ==========================================================================
 */
test('R11 · la misura dell’icona della × è quella dichiarata?', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  await page.locator('#settingsSearch').fill('tema');
  const m = await page.evaluate(() => {
    const clear = document.querySelector('[data-settings-clear]');
    const svg = clear.querySelector('svg');
    const s = getComputedStyle(svg);
    return { cls: svg.getAttribute('class'), w: s.width, h: s.height, usoReferenziato: svg.querySelector('use')?.getAttribute('href'), simboloEsiste: Boolean(document.getElementById((svg.querySelector('use')?.getAttribute('href') || '').slice(1))) };
  });
  console.log('R11 ' + breve(m));
  expect(m.simboloEsiste, `lo sprite della × non esiste: ${breve(m)}`).toBe(true);
});

/*
 * ==========================================================================
 * R13/R14 — LA MISURA GIUSTA E LA MISURA DI INTELAIATURA-10, SULLO STESSO STATO.
 *   R13 misura la POSIZIONE ASSOLUTA della prima voce (quello che l'occhio vede
 *   scendere); R14 misura il GAP che usa INTELAIATURA-10 (`voce.top - barra.bottom`).
 *   Le due prove si lanciano TALI E QUALI su due pacchetti: quello di oggi e quello
 *   ricostruito da `bb148037~1` (`%TEMP%/talos-phase1-review-cure-old`, vedi il
 *   comando nel referto). Il confronto fra i due giri è la prova.
 * ==========================================================================
 */
const misuraSalto = (page) => page.evaluate(() => {
  const barra = document.querySelector('#schermoImpostazioni .settings-toolbar').getBoundingClientRect();
  const voce = document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]').getBoundingClientRect();
  return { gap: Math.round(voce.top - barra.bottom), top: Math.round(voce.top), altezzaBarra: Math.round(barra.height) };
});

test('R13 · la POSIZIONE ASSOLUTA della prima voce non salta mentre si cerca', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const prima = await misuraSalto(page);
  await page.locator('#settingsSearch').fill('tema');
  const durante = await misuraSalto(page);
  console.log('R13 ' + breve({ prima, durante, saltoAssoluto: Math.abs(durante.top - prima.top), saltoBarra: Math.abs(durante.altezzaBarra - prima.altezzaBarra) }));
  expect(Math.abs(durante.top - prima.top), `la prima voce scende di ${durante.top - prima.top} px: ${breve({ prima, durante })}`).toBeLessThanOrEqual(8);
});

test('R14 · il GAP di INTELAIATURA-10 è cieco al salto', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const prima = await misuraSalto(page);
  await page.locator('#settingsSearch').fill('tema');
  const durante = await misuraSalto(page);
  console.log('R14 ' + breve({ prima, durante, gap: Math.abs(durante.gap - prima.gap), assoluto: Math.abs(durante.top - prima.top), barra: `${prima.altezzaBarra}->${durante.altezzaBarra}` }));
  // Questa È l'asserzione di INTELAIATURA-10, parola per parola. Se è verde anche quando
  // la barra cresce e la voce scende, allora non sta misurando il salto.
  expect(Math.abs(durante.gap - prima.gap), `gap ${durante.gap - prima.gap}`).toBeLessThanOrEqual(8);
});

/*
 * ==========================================================================
 * R19 — MENTRE SI CERCA, LA COLONNA È VUOTA?
 *   La foto della colonna a campo pieno mostra un blocco senza una riga di testo.
 *   Qui si misura cosa è disegnato nella colonna nei due stati, e si fotografa la
 *   PAGINA INTERA (non un ritaglio) per guardarla tutta.
 * ==========================================================================
 */
test('R19 · mentre si cerca, cosa resta disegnato nella colonna', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apriImpostazioni(page, 'appearance');
  const stato = () => page.evaluate(() => {
    const nav = document.querySelector('#schermoImpostazioni .settings-nav');
    const figli = [...nav.querySelectorAll('*')].map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, cls: String(el.className).slice(0, 40), visibile: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden', testo: (el.textContent || '').trim().slice(0, 24) };
    });
    const dentro = figli.filter((f) => f.visibile && f.testo);
    return {
      nav: `${Math.round(nav.getBoundingClientRect().width)}x${Math.round(nav.getBoundingClientRect().height)}`,
      vociVisibili: dentro.filter((f) => f.cls.includes('settings-nav__item')).length,
      cercatoreVisibile: Boolean(document.querySelector('#schermoImpostazioni .settings-toolbar')?.getBoundingClientRect().height),
      primiNodi: dentro.slice(0, 6),
    };
  });
  const senzaRicerca = await stato();
  await page.locator('#settingsSearch').fill('tema');
  await page.waitForTimeout(300);
  const conRicerca = await stato();
  console.log('R19-senza ' + breve(senzaRicerca));
  console.log('R19-con   ' + breve(conRicerca));
  await page.screenshot({ path: path.join(process.env.TEMP, 'review-cure-pagina-in-ricerca.png') });
  await page.locator('#settingsSearch').fill('');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(process.env.TEMP, 'review-cure-pagina-senza-ricerca.png') });
  expect(conRicerca.vociVisibili, `mentre si cerca la colonna resta senza voci: ${breve(conRicerca)}`).toBeGreaterThan(0);
});

/*
 * ==========================================================================
 * R18 — LA CURA, MISURATA: 220 px invece di 150. Qui si prova a 220 px, in pagina,
 *   sulle DUE cose che contano insieme: l'etichetta più lunga E il segnaposto del
 *   campo di ricerca.
 * ⛔ E IL 220 **NON È DEL MOCKUP** — questa intestazione lo diceva, ed era FALSO: il
 *   terzo revisore l'ha misurato alla fonte. Nel mockup `.catalog-sorting .calm-control`
 *   non matcha NESSUN elemento; il suo controllo dell'ordine è `.catalog-sort
 *   select{max-width:245px}` ed è largo 158 px nella scena viva. Il 220 si tiene perché
 *   è giusto **per noi**: 135 px di etichetta su 135 disponibili, e il campo resta largo.
 * ==========================================================================
 */
test('R18 · a 220 px entrano sia l’etichetta lunga sia il segnaposto', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriLaboratorio(page);
  await page.selectOption('#modelLabHfSortControl', 'updated', { force: true });
  await page.waitForTimeout(150);
  const leggi = () => page.evaluate(() => {
    const r = document.querySelector('.talos-toolbar--hf');
    const c = r.querySelector('.calm-control--select');
    const v = c.querySelector('.calm-select__value');
    const campo = document.getElementById('modelLabHfSearch');
    const cs = getComputedStyle(campo);
    const tela = document.createElement('canvas').getContext('2d');
    tela.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const serve = tela.measureText(campo.placeholder).width;
    const utile = campo.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
    return {
      ordine: Math.round(c.getBoundingClientRect().width),
      etichetta: v ? `${Math.round(v.getBoundingClientRect().width)}/${v.scrollWidth}` : null,
      etichettaTagliata: v ? v.scrollWidth > v.clientWidth + 1 : null,
      campo: Math.round(campo.getBoundingClientRect().width),
      segnapostoServe: Math.round(serve), segnapostoUtile: Math.round(utile), segnapostoTagliato: serve > utile,
    };
  });
  const ora = await leggi();
  await page.addStyleTag({ content: '.talos-toolbar--hf .calm-control--select{flex:0 0 220px !important}' });
  await page.waitForTimeout(200);
  const a220 = await leggi();
  console.log('R18-ora ' + breve(ora));
  console.log('R18-220 ' + breve(a220));
  expect(a220.etichettaTagliata, `a 220 px l’etichetta lunga è ancora tagliata: ${breve(a220)}`).toBe(false);
  expect(a220.segnapostoTagliato, `a 220 px il segnaposto si rompe: ${breve(a220)}`).toBe(false);
});

/*
 * ==========================================================================
 * R17 — LA GUARDIA NUOVA DI INTELAIATURA-06 È CIRCOLARE?
 *   La guardia è `if (colonna < intelaiatura - 1) { …campo < intelaiatura/2… }`.
 *   Ma «colonna < intelaiatura» è PROPRIO la cosa che la prova dovrebbe
 *   sorvegliare: una regressione che rendesse la colonna a tutta larghezza a
 *   desktop fa sparire l'asserzione invece di farla diventare rossa.
 *   Qui si regredisce il prodotto di proposito (`.talos-settings{display:block}`)
 *   e si leggono le DUE forme della stessa asserzione.
 * ==========================================================================
 */
test('R17 · la guardia di INTELAIATURA-06 fa sparire l’asserzione sotto regressione', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriImpostazioni(page, 'appearance');
  const misure = () => page.evaluate(() => {
    const c = document.querySelector('#settingsSearch');
    const col = c.closest('.settings-nav').getBoundingClientRect();
    const intel = c.closest('.talos-settings').getBoundingClientRect();
    const contenitore = c.closest('#schermoImpostazioni').getBoundingClientRect();
    return { campo: Math.round(c.getBoundingClientRect().width), colonna: Math.round(col.width), intelaiatura: Math.round(intel.width), display: getComputedStyle(c.closest('.talos-settings')).display, contenitore: Math.round(contenitore.width) };
  });
  const sane = await misure();
  await page.addStyleTag({ content: '.talos-settings{display:block !important}' });
  await page.waitForTimeout(250);
  const rotte = await misure();
  const formaVecchia = (m) => m.campo < m.intelaiatura / 2;
  /*
   * ⛔ LA GUARDIA NUOVA, come sta in `INTELAIATURA-06` dopo la seconda correzione (commit
   *   `a253687a`): sopra i **660 px di CONTENITORE** la disposizione DEVE essere `grid`, e il campo
   *   sta sotto metà intelaiatura. La forma della prima correzione (`colonna < intelaiatura - 1`)
   *   era **circolare**: si spegneva proprio nella regressione, e qui sotto lo si vede
   *   (`nuovaSuRotte` era `true`). Questa no: il contenitore resta 928 e la disposizione diventa
   *   `block` ⇒ la guardia morde.
   */
  const formaNuova = (m) => (m.contenitore > 660 ? m.display === 'grid' && m.campo < m.intelaiatura / 2 : true);
  console.log('R17 ' + breve({
    sane, rotte,
    vecchiaSuSane: formaVecchia(sane), nuovaSuSane: formaNuova(sane),
    vecchiaSuRotte: formaVecchia(rotte), nuovaSuRotte: formaNuova(rotte),
    campoVsColonna: rotte.campo <= rotte.colonna,
  }));
  expect(formaVecchia(sane), 'sul prodotto sano la forma senza guardia deve essere verde').toBe(true);
  expect(formaNuova(sane), 'sul prodotto sano la guardia nuova è verde').toBe(true);
  expect(formaVecchia(rotte), 'la forma senza guardia morde la regressione').toBe(false);
  // ⛔ Questa asserzione ERA `toBe(false)`: il revisore documentava che la guardia circolare taceva
  //    sulla regressione. Adesso pretende l'opposto, perché la guardia è stata corretta: se
  //    qualcuno la rende di nuovo circolare, è qui che diventa rossa.
  expect(formaNuova(rotte), `la guardia nuova DEVE mordere la stessa regressione (${breve(rotte)})`).toBe(false);
});

/*
 * ==========================================================================
 * R16 — SOTTO I 660 px DI CONTENITORE LA PROVA DIVENTA VACUA.
 *   `@container settings (max-width: 660px) { .settings-nav__list { display: none } }`:
 *   la voce che INTELAIATURA-10 misura ha rettangolo 0×0, e 0 - 0 = 0 ⇒ verde per
 *   costruzione. INTELAIATURA-06 ha ricevuto una guardia di contenitore in questo
 *   commit; INTELAIATURA-10 no.
 * ==========================================================================
 */
test('R16 · sotto i 660 px di contenitore la metrica di INTELAIATURA-10 è 0 su 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriImpostazioni(page, 'appearance');
  await page.setViewportSize({ width: 560, height: 900 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const lista = document.querySelector('#schermoImpostazioni .settings-nav__list');
    const voce = document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]');
    const barra = document.querySelector('#schermoImpostazioni .settings-toolbar');
    return {
      listaDisplay: lista ? getComputedStyle(lista).display : null,
      voce: voce ? JSON.stringify(voce.getBoundingClientRect().toJSON()).slice(0, 0) || `${Math.round(voce.getBoundingClientRect().width)}x${Math.round(voce.getBoundingClientRect().height)}` : null,
      voceTop: voce ? Math.round(voce.getBoundingClientRect().top) : null,
      barraBottom: barra ? Math.round(barra.getBoundingClientRect().bottom) : null,
      mobileNav: getComputedStyle(document.querySelector('.settings-mobile-nav')).display,
    };
  });
  console.log('R16 ' + breve(m));
  expect(m.listaDisplay, 'sotto i 660 px la lista resta disegnata: la prova NON è vacua').toBe('none');
  expect(m.voceTop, 'la voce non ha rettangolo: la metrica è 0 su 0').toBe(0);
});

/*
 * ==========================================================================
 * R15 — TEMA CHIARO E SCURO: la × si vede in tutti e due?
 * ==========================================================================
 */
test('R15 · la × nei due temi, col contrasto calcolato', async ({ page }) => {
  for (const modo of ['dark', 'light']) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((m) => {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: m }, chat: {}, workspaces: {} }));
    }, modo);
    await page.goto('/');
    await page.evaluate(() => {
      const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
      const gruppo = voce?.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
      voce?.click();
      window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false });
    });
    await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
    await page.locator('#settingsSearch').fill('tema');
    const m = await page.evaluate(() => {
      const num = (c) => (c.match(/\d+(\.\d+)?/g) || []).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const fondo = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; const a = num(c); if (a.length >= 3 && (a[3] === undefined || a[3] > 0)) return a.slice(0, 3); n = n.parentElement; } return [255, 255, 255]; };
      const clear = document.querySelector('[data-settings-clear]');
      const svg = clear.querySelector('svg');
      const primo = num(getComputedStyle(clear).color).slice(0, 3);
      const secondo = num(getComputedStyle(svg).stroke === 'none' ? getComputedStyle(clear).color : getComputedStyle(svg).stroke).slice(0, 3);
      const f1 = lum(primo); const f2 = lum(secondo); const fb = lum(fondo(clear));
      const rapporto = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const r = clear.getBoundingClientRect();
      return {
        tema: getComputedStyle(document.documentElement).getPropertyValue('--talos-muted').trim(),
        colore: getComputedStyle(clear).color, stroke: getComputedStyle(svg).stroke,
        fondo: `rgb(${fondo(clear).join(',')})`,
        contrastoBottone: Math.round(rapporto(f1, fb) * 100) / 100,
        contrastoIcona: Math.round(rapporto(f2, fb) * 100) / 100,
        misura: `${Math.round(r.width)}x${Math.round(r.height)}`,
      };
    });
    console.log(`R15-${modo} ` + breve(m));
    // ⛔ L'OCCHIO, non solo il numero: la colonna col cercatore e la × dentro il campo,
    //    in tutti e due i temi, da guardare TUTTA (la regola del taccuino).
    await page.locator('#schermoImpostazioni .settings-nav').screenshot({ path: path.join(process.env.TEMP, `review-cure-cercatore-${modo}.png`) });
    // WCAG 1.4.11 (non-text contrast) per un componente di interfaccia: 3:1.
    expect(m.contrastoIcona, `nel tema ${modo} la × ha contrasto ${m.contrastoIcona}:1, sotto il 3:1 di WCAG 1.4.11`).toBeGreaterThanOrEqual(3);
  }
});

/*
 * ==========================================================================
 * R12 — L'INTELAIATURA-10 MORDE PER LA RAGIONE GIUSTA?
 *   La sua metrica è `voce.top - barra.bottom` (un GAP). Un gap non cambia se
 *   la barra va a capo: cambiano le POSIZIONI ASSOLUTE. Qui si misura la
 *   differenza fra le due metriche sullo stato VECCHIO ricostruito.
 * ==========================================================================
 */
test('R12 · la metrica di INTELAIATURA-10 è cieca al salto?', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriImpostazioni(page, 'appearance');
  const esito = await page.evaluate(() => {
    const barra = () => document.querySelector('#schermoImpostazioni .settings-toolbar');
    const voce = () => document.querySelector('#schermoImpostazioni .settings-nav__list [role="tab"]');
    const gap = () => Math.round(voce().getBoundingClientRect().top - barra().getBoundingClientRect().bottom);
    const assoluto = () => Math.round(voce().getBoundingClientRect().top);
    const campo = document.querySelector('#settingsSearch');
    const clear = document.querySelector('[data-settings-clear]');

    // Stato NUOVO, a campo pieno.
    campo.value = 'tema'; campo.dispatchEvent(new Event('input', { bubbles: true }));
    const nuovo = { gap: gap(), top: assoluto(), barra: Math.round(barra().getBoundingClientRect().height) };

    // Stato VECCHIO ricostruito: le regole di `4b4c753b` rimesse a mano e il nodo accanto al campo.
    const vecchie = document.createElement('style');
    vecchie.textContent = '.settings-toolbar{flex-wrap:wrap;gap:8px}.settings-search-field{display:block;position:static}.settings-search{flex:1 1 150px}';
    document.head.append(vecchie);
    clear.className = 'talos-button talos-button--secondary';
    clear.textContent = 'Cancella ricerca';
    clear.hidden = true;
    barra().append(clear);
    const vuoto = { gap: gap(), top: assoluto(), barra: Math.round(barra().getBoundingClientRect().height) };
    clear.hidden = false;
    const pieno = { gap: gap(), top: assoluto(), barra: Math.round(barra().getBoundingClientRect().height) };
    vecchie.remove();
    return {
      nuovo, vuoto, pieno,
      gapVecchio: Math.abs(pieno.gap - vuoto.gap), topVecchio: Math.abs(pieno.top - vuoto.top),
      barraCresciuta: pieno.barra - vuoto.barra,
    };
  });
  console.log('R12 ' + breve(esito));
  expect(esito.barraCresciuta, `la ricostruzione dello stato vecchio non fa crescere la barra: A/B non riprodotto (${breve(esito)})`).toBeGreaterThan(20);
  /*
   * ⛔ QUESTA ASSERZIONE ERA `gapVecchio > 8`, cioè «la metrica di INTELAIATURA-10 vede il salto».
   *   Era il difetto del revisore, e adesso è la sua documentazione: la metrica del **GAP** è
   *   cieca (0 px su un salto di 48) ed è il motivo per cui `INTELAIATURA-10` è stata riscritta
   *   sull'ALTEZZA DELLA BARRA e sulla posizione relativa. Se qualcuno tornasse al gap, la prima
   *   asserzione resta verde e la seconda diventa rossa.
   */
  expect(esito.gapVecchio, `la metrica del GAP deve restare cieca al salto: è il difetto documentato (${breve(esito)})`).toBeLessThanOrEqual(8);
  expect(esito.topVecchio, `la posizione relativa vede il salto di 48 px: le metriche nuove mordono (${breve(esito)})`).toBeGreaterThan(8);
});
