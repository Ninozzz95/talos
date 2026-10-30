import { expect, test } from '@playwright/test';

/*
 * Owner 27/10/2026 («Di serie nelle Impostazioni + per conversazione») — «Dove girano i comandi» in Impostazioni → Strumenti e
 * permessi (`components/dove-girano-di-serie.js`): la scelta con cui nascono le conversazioni nuove, con le tre carte e le parole
 * del foglio dei permessi. La rotta la risponde la prova: ogni scrittura vera si ferma e si conta, quelle della carta si registrano
 * e si rispondono qui.
 */
async function apri(page, { tema = 'dark', lingua = 'it', get = { doveDiSerie: null }, post = null, wsl = null } = {}) {
  const fermate = []; const scritte = [];
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : (fermate.push(r.request().url()), r.abort())));
  if (wsl) await page.route('**/api/v1/wsl', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: wsl } }) : r.fallback()));
  await page.route('**/api/v1/command-settings', async (r) => {
    if (r.request().method() === 'GET') {
      return get === 503
        ? r.fulfill({ status: 503, json: { ok: false, error: { code: 'COMMAND_SETTINGS_UNAVAILABLE', message: 'Command settings not available' } } })
        : r.fulfill({ json: { ok: true, data: get } });
    }
    const corpo = JSON.parse(r.request().postData() || '{}');
    scritte.push(corpo);
    if (post === 500) return r.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR' } } });
    return r.fulfill({ json: { ok: true, data: { doveDiSerie: corpo.doveDiSerie } } });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage, uiFontScale: 'default' } })); } catch { /* niente */ }
  }, { colorMode: tema, uiLanguage: lingua });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-tools').click();
  const carta = page.locator('[data-settings-card="tools-dove-girano"]');
  const scelta = (valore) => carta.locator(`[data-dove-serie="${valore}"]`);
  return { fermate, scritte, carta, scelta };
}

for (const tema of ['dark', 'light']) {
  test(`DOVE-SERIE-UI-01 (${tema}): the card shows the three choices of the permissions sheet, Automatic by default, and a click saves the choice`, async ({ page }) => {
    const { fermate, scritte, carta, scelta } = await apri(page, { tema });
    await expect(carta).toBeVisible();
    await expect(carta.locator('h3')).toHaveText('Dove girano i comandi');
    await expect(carta.locator('[role="radio"]')).toHaveCount(3);
    expect(await carta.evaluate((c) => c.previousElementSibling?.dataset.settingsCard), 'right after the session policy').toBe('tools-policy');
    expect(await page.evaluate(() => document.querySelector('#setting-panel-tools').lastElementChild.classList.contains('talos-settings__actions')), 'the actions row stays last').toBe(true);
    await expect(scelta('')).toHaveAttribute('aria-checked', 'true');
    await expect(scelta('wsl2')).toHaveAttribute('aria-checked', 'false');
    await expect(scelta('wsl2').locator('.talos-choice__title')).toHaveText('Linux (WSL2)');
    await expect(scelta('windows').locator('.talos-choice__title')).toHaveText('Windows');
    await scelta('wsl2').click();
    await expect(scelta('wsl2')).toHaveAttribute('aria-checked', 'true');
    await expect(scelta('')).toHaveAttribute('aria-checked', 'false');
    expect(scritte).toEqual([{ doveDiSerie: 'wsl2' }]);
    await scelta('wsl2').click(); // la scelta già fatta non riscrive
    await scelta('').click();
    expect(scritte).toEqual([{ doveDiSerie: 'wsl2' }, { doveDiSerie: null }], 'back to automatic sends null, never an empty string');
    await expect(carta.locator('[data-dove-serie-stato]')).toBeHidden();
    await carta.screenshot({ path: `test-results/dove-girano-di-serie-${tema}.png` });
    await page.screenshot({ path: `test-results/dove-girano-di-serie-pagina-${tema}.png` });
    expect(fermate).toEqual([]);
  });
}

test('DOVE-SERIE-UI-02: a save that fails leaves the old choice and says so', async ({ page }) => {
  const { scritte, carta, scelta } = await apri(page, { post: 500, get: { doveDiSerie: 'windows' } });
  await expect(scelta('windows')).toHaveAttribute('aria-checked', 'true');
  await scelta('wsl2').click();
  await expect(carta.locator('[data-dove-serie-stato]')).toHaveText('La scelta non è stata salvata: riprova.');
  await expect(scelta('windows')).toHaveAttribute('aria-checked', 'true');
  await expect(scelta('wsl2')).toHaveAttribute('aria-checked', 'false');
  expect(scritte).toEqual([{ doveDiSerie: 'wsl2' }]);
});

test('DOVE-SERIE-UI-03: without the setting on the server the choices are disabled and the card says why; English first', async ({ page }) => {
  const { carta, scelta } = await apri(page, { get: 503, lingua: 'en' });
  await expect(carta.locator('h3')).toHaveText('Where commands run');
  for (const v of ['', 'wsl2', 'windows']) await expect(scelta(v)).toBeDisabled();
  await expect(carta.locator('[data-dove-serie-stato]')).toHaveText('This setting is not available in this instance.');
});

test('DOVE-SERIE-UI-04: with the Linux home ready the sentences are the sheet\'s Linux-home ones; arrows move and save', async ({ page }) => {
  const { scritte, carta, scelta } = await apri(page, { lingua: 'en', wsl: { preferenze: { usaUtenteNormale: true }, wsl: { disponibile: true, distro: 'Ubuntu', casaLinux: { pronta: true } } } });
  await expect(scelta('').locator('.talos-badge')).toHaveText('Linux with WSL');
  await expect(scelta('').locator('.talos-choice__sub')).toHaveText('One home: with WSL, commands and file tools work in Linux; without WSL, on Windows.');
  await expect(scelta('wsl2').locator('.talos-badge')).toHaveText('Recommended');
  await scelta('').focus();
  await page.keyboard.press('ArrowRight');
  await expect(scelta('wsl2')).toHaveAttribute('aria-checked', 'true');
  await expect(scelta('wsl2')).toBeFocused();
  expect(scritte).toEqual([{ doveDiSerie: 'wsl2' }]);
  await expect(carta.locator('[data-dove-serie-stato]')).toBeHidden();
});

test('DOVE-SERIE-UI-05 (revisione blocco 9, F-R1): senza WSL «Linux (WSL2)» non è consigliata, dice che manca ed è spenta; se è già la scelta salvata resta attiva per cambiarla', async ({ page }) => {
  const senza = { preferenze: { usaUtenteNormale: true }, wsl: { disponibile: false } };
  const { scritte, carta, scelta } = await apri(page, { lingua: 'en', wsl: senza });
  await expect(scelta('wsl2').locator('.talos-badge')).toHaveText('WSL not installed');
  await expect(scelta('wsl2').locator('.talos-badge')).toHaveClass(/talos-badge--warning/u);
  await expect(scelta('wsl2').locator('.talos-choice__sub')).toContainText('commands set to run in Linux would fail');
  await expect(scelta('wsl2')).toBeDisabled();
  await scelta('').focus();
  await page.keyboard.press('ArrowRight');
  await expect(scelta('windows')).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  expect(scritte).toEqual([{ doveDiSerie: 'windows' }], 'the arrows skip the disabled choice');
  await carta.screenshot({ path: 'test-results/dove-girano-di-serie-senza-wsl.png' });
  /* AL CONTRARIO: già salvata ⇒ resta attiva, e si può cambiare */
  const altra = await page.context().newPage();
  const b = await apri(altra, { lingua: 'en', wsl: senza, get: { doveDiSerie: 'wsl2' } });
  await expect(b.scelta('wsl2')).toBeEnabled();
  await expect(b.scelta('wsl2')).toHaveAttribute('aria-checked', 'true');
});
