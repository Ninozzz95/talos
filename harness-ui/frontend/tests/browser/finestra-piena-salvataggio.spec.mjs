import { expect, test } from '@playwright/test';

/*
 * 27/10/2026 — revisione del blocco 10, C-R2 (prova REV-B10-F4 del revisore, portata qui). La carta «quando la finestra di un modello
 * locale si riempie» spegneva TUTTE le scelte mentre salvava; con la regola globale `.talos-choice:disabled` la carta appena cliccata
 * diventava grigia (0,55) e restava piena quella di prima finché la POST non tornava. Ora: la cliccata è segnata subito, la griglia è
 * `aria-busy`, niente si spegne; un salvataggio fallito torna alla scelta di prima. Ogni scrittura vera si ferma (route).
 */
async function apri(page, { ritardo = 0, fallisce = false, colore = 'dark' } = {}) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  let scelta = 'allarga';
  await page.route('**/api/v1/local-engine/window-policy', async (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { ok: true, data: { scelta } } });
    const corpo = JSON.parse(r.request().postData() || '{}');
    await new Promise((ok) => setTimeout(ok, ritardo));
    if (fallisce) return r.fulfill({ status: 503, json: { ok: false, error: { code: 'LOCAL_RUNTIME_NOT_CONFIGURED' } } });
    scelta = corpo.scelta ?? scelta;
    return r.fulfill({ json: { ok: true, data: { scelta } } });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'en', uiFontScale: 'default' } })); } catch { /* niente */ }
  }, { colorMode: colore });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-models').click();
  await expect(page.locator('[data-finestra-piena]').first()).toBeVisible();
}
const stato = (page) => page.locator('[data-finestra-piena]').evaluateAll((bb) => bb.map((b) => ({ v: b.dataset.finestraPiena, scelta: b.getAttribute('aria-checked'), spenta: b.disabled, opacita: getComputedStyle(b).opacity })));

test('FINESTRA-SALVA-01 (C-R2) mentre salva (POST lenta 800 ms): la carta cliccata è già segnata, nessuna si spegne, la griglia è aria-busy', async ({ page }) => {
  await apri(page, { ritardo: 800 });
  const altra = page.locator('[data-finestra-piena][aria-checked="false"]').first();
  const valore = await altra.getAttribute('data-finestra-piena');
  await altra.click();
  await page.waitForTimeout(200);
  const durante = await stato(page);
  expect(durante.filter((x) => x.spenta || x.opacita === '0.55'), JSON.stringify(durante)).toEqual([]);
  expect(durante.find((x) => x.v === valore).scelta, 'la cliccata è già quella segnata').toBe('true');
  expect(durante.filter((x) => x.scelta === 'true').length).toBe(1);
  await expect(page.locator('[data-finestra-piena]').first().locator('xpath=..')).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(1000);
  await expect(page.locator(`[data-finestra-piena="${valore}"]`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-finestra-piena]').first().locator('xpath=..')).toHaveAttribute('aria-busy', 'false');
});

test('FINESTRA-SALVA-02 (C-R2, al contrario) un salvataggio che fallisce torna alla scelta di prima e lo dice', async ({ page }) => {
  await apri(page, { ritardo: 300, fallisce: true });
  const prima = (await stato(page)).find((x) => x.scelta === 'true').v;
  await page.locator('[data-finestra-piena][aria-checked="false"]').first().click();
  await page.waitForTimeout(700);
  const dopo = await stato(page);
  expect(dopo.find((x) => x.scelta === 'true').v, 'torna alla scelta salvata').toBe(prima);
});
