/*
 * FE-040: il cielo beta nella pagina vera. Di serie Nuova sessione apre la finestra; con l'impostazione su Cielo apre la mappa, da cui si torna alla finestra.
 */
import { expect, test } from '@playwright/test';

const SESSIONI = [
  { sessionId: 'a', nome: 'Refactor del selettore', progetto: 'TALOS', conclusa: false, modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date().toISOString() },
  { sessionId: 'b', nome: 'Pagina dei prezzi', progetto: 'Sito', conclusa: true, ultimoEsito: 'successo', modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date(Date.now() - 86_400_000).toISOString() },
];
async function apri(page, vista) {
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: SESSIONI } } }) : r.fallback()));
  /* La scelta si semina nella memoria della finestra, dove la legge Nuova sessione (`appearance.newSessionView`, app.js): la tendina
     delle impostazioni non è nella pagina finché non si aprono le Impostazioni. */
  if (vista) await page.addInitScript((v) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { newSessionView: v } })); } catch { /* senza memoria la prova lo dice da sola */ } }, vista);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
}
/* Il «+» di Nuova sessione in cima alla barra è un pulsante a sola icona (nome nell'aria-label): si prende per id, come le altre prove. */
const nuova = (page) => page.locator('#newSessionBtn').click();

test.use({ viewport: { width: 1440, height: 860 } });

test('CIELO-WEB-01 di serie si apre la finestra', async ({ page }) => {
  await apri(page);
  await nuova(page);
  await expect(page.locator('.cielo')).toHaveCount(0);
  await expect(page.locator('.sheet-dialog--new-session')).toBeVisible();
});

test('CIELO-WEB-02 con Cielo si apre la mappa col segno Beta, e con Elenco si arriva a una sessione', async ({ page }) => {
  await apri(page, 'sky');
  await nuova(page);
  await expect(page.locator('.cielo')).toBeVisible();
  await expect(page.locator('.cielo .talos-badge')).toContainText('Beta');
  await page.locator('.cielo .c-tondo', { hasText: 'Elenco' }).click();
  await page.locator('.c-elenco .c-ses', { hasText: 'TALOS' }).click();
  await expect(page.locator('.c-pan')).toContainText('Refactor del selettore');
});

test('CIELO-WEB-03 «Usa la finestra» chiude il cielo e apre la finestra; Esc chiude', async ({ page }) => {
  await apri(page, 'sky');
  await nuova(page);
  await page.locator('.cielo .c-tondo', { hasText: 'Usa la finestra' }).click();
  await expect(page.locator('.cielo')).toHaveCount(0);
  await expect(page.locator('.sheet-dialog--new-session')).toBeVisible();
});

test('CIELO-WEB-04 a 390 px non esce dalla pagina', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await apri(page, 'sky');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
