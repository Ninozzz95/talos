/*
 * FE-008: i Passi nella chat vera. Gli eventi sono quelli del server, dati al gestore della pagina come fa `blocchi-chat.spec`. Sopra la riga viva,
 * niente riga di `steps_update` nell'elenco degli strumenti, la lista torna dopo una ricarica.
 */
import { expect, test } from '@playwright/test';

const ID = 'chat-passi';
async function apri(page) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Passi', 'chatgpt:gpt-prova', { conclusa: false, modello: 'chatgpt:gpt-prova' });
  }, ID);
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
const lista = (revisione, ora) => ({ type: 'CUSTOM', name: 'talos.passi.v1', value: { revisione, voci: ['Leggo', 'Scrivo', 'Provo'].map((testo, i) => ({ testo, stato: i < ora ? 'completed' : i === ora ? 'in_progress' : 'pending', ...(i <= ora ? { iniziatoAl: Date.now() - 2000 } : {}), ...(i < ora ? { finitoAl: Date.now() - 1000 } : {}) })) } });

test.use({ viewport: { width: 1280, height: 860 } });

test('PASSI-CHAT-01 la lista sta sopra la riga viva, conta fatti su totale e si spunta', async ({ page }) => {
  await apri(page);
  await manda(page, [{ type: 'RunStarted', threadId: ID, runId: 'r1' }, lista(1, 0)]);
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeVisible();
  await expect(passi).toContainText('Passi · 0 di 3');
  await expect(page.locator('.talos-chat-foot > .talos-passi + .talos-status-strip')).toHaveCount(1);
  await manda(page, [lista(2, 1)]);
  await expect(passi).toContainText('Passi · 1 di 3');
  await expect(passi.locator('[data-passo="fatto"]')).toHaveCount(1);
  await manda(page, [lista(1, 0)]);
  await expect(passi).toContainText('Passi · 1 di 3');
});

test('PASSI-CHAT-02 la riga di `steps_update` non compare fra gli strumenti, le altre sì', async ({ page }) => {
  await apri(page);
  await manda(page, [
    { type: 'RunStarted', threadId: ID, runId: 'r1' },
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'steps_update' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"steps":[]}' },
    { type: 'ToolCallEnd', toolCallId: 'a' },
    { type: 'ToolCallResult', toolCallId: 'a', content: 'ok 0/3' },
    { type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'leggi' },
  ]);
  await expect(page.locator('#conversation')).not.toContainText('steps');
  await expect(page.locator('#conversation .talos-tool-row')).toHaveCount(1);
});

test('PASSI-CHAT-03 cambiando chat la lista non resta, e a lista finita si chiude da sola', async ({ page }) => {
  await apri(page);
  await manda(page, [{ type: 'RunStarted', threadId: ID, runId: 'r1' }, lista(1, 3), { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } }]);
  await expect(page.locator('.talos-passi .talos-activity__head')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => { window.__talosHarnessUiRuntime.passaASessione('altra', 'workspace', 'Altra', 'chatgpt:gpt-prova', { conclusa: true }); });
  await expect(page.locator('.talos-passi')).toBeHidden();
});

test('PASSI-CHAT-04 a 390 px resta dentro la pagina', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await apri(page);
  await manda(page, [{ type: 'RunStarted', threadId: ID, runId: 'r1' }, lista(1, 1)]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
