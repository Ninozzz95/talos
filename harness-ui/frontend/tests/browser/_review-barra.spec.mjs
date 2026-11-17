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

/*
 * ⛔ 023 cura 1 (11/11/2026): il bottone «Cerca impostazioni» e la sua riga in sidebar sono TOLTI (023 passo 2, una ricerca sola).
 *   Al loro posto il glifo «Ctrl K» sta DENTRO il campo, e lo spazio che gli si riserva è una sola regola
 *   (`#schermoImpostazioni .settings-search__input { padding-inline-end: 50px }`). R-A e R-B fanno la stessa domanda di prima — il
 *   testo del segnaposto e il segno della scorciatoia si pestano? — sul segno che c'è oggi.
 */
const STRUMENTO = () => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const nav = document.querySelector('.settings-nav');
  const toolbar = document.querySelector('.settings-toolbar');
  const campo = document.querySelector('#settingsSearch');
  const kbd = document.querySelector('[data-settings-shortcut]');
  const cs = getComputedStyle(campo);
  const m = document.createElement('span'); m.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};`; m.textContent = campo.placeholder; document.body.append(m);
  const serve = m.getBoundingClientRect().width; m.remove();
  const utile = campo.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
  /* dove finisce il testo che si vede: il segnaposto intero se sta, altrimenti fin dove arrivano i puntini */
  const fineTesto = campo.getBoundingClientRect().left + Number.parseFloat(cs.paddingLeft) + Math.min(serve, utile);
  return {
    nav: box(nav), toolbar: box(toolbar), campo: box(campo), kbd: box(kbd),
    serve: Math.round(serve), utile: Math.round(utile), fineTesto: Math.round(fineTesto),
    pestaIlGlifo: Boolean(kbd && !kbd.hidden && fineTesto > kbd.getBoundingClientRect().left + 0.5),
  };
};

/** Cancella dal CSSOM la regola che riserva il posto al glifo dentro il campo: è lo stato «prima» della cura del passo 2. */
const RISERVA_PRIMA = () => {
  let tolte = 0;
  for (const foglio of document.styleSheets) {
    let regole; try { regole = foglio.cssRules; } catch { continue; }
    if (!regole) continue;
    for (let i = regole.length - 1; i >= 0; i -= 1) if (regole[i].selectorText === '#schermoImpostazioni .settings-search__input') { foglio.deleteRule(i); tolte += 1; }
  }
  return tolte;
};

test('R-A · il segnaposto del campo e il glifo «Ctrl K»: mai uno sopra l’altro, a ogni larghezza', async ({ page }) => {
  await apriImpostazioni(page);
  const campo = page.locator('#settingsSearch');
  const misure = [];
  for (const w of [1280, 1100, 1024, 900, 700]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const d = await page.evaluate(STRUMENTO);
    console.log(`R-A-${w} ` + JSON.stringify({ campo: d.campo, kbd: d.kbd, serve: d.serve, utile: d.utile, fineTesto: d.fineTesto, pesta: d.pestaIlGlifo }));
    misure.push({ w, ...d });
  }
  await expect(campo).toBeVisible();
  expect(misure.every((m) => m.kbd && m.kbd.w > 0), 'il glifo si vede a ogni larghezza: la prova misura').toBe(true);
  expect(misure.filter((m) => m.pestaIlGlifo).map((m) => m.w), 'il testo del campo finisce sotto il glifo «Ctrl K»').toEqual([]);
});

test('R-B · A/B della riserva del glifo a 1100px: prima (regola cancellata) contro adesso', async ({ page }) => {
  await apriImpostazioni(page);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(200);
  const adesso = await page.evaluate(STRUMENTO);
  await page.screenshot({ path: 'artifacts/review-barra/AB-1100-adesso.png' });
  const tolte = await page.evaluate(RISERVA_PRIMA);
  await page.waitForTimeout(250);
  const prima = await page.evaluate(STRUMENTO);
  await page.screenshot({ path: 'artifacts/review-barra/AB-1100-prima.png' });
  console.log('R-B ' + JSON.stringify({ regoleTolte: tolte, adesso: { fineTesto: adesso.fineTesto, kbd: adesso.kbd, pesta: adesso.pestaIlGlifo }, prima: { fineTesto: prima.fineTesto, kbd: prima.kbd, pesta: prima.pestaIlGlifo } }, null, 1));
  expect(tolte, 'la regola che riserva il posto al glifo deve esistere per poterla togliere').toBe(1);
  expect(adesso.pestaIlGlifo, 'con la riserva il testo non tocca il glifo').toBe(false);
  expect(prima.pestaIlGlifo, 'senza la riserva il testo finisce sotto il glifo: R-A morde per la ragione giusta').toBe(true);
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
  /* VIVO: dopo il rimontaggio Ctrl K porta ancora al campo e NON apre la palette dei comandi (023 cura 1). Prima l'ascoltatore della
     vista stava su `document` in bolla e, rimontato, arrivava DOPO quello globale dell'app: Ctrl K apriva i comandi sopra le
     Impostazioni e la riga «Ctrl K o / cerca» mentiva. */
  await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#settingsSearch'), 'dopo il ripristino Ctrl K porta al campo').toBeFocused();
  const comandi = await page.evaluate(() => { const v = document.querySelector('#veloComandi'); return !!v && !v.hidden && v.getClientRects().length > 0; });
  expect(comandi, 'e la palette dei comandi non si apre sopra le Impostazioni').toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#schermoImpostazioni')).toBeVisible();
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
