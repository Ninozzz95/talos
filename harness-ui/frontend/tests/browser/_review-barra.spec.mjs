/*
 * REVIEW AVVERSARIA — 18/09/2026, commit 4b4c753b «la barra di ricerca scende in sidebar».
 * File NUOVO, temporaneo, creato dal revisore. Non tocca le prove esistenti.
 */
import { expect, test } from '@playwright/test';

async function apriImpostazioni(page, sezione = 'appearance') {
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
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
  // ⛔ Il velo d'avvio copre TUTTO: una foto scattata prima che sparisca mostra lo splash,
  //   non la schermata — è la trappola della «foto di una superficie non ancora montata».
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
}

const STRUMENTO = () => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const ell = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { testo: (el.textContent || '').trim(), w: Math.round(el.getBoundingClientRect().width), scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight, ws: cs.whiteSpace, fs: cs.fontSize, troncato: el.scrollWidth > el.clientWidth + 1, righeVisibili: Math.round(el.clientHeight / Number.parseFloat(cs.lineHeight || cs.fontSize)) }; };
  const nav = document.querySelector('.settings-nav');
  const toolbar = document.querySelector('.settings-toolbar');
  const campo = document.querySelector('#settingsSearch');
  const bottone = document.querySelector('[data-settings-open-search]');
  return {
    nav: box(nav), toolbar: box(toolbar), campo: box(campo),
    bottone: box(bottone),
    etichettaBottone: ell(bottone?.querySelector('.talos-nav-item__label')),
    primaVoce: box(document.querySelector('.settings-nav__list [data-settings-tab="appearance"]')),
    kbd: box(bottone?.querySelector('kbd')),
  };
};

/** Cancella dal CSSOM le TRE regole che questo commit ha aggiunto per la riga del cercatore:
 *  è la riproduzione fedele dello stato precedente (quelle tre non sostituivano nulla). */
const RIGHE_PRIMA = () => {
  const nuovi = [
    '#schermoImpostazioni .talos-settings__nav .settings-nav__search.talos-nav-item',
    '#schermoImpostazioni .talos-settings__nav .settings-nav__search .talos-nav-item__label',
    '#schermoImpostazioni .talos-settings__nav .settings-nav__search .settings-nav__kbd',
  ];
  let tolte = 0;
  for (const foglio of document.styleSheets) {
    let regole; try { regole = foglio.cssRules; } catch { continue; }
    if (!regole) continue;
    for (let i = regole.length - 1; i >= 0; i -= 1) {
      const sel = regole[i].selectorText;
      if (sel && nuovi.includes(sel)) { foglio.deleteRule(i); tolte += 1; }
    }
  }
  return tolte;
};

test('R-A · il segnaposto del campo e l’etichetta del bottone: DENTRO o TRONCATI', async ({ page }) => {
  await apriImpostazioni(page);
  const campo = page.locator('#settingsSearch');
  const b = page.locator('[data-settings-open-search]');
  for (const w of [1280, 1100, 1024, 900, 700]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const d = await page.evaluate(STRUMENTO);
    // Quanto serve davvero al segnaposto, misurato nella font vera
    const serveSegnaposto = await page.evaluate(() => {
      const c = document.querySelector('#settingsSearch');
      const cs = getComputedStyle(c);
      const m = document.createElement('span');
      m.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};`;
      m.textContent = c.placeholder; document.body.append(m);
      const w = m.getBoundingClientRect().width; m.remove();
      const utile = c.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
      return { serve: Math.round(w), utile: Math.round(utile), sta: w <= utile };
    });
    console.log(`R-A-${w} ` + JSON.stringify({ campo: d.campo.w, etichetta: d.etichettaBottone, bottone: d.bottone, kbd: d.kbd, serveSegnaposto }));
  }
  await expect(campo).toBeVisible();
  await expect(b).toBeVisible();
});

test('R-B · A/B dell’etichetta del cercatore a 1100px: prima (righe cancellate) contro adesso', async ({ page }) => {
  await apriImpostazioni(page);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(200);
  const adesso = await page.evaluate(STRUMENTO);
  await page.screenshot({ path: 'artifacts/review-barra/AB-1100-adesso.png' });
  const tolte = await page.evaluate(RIGHE_PRIMA);
  await page.waitForTimeout(250);
  const prima = await page.evaluate(STRUMENTO);
  await page.screenshot({ path: 'artifacts/review-barra/AB-1100-prima.png' });
  console.log('R-B ' + JSON.stringify({ regoleTolte: tolte, adesso: { etichetta: adesso.etichettaBottone, bottone: adesso.bottone, kbd: adesso.kbd }, prima: { etichetta: prima.etichettaBottone, bottone: prima.bottone, kbd: prima.kbd } }, null, 1));
  expect(tolte, 'le tre regole nuove devono esistere per poterle togliere').toBe(3);
});

test('R-C · il salto della colonna quando compare «Cancella ricerca»', async ({ page }) => {
  await apriImpostazioni(page);
  // Misura RELATIVA alla barra: immune allo scorrimento di pagina che `fill()` provoca.
  const scarto = () => page.evaluate(() => {
    const t = document.querySelector('.settings-toolbar').getBoundingClientRect();
    const v = document.querySelector('.settings-nav__list [data-settings-tab="appearance"]').getBoundingClientRect();
    const c = document.querySelector('[data-settings-clear]').getBoundingClientRect();
    return { barra: Math.round(t.height), distanza: Math.round(v.top - t.top), clearAltezza: Math.round(c.height), clearLarghezza: Math.round(c.width) };
  });
  const prima = await scarto();
  await page.locator('#settingsSearch').fill('elastica');
  await page.waitForTimeout(300);
  const dopo = await scarto();
  console.log('R-C ' + JSON.stringify({ prima, dopo, salto: dopo.distanza - prima.distanza, barraCresce: dopo.barra - prima.barra }));
  await page.screenshot({ path: 'artifacts/review-barra/colonna-in-ricerca.png' });
  // LA MISURA: la prima voce non deve saltare in giù quando si scrive nella barra.
  expect(dopo.distanza - prima.distanza, 'la colonna salta in giù quando compare «Cancella ricerca»').toBeLessThanOrEqual(8);
});

test('R-C-bis · A/B dello stesso salto con la barra al posto di PRIMA (blocco di pagina)', async ({ page }) => {
  await apriImpostazioni(page);
  // La barra torna dove stava prima di questo commit: figlia di `.talos-page`, prima di `.talos-settings`.
  const spostata = await page.evaluate(() => {
    const t = document.querySelector('.settings-toolbar');
    const pagina = document.querySelector('#schermoImpostazioni > .talos-page');
    const layout = document.querySelector('#schermoImpostazioni .talos-settings');
    if (!t || !pagina || !layout) return false;
    pagina.insertBefore(t, layout);
    return t.parentElement === pagina;
  });
  const scarto = () => page.evaluate(() => {
    const t = document.querySelector('.settings-toolbar').getBoundingClientRect();
    const v = document.querySelector('.settings-nav__list [data-settings-tab="appearance"]').getBoundingClientRect();
    return { barra: Math.round(t.height), distanza: Math.round(v.top - t.top) };
  });
  const prima = await scarto();
  await page.locator('#settingsSearch').fill('elastica');
  await page.waitForTimeout(300);
  const dopo = await scarto();
  console.log('R-C-bis ' + JSON.stringify({ spostata, prima, dopo, salto: dopo.distanza - prima.distanza, barraCresce: dopo.barra - prima.barra }));
  expect(spostata, 'la barra deve poter tornare al posto di prima').toBe(true);
});

test('R-D · A/B del campo a 660 di contenitore: dentro la colonna o a tutta larghezza', async ({ page }) => {
  await apriImpostazioni(page);
  await page.setViewportSize({ width: Number(process.env.R_D_LARGHEZZA || 700), height: 900 });
  await page.waitForTimeout(250);
  const misure = await page.evaluate(() => {
    const c = document.querySelector('#settingsSearch');
    const col = c.closest('.settings-nav').getBoundingClientRect();
    const intel = c.closest('.talos-settings').getBoundingClientRect();
    return { campo: Math.round(c.getBoundingClientRect().width), colonna: Math.round(col.width), intelaiatura: Math.round(intel.width), larghezzaFinestra: window.innerWidth };
  });
  console.log('R-D ' + JSON.stringify(misure));
  // Questa è ESATTAMENTE l'asserzione (b) di INTELAIATURA-06 riga 150 — su una finestra da 700px
  expect(misure.campo, 'la barra è tornata a tutta larghezza: ' + JSON.stringify(misure)).toBeLessThan(misure.intelaiatura / 2);
  // E questa è l'asserzione (b) letta come la legge il prodotto: la barra NON sfonda la colonna
  expect(misure.campo, 'il campo non può sfondare la colonna').toBeLessThanOrEqual(misure.colonna);
});

test('R-F · il <search> è davvero una landmark di ricerca nell’albero di accessibilità', async ({ page }) => {
  await apriImpostazioni(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const rilevanti = nodes
    .filter((n) => ['search', 'navigation', 'searchbox'].includes(n.role?.value))
    .map((n) => ({ role: n.role?.value, name: n.name?.value, ignorato: n.ignored }));
  console.log('R-F ' + JSON.stringify(rilevanti, null, 1));
  expect(rilevanti.some((r) => r.role === 'search'), 'la landmark di ricerca deve esistere nell’albero').toBe(true);
  expect(await page.locator('.settings-toolbar[role]').count(), 'nessun role ridondante sul <search>').toBe(0);
});

test('R-01 · al rimontaggio: nessun doppione, il campo resta VIVO, il filtro morde', async ({ page }) => {
  await apriImpostazioni(page);
  await page.evaluate(() => document.querySelector('#settingsRipristina').click());
  const conferma = page.locator('.td-detail-footer button', { hasText: 'Ripristina' });
  await expect(conferma).toHaveCount(1, { timeout: 5000 });
  await conferma.click();
  await page.waitForTimeout(700);
  const conteggi = await page.evaluate(() => ({
    toolbar: document.querySelectorAll('.settings-toolbar').length,
    search: document.querySelectorAll('search').length,
    campo: document.querySelectorAll('#settingsSearch').length,
    query: document.querySelectorAll('[data-settings-query]').length,
    dentroNav: document.querySelectorAll('.settings-nav .settings-toolbar').length,
    navBambini: [...document.querySelector('.settings-nav').children].map((e) => e.tagName),
  }));
  console.log('R-01-dopo-rimontaggio ' + JSON.stringify(conteggi));
  expect(conteggi.toolbar).toBe(1);
  expect(conteggi.search).toBe(1);
  expect(conteggi.campo).toBe(1);
  expect(conteggi.dentroNav).toBe(1);
  // VIVO: il campo nuovo filtra ancora davvero
  await page.locator('#settingsSearch').fill('elastica');
  await expect(page.locator('#settingsSearchResults .settings-result')).toHaveCount(1, { timeout: 5000 });
  // VIVO: «Cancella ricerca» cancella davvero e riporta la vista
  await page.locator('[data-settings-clear]').click();
  await expect(page.locator('#settingsSearchResults')).toBeHidden();
  expect(await page.locator('#settingsSearch').inputValue()).toBe('');
  // VIVO: Ctrl K con la barra in sidebar apre ancora la palette delle impostazioni
  await page.locator('.settings-nav__search').focus();
  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog.settings-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.settings-palette')).toBeHidden();
});

/** Le TRE asserzioni di INTELAIATURA-06 (righe 139-150 della prova ufficiale), ricopiate
 *  parola per parola, su una pagina in cui la barra è stata riportata al posto di PRIMA.
 *  Serve a rispondere a: «la prova nuova morde per la ragione giusta?». */
async function asserzioniIntelaiatura06(page) {
  const campo = page.locator('#settingsSearch');
  const dentroLaColonna = await campo.evaluate((el) => Boolean(el.closest('.settings-nav')));
  const misure = await campo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const nav = el.closest('.settings-nav');
    const intel = el.closest('.talos-settings');
    return { campo: Math.round(r.width), colonna: nav ? Math.round(nav.getBoundingClientRect().width) : null, intelaiatura: intel ? Math.round(intel.getBoundingClientRect().width) : null };
  });
  const esiti = [];
  if (dentroLaColonna !== true) esiti.push('(a) ROSSA: il campo di ricerca deve stare nella colonna delle sezioni');
  if (misure.colonna === null || !(misure.campo <= misure.colonna)) esiti.push('(a2) ROSSA: il campo non può sfondare la colonna ' + JSON.stringify(misure));
  if (!(misure.campo < misure.intelaiatura / 2)) esiti.push('(b) ROSSA: la barra è tornata a tutta larghezza: ' + JSON.stringify(misure));
  return { misure, esiti };
}

test('R-G · INTELAIATURA-06 morde davvero? la barra riportata al posto di prima', async ({ page }) => {
  await apriImpostazioni(page);
  console.log('R-G-come-sta-adesso ' + JSON.stringify(await asserzioniIntelaiatura06(page)));
  await page.evaluate(() => {
    const t = document.querySelector('.settings-toolbar');
    document.querySelector('#schermoImpostazioni > .talos-page').insertBefore(t, document.querySelector('#schermoImpostazioni .talos-settings'));
  });
  await page.waitForTimeout(200);
  const rotte = await asserzioniIntelaiatura06(page);
  console.log('R-G-barra-rimessa-nella-pagina ' + JSON.stringify(rotte));
  expect(rotte.esiti.join(' | '), 'rimettendo la barra nella pagina, la prova DEVE diventare rossa').not.toBe('');
});
