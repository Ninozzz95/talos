/*
 * FE-009: la vista Lavagna nella Bacheca vera. Stesse sessioni, stessi filtri, la scelta resta dopo una ricarica, un clic apre la conversazione.
 */
import { expect, test } from '@playwright/test';

const SESSIONI = [
  { sessionId: 'a', nome: 'Al lavoro', conclusa: false, modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date().toISOString() },
  { sessionId: 'b', nome: 'Ferma su una carta', conclusa: false, inAttesaApprovazione: true, modello: 'z-ai/glm-5.3-flash' },
  { sessionId: 'c', nome: 'Interrotta', conclusa: true, interrotta: true, modello: 'z-ai/glm-5.3-flash' },
  { sessionId: 'd', nome: 'Finita', conclusa: true, ultimoEsito: 'successo', modello: 'z-ai/glm-5.3-flash', passi: { fatti: 3, totale: 7 } },
];
async function apriBacheca(page) {
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: SESSIONI } } }) : r.fallback()));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.locator('.talos-nav-item', { hasText: 'Bacheca' }).click();
  await expect(page.locator('#schermoBoard')).toBeVisible();
}

test.use({ viewport: { width: 1280, height: 860 } });

test('LAV-WEB-01 Tabella e Lavagna mostrano le stesse sessioni, a quattro colonne; la nota si nasconde', async ({ page }) => {
  await apriBacheca(page);
  await expect(page.locator('#boardTabella tr[data-board-session-id]')).toHaveCount(4);
  await page.locator('[data-board-vista="lavagna"]').click();
  await expect(page.locator('.lavagna .lav-col')).toHaveCount(4);
  await expect(page.locator('.lavagna .lav-carta')).toHaveCount(4);
  /* la legenda del «—» (parla delle colonne della Tabella); la riga di stato #boardEsito è anche lei `.talos-page__note` */
  await expect(page.locator('#schermoBoard .talos-page__note:not(#boardEsito)')).toBeHidden();
  await page.locator('[data-board-vista="tabella"]').click();
  await expect(page.locator('#schermoBoard .talos-page__note:not(#boardEsito)'), 'tornati alla Tabella, la legenda torna').toBeVisible();
  await page.locator('[data-board-vista="lavagna"]').click();
  await expect(page.locator('.lav-col').nth(2)).toContainText('Interrotta');
  await expect(page.locator('.lavagna')).toContainText('3 di 7 passi');
});

test('LAV-WEB-02 la scelta resta dopo una ricarica, e il filtro vale anche qui', async ({ page }) => {
  await apriBacheca(page);
  await page.locator('[data-board-vista="lavagna"]').click();
  await page.locator('[data-board-stato="attesa"]').click();
  await expect(page.locator('.lavagna .lav-carta')).toHaveCount(1);
  await page.reload();
  await apriBacheca(page);
  await expect(page.locator('.lavagna')).toBeVisible();
});

test('LAV-WEB-03 stretta non esce dalla pagina', async ({ page }) => {
  /* A 390 px la voce «Bacheca» della barra non è a schermo: si apre la Lavagna a larghezza piena, poi si stringe e si misura. */
  await apriBacheca(page);
  await page.locator('[data-board-vista="lavagna"]').click();
  await expect(page.locator('.lavagna .lav-carta')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.lavagna')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
