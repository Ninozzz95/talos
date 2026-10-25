import { expect, test } from '@playwright/test';

/*
 * 24/10/2026 — revisione avversaria della finestra delle cartelle (R5.12), D-C1/D-C2/D-C3: le sonde del revisore (REV2-A1, A2, A4,
 *   A5) diventano prove del prodotto. «Allow» si arma dopo 1 s di visibilità VERA (non coperto da velo o finestra modale, finestra
 *   visibile), si disarma quando la finestra torna in primo piano o la carta si sposta, e mentre si arma dice perché. Rotte remote
 *   finte; ogni altra richiesta non-GET si ferma e si conta. Mai il Terminale.
 */
const ORA = Date.now();
async function fingi(page, { consensiSubito = true } = {}) {
  const stato = {
    chiamate: [], nonGetAltri: 0, giri: 0,
    consensi: [{ richiestaId: 'richiesta-0001', dispositivoId: 't1', nomeDispositivo: 'Pad di Nino', nome: 'AVM', percorso: 'D:\\Projects\\AVM', scadeAlle: new Date(ORA + 110_000).toISOString() }],
    cartelle: [
      { cartellaId: 'cartella-0000000000000001', nome: 'talos-site', percorso: 'D:\\Projects\\talos-site', consentitaAlle: new Date(ORA).toISOString(), da: 'consenso', esiste: true },
    ],
  };
  if (!consensiSubito) { stato.inArrivo = stato.consensi; stato.consensi = []; }
  await page.route('**/api/v1/**', async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname;
    if (p.startsWith('/api/v1/remote')) {
      stato.chiamate.push(`${r.method()} ${p}`);
      if (p === '/api/v1/remote') {
        stato.giri += 1;
        return route.fulfill({ json: { ok: true, data: {
          disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: ['t1'],
          telefoni: [{ id: 't1', nome: 'Pad di Nino', collegatoAlle: ORA, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 }, revocatoAlle: null }],
          attese: [], accoppiamento: { sbagliati: 0 }, consensi: stato.consensi,
        } } });
      }
      const consenso = /^\/api\/v1\/remote\/consents\/([^/]+)\/(allow|deny)$/u.exec(p);
      if (consenso) { stato.consensi = stato.consensi.filter((c) => c.richiestaId !== consenso[1]); return route.fulfill({ json: { ok: true, data: { esito: 'ok' } } }); }
      if (p === '/api/v1/remote/phones/t1/folders' && r.method() === 'GET') return route.fulfill({ json: { ok: true, data: { cartelle: stato.cartelle } } });
      return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND' } } });
    }
    if (p.startsWith('/api/v1/workspace-browser')) {
      return route.fulfill({ json: { ok: true, data: { root: 'D:\\', path: 'D:\\Projects', parent: 'D:\\', items: [{ name: 'uno', path: 'D:\\Projects\\uno', projectId: null }], recommended: [] } } });
    }
    if (r.method() !== 'GET') { stato.nonGetAltri += 1; return route.abort(); }
    return route.continue();
  });
  return stato;
}
async function apri(page, { w = 1920, h = 1080, tema = 'dark', lingua = 'en' } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(([colorMode, uiLanguage]) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage, colorMode } }));
  }, [tema, lingua]);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
}
const carta = (page) => page.locator('[data-remoto-consenso="richiesta-0001"]');
const si = (page) => carta(page).locator('[data-remoto-consenti]');
const armata = (page) => expect(si(page)).not.toHaveAttribute('data-in-armamento', /.*/u, { timeout: 5_000 });
const post = (stato) => stato.chiamate.filter((c) => c.startsWith('POST'));


test('ARM-01 (REV2-A1) — la finestra torna in primo piano: «Allow» si disarma e un clic subito non consente; dopo un attimo sì', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page);
  await armata(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  await si(page).click({ force: true });
  await page.waitForTimeout(150);
  expect(post(stato)).toEqual([]);
  await armata(page);
  await si(page).click();
  await expect.poll(() => post(stato)).toContain('POST /api/v1/remote/consents/richiesta-0001/allow');
  expect(stato.nonGetAltri).toBe(0);
});

test('ARM-02 (REV2-A2) — la carta si sposta (finestra ristretta): «Allow» si disarma', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page);
  await armata(page);
  const primaX = (await carta(page).boundingBox()).x;
  await page.setViewportSize({ width: 520, height: 900 });
  await expect.poll(async () => (await carta(page).boundingBox()).x).not.toBe(primaX);
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  expect(stato.nonGetAltri).toBe(0);
});

test('ARM-03 (REV2-A4) — «Later» e Esc rimettono il fuoco sull\'icona; ai giri dopo resta nascosta; l\'icona la riporta DISARMATA', async ({ page }) => {
  test.setTimeout(40_000);
  const stato = await fingi(page);
  await apri(page);
  await armata(page);
  await carta(page).locator('[data-remoto-piu-tardi]').click();
  await expect(carta(page)).toBeHidden();
  await expect(page.locator('#telefoniRemoto')).toBeFocused();
  const giri = stato.giri;
  await expect.poll(() => stato.giri, { timeout: 10_000 }).toBeGreaterThan(giri);
  await expect(carta(page)).toHaveCount(0);
  await page.locator('#telefoniRemoto').click();
  await expect(carta(page)).toBeVisible();
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  await page.keyboard.press('Escape');
  await expect(carta(page)).toBeHidden();
  await expect(page.locator('#telefoniRemoto')).toBeFocused();
  expect(post(stato)).toEqual([]);
  expect(stato.nonGetAltri).toBe(0);
});

test('ARM-04 (REV2-A5, D-C1) — la carta arriva sotto una finestra modale: alla chiusura «Allow» NON è già armato, e dice perché', async ({ page }) => {
  test.setTimeout(40_000);
  const stato = await fingi(page, { consensiSubito: false });
  await apri(page);
  await page.locator('#newSessionBtn').click();
  await page.locator('.workspace-chooser-tree-frame').waitFor();
  stato.consensi = stato.inArrivo;
  await expect.poll(() => carta(page).count(), { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(1500);
  const coperto = await page.evaluate(() => {
    const b = document.querySelector('[data-remoto-consenso="richiesta-0001"] [data-remoto-consenti]');
    const r = b.getBoundingClientRect();
    return !b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(coperto, 'la scena vera: «Allow» sotto la finestra modale').toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  /* D-C3: mentre si arma, il motivo è detto a chi usa un lettore di schermo */
  const descritto = await si(page).evaluate((b) => document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent ?? '');
  expect(descritto).toBe('Available in a moment, so a stray click cannot allow it.');
  await si(page).click({ force: true });
  await page.waitForTimeout(150);
  expect(post(stato)).toEqual([]);
  await armata(page);
  await expect(si(page)).not.toHaveAttribute('aria-describedby', /.*/u);
  expect(stato.nonGetAltri).toBe(0);
});

/* ------------------------------------------------------------------------------------------------------------------------
 * Revisione avversaria a blocco 3 (24/10/2026, `REVISIONE-BLOCCO-3-2026-10-24.md` §2b): le tre riserve S4, curate e provate.
 * ------------------------------------------------------------------------------------------------------------------------ */

test('ARM-05 (REV3) — armato, la frase «Available in a moment…» se ne va anche per il lettore di schermo', async ({ page }) => {
  await fingi(page);
  await apri(page);
  const frase = carta(page).locator('.sr-only');
  await armata(page);
  await expect(frase).toBeHidden();
  /* AL CONTRARIO: disarmato, torna (e «Allow» la indica) */
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  expect(await frase.evaluate((n) => n.hidden)).toBe(false);
});

test('ARM-06 (REV3) — la finestra torna visibile SENZA un evento focus: «Allow» riparte da capo', async ({ page }) => {
  await fingi(page);
  await apri(page);
  await armata(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(si(page)).toHaveAttribute('data-in-armamento', '');
  await armata(page);
});

test('ARM-07 (REV3) — finestra bassa: il centro di «Allow» è fuori, il pezzo visibile si arma e consente', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page, { w: 1280, h: 300 });
  await expect(carta(page)).toBeVisible();
  const r = await si(page).boundingBox();
  test.skip(!r || r.y + r.height / 2 <= 300, `il centro di «Allow» è dentro la finestra (${r && Math.round(r.y + r.height / 2)} px): il caso non si presenta`);
  await armata(page);
  await si(page).click({ position: { x: 8, y: 4 } });
  await expect.poll(() => post(stato)).toContain('POST /api/v1/remote/consents/richiesta-0001/allow');
});
