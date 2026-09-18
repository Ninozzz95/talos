import { expect, test } from '@playwright/test';

/*
 * ============================================================================
 * L'INTELAIATURA DELLE IMPOSTAZIONI — FASE 1 della parità col mockup, 18/09/2026
 * ============================================================================
 * Prova le due cose che il mockup ha e l'app non aveva, SULLA PAGINA VIVA:
 * il BREADCRUMB e il PUNTO della voce attiva. Più le cinque misure della voce.
 *
 * ⛔ LE MISURE NON SI LEGGONO DAL CSS, SI MISURANO. Il 18/09 il CSS dichiarava
 *   `padding:0 10px` e `border-radius:10px` per `.talos-nav-item`, e stavo per
 *   «correggerli»: il DOM vivo diceva `10px 12px` e `8px`, già quelli del
 *   mockup, perché una regola più specifica vince. Da qui in poi la prova
 *   misura il COMPUTED STYLE, che è l'unica cosa che l'occhio vede.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA (provata, non dichiarata):
 *   · si toglie la regola `::after` della voce attiva → INTELAIATURA-02 rossa;
 *   · si tolgono `gap`/`min-height`/`font-size` dalle misure → INTELAIATURA-03
 *     rossa, una per una;
 *   · si toglie il breadcrumb da `content.prepend(...)` → INTELAIATURA-01 rossa;
 *   · si mette il separatore nel DOM invece che in CSS → INTELAIATURA-04 rossa;
 *   · si smette di nascondere il breadcrumb durante la ricerca → INTELAIATURA-05
 *     rossa.
 */

/*
 * ⛔ `[role="tab"]` E NON SOLO LA CLASSE. Il 18/09 il bottone del cercatore è entrato nella
 *   stessa barra con la stessa classe: `nth(1)` ha smesso di essere «la voce non attiva» ed è
 *   diventato la voce ATTIVA, e la prova è andata rossa per una ragione che non era un difetto.
 *   La classe è presentazione, il ruolo è semantica: si misura sulle tab.
 */
const VOCI = '#schermoImpostazioni .talos-settings__nav [role="tab"].talos-nav-item';

/** Apre l'app in italiano e entra nelle Impostazioni. La lingua va DICHIARATA:
 *  senza, l'app parte in inglese ed è il predefinito — un confronto col mockup
 *  italiano sarebbe falso in ogni riga. */
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
    // `persist:false` è obbligatorio: col default `true` la sonda SCRIVEREBBE in localStorage.
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

test('INTELAIATURA-01 · il breadcrumb esiste, è una landmark con nome, e dice dove sei', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const briciole = page.locator('#schermoImpostazioni nav[aria-label="Breadcrumb"]');
  await expect(briciole).toHaveCount(1);
  // L'ordine è significativo ⇒ lista ORDINATA, e `role="list"` tiene il ruolo
  // che `list-style:none` toglie su alcuni motori.
  await expect(briciole.locator('ol[role="list"]')).toHaveCount(1);
  await expect(briciole.locator('li')).toHaveCount(2);
  // Prima voce: la pagina. Ultima: la sezione, marcata `aria-current="page"` e
  // NON un link — è dove sei già, e un link che non naviga è un link morto.
  await expect(briciole.locator('li').first()).toHaveText('Impostazioni');
  const qui = briciole.locator('[aria-current="page"]');
  await expect(qui).toHaveText('Aspetto e movimento');
});

test('INTELAIATURA-02 · la voce attiva ha il punto che il mockup ha e l’app non aveva', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const attiva = page.locator(`${VOCI}[aria-current="page"]`);
  await expect(attiva).toHaveCount(1);
  const punto = await attiva.evaluate((el) => {
    const cs = getComputedStyle(el, '::after');
    return { contenuto: cs.content, larghezza: cs.width, altezza: cs.height, raggio: cs.borderRadius, spinta: cs.marginLeft };
  });
  // `content` era `none` prima della cura: questo è il morso.
  expect(punto.contenuto, 'il punto della voce attiva non c’è').not.toBe('none');
  expect(punto.larghezza).toBe('5px');
  expect(punto.altezza).toBe('5px');
  expect(punto.raggio).toBe('50%');
  // `margin-left:auto` è ciò che lo spinge a destra, come nel mockup.
  expect(Number.parseFloat(punto.spinta)).toBeGreaterThan(0);
  // E la voce NON attiva non lo ha: il punto distingue, non decora.
  const altra = page.locator(VOCI).nth(1);
  expect(await altra.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
});

test('INTELAIATURA-03 · le cinque misure della voce, come le ha il mockup', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const voce = page.locator(VOCI).first();
  const m = await voce.evaluate((el) => {
    const cs = getComputedStyle(el);
    const etichetta = el.querySelector('.talos-nav-item__label');
    const icona = el.querySelector('.i');
    return {
      gap: cs.gap, altezza: cs.minHeight, margine: `${cs.marginTop} ${cs.marginBottom}`,
      etichetta: etichetta ? getComputedStyle(etichetta).fontSize : null,
      icona: icona ? getComputedStyle(icona).width : null,
    };
  });
  expect(m.gap, 'gap icona↔testo (mockup: 11px)').toBe('11px');
  expect(m.altezza, 'altezza minima della voce (mockup: 42px)').toBe('42px');
  expect(m.margine, 'margine verticale (mockup: 3px)').toBe('3px 3px');
  expect(m.etichetta, 'dimensione dell’etichetta (mockup: 13px)').toBe('13px');
  expect(m.icona, 'l’icona della voce (mockup: 17px)').toBe('17px');
});

test('INTELAIATURA-04 · il separatore sta nel CSS, non nel DOM', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const briciole = page.locator('#schermoImpostazioni nav[aria-label="Breadcrumb"]');
  // Uno screen reader non deve annunciare il separatore: la landmark lo dice già.
  expect(await briciole.locator('ol').innerText()).not.toContain('›');
  const separatore = await briciole.locator('li').nth(1).evaluate((el) => getComputedStyle(el, '::before').content);
  expect(separatore).toContain('›');
});

test('INTELAIATURA-06 · il cercatore del mockup è in sidebar, con la sua scorciatoia', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const bottone = page.locator('#schermoImpostazioni [data-settings-open-search]');
  await expect(bottone).toHaveCount(1);
  await expect(bottone).toContainText('Cerca impostazioni');
  // Il glifo della scorciatoia si vede ma non si annuncia — «Ctrl K» letto da uno screen
  // reader è «Control K» e va detto a parole, non lasciato al caso.
  const tasto = bottone.locator('kbd');
  await expect(tasto).toHaveAttribute('aria-hidden', 'true');
  await expect(tasto).toHaveText('Ctrl K');
  /*
   * ⛔ E IL CAMPO STA NELLA COLONNA, non più a tutta larghezza. Owner, 18/09/2026: «attento alla
   *   barra di ricerca io la vedo ancora full width e no sopra sidebar», e poi «sposta la barra».
   *   Prima era un blocco di pagina (`page.insertBefore(toolbar, layout)`) e si prendeva la
   *   larghezza del contenuto. La prova morde su DUE fatti misurati, non su una classe:
   *   (a) il campo è DENTRO la colonna delle sezioni; (b) la sua larghezza è quella della
   *   colonna, non quella dell'intelaiatura — se qualcuno lo rimette nella pagina, (a) e (b)
   *   diventano rossi. La funzione resta: filtro in pagina, «Cancella ricerca» e Ctrl K sono
   *   provati da INTELAIATURA-05 e INTELAIATURA-07.
   */
  const campo = page.locator('#settingsSearch');
  await expect(campo).toBeVisible();
  const dentroLaColonna = await campo.evaluate((el) => Boolean(el.closest('.settings-nav')));
  expect(dentroLaColonna, 'il campo di ricerca deve stare nella colonna delle sezioni').toBe(true);
  const misure = await campo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const colonna = el.closest('.settings-nav').getBoundingClientRect();
    const intelaiatura = el.closest('.talos-settings').getBoundingClientRect();
    return { campo: Math.round(r.width), colonna: Math.round(colonna.width), intelaiatura: Math.round(intelaiatura.width) };
  });
  expect(misure.campo, 'il campo non può sfondare la colonna: ' + JSON.stringify(misure)).toBeLessThanOrEqual(misure.colonna);
  expect(misure.campo, 'la barra è tornata a tutta larghezza: ' + JSON.stringify(misure)).toBeLessThan(misure.intelaiatura / 2);
});

test('INTELAIATURA-07 · Ctrl K apre la palette, Esc la chiude, e il fuoco torna al bottone', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const palette = page.locator('dialog.settings-palette');
  await expect(palette).toBeHidden();
  // Aperta DAL BOTTONE, il fuoco deve tornare al bottone: è il contratto di `showModal()`
  // (`restoreFocus`, `manager.ts:75-86`) e senza di lui il prossimo Tab riparte da capo pagina.
  const bottone = page.locator('#schermoImpostazioni [data-settings-open-search]');
  await bottone.click();
  await expect(palette).toBeVisible();
  // `showModal()` mette il fuoco dentro da sé; noi lo mettiamo sul campo perché `autofocus`
  // non è affidabile su tutti i browser desktop.
  await expect(page.locator('#settingsPaletteQuery')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(bottone, 'il fuoco deve tornare a chi ha aperto').toBeFocused();
  // E aperta DA TASTIERA, il fuoco torna dov'era: `showModal()` lo restituisce all'elemento
  // che lo aveva, che con la scorciatoia non è il bottone.
  await page.locator('#schermoImpostazioni .settings-section-heading h2').focus();
  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(page.locator('#schermoImpostazioni .settings-section-heading h2')).toBeFocused();
});

test('INTELAIATURA-08 · la palette cerca sull’indice vero e porta alla riga', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  await page.locator('#schermoImpostazioni [data-settings-open-search]').click();
  const palette = page.locator('dialog.settings-palette');
  await expect(palette).toBeVisible();
  await page.locator('#settingsPaletteQuery').fill('elastica');
  // Lo stesso indice della ricerca in pagina: 40 controlli + le 10 sezioni.
  await expect(palette.locator('.settings-palette__count')).toHaveText('1 risultato');
  const esito = palette.locator('[data-settings-result="motionEasingSelect"]');
  await expect(esito).toHaveCount(1);
  await esito.click();
  await expect(palette).toBeHidden();
  // La riga è evidenziata e il fuoco è sul suo controllo: si arriva davvero, non si "trova".
  await expect(page.locator('[data-setting-row="motionEasingSelect"][data-settings-hit]')).toHaveCount(1);
});

test('INTELAIATURA-09 · Ctrl K ha un ambito: le impostazioni qui, i comandi fuori', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const palette = page.locator('dialog.settings-palette');
  // Dentro le Impostazioni, fuori da un campo: vince il cercatore delle impostazioni.
  await page.locator('#schermoImpostazioni .settings-nav__search').focus();
  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  /*
   * ⛔ COL FUOCO IN UN CAMPO la scorciatoia NON deve scattare: il composer della chat è a un
   *   passo da qui. Misurato il 18/09: oggi l'app porta il fuoco a `#cercaComando`, cioè apre
   *   la SUA palette dei comandi — comportamento che c'era prima di questa cura e che resta.
   *   Quello che questa prova protegge è che NON si apra la paletta delle impostazioni.
   */
  await page.locator('#settingsSearch').click();
  await page.keyboard.press('Control+k');
  await expect(palette, 'col fuoco in un campo la palette non deve aprirsi').toBeHidden();
});

test('INTELAIATURA-05 · cercando, il breadcrumb sparisce come la testata', async ({ page }) => {
  await apriImpostazioni(page, 'appearance');
  const briciole = page.locator('#schermoImpostazioni nav[aria-label="Breadcrumb"]');
  await expect(briciole).toBeVisible();
  await page.locator('#settingsSearch').fill('elastica');
  // La ricerca sostituisce la vista: se il breadcrumb restasse direbbe una
  // sezione che a schermo non c'è più.
  await expect(briciole).toBeHidden();
  await expect(page.locator('#schermoImpostazioni .settings-section-heading')).toBeHidden();
  await page.locator('#settingsSearch').fill('');
  await expect(briciole).toBeVisible();
});
