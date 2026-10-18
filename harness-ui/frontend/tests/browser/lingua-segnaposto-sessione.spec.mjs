import { expect, test } from '@playwright/test';

/*
 * 18/10/2026, visto in una foto del 4174 con l'interfaccia in inglese: la testata della chat diceva «Nessuna sessione».
 * `state.session` nasce con `tr('app.sessions.none')` quando il modulo si carica, PRIMA che `applicaLingua` fissi la lingua
 * risolta; l'ascoltatore del cambio lingua che lo rilegge si attacca dopo, e comunque non ridisegnava la testata
 * (`aggiornaTestataSessione`). Si prova nei due versi: un browser inglese vede «No session», uno italiano «Nessuna sessione».
 */
for (const [locale, atteso, sbagliato] of [['en-US', 'No session', 'Nessuna sessione'], ['it-IT', 'Nessuna sessione', 'No session']]) {
  test(`SEGNAPOSTO-SESSIONE — ${locale}: la testata della chat senza sessione dice «${atteso}»`, async ({ browser }) => {
    const ctx = await browser.newContext({ locale, viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    const titolo = page.locator('#schermoChat .talos-topbar .talos-topbar__title h1');
    await expect(titolo).toBeVisible();
    await expect(titolo).toHaveText(atteso);
    await expect(titolo).not.toHaveText(sbagliato);
    await ctx.close();
  });
}

test('SEGNAPOSTO-SESSIONE A CALDO — italiano, poi l\u2019inglese dalle Impostazioni: la testata si ridisegna, senza ricaricare', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'it-IT', viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  const titolo = page.locator('#schermoChat .talos-topbar .talos-topbar__title h1');
  await expect(titolo).toHaveText('Nessuna sessione');
  await page.evaluate(() => {
    const sel = document.querySelector('#setting-uiLanguageSelect');
    sel.value = 'en';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(titolo).toHaveText('No session');
  await ctx.close();
});
