import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * FE-070 (R8): il segno del computer use nel browser vero, contro il bozzetto approvato (`bozzetto-computer-use-pc/index.html:849-904`).
 * Una pagina del segno (lo schermo) e una pagina che parla sul canale della bolla (la pagina principale, qui senza schermo, quindi muta).
 * Il cursore: Web Animations API, 850 ms, cubic-bezier(.3,.7,.2,1), all'orologio di t0; si legge la posizione fermando l'animazione a 0, 420 e 850 ms.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/segno-computer-use/', import.meta.url)));
const SCHERMO = 'segno.html?fx=0&fy=0&fw=1440&fh=900&scala=1';
const DA = { x: 200, y: 150 }, A = { x: 1000, y: 600 };
const FIN = { x: 120, y: 80, w: 1100, h: 700 };

/** cubic-bezier(.3,.7,.2,1): l'avanzamento in y per una frazione di tempo x, come lo calcola il browser (Newton + bisezione). */
function andamento(x) {
  const [x1, y1, x2, y2] = [0.3, 0.7, 0.2, 1];
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t ** 2 * (1 - t) + t ** 3;
  const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t ** 2 * (1 - t) + t ** 3;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 60; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
  return by(t);
}

async function apri(browser, { ridotto = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: ridotto ? 'reduce' : 'no-preference' });
  const errori = [];
  const schermo = await ctx.newPage();
  schermo.on('pageerror', (e) => errori.push(e.message));
  await schermo.goto(SCHERMO);
  const voce = await ctx.newPage();
  await voce.goto('segno.html');
  const manda = (name, value) => voce.evaluate(([n, v]) => { const c = new BroadcastChannel('talos-bolla'); c.postMessage({ tipo: 'evento', evento: { name: n, value: v } }); c.close(); }, [name, value]);
  return { ctx, schermo, manda, errori };
}
const posizione = (page) => page.evaluate(() => { const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.cursore')).transform); return { x: m.m41, y: m.m42 }; });

test('SEG-R8a viaggio lungo (senza durata = 850): la curva del cursore a 0, 420 e 850 ms è quella del bozzetto; l anello a 420 ms; il bordo pulsa ogni 2 s', async ({ browser }) => {
  const { ctx, schermo, manda, errori } = await apri(browser);
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: DA, t0: Date.now() - 5000 });
  await expect(schermo.locator('.cursore')).toBeVisible();
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: A, t0: Date.now() });
  await schermo.waitForFunction(() => document.getAnimations().some((a) => a.effect?.target?.classList?.contains('cursore')));
  const tempi = await schermo.evaluate(() => {
    const a = document.getAnimations().find((x) => x.effect.target.classList.contains('cursore'));
    a.pause();
    const t = a.effect.getTiming();
    return { durata: t.duration, andamento: t.easing };
  });
  expect(tempi).toEqual({ durata: 850, andamento: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
  for (const ms of [0, 420, 850]) {
    await schermo.evaluate((t) => { document.getAnimations().find((x) => x.effect.target.classList.contains('cursore')).currentTime = t; }, ms);
    const p = await posizione(schermo);
    const e = andamento(ms / 850);
    const atteso = { x: DA.x + (A.x - DA.x) * e - 4, y: DA.y + (A.y - DA.y) * e - 2 };
    expect(Math.abs(p.x - atteso.x), `x a ${ms} ms`).toBeLessThanOrEqual(2);
    expect(Math.abs(p.y - atteso.y), `y a ${ms} ms`).toBeLessThanOrEqual(2);
  }
  await expect(schermo.locator('.anello')).toHaveCount(1, { timeout: 2000 });
  const anello = await schermo.locator('.anello').evaluate((n) => { const s = getComputedStyle(n); return [s.animationName, s.animationDuration, s.animationTimingFunction, n.style.left, n.style.top]; });
  expect(anello).toEqual(['anello', '0.65s', 'ease-out', `${A.x + 1}px`, `${A.y + 1}px`]);
  const bordo = await schermo.locator('.guarda').evaluate((n) => { const s = getComputedStyle(n); const r = n.getBoundingClientRect(); return [s.animationName, s.animationDuration, s.animationIterationCount, s.borderRadius, r.x, r.y, r.width, r.height]; });
  expect(bordo).toEqual(['guarda', '2s', 'infinite', '11px', FIN.x, FIN.y, FIN.w, FIN.h]);
  expect(await schermo.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await schermo.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect.target.classList.contains('cursore')) a.finish(); }));
  await schermo.screenshot({ path: path.join(FOTO, 'segno-sottofondo.png') });
  await manda('talos.computer-use-esito', { motivo: 'fatto' });
  await expect(schermo.locator('.cursore, .guarda, .anello')).toHaveCount(0);
  expect(errori).toEqual([]);
  await ctx.close();
});

/* Decisione 252 dell'owner: la durata secondo la distanza (250-850 ms). Il caso breve: la stessa curva in 255 ms, l'anello a 255·420/850 = 126 ms. */
test('SEG-R8e viaggio breve: la curva dura 255 ms con lo stesso andamento, l anello a 126 ms', async ({ browser }) => {
  const { ctx, schermo, manda, errori } = await apri(browser);
  const VICINO = { x: 260, y: 190 };
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: DA, t0: Date.now() - 5000 });
  await expect(schermo.locator('.cursore')).toBeVisible();
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: VICINO, t0: Date.now(), durata: 255 });
  await schermo.waitForFunction(() => document.getAnimations().some((a) => a.effect?.target?.classList?.contains('cursore')));
  const durata = await schermo.evaluate(() => { const a = document.getAnimations().find((x) => x.effect.target.classList.contains('cursore')); a.pause(); return [a.effect.getTiming().duration, a.effect.getTiming().easing]; });
  expect(durata).toEqual([255, 'cubic-bezier(0.3, 0.7, 0.2, 1)']);
  for (const ms of [0, 126, 255]) {
    await schermo.evaluate((t) => { document.getAnimations().find((x) => x.effect.target.classList.contains('cursore')).currentTime = t; }, ms);
    const p = await posizione(schermo);
    const e = andamento(ms / 255);
    expect(Math.abs(p.x - (DA.x + (VICINO.x - DA.x) * e - 4)), `x a ${ms} ms`).toBeLessThanOrEqual(2);
    expect(Math.abs(p.y - (DA.y + (VICINO.y - DA.y) * e - 2)), `y a ${ms} ms`).toBeLessThanOrEqual(2);
  }
  await expect(schermo.locator('.anello')).toHaveCount(1, { timeout: 1000 });
  expect(await schermo.locator('.anello').evaluate((n) => [n.style.left, n.style.top])).toEqual([`${VICINO.x + 1}px`, `${VICINO.y + 1}px`]);
  expect(errori).toEqual([]);
  await ctx.close();
});

test('SEG-R8b mouse preso: anello di 40 px e «TALOS», senza freccia finta', async ({ browser }) => {
  const { ctx, schermo, manda, errori } = await apri(browser);
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: A, t0: Date.now() - 5000, modo: 'preso' });
  await expect(schermo.locator('.mio.mio--preso b')).toHaveText('TALOS');
  await expect(schermo.locator('.mio svg')).toHaveCount(0);
  const prima = await schermo.locator('.mio').evaluate((n) => { const s = getComputedStyle(n, '::before'); return [s.width, s.height, s.borderTopWidth, s.borderRadius]; });
  expect(prima).toEqual(['40px', '40px', '2px', '50%']);
  await schermo.screenshot({ path: path.join(FOTO, 'segno-mouse-preso.png') });
  expect(errori).toEqual([]);
  await ctx.close();
});

test('SEG-R8c movimento ridotto: niente animazioni, il cursore è subito sul punto, il bordo non pulsa', async ({ browser }) => {
  const { ctx, schermo, manda, errori } = await apri(browser, { ridotto: true });
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: DA, t0: Date.now() - 5000 });
  await expect(schermo.locator('.cursore')).toBeVisible();
  await manda('talos.computer-use-annuncio', { finestra: FIN, punto: A, t0: Date.now() });
  await expect(schermo.locator('.anello')).toHaveCount(1);
  expect(await schermo.evaluate(() => document.getAnimations().length)).toBe(0);
  const p = await posizione(schermo);
  expect(p).toEqual({ x: A.x - 4, y: A.y - 2 });
  expect(await schermo.locator('.guarda').evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
  expect(errori).toEqual([]);
  await ctx.close();
});

test('SEG-R8d senza schermo nella query la pagina non disegna niente', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('segno.html?fx=uno');
  const altra = await ctx.newPage();
  await altra.goto('segno.html');
  await altra.evaluate(() => { const c = new BroadcastChannel('talos-bolla'); c.postMessage({ tipo: 'evento', evento: { name: 'talos.computer-use-annuncio', value: { finestra: { x: 0, y: 0, w: 10, h: 10 }, punto: { x: 1, y: 1 }, t0: Date.now() } } }); c.close(); });
  await page.waitForTimeout(300);
  await expect(page.locator('.cursore, .guarda')).toHaveCount(0);
  await ctx.close();
});
