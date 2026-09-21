import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const MODELLO_AUTORIZZATO = 'qwen/qwen3.8-flash';
const MODELLO_SOLO_PERSISTENZA = 'google/gemini-3.7-flash';

async function scegliModello(page, modelId) {
  await page.locator('[data-open-sheet="model"]').click();
  const search = page.locator('.model-picker-search input');
  await expect(search).toBeVisible();
  await search.fill(modelId);
  const option = page.getByRole('option').filter({ hasText: modelId }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText(modelId);
}

test('OPENROUTER-REAL-QWEN-09 — composer, tool trace, cambio modello, follow-up e reload restano coerenti', async ({ page }) => {
  test.skip(process.env.TALOS_REAL_QWEN_GATE !== '1', 'Gate opt-in: esegue due turni reali esclusivamente con Qwen 3.8 Flash.');
  test.setTimeout(360_000);
  page.setDefaultTimeout(30_000);

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const visualDir = resolve(process.cwd(), 'artifacts', 'real-qwen-gate-2026-09-01');
  await mkdir(visualDir, { recursive: true });

  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await scegliModello(page, MODELLO_AUTORIZZATO);

  const firstPrompt = 'Leggi il file harness-ui/package.json, dimmi il nome del pacchetto e conferma se la dipendenza eventsource-parser è presente. Non modificare alcun file.';
  await page.locator('#composerInput').fill(firstPrompt);
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());

  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime?.realSessionState?.id ?? null), {
    timeout: 30_000,
  }).not.toBeNull();
  const sessionId = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id);
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);

  const activity = page.locator('.real-waiting-note');
  await expect(activity).toBeVisible({ timeout: 30_000 });
  await expect(activity.locator('.talos-line-loader-node')).toHaveCount(3);
  await page.screenshot({ path: resolve(visualDir, '01-qwen-in-corso-1440x900.png'), fullPage: true });

  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventoTerminaleVisto), {
    timeout: 240_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(true);
  await expect.poll(() => page.locator('.real-tool-note').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.real-tool-note[data-tool-state="complete"]').count()).toBeGreaterThan(0);
  await expect(page.locator('#conversation')).toContainText('eventsource-parser');
  await expect(page.locator('.assistant-meta').last()).toContainText(MODELLO_AUTORIZZATO);
  await page.screenshot({ path: resolve(visualDir, '02-qwen-tool-completato-1440x900.png'), fullPage: true });

  // Il modello alternativo viene soltanto salvato e riletto: nessun messaggio
  // reale parte mentre è selezionato.
  await scegliModello(page, MODELLO_SOLO_PERSISTENZA);
  await page.reload();
  await page.locator(`[data-real-session-id="${sessionId}"]`).click();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText(MODELLO_SOLO_PERSISTENZA);
  await scegliModello(page, MODELLO_AUTORIZZATO);

  const runCountPrima = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.runCount);
  const followUp = 'In una sola frase: quale dipendenza hai appena verificato e in quale file?';
  await page.locator('#composerInput').fill(followUp);
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.runCount), {
    timeout: 30_000,
  }).toBeGreaterThan(runCountPrima);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventoTerminaleVisto), {
    timeout: 240_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(true);
  await expect(page.locator('#conversation')).toContainText(followUp);
  await expect(page.locator('#conversation')).toContainText('eventsource-parser');
  await expect(page.locator('.assistant-meta').last()).toContainText(MODELLO_AUTORIZZATO);
  await page.screenshot({ path: resolve(visualDir, '03-qwen-follow-up-1440x900.png'), fullPage: true });

  await page.reload();
  await page.locator(`[data-real-session-id="${sessionId}"]`).click();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText(MODELLO_AUTORIZZATO);
  await expect(page.locator('#conversation')).toContainText(firstPrompt);
  await expect(page.locator('#conversation')).toContainText(followUp);
  await expect(page.locator('#conversation')).toContainText('eventsource-parser');
  await expect.poll(() => page.locator('.real-tool-note[data-tool-state="complete"]').count()).toBeGreaterThan(0);
  await page.screenshot({ path: resolve(visualDir, '04-qwen-reload-persistito-1440x900.png'), fullPage: true });

  expect(pageErrors).toEqual([]);
  await writeFile(resolve(visualDir, 'gate.json'), `${JSON.stringify({
    sessionId,
    realModelsCalled: [MODELLO_AUTORIZZATO],
    settingsOnlyModel: MODELLO_SOLO_PERSISTENZA,
    prompts: [firstPrompt, followUp],
  }, null, 2)}\n`, 'utf8');
});

