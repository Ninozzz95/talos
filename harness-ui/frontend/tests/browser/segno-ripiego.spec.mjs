import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * FE-074 (R11, Desktop 05/11 18:34): il ripiego (c) del guscio. Un clic fatto col mouse preso senza una curva prevista: la pagina del segno chiede con
 * `window.open('talos-segno:ripiego')` (il guscio la nega), il guscio risponde con `postMessage({tipo:'segno-ripiego', punto})` in pixel fisici globali e l'anello
 * si disegna lì, convertito con lo schermo della query. Qui `window.open` si registra invece di aprire, e la risposta del guscio è la stessa chiamata di `executeJavaScript`.
 * Secondo schermo a destra, al 200%: (2920, 600) globali sono (500, 300) locali.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/segno-ripiego/', import.meta.url)));
const SCHERMO = 'segno.html?fx=1920&fy=0&fw=2880&fh=1800&scala=2';
const FIN = { x: 2000, y: 100, w: 2000, h: 1400 };
const esito = (n, extra = {}) => ({ n, fase: 'esito', tipo: 'clic', esito: 'confermata', motivo: null, modo: 'preso', processo: null, ...extra });

for (const colorScheme of ['light', 'dark']) {
  test(`SEG-R11 ${colorScheme}: un clic senza curva chiede il ripiego e l anello va dove dice il guscio; in sottofondo e con la curva non chiede`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme });
    const errori = [];
    const schermo = await ctx.newPage();
    schermo.on('pageerror', (e) => errori.push(e.message));
    await schermo.addInitScript(() => { window.__aperti = []; window.open = (u) => { window.__aperti.push(String(u)); return null; }; });
    await schermo.goto(SCHERMO);
    const voce = await ctx.newPage();
    await voce.goto('segno.html');
    const manda = (name, value) => voce.evaluate(([n, v]) => { const c = new BroadcastChannel('talos-bolla'); c.postMessage({ tipo: 'evento', evento: { name: n, value: v } }); c.close(); }, [name, value]);
    const aperti = () => schermo.evaluate(() => window.__aperti.slice());

    await manda('talos.computer-use-passo', { fase: 'annuncio', n: 1, tipo: 'clic', bersaglio: 'Treni' });
    await manda('talos.computer-use-passo', esito(1));
    await expect.poll(aperti).toEqual(['talos-segno:ripiego']);
    await schermo.evaluate(() => window.postMessage({ tipo: 'segno-ripiego', punto: { x: 2920, y: 600 } }, location.origin));
    const anello = schermo.locator('.anello');
    await expect(anello).toHaveCount(1);
    expect(await anello.evaluate((n) => [n.style.left, n.style.top])).toEqual(['501px', '301px']);
    await schermo.screenshot({ path: path.join(FOTO, `ripiego-${colorScheme}.png`) });
    await expect(anello).toHaveCount(0);

    await manda('talos.computer-use-passo', esito(2, { modo: 'sottofondo' }));
    await manda('talos.computer-use-passo', esito(3, { modo: null }));
    await manda('talos.computer-use-annuncio', { finestra: FIN, punto: { x: 3000, y: 700 }, t0: Date.now(), modo: 'preso' });
    await manda('talos.computer-use-passo', esito(4));
    await schermo.waitForTimeout(150);
    expect(await aperti(), 'in sottofondo, senza modo, o con la sua curva: nessuna richiesta').toEqual(['talos-segno:ripiego']);
    /* durante la curva una risposta del guscio arrivata in ritardo non disegna l anello sopra il cursore che vola; `.mio` non ha misura sua, si guarda l etichetta */
    await schermo.evaluate(() => window.postMessage({ tipo: 'segno-ripiego', punto: { x: 2920, y: 600 } }, location.origin));
    await schermo.waitForTimeout(100);
    await expect(schermo.locator('.anello')).toHaveCount(0);
    await expect(schermo.locator('.mio b')).toBeVisible();

    expect(errori).toEqual([]);
    await ctx.close();
  });
}
