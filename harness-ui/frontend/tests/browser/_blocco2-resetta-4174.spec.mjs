import { expect, test } from '@playwright/test';

/*
 * BLOCCO 2 — LE FOTO DEL 4174, Impostazioni → Aspetto dopo cinque «Ripristina tutto l'aspetto».
 *
 * ⛔ La guardia è la stessa del BLOCCO 1: sul 4174 passa SOLO `GET`/`HEAD`, e ogni altra richiesta
 *   si ferma e si conta. Si salta da sé senza baseURL esterno, così non entra nella suite normale.
 *     TALOS_HARNESS_UI_BASE_URL=http://127.0.0.1:4174/ npx playwright test <questo file>
 */

test.skip(!process.env.TALOS_HARNESS_UI_BASE_URL, 'sonda dell’ambiente esterno: si lancia col baseURL dell’owner');

test.use({ locale: 'it-IT' });

const FERMATE = [];

async function apriAspetto(page, { tema, larghezza = 1440, altezza = 900 }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.route('**/*', (route) => {
    const metodo = route.request().method().toUpperCase();
    if (metodo === 'GET' || metodo === 'HEAD') return route.continue();
    FERMATE.push(`${metodo} ${route.request().url()}`);
    return route.abort();
  });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
    catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime, null, { timeout: 15000 });
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-appearance').click();
  await page.waitForTimeout(300);
}

const MISURA = `(() => {
  const radice = document.querySelector('#schermoImpostazioni') || document;
  const telai = [...radice.querySelectorAll('.settings-layout')];
  const b = document.querySelector('[data-reset-appearance]');
  const rb = b?.getBoundingClientRect();
  return {
    colonne: document.querySelectorAll('.appearance-preview').length,
    tele: document.querySelectorAll('.appearance-preview canvas').length,
    telai: telai.length,
    annidati: telai.filter((t) => t.parentElement?.closest('.settings-layout')).length,
    raggiungibile: rb ? document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2)?.closest('[data-reset-appearance]') === b : null,
  };
})()`;

test.afterAll(() => {
  console.log(`FERMATE-SUL-4174-BLOCCO2 n=${FERMATE.length}${FERMATE.length ? ' :: ' + FERMATE.join(' | ') : ''}`);
});

for (const tema of ['dark', 'light']) {
  test(`4174 (1440x900, ${tema}) — cinque «Resetta» su Impostazioni → Aspetto`, async ({ page }) => {
    test.setTimeout(60000);
    await apriAspetto(page, { tema });
    const prima = await page.evaluate(MISURA);
    await page.screenshot({ path: `../../artifacts/blocco2/4174-aspetto-prima-${tema}.png`, fullPage: false });
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => document.querySelector('[data-reset-appearance]')?.click());
      await page.waitForTimeout(180);
    }
    const dopo = await page.evaluate(MISURA);
    console.log(`MISURA-4174-BLOCCO2 1440x900 ${tema} = ${JSON.stringify({ prima, dopo })}`);
    await page.screenshot({ path: `../../artifacts/blocco2/4174-aspetto-dopo5-${tema}.png`, fullPage: false });
    /* ⛔ Le premesse: la scena deve essersi formata (una colonna prima) e il residuo dev'essere zero. */
    expect(prima.colonne, 'la scena non si è formata: nessuna colonna d’anteprima sul 4174').toBe(1);
    expect(dopo.colonne, `dopo 5 «Resetta» le colonne sono ${dopo.colonne}, non 1`).toBe(1);
    expect(dopo.annidati, `i telai delle Impostazioni si sono annidati sul 4174: ${dopo.annidati}`).toBe(0);
    expect(dopo.telai, `i telai sono passati da ${prima.telai} a ${dopo.telai}`).toBe(prima.telai);
    expect(dopo.raggiungibile, 'il tasto «Ripristina tutto l’aspetto» non è più raggiungibile dal puntatore').toBe(true);
  });
}
