/*
 * D22 del Tester (02/11/2026): a 390 px la chat con tutte le pillole allargava la pagina a 413 px. Misurato sul 4174: il pulsante
 * d'invio fuori dalla finestra, compositore largo 196 px, schede sotto le azioni della testata.
 * ⛔ Il caso cattivo non è la chat vuota: serve la fila del compositore piena, e la si forza con pillole accese.
 */
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function misura(page) {
  return page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: b.x, destra: b.right, largo: b.width } : null; };
    const schede = document.querySelector('#schermoChat .talos-topbar .talos-tabs')?.getBoundingClientRect();
    const azioni = document.querySelector('#schermoChat .talos-topbar .talos-topbar__actions')?.getBoundingClientRect();
    return { pagina: document.documentElement.scrollWidth, composer: r('#composerForm'), invio: r('#composerForm .talos-send'), schedeDestra: schede?.right ?? 0, azioniSinistra: azioni?.left ?? 0 };
  });
}

test('D22-01 a 390 px la pagina non scorre di lato, il compositore è largo e le schede non passano sotto le azioni', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { document.querySelector('[data-vaia="chat"]')?.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const bar = document.querySelector('#composerForm .talos-composer__bar');
    for (const c of bar.querySelectorAll('[hidden]')) if (!c.classList.contains('talos-ferma-agenti')) c.hidden = false;
  });
  const m = await misura(page);
  expect(m.pagina).toBeLessThanOrEqual(390);
  expect(m.composer.largo).toBeGreaterThanOrEqual(290);
  expect(m.invio.destra).toBeLessThanOrEqual(m.composer.destra);
  expect(m.schedeDestra).toBeLessThanOrEqual(m.azioniSinistra);
});

test('D22-02 AL CONTRARIO: a 900 px il piede resta quello del PC', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/');
  await page.evaluate(() => { document.querySelector('[data-vaia="chat"]')?.click(); });
  await page.waitForTimeout(400);
  const sinistra = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.talos-chat-foot')).paddingLeft));
  expect(sinistra).toBeGreaterThan(30);
});

test('TONDO-01 a 800×900 il tondo non copre «Tutte le sessioni» né a riposo né scorrendo', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  const riga = (i) => ({ sessionId: `s-${i}`, taskId: `sessione-${i}`, nome: `Sessione ${i}`, conclusa: true, stato: 'concluso' });
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: Array.from({ length: 6 }, (_, i) => riga(i)) } } }) : r.fallback()));
  await page.goto('/');
  const tasto = page.locator('#schermoHome .workspace-recent__tutte');
  await tasto.waitFor({ timeout: 6000 }).catch(() => {});
  test.skip(await tasto.count().then((n) => n === 0).catch(() => true), 'la Home di questo profilo non ha sessioni recenti');
  const coperto = await page.evaluate(() => {
    const b = document.querySelector('#schermoHome .workspace-recent__tutte');
    const t = document.querySelector('#apriCassettoBarra').getBoundingClientRect();
    const s = document.querySelector('#schermoHome');
    const copre = () => { const q = b.getBoundingClientRect(); return !(q.right < t.x || q.x > t.right || q.bottom < t.y || q.y > t.bottom); };
    for (let y = 0; y <= s.scrollHeight - s.clientHeight; y += 20) { s.scrollTop = y; if (copre()) return true; }
    return copre();
  });
  expect(coperto).toBe(false);
});
