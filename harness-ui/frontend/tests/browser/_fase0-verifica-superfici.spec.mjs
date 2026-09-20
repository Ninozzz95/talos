import { expect, test } from '@playwright/test';

/*
 * FASE 0 (20/09/2026) — verifica veloce delle superfici che l'altro agente ha chiuso, prima di
 * costruire sopra: Impostazioni/Aspetto e pagina Hugging Face, entrambi i temi, sul 4174 vivo.
 * Il grafo ha la sua prova: la foto dell'owner di stamattina 09:17 (diagramma pieno, 141 chiamate).
 * ⛔ Solo GET e letture: nessuna scrittura di rete, nessuna sessione avviata.
 */

test.use({ locale: 'it-IT' });

async function apri(page, { tema }) {
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
}

for (const tema of ['dark', 'light']) {
  test(`impostazioni aspetto visibile nei due temi (${tema})`, async ({ page }) => {
    await apri(page, { tema });
    await page.locator('[data-vaia="impostazioni"]').click();
    const sezione = page.locator('#schermoImpostazioni');
    await expect(sezione).toBeVisible();
    // la scheda Aspetto è la sezione settings-view vera (colonna anteprima compresa)
    await page.locator('text=Aspetto').first().click();
    await expect(page.locator('.settings-view, [data-settings-ui], #schermoImpostazioni').first()).toBeVisible();
    await page.screenshot({ path: `../../artifacts/fase0/impostazioni-aspetto-${tema}.png`, fullPage: false });
  });

  test(`laboratorio HF: lista e pagina modello (${tema})`, async ({ page }) => {
    test.setTimeout(120000);
    await apri(page, { tema });
    await page.locator('[data-vaia="impostazioni"]').click();
    // «Strumenti» nasce CHIUSO (template, commento al gruppo): lo si apre, poi «Modelli».
    const testa = page.locator('#testataGruppoStrumenti');
    if ((await testa.getAttribute('aria-expanded')) !== 'true') await testa.click();
    await page.locator('[data-vaia="modelli"]').click();
    // I [data-model-lab-tab] sono i SEI bottoni LEGACY (frammenti.html), tenuti in vita come
    // superficie di comando dentro la cornice V3 (lab-cornice-v3.js:604-617): NON sono visibili.
    // Il tab visibile è [data-lab-scheda="models"] («Hugging Face»), e il suo clic accende la
    // PRIMA sezione della scheda = 'huggingface' (lab-cornice-v3.js:168).
    const tab = page.locator('[data-lab-scheda="models"]');
    await expect(tab).toBeVisible({ timeout: 30000 });
    await tab.click();
    // il catalogo iniziale parte da solo; la prima riga arriva via rete (GET): si aspetta.
    const riga = page.locator('#modelLabHfResults [data-hf]').first();
    await riga.waitFor({ state: 'visible', timeout: 60000 });
    await page.screenshot({ path: `../../artifacts/fase0/hf-lista-${tema}.png`, fullPage: false });
    await riga.click();
    const pagina = page.locator('#paginaModello');
    await expect(pagina).toBeVisible({ timeout: 30000 });
    await expect(pagina.locator('visible=true').first()).toBeAttached();
    await page.screenshot({ path: `../../artifacts/fase0/hf-pagina-modello-${tema}.png`, fullPage: false });
  });
}
