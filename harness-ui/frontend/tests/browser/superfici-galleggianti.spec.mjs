/*
 * ⛔⛔ 18/09/2026 — una superficie che GALLEGGIA sopra il contenuto ha uno sfondo pieno, nei due temi.
 * Nato da una foto: dopo l'integrazione della PR #27 il toast era trasparente (`rgba(0,0,0,0)`), perché il foglio nuovo dei
 * controlli ridefinisce lo sfondo di ogni `.talos-card`. Si misura il colore CALCOLATO, non la presenza di una classe.
 */
import { expect, test } from '@playwright/test';

const opaco = (colore) => { const m = /rgba?\(([^)]+)\)/.exec(colore); if (!m) return false; const p = m[1].split(',').map((x) => Number(x.trim())); return p.length === 3 || p[3] >= 0.97; };

for (const tema of ['dark', 'light']) {
  test(`GALLEGGIANTI-01 (${tema}) — il toast ha uno sfondo pieno`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(({ colorMode }) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ } }, { colorMode: tema });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const toast = page.locator('#regioneToast .talos-toast:not([data-demo])').first();
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(500); // l'animazione d'entrata porta l'opacità a 1
    const m = await toast.evaluate((t) => { const s = getComputedStyle(t); return { sfondo: s.backgroundColor, opacita: s.opacity }; });
    console.log(`MISURA-GALLEGGIANTI toast ${tema} = ${JSON.stringify(m)}`);
    expect(opaco(m.sfondo), `lo sfondo del toast è ${m.sfondo}: ciò che sta dietro si legge attraverso`).toBe(true);
    expect(Number(m.opacita)).toBeGreaterThan(0.97);
  });
}
