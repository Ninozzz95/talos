import { expect, test } from '@playwright/test';

/*
 * Owner 28/10/2026 (via Mobile, quattro consigliate): «se parlo in persiano a Talos mi risponde in inglese». L'impostazione «Lingua
 * delle risposte e della dettatura», Automatica di serie, subito dopo «Lingua dei menu»; il valore viaggia al server
 * (`linguaDelleRisposte`) all'avvio e prima di ogni giro, e il nucleo lo mette nella riga di lingua (`rigaLinguaDelleRisposte`).
 * ⛔ Nessuna scrittura vera: le POST di avvio si fermano qui e se ne legge il corpo.
 */
async function apriImpostazioni(page, { uiLanguage = 'it', replyLanguage } = {}) {
  await page.addInitScript(({ uiLanguage, replyLanguage }) => {
    if (window.top !== window) return;
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage, ...(replyLanguage ? { replyLanguage } : {}) }, chat: {}, workspaces: {} }));
  }, { uiLanguage, replyLanguage });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('appearance', { persist: false });
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
}

const calm = (page) => page.locator('#setting-replyLanguageSelect--calm');

test('LINGUA-UI-01 — la riga sta subito dopo «Lingua dei menu», Automatica di serie, le lingue col nome e in se stesse; una riga d\'aiuto sola', async ({ page }) => {
  await apriImpostazioni(page);
  await expect(calm(page)).toBeVisible();
  await expect(calm(page)).toContainText('Automatica');
  const righe = await page.evaluate(() => [...document.querySelectorAll('#schermoImpostazioni [data-setting-row]')].map((r) => r.dataset.settingRow));
  expect(righe.indexOf('replyLanguageSelect'), righe.join(',')).toBe(righe.indexOf('uiLanguageSelect') + 1);
  await calm(page).click();
  const opzioni = page.locator('#setting-replyLanguageSelect--calm--listbox [role="option"]');
  await expect(opzioni).toHaveCount(36);
  await expect(opzioni.first()).toContainText('Automatica');
  await expect(opzioni.filter({ hasText: 'Persiano (فارسی)' })).toHaveCount(1);
  const riga = page.locator('[data-setting-row="replyLanguageSelect"]');
  await expect(riga).toContainText('Lingua delle risposte e della dettatura');
  await expect(riga.locator('.talos-setting__help')).toHaveCount(1);
  await expect(riga.locator('.talos-setting__help')).toContainText('Automatica: TALOS risponde nella lingua in cui scrivi o parli.');
  await page.keyboard.press('Escape');
  for (const tema of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: tema });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await riga.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/lingua-risposte-${tema}.png` });
  }
});

test('LINGUA-UI-02 — la scelta col selettore a schermo resta, e con i menu in inglese le lingue si rinominano', async ({ page }) => {
  await apriImpostazioni(page);
  await calm(page).click();
  await page.locator('#setting-replyLanguageSelect--calm--listbox [role="option"]').filter({ hasText: 'Persiano (فارسی)' }).click();
  await expect(calm(page)).toContainText('Persiano (فارسی)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1')).appearance.replyLanguage)).toBe('fa');
  await page.evaluate(() => {
    const s = document.querySelector('#setting-uiLanguageSelect');
    s.value = 'en';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(calm(page)).toContainText('Persian (فارسی)');
  await expect(page.locator('[data-setting-row="replyLanguageSelect"]')).toContainText('Reply and dictation language');
  await calm(page).click();
  await expect(page.locator('#setting-replyLanguageSelect--calm--listbox [role="option"]').first()).toContainText('Automatic');
});
