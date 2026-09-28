import { test, expect } from '@playwright/test';

/*
 * ⭐ 24/09/2026 sera — IL TEMA DI SERIE È FORGE (owner: «piccole modifiche da fare immediatamente, tema default forge»).
 *
 * Il tema si decide in DUE momenti e tutti e due devono dire Forge: il ponte d'avvio (`avvio.js`), che colora la radice
 * prima del primo disegno, e le impostazioni di serie della app (`DESKTOP_APPEARANCE_DEFAULTS`, `legacy/app.js`), che la
 * ricolorano dopo il caricamento. Uno solo dei due sbagliato = un lampo di un altro tema, o il tema sbagliato a regime.
 * ⛔ Verso contrario: una scelta FATTA (timbro `themePresetVersione: 2`, `app.js` «preferenza dormiente») resta la sua.
 * Banco: la 4176 del `webServer`, mai il 4174.
 */
test.use({ locale: 'it-IT' });

const temaAllAvvio = () => window.__temaAllAvvio;
async function apri(page, preferenze) {
  await page.addInitScript((preferenze) => {
    if (window.top !== window) return;
    try { if (preferenze) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(preferenze)); else localStorage.removeItem('talos.harness.desktop.settings.v1'); } catch { /* documento senza deposito */ }
    // il valore stampato dal ponte d'avvio, letto appena la radice lo riceve (prima che la app lo ricolori).
    // ⛔ Si osserva `document` con `subtree`: quando gira questo copione `<html>` non esiste ancora (prima versione: `undefined`).
    new MutationObserver((_, osservatore) => {
      const t = document.documentElement?.getAttribute('data-talos-theme');
      if (t && window.__temaAllAvvio === undefined) { window.__temaAllAvvio = t; osservatore.disconnect(); }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-talos-theme'] });
  }, preferenze);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
}

test('TEMA-DI-SERIE-FORGE — un profilo nuovo si apre col tema Forge, all’avvio e a regime', async ({ page }) => {
  await apri(page, null);
  expect(await page.evaluate(temaAllAvvio), 'il ponte d’avvio colora già in Forge').toBe('forge');
  await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'forge');
  await expect(page.locator('.talos-sidebar__foot-sub').first()).toContainText('Tema Forge');
});

test('TEMA-DI-SERIE-SCELTA-RESTA (verso contrario) — chi ha scelto Calm lo tiene', async ({ page }) => {
  await apri(page, { version: 1, appearance: { themePreset: 'calm', themePresetVersione: 2, colorMode: 'dark', uiLanguage: 'it' } });
  expect(await page.evaluate(temaAllAvvio)).toBe('calm');
  await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'calm');
});

test('TEMA-DI-SERIE-STUDIO — nello studio dei temi Forge è primo, Calm secondo, gli altri come sempre (owner 24/09 notte)', async ({ page }) => {
  await apri(page, null);
  // la strada della persona, come `aprireStudio` in `tests/parity/impostazioni-vivo.spec.mjs:16`
  await page.getByRole('button', { name: /^Impostazioni(?: \(Ctrl ,\))?$/ }).first().click();
  const schermo = page.locator('#schermoImpostazioni');
  await schermo.getByRole('tab', { name: 'Aspetto e movimento', exact: true }).click();
  await schermo.getByRole('button', { name: 'Temi e atmosfere', exact: true }).click();
  const temi = page.locator('dialog.td-modal .td-theme-studio [data-tema]');
  await expect(temi.first()).toBeVisible();
  const ordine = await temi.evaluateAll((nodi) => nodi.map((n) => n.dataset.tema));
  expect(ordine.slice(0, 2)).toEqual(['forge', 'calm']);
  expect(new Set(ordine).size, 'nessun tema due volte').toBe(ordine.length);
  expect(ordine).toHaveLength(14);
  await page.keyboard.press('Escape');
});

test('TEMA-DI-SERIE-RESIDUO — un Calm salvato SENZA timbro è un residuo, non una scelta: si apre Forge', async ({ page }) => {
  await apri(page, { version: 1, appearance: { themePreset: 'calm', colorMode: 'dark', uiLanguage: 'it' } });
  expect(await page.evaluate(temaAllAvvio)).toBe('forge');
  await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'forge');
});
