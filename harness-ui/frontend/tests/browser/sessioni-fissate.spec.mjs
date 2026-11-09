/*
 * FE-001, decisione dell'owner del 02/11/2026: la stella per fissare una sessione, al passaggio del puntatore e nel menu «⋯»; la riga a
 * riposo non cambia. Le righe vengono da `GET /api/v1/sessions`, finta qui per averne un numero noto.
 */
import { expect, test } from '@playwright/test';

const riga = (i) => ({ sessionId: `s-${i}`, taskId: `sessione-${i}`, nome: `Sessione ${i}`, conclusa: true, stato: 'concluso' });
const titoli = (page) => page.locator('.talos-sidebar .talos-session-item__title').allTextContents();

async function apri(page) {
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: [riga(1), riga(2), riga(3)] } } }) : r.fallback()));
  await page.goto('/');
  await page.locator('.talos-sidebar .talos-session-item').first().waitFor({ timeout: 10000 });
}

test('FISSA-B01 a riposo la stella non si vede; passando sopra sì; un clic fissa, non apre, e dura dopo la ricarica', async ({ page }) => {
  await apri(page);
  const rigaTre = page.locator('.td-session-row', { hasText: 'Sessione 3' });
  const stella = rigaTre.locator('.td-session-star');
  await expect(stella).toHaveCSS('opacity', '0');
  await expect(page.locator('.td-session-fissate')).toHaveCount(0);
  await page.mouse.move(600, 500);
  await rigaTre.hover();
  await expect(stella).toHaveCSS('opacity', '1');
  await expect(stella).toHaveAttribute('aria-pressed', 'false');
  await stella.click();
  await expect(page.locator('.td-session-fissate')).toBeVisible();
  await expect.poll(() => titoli(page)).toEqual(['Sessione 3', 'Sessione 1', 'Sessione 2']);
  await expect(page.locator('.td-session-row', { hasText: 'Sessione 3' }).locator('.td-session-star')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.locator('.talos-sidebar .talos-session-item').first().waitFor({ timeout: 10000 });
  await expect.poll(() => titoli(page)).toEqual(['Sessione 3', 'Sessione 1', 'Sessione 2']);
});

test('FISSA-B02 il menu «⋯» fissa e toglie, con la voce giusta', async ({ page }) => {
  await apri(page);
  await page.locator('.td-session-row', { hasText: 'Sessione 2' }).locator('.td-session-menu').click();
  await page.getByRole('menuitem', { name: 'Fissa in cima' }).click();
  await expect.poll(() => titoli(page)).toEqual(['Sessione 2', 'Sessione 1', 'Sessione 3']);
  await page.locator('.td-session-row', { hasText: 'Sessione 2' }).locator('.td-session-menu').click();
  await page.getByRole('menuitem', { name: 'Togli dalle fissate' }).click();
  await expect.poll(() => titoli(page)).toEqual(['Sessione 1', 'Sessione 2', 'Sessione 3']);
  await expect(page.locator('.td-session-fissate')).toHaveCount(0);
});

test('FISSA-B03 col fuoco da tastiera la stella si vede e si usa', async ({ page }) => {
  await apri(page);
  const prima = page.locator('.talos-sidebar .talos-session-item').first();
  await prima.focus();
  const stella = page.locator('.td-session-row').first().locator('.td-session-star');
  await expect(stella).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Tab');
  await expect(stella).toBeFocused();
  await expect(stella).toHaveCSS('opacity', '1');
});

/* Decisione 69 (03/11/2026): con un server che conosce il campo `fissata`, la stella si scrive sul server (POST …/pin) e si legge dall'elenco;
   le fissate di questo PC passano al server una volta sola e la chiave locale si toglie. AL CONTRARIO le tre prove sopra, senza il campo, restano locali. */
async function apriColServer(page, { locali = null } = {}) {
  const fissate = new Set();
  const chiamate = [];
  await page.addInitScript((valore) => { if (valore) window.localStorage.setItem('talos.harness.desktop.barra.fissate.v1', valore); }, locali ? JSON.stringify(locali) : null);
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ json: { ok: true, data: { items: [1, 2, 3].map((i) => ({ ...riga(i), fissata: fissate.has(`s-${i}`) })) } } }) : r.fallback()));
  await page.route('**/api/v1/sessions/*/pin', async (r) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split('/')[4]);
    const { fissata } = r.request().postDataJSON();
    chiamate.push({ id, fissata });
    if (fissata) fissate.add(id); else fissate.delete(id);
    return r.fulfill({ json: { ok: true, data: { ok: true, fissata } } });
  });
  await page.goto('/');
  await page.locator('.talos-sidebar .talos-session-item').first().waitFor({ timeout: 10000 });
  return { chiamate, fissate };
}

test('FISSA-B04 (decisione 69) col server: la stella scrive sul server e l ordine viene dall elenco', async ({ page }) => {
  const { chiamate, fissate } = await apriColServer(page);
  const rigaTre = page.locator('.td-session-row', { hasText: 'Sessione 3' });
  await rigaTre.hover();
  await rigaTre.locator('.td-session-star').click();
  await expect.poll(() => chiamate).toEqual([{ id: 's-3', fissata: true }]);
  await expect.poll(() => titoli(page)).toEqual(['Sessione 3', 'Sessione 1', 'Sessione 2']);
  expect([...fissate]).toEqual(['s-3']);
  expect(await page.evaluate(() => window.localStorage.getItem('talos.harness.desktop.barra.fissate.v1'))).toBeNull();
});

test('FISSA-B05 (decisione 69) le fissate locali passano al server una volta e la chiave locale sparisce', async ({ page }) => {
  const { chiamate } = await apriColServer(page, { locali: ['s-2', 'sparita'] });
  await expect.poll(() => chiamate).toEqual([{ id: 's-2', fissata: true }]);
  await expect.poll(() => titoli(page)).toEqual(['Sessione 2', 'Sessione 1', 'Sessione 3']);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('talos.harness.desktop.barra.fissate.v1'))).toBeNull();
});
