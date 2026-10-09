import { expect, test } from '@playwright/test';

import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

/*
 * ⛔ B3 (09/10/2026) — due regole `:has()` ancorate a elementi grandi pesavano sullo streaming (misurato a 200 giri, togliendole
 *   da una copia del foglio: ~380 ms e ~350 ms di ricalcolo degli stili ogni 11 s):
 *   · `#schermoChat:has(#conversation > *)` (aspetto.css) → ora `#schermoChat:has(> .talos-conversation > #conversation > *)`,
 *     soli figli diretti: vale SOLO se la catena è quella. Questa prova ne è la guardia: se cambia, è rossa.
 *   · `:root:has(dialog.settings-palette[open]:modal)` e gemello (settings.css) → classe sulla radice messa e tolta da
 *     `segnaModaleImpostazioni` (settings-view.ts) all'apertura e a ogni chiusura.
 *   Il COMPORTAMENTO resta quello di prima, e qui si prova: la scena dietro la chat si ferma al primo giro; la radice non
 *   scorre mentre la palette è aperta, e torna com'era quando si chiude.
 */
test.use({ locale: 'it-IT' });

test('B3-HAS-01 — la catena #schermoChat > .talos-conversation > #conversation è fatta di figli DIRETTI', async ({ page }) => {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').first().click();
  const catena = await page.evaluate(() => {
    const c = document.querySelector('#conversation');
    return { padre: c?.parentElement?.classList.contains('talos-conversation') ?? false, nonno: c?.parentElement?.parentElement?.id ?? null };
  });
  expect(catena).toEqual({ padre: true, nonno: 'schermoChat' });
});

test('B3-HAS-02 — la scena dietro la chat si ferma al primo giro (come prima), con la regola a figli diretti', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { backgroundMotion: true, backgroundMotionVersione: 2, colorMode: 'dark' } }));
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/v1/sessions/b3-has/events*', flussoConConfine);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('.talos-nav-item[data-vaia="chat"]').first().click();
  const animazione = () => page.evaluate(() => getComputedStyle(document.querySelector('#schermoChat'), '::after').animationName);
  await expect.poll(() => page.evaluate(() => document.querySelector('#conversation')?.childElementCount ?? -1)).toBe(0);
  const vuota = await animazione();
  expect(vuota, 'PRECONDIZIONE: a chat vuota lo sfondo animato gira, altrimenti la prova non misura niente').not.toBe('none');
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('b3-has', 'workspace', 'B3 has', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' }));
  await attendiFineStoria(page);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 1, input: { consegna: 'ciao' } }, r.realSessionState.generation);
  });
  await expect.poll(() => page.evaluate(() => document.querySelector('#conversation')?.childElementCount ?? 0)).toBeGreaterThan(0);
  await expect.poll(animazione, { message: 'con un giro nella colonna la scena si ferma' }).toBe('none');
});

test('B3-HAS-03 — la palette delle impostazioni blocca la radice mentre è aperta, e la libera quando si chiude', async ({ page }) => {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.locator('[data-vaia="impostazioni"]').first().click();
  const radice = () => page.evaluate(() => ({ classe: document.documentElement.classList.contains('talos-impostazioni-modale-aperta'), overflow: getComputedStyle(document.documentElement).overflow }));
  expect(await radice()).toEqual({ classe: false, overflow: 'visible' });
  await page.locator('[data-settings-open-search]').first().click();
  await expect(page.locator('dialog.settings-palette[open]')).toHaveCount(1);
  expect(await radice()).toEqual({ classe: true, overflow: 'hidden' });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.settings-palette[open]')).toHaveCount(0);
  await expect.poll(radice).toEqual({ classe: false, overflow: 'visible' });
});

test('B3-HAS-04 — la vista smontata con la palette aperta non lascia la radice bloccata (review di «talos desktop»)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.locator('[data-vaia="impostazioni"]').first().click();
  await page.locator('[data-settings-open-search]').first().click();
  await expect(page.locator('dialog.settings-palette[open]')).toHaveCount(1);
  const prima = await page.evaluate(() => { window.__palettePrima = document.querySelector('dialog.settings-palette[open]'); return document.documentElement.classList.contains('talos-impostazioni-modale-aperta'); });
  expect(prima, 'PRECONDIZIONE: con la palette aperta la radice è bloccata').toBe(true);
  /* Il rimontaggio VERO: «Ripristina tutto l'aspetto» (`resettaAspettoDesktop` → `montaImpostazioni` → `dispose()` della vista,
     `impostazioni.js:95`). Misurato: il cambio di lingua NON smonta la vista (ridisegna sul posto), quindi non serviva. La modale
     rende inerte il resto: il clic si dà dal codice, sul pulsante vero. */
  await page.evaluate(() => {
    const ripristina = document.querySelector('[data-reset-appearance]');
    if (!ripristina) throw new Error('il pulsante «Ripristina tutto l’aspetto» non esiste');
    ripristina.click();
  });
  await expect.poll(() => page.evaluate(() => {
    const vecchia = window.__palettePrima;
    return { rimontata: !vecchia.isConnected || !vecchia.open, classe: document.documentElement.classList.contains('talos-impostazioni-modale-aperta'), overflow: getComputedStyle(document.documentElement).overflow };
  }), { message: 'smontata la vista, la radice torna libera' }).toEqual({ rimontata: true, classe: false, overflow: 'visible' });
});
