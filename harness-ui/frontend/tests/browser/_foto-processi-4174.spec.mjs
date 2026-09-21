import { expect, test } from '@playwright/test';
/* Foto della scheda Processi sul 4174 dopo la cura del BLOCCO 4: solo la descrizione in riga. */
test.skip(!process.env.TALOS_HARNESS_UI_BASE_URL, 'sonda dell’ambiente esterno');
test.use({ locale: 'it-IT' });
test('FOTO-PROCESSI-4174', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch {} });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator('#sessionList .talos-session-item, #sessionList .td-session-row').first().click();
  await page.waitForTimeout(2500);
  /* ⛔ IL TAB DELL'ISPETTORE, non il testo «Processi»: aprendo la scheda nascosta non si disegna
     (`schedaDaSaltare`), quindi senza questo clic il pannello resta VUOTO — misurato: zero righe
     anche dopo aver aperto una sessione. E il clic sul TESTO è fragile: «Processi» compare anche
     altrove a schermo, l'attributo no. */
  await page.locator('[data-rail="processi"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '../../artifacts/blocco4/4174-processi-1440x900-dark.png', fullPage: false });
  const m = await page.evaluate(() => {
    const righe = [...document.querySelectorAll('.talos-process')].filter((r) => r.getClientRects().length > 0);
    return {
      righe: righe.length,
      /* ⛔ `data-descrizione` NON esiste più (era stato scritto e mai letto, tolto il 20/09): questa
         riga contava **sempre zero**, cioè una misura morta che sembrava un dato. Il criterio vero è
         quello che si vede: la riga ha un TITOLO disegnato (altezza > 0). */
      conTitolo: righe.filter((r) => { const t = r.querySelector('.talos-process__titolo'); return t && t.getClientRects().length > 0; }).length,
      comandiVisibili: righe.filter((r) => { const c = r.querySelector('.talos-process__cmd'); return c && c.getClientRects().length > 0; }).length,
      altezzaRiga: righe.length ? Math.round(righe.reduce((s, r) => s + r.getBoundingClientRect().height, 0) / righe.length) : null,
      titoli: righe.slice(0, 4).map((r) => (r.querySelector('.talos-process__titolo')?.textContent || '').slice(0, 52)),
    };
  });
  console.log(`MISURA-PROCESSI-4174 = ${JSON.stringify(m)}`);
  expect(m.righe, 'la scena non si è formata: nessuna riga di processo').toBeGreaterThan(0);
});
