import { test, expect } from '@playwright/test';

/*
 * Difetto (9) delle foto di Ask e del Piano, riverificato sul 4174 il 26/09: nelle tendine della scheda Aspetto la freccia
 * era il carattere «⌄», che nel font dell'interfaccia si legge «v» e siede sulla linea di base. Ora è l'icona `#i-chevron`.
 * Server di prova (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
for (const tema of ['dark', 'light']) {
  test(`SELECT-CHEVRON-09 — la freccia delle tendine è un'icona centrata, non una «v» di testo (${tema})`, async ({ page }) => {
    const contatore = { nonGet: 0 };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.addInitScript((colorMode) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
    }, tema);
    await page.route('**/api/v1/**', (route) => { if (route.request().method() !== 'GET') { contatore.nonGet += 1; return route.abort(); } return route.continue(); });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    await page.locator('[data-vaia="impostazioni"]').click();
    await page.locator('#setting-tab-appearance').click();
    const tendine = page.locator('[data-setting-row] .calm-select:visible');
    await expect(tendine.first()).toBeVisible();
    const misure = await tendine.evaluateAll((lista) => lista.slice(0, 6).map((s) => {
      const f = s.querySelector('.calm-select__chevron');
      const rs = s.getBoundingClientRect(); const rf = f.getBoundingClientRect();
      return { testo: f.textContent, icona: f.querySelector('svg use')?.getAttribute('href') ?? null, scarto: Math.abs((rf.top + rf.bottom) / 2 - (rs.top + rs.bottom) / 2), w: Math.round(rf.width) };
    }));
    expect(misure.length).toBeGreaterThan(2);
    for (const m of misure) {
      expect(m.testo, 'nessun carattere a fare da freccia').toBe('');
      expect(m.icona).toBe('#i-chevron');
      expect(m.scarto, 'centrata in verticale nella tendina').toBeLessThanOrEqual(1);
      expect(m.w).toBeGreaterThan(8);
    }
    await page.screenshot({ path: `artifacts/tendine-freccia-1440-${tema}.png` });
    expect(contatore.nonGet).toBe(0);
  });
}
