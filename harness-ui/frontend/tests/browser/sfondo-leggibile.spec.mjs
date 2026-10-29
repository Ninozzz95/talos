import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/*
 * Owner 28/10/2026 notte: lo sfondo animato di serie si accende solo se il testo resta leggibile. Accesa così com'era, la scena Forge
 * (tema di serie) portava nei punti peggiori anche il testo PRINCIPALE a 2,92:1 (scuro) e 4,24:1 (chiaro); l'owner ha scelto sul
 * bozzetto «Corridoio velato» (desktop-background.js, VELO_DELLE_SCENE). Questa prova misura il caso peggiore DOVE STA IL TESTO
 * (W3C F83): l'interfaccia si nasconde, resta solo la scena sul fondo, sotto la colonna della chat; il testo principale e il grigio
 * secondario si risolvono dal browser. Soglia WCAG 2.2 AA per il testo normale: 4,5:1. Prima della cura: 2,92 / 4,24.
 */
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrasto = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

for (const [tema, scena] of [['forge', 'forge'], ['calm', 'calm']]) for (const modo of ['dark', 'light']) {
  test(`SFONDO-LEGGIBILE-01 · ${tema} ${modo} — sotto la colonna della chat il testo principale e il grigio secondario restano ≥ 4,5:1`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: modo });
    await page.addInitScript(({ m, t }) => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: {
      colorMode: m, uiLanguage: 'it', backgroundMotion: true, backgroundMotionVersione: 2, themePreset: t, themePresetVersione: 2, sceneOverride: t, sceneOverrideVersione: 2 } })), { m: modo, t: tema });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const scritture = [];
    await page.route('**/api/**', (r) => { if (r.request().method() === 'GET') return r.fallback(); scritture.push(r.request().method()); return r.abort(); });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    await expect(page.locator('#schermoChat canvas')).toHaveAttribute('data-scene', scena);
    await expect(page.locator('#schermoChat canvas')).toHaveAttribute('data-scene-status', 'animating');
    const info = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement); const sonda = document.createElement('span'); document.body.append(sonda);
      const rgb = (n) => { sonda.style.color = s.getPropertyValue(n).trim(); const x = document.createElement('canvas').getContext('2d'); x.fillStyle = getComputedStyle(sonda).color; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
      const cv = document.querySelector('#schermoChat canvas').getBoundingClientRect(); const col = document.querySelector('#schermoChat .talos-conversation__column').getBoundingClientRect();
      const colori = { testo: rgb('--talos-text'), muto: rgb('--talos-muted') }; sonda.remove();
      return { ...colori, cv: [cv.x, cv.y, cv.width, cv.height], col: [col.left, col.right] };
    });
    await page.addStyleTag({ content: '#schermoChat > *:not(canvas){visibility:hidden !important}' });
    const lt = lum(...info.testo), lm = lum(...info.muto);
    const clip = { x: Math.max(info.cv[0], info.col[0]), y: info.cv[1], width: Math.min(info.col[1], info.cv[0] + info.cv[2]) - Math.max(info.cv[0], info.col[0]), height: info.cv[3] };
    let principale = Infinity, secondario = Infinity;
    for (let k = 0; k < 6; k += 1) {
      const png = PNG.sync.read(await page.screenshot({ clip }));
      for (let i = 0; i < png.data.length; i += 4 * 2) { const l = lum(png.data[i], png.data[i + 1], png.data[i + 2]); principale = Math.min(principale, contrasto(l, lt)); secondario = Math.min(secondario, contrasto(l, lm)); }
      await page.waitForTimeout(1500);
    }
    console.log(`SFONDO-LEGGIBILE ${tema} ${modo}: principale ${principale.toFixed(2)} · secondario ${secondario.toFixed(2)}`);
    expect(principale, 'testo principale nel punto peggiore').toBeGreaterThanOrEqual(4.5);
    expect(secondario, 'grigio secondario nel punto peggiore').toBeGreaterThanOrEqual(4.5);
    expect(scritture).toEqual([]);
  });
}
