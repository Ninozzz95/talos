import { test, expect } from '@playwright/test';

/*
 * ⛔ 24/09/2026 notte — I PANNELLI CHE GALLEGGIANO HANNO IL FONDO PIENO, IN TUTTI I TEMI.
 * Owner, con la foto del 4174 (pannello «Aspetta te» aperto, la barra laterale leggibile attraverso): «su tutti i temi è così».
 * Causa misurata: `.talos-card` (`design-system/controls.css:136`, importato dopo `index.css`) ridipinge il pannello e il menu
 * contestuale col suo gradiente al 2% → 1% e azzera `background-color` ⇒ `rgba(0, 0, 0, 0)` in Forge e in Calm.
 * Qui si prova il fondo CALCOLATO dei due pannelli per i 14 temi × chiaro/scuro: alfa 1, mai trasparente.
 * Banco: la 4176 del `webServer`, mai il 4174.
 */
test.use({ locale: 'it-IT' });

const TEMI = ['forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'telemetry', 'calm'];

/** L'alfa di un colore calcolato, in qualunque forma lo restituisca il motore (`rgb`, `rgba`, `color(srgb …)`). */
function alfa(colore) {
  const c = String(colore).trim();
  if (c === 'transparent') return 0;
  const barra = c.match(/\/\s*([\d.]+%?)\s*\)$/); // `color(srgb r g b / a)`
  if (barra) return barra[1].endsWith('%') ? Number.parseFloat(barra[1]) / 100 : Number(barra[1]);
  const rgba = c.match(/^rgba\(([^)]+)\)$/);
  if (rgba) return Number(rgba[1].split(',')[3]);
  return 1; // `rgb(...)` e `color(srgb r g b)` senza alfa sono pieni
}

test('PANNELLI-OPACHI — «Aspetta te» e il menu contestuale hanno il fondo pieno in 14 temi × chiaro/scuro', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  // il pannello si apre come lo apre la persona: dal campanello
  await page.locator('button[aria-label^="Notifiche"]').first().click();
  await expect(page.locator('#pannelloNotifiche')).toBeVisible();
  const esiti = await page.evaluate((temi) => {
    const radice = document.documentElement;
    const menu = document.getElementById('menuFile');
    const menuNascosto = menu.hidden; menu.hidden = false; // il menu dei file: basta che sia disegnato, non serve un file
    const prima = { tema: radice.getAttribute('data-talos-theme'), modo: radice.getAttribute('data-theme') };
    const out = [];
    for (const tema of temi) for (const modo of ['light', 'dark']) {
      radice.setAttribute('data-talos-theme', tema);
      if (modo === 'light') radice.setAttribute('data-theme', 'light'); else radice.removeAttribute('data-theme');
      out.push({ tema, modo,
        pannello: getComputedStyle(document.getElementById('pannelloNotifiche')).backgroundColor,
        menu: getComputedStyle(menu).backgroundColor });
    }
    menu.hidden = menuNascosto;
    radice.setAttribute('data-talos-theme', prima.tema);
    if (prima.modo) radice.setAttribute('data-theme', prima.modo); else radice.removeAttribute('data-theme');
    return out;
  }, TEMI);
  expect(esiti).toHaveLength(28);
  const trasparenti = esiti.filter((e) => alfa(e.pannello) < 1 || alfa(e.menu) < 1);
  expect(trasparenti, 'nessun tema lascia vedere sotto il pannello o il menu').toEqual([]);
});
