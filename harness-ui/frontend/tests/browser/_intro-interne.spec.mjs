import { test } from '@playwright/test';

/*
 * SONDA USA-E-GETTA — owner 18/09: «ogni sezione dell'impostazione ha due titoli e sottotitoli,
 * devi levare tutti i titoli e sottotitoli introduttivi dentro la sezione e mantenere solo quelli
 * fuori». Qui si MISURA, per ognuna delle dieci, che cosa c'è DENTRO: se è un'introduzione (che
 * ripete il tema della sezione) o un titolo di BLOCCO (che introduce un contenuto suo).
 */
const SEZIONI = ['appearance', 'chat', 'tools', 'memoria', 'privacy', 'models', 'providers', 'costi', 'workspace', 'account'];

test('SONDA — le intestazioni DENTRO ogni sezione', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} })); });
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await page.waitForTimeout(1000);
  for (const sezione of SEZIONI) {
    await page.evaluate((s) => window.__talosHarnessUiRuntime?.setSettingsSection?.(s), sezione);
    await page.waitForTimeout(600);
    const dentro = await page.evaluate((s) => {
      const pannello = document.querySelector(`[data-settings-panel="${s}"]`);
      if (!pannello) return { manca: true };
      /* I primi tre elementi di testo di ogni blocco: eyebrow, titolo, nota. */
      const blocchi = [...pannello.querySelectorAll('[data-settings-group], .talos-settings__section')];
      return blocchi.map((b) => ({
        eyebrow: b.querySelector('.talos-eyebrow')?.textContent?.trim() ?? null,
        h3: b.querySelector('h3')?.textContent?.trim() ?? null,
        p: b.querySelector('p')?.textContent?.trim().slice(0, 70) ?? null,
      }));
    }, sezione);
    console.log(`INTRO ${sezione} ` + JSON.stringify(dentro));
  }
});
