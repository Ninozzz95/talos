import { readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';

import { expect, test } from '@playwright/test';

const MODEL = 'stealth/space-bunny-alpha';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('REAL-SPACE-BUNNY-019 — composer → leggi → risposta → reload con modello esatto', async ({ page, request }) => {
  test.skip(process.env.TALOS_REAL_SPACE_BUNNY_GATE !== '1', 'Gate opt-in: una richiesta reale solo a Space Bunny Alpha.');
  test.setTimeout(240_000);
  page.setDefaultTimeout(30_000);

  const workspace = realpathSync(process.env.TALOS_HARNESS_UI_PROJECT_DIRS || '');
  expect(basename(workspace)).toBe('space-bunny-019-project');
  const code = readFileSync(join(workspace, 'prova.txt'), 'utf8').trim();
  expect(code).toMatch(/^SB019-[A-Z0-9]{8}$/u);

  const catalogResponse = await fetch('https://openrouter.ai/api/v1/models');
  expect(catalogResponse.ok, 'Catalogo OpenRouter non disponibile: nessuna chiamata al modello.').toBe(true);
  const catalog = await catalogResponse.json();
  const model = catalog.data?.find((item) => item.id === MODEL);
  expect(model?.pricing?.prompt, 'Prezzo input mutato: nessuna chiamata al modello.').toBe('0');
  expect(model?.pricing?.completion, 'Prezzo output mutato: nessuna chiamata al modello.').toBe('0');
  expect(model?.supported_parameters).toContain('tools');

  const key = process.env.OPENROUTER_API_KEY;
  expect(key, 'Chiave OpenRouter assente nel processo di prova.').toBeTruthy();
  const provision = await request.post('/api/v1/providers/openrouter/key', { data: { key } });
  expect(provision.status(), 'Portachiavi di prova non configurato.').toBe(200);

  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 30_000 });
  await page.getByRole('button', { name: /^(?:New conversation|Nuova conversazione)$/u }).last().click();
  const chooser = page.getByRole('dialog', { name: 'Su quale progetto lavora TALOS?' });
  await expect(chooser).toBeVisible();
  const picker = chooser.locator('.model-picker').first();
  await picker.locator('.model-picker-trigger').click();
  const search = picker.locator('.model-picker-search input');
  await expect(search).toBeVisible();
  await search.fill(MODEL);
  const option = picker.getByRole('option').filter({ hasText: MODEL }).first();
  await expect(option, 'Modello assente nel picker TALOS: nessun fallback.').toBeVisible();
  await option.click();
  await chooser.locator('#workspaceChooserSubmit').click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await expect(chooser).not.toBeVisible();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText('space-bunny-alpha');

  let requestedModel = null;
  await page.route('**/api/v1/sessions/custom', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    requestedModel = body?.modello ?? null;
    if (requestedModel !== MODEL || body.modelloPlanner || body.fallbackProviders?.length) return route.abort();
    return route.continue();
  });

  const prompt = 'Leggi il file prova.txt nella cartella di lavoro e dimmi esattamente il suo codice. Non modificare file.';
  await page.locator('#composerInput').fill(prompt);
  await expect(page.locator('#composerInput')).toHaveValue(prompt);
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => requestedModel).toBe(MODEL);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime?.realSessionState?.id || null), {
    timeout: 30_000,
  }).not.toBeNull();
  const sessionId = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventoTerminaleVisto), {
    timeout: 180_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(true);
  const readReceipt = page.locator('#conversation .talos-activity, #conversation [role="status"]')
    .filter({ hasText: /1 file (?:read|letto)/iu }).first();
  await expect(readReceipt).toBeVisible();
  await expect(page.locator('#conversation')).toContainText(code);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.currentRunModel)).toBe(MODEL);
  await expect(page.locator('#conversation .talos-turn[data-turno="talos"] .talos-message__meta').last()).toContainText('space-bunny-alpha');

  await page.reload();
  await page.locator(`[data-real-session-id="${sessionId}"]`).click();
  await expect(page.locator('#conversation')).toContainText(code);
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText('space-bunny-alpha');
});
