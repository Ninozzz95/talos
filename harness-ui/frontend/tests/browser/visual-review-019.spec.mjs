import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const evidence = resolve(process.cwd(), '..', '..', 'artifacts', 'visual-019');

test('VISUAL-019-LAYOUT: inspect workflow history and full output at both release viewports and themes', async ({ page }) => {
  const scene = costruisciScena(14, { sessionId: 'visual-019-session', runId: 'visual-019-run' });
  await instradaScena(page, scene);
  await page.route(`**/api/v1/sessions/${scene.sessionId}/workflows?*`, (route) => route.fulfill({ json: { ok: true, data: {
    items: [
      { runId: scene.runId, workflowId: scene.workflowId, version: 1, status: 'running', title: 'Analisi del progetto', createdAt: '2026-09-29T10:00:00.000Z', steps: { total: 14, terminal: 6 }, model: 'unknown' },
      { runId: 'visual-019-old', workflowId: scene.workflowId, version: 1, status: 'failed', title: 'Verifica precedente', createdAt: '2026-09-28T10:00:00.000Z', steps: { total: 14, terminal: 14 }, model: 'unknown' },
    ], total: 2, nextOffset: null,
  } } }));
  const selected = scene.tutte.find((row) => row.label.includes('Agente 06'));
  const base = `/api/v1/sessions/${scene.sessionId}/workflows/${scene.runId}/nodes/${selected.nodeId}`;
  await page.route(`**${base}**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/output')) return route.fulfill({ json: { ok: true, data: {
      schema: 'talos.workflow-node-output.v1', resultId: 'visual-result', content: 'Risultato completo: tre osservazioni verificate e una decisione da prendere.', rawAvailable: true,
    } } });
    return route.fulfill({ json: { ok: true, data: { ...selected, attempt: 1, resultRefIds: ['visual-result', 'binary-result'],
      outputs: [
        { resultId: 'visual-result', kind: 'text', contentType: 'text/plain', bytes: 74, preview: 'Risultato completo: tre osservazioni…', truncated: true },
        { resultId: 'binary-result', kind: 'binary', contentType: 'application/octet-stream', bytes: 4, preview: '', truncated: false },
      ], totalOutputs: 2, nextOutputOffset: null,
    } } });
  });
  const graph = await apriDiagrammaDellaScena(page, scene);
  const detail = graph.locator('.talos-wfg__dettaglio');
  await expect(detail.locator('.talos-wfg__output')).toHaveCount(2);
  await detail.locator('.talos-wfg__output').first().getByRole('button', { name: 'Mostra tutto' }).click();
  await expect(detail.locator('.talos-wfg__output-full')).toHaveText(/Risultato completo/u);
  await expect(page.locator('#railAgenti .talos-wfh__open')).toHaveCount(2);
  mkdirSync(evidence, { recursive: true });
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['light', 'dark']) {
      await page.evaluate((value) => {
        const control = document.getElementById('colorModeSelect');
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      }, mode);
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe(mode === 'light' ? 'light' : null);
      await page.evaluate(() => document.querySelector('.talos-toast:not([hidden]) [data-toast-chiudi]')?.click());
      await page.screenshot({ path: join(evidence, `workflow-${width}x${height}-${mode}.png`), animations: 'disabled' });
    }
  }
  await graph.getByRole('button', { name: 'Torna alla chat' }).click();
  const history = page.locator('#railAgenti .talos-wfh');
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    if (!(await history.isVisible())) await page.locator('#schermoChat [data-azione="dettagli"]').click();
    for (const mode of ['light', 'dark']) {
      await page.evaluate((value) => {
        const control = document.getElementById('colorModeSelect');
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      }, mode);
      await expect(history.locator('.talos-wfh__open')).toHaveCount(2);
      await history.scrollIntoViewIfNeeded();
      await expect(history).toBeInViewport();
      await page.screenshot({ path: join(evidence, `history-${width}x${height}-${mode}.png`), animations: 'disabled' });
    }
  }
});

test('VISUAL-019-PLAN: inspect the durable plan banner at both release viewports and themes', async ({ page }) => {
  const sessionId = 'visual-019-plan';
  await page.route(`**/api/v1/sessions/${sessionId}/events*`, (route) => route.fulfill({
    contentType: 'text/event-stream', body: 'retry: 3600000\ndata: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}\n\n',
  }));
  await page.route(`**/api/v1/sessions/${sessionId}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Piano richiesto', 'test/model',
    { sessionId: id, conclusa: true, modalitaOperativa: 'normale', permessi: 'Read only' }), sessionId);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: 101,
      value: { modalitaOperativa: 'piano', permessi: 'Read only', motivo: 'piano-richiesto-dal-modello' } },
    runtime.realSessionState.generation);
  });
  const banner = page.locator('#fasciaPianoRichiesto');
  await expect(banner).toBeVisible();
  await page.evaluate(() => document.querySelector('.talos-toast:not([hidden]) [data-toast-chiudi]')?.click());
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['light', 'dark']) {
      await page.evaluate((value) => {
        const control = document.getElementById('colorModeSelect');
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      }, mode);
      await expect(banner.getByRole('status')).toHaveText('Piano attivo dal prossimo giro');
      await page.evaluate(() => document.querySelector('.talos-toast:not([hidden]) [data-toast-chiudi]')?.click());
      await page.screenshot({ path: join(evidence, `plan-${width}x${height}-${mode}.png`), animations: 'disabled' });
    }
  }
});
