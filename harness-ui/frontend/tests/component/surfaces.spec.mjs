import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/superfici');

/*
 * Le otto superfici estratte, GUARDATE nel browser vero.
 *
 * ⛔ Perché questo file esiste: le superfici avevano prove unitarie verdi e
 * nessuno le aveva viste a schermo. Un test che passa dice che il codice fa
 * quello che il test chiede — non che a schermo si veda qualcosa di sensato.
 *
 * ⛔ Le tre viewport sono quelle DESKTOP dichiarate (`playwright.lab.config.mjs`):
 * 1440×900, 1280×800 e 1024×800, dove le colonne si stringono per prime. Non
 * sono le quattro viewport mobile: quella è una regola di un'altra lane.
 */
async function apriLaboratorio(page) {
  const errori = [];
  page.on('pageerror', (errore) => errori.push(errore.message));
  page.on('console', (messaggio) => { if (messaggio.type() === 'error') errori.push(messaggio.text()); });
  page.on('response', (risposta) => { if (risposta.status() >= 400) errori.push(`${risposta.status()} ${risposta.url()}`); });
  await page.goto('/?component=Surfaces');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  return errori;
}

test('SUP-VIS-01 le otto superfici si montano senza un solo errore di console', async ({ page }) => {
  const errori = await apriLaboratorio(page);
  for (const testId of ['lab-sidebar', 'lab-topbar', 'lab-inspector', 'lab-board', 'lab-capability', 'lab-terminal', 'lab-status-bar']) {
    await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
  }
  expect(errori).toEqual([]);
});

test('SUP-VIS-02 fotografia di ogni superficie alle tre viewport desktop', async ({ page }, testInfo) => {
  await mkdir(artifacts, { recursive: true });
  const errori = await apriLaboratorio(page);
  const nome = testInfo.project.name;
  // La pagina intera, per vedere anche i rapporti fra i blocchi.
  await page.screenshot({ path: path.join(artifacts, `superfici-${nome}.png`), fullPage: true });
  for (const testId of ['lab-sidebar', 'lab-topbar', 'lab-inspector', 'lab-board', 'lab-capability', 'lab-terminal', 'lab-status-bar']) {
    await page.locator(`[data-testid="${testId}"]`).screenshot({ path: path.join(artifacts, `${testId}-${nome}.png`) });
  }
  expect(errori).toEqual([]);
});

test('SUP-VIS-03 ⛔ la pagina non scorre in orizzontale a nessuna larghezza', async ({ page }) => {
  await apriLaboratorio(page);
  const straborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(straborda, 'una superficie sta spingendo la pagina oltre la sua larghezza').toBe(false);
});

test('SUP-VIS-04 ⭐ «0 %» misurato e «—» non misurato si vedono DIVERSI nella Board', async ({ page }) => {
  await apriLaboratorio(page);
  const board = page.locator('[data-testid="lab-board"]');
  await expect(board.getByText('0', { exact: false }).first()).toBeVisible();
  const nonMisurati = board.locator('.talos-board__unmeasured');
  await expect(nonMisurati.first()).toBeVisible();
  // ⛔ Il motivo dev'essere raggiungibile, non solo il trattino.
  await expect(nonMisurati.first()).toHaveAttribute('title', /.+/);
});

test('SUP-VIS-05 ⭐ il contrassegno degli avvisi si vede sulla scheda «Processi» mentre è attiva un\'altra scheda', async ({ page }) => {
  await apriLaboratorio(page);
  const inspector = page.locator('[data-testid="lab-inspector"]');
  const schedaProcessi = inspector.locator('[data-tab-id="processi"]');
  await expect(schedaProcessi).toHaveAttribute('aria-selected', 'false');
  await expect(schedaProcessi.locator('.talos-tabs__count')).toBeVisible();
});

test('SUP-VIS-06 ⭐ il percorso della Topbar è troncato al centro ma leggibile per intero', async ({ page }) => {
  await apriLaboratorio(page);
  const percorso = page.locator('[data-testid="lab-topbar"] .talos-topbar__path');
  await expect(percorso).toHaveAttribute('title', /AVM-harness-desktop/);
  const visibile = await percorso.locator('[aria-hidden="true"]').innerText();
  expect(visibile).toContain('…');
  expect(visibile.startsWith('C:/Users')).toBe(true);
  expect(visibile.endsWith('harness-ui')).toBe(true);
});

test('SUP-VIS-07 ⛔ nessun nome tecnico di attrezzo compare come TITOLO nell\'inventario', async ({ page }) => {
  await apriLaboratorio(page);
  const titoli = await page.locator('[data-testid="lab-capability"] .talos-list-row__title').allInnerTexts();
  expect(titoli.length).toBeGreaterThan(0);
  for (const titolo of titoli) {
    expect(titolo, `«${titolo}» è un nome tecnico e non deve essere il titolo`).not.toMatch(/^[a-z0-9]+_[a-z0-9_]+$/);
  }
});

test('SUP-VIS-08 ⭐⭐ il percorso NON viene tagliato una seconda volta dal CSS', async ({ page }) => {
  await apriLaboratorio(page);
  const visibile = page.locator('[data-testid="lab-topbar"] .talos-topbar__path > [aria-hidden="true"]');
  // ⛔ Il codice tronca al centro e sa dove tagliare; se poi il CSS clippa, la
  // coda mostrata non è né quella vera né quella scelta — e la coda è proprio
  // la parte che avevamo deciso di salvare.
  const tagliato = await visibile.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(tagliato, 'il CSS sta tagliando un percorso già troncato dal codice').toBe(false);
  const testo = await visibile.innerText();
  expect(testo.endsWith('harness-ui')).toBe(true);
});
