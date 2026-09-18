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

const VOCI = '#schermoImpostazioni .talos-settings__nav .talos-nav-item';

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
