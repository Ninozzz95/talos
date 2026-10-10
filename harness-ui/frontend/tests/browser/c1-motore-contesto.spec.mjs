import { expect, test } from '@playwright/test';

/*
 * C1 (owner 09/10/2026 sera) — «Motore del contesto» in Impostazioni → Memoria e contesto: acceso di serie, spento = le
 * conversazioni NUOVE usano la compattazione precedente (`components/motore-contesto.js`). La rotta la risponde la prova: ogni
 * scrittura vera si ferma e si conta, quelle della carta si registrano e si rispondono qui.
 */
async function apri(page, { tema = 'dark', lingua = 'it', get = { motore: 'engine' }, post = null } = {}) {
  const fermate = []; const scritte = [];
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : (fermate.push(r.request().url()), r.abort())));
  await page.route('**/api/v1/context-settings', async (r) => {
    if (r.request().method() === 'GET') {
      return get === 503
        ? r.fulfill({ status: 503, json: { ok: false, error: { code: 'CONTEXT_SETTINGS_UNAVAILABLE', message: 'Context engine settings not available' } } })
        : r.fulfill({ json: { ok: true, data: get } });
    }
    const corpo = JSON.parse(r.request().postData() || '{}');
    scritte.push(corpo);
    if (post === 500) return r.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR' } } });
    return r.fulfill({ json: { ok: true, data: { motore: corpo.motore } } });
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
  await page.locator('#setting-tab-memoria').click();
  const carta = page.locator('[data-settings-card="memoria-motore-contesto"]');
  /* l'`input` e' la sorgente NASCOSTA del componente Switch (aria-hidden): la persona clicca l'interruttore visibile, e li' si clicca */
  return { fermate, scritte, carta, interruttore: page.locator('#setting-motoreContesto'), visibile: carta.getByRole('switch') };
}

for (const tema of ['dark', 'light']) {
  test(`C1-MOTORE-UI-01 (${tema}): the card sits after the context breakdown, ON by default, and switching writes the choice`, async ({ page }) => {
    const { fermate, scritte, carta, interruttore, visibile } = await apri(page, { tema });
    await expect(carta).toBeVisible();
    await expect(carta.locator('h3')).toHaveText('Motore del contesto');
    expect(await page.evaluate(() => document.querySelector('[data-settings-card="memoria-context"]')?.nextElementSibling?.dataset.settingsCard)).toBe('memoria-motore-contesto');
    await expect(interruttore).toBeChecked();
    await expect(interruttore).toBeEnabled();
    // acceso, l'aiuto non deve leggersi come uno stato «Spento» (trovato nella foto della prima corsa): dice cosa succede DA spento
    await expect(carta.locator('.talos-setting__help')).toHaveText('Da spento, le conversazioni nuove usano la compattazione precedente. Quelle già cominciate tengono quella con cui sono nate.');
    await expect(visibile).toHaveAttribute('aria-checked', 'true');
    await visibile.click();
    await expect(interruttore).not.toBeChecked();
    await expect(visibile).toHaveAttribute('aria-checked', 'false');
    expect(scritte).toEqual([{ motore: 'legacy' }]);
    await expect(carta.locator('.talos-setting__help')).toHaveText(/compattazione precedente/u);
    await page.screenshot({ path: `test-results/c1-motore-contesto-${tema}.png` });
    expect(fermate).toEqual([]);
  });
}

test('C1-MOTORE-UI-02: a save that fails puts the switch back and says so; nothing changed on screen without the server', async ({ page }) => {
  const { scritte, carta, interruttore, visibile } = await apri(page, { post: 500 });
  await expect(interruttore).toBeChecked();
  await visibile.click();
  await expect(interruttore).toBeChecked(); // il server non ha detto sì: torna com'era
  expect(scritte).toEqual([{ motore: 'legacy' }]);
  await expect(carta.locator('.talos-setting__help')).toHaveText('La scelta non è stata salvata: riprova.');
});

test('C1-MOTORE-UI-03: without the setting on the server the switch is disabled and says why; English first', async ({ page }) => {
  const { carta, interruttore } = await apri(page, { get: 503, lingua: 'en' });
  await expect(carta.locator('h3')).toHaveText('Context engine');
  await expect(interruttore).toBeDisabled();
  await expect(carta.locator('.talos-setting__help')).toHaveText('This setting is not available in this instance.');
});

test('C1-MOTORE-UI-04: a choice saved as legacy is read back as OFF', async ({ page }) => {
  const { interruttore } = await apri(page, { get: { motore: 'legacy' } });
  await expect(interruttore).not.toBeChecked();
});
