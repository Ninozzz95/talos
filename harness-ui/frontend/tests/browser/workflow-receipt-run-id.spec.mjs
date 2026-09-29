import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';
const HASH = `sha256:${'a'.repeat(64)}`;
const SESSION_ID = 'wf-receipt-a1';
const receipt = JSON.stringify({ schema: 'talos.workflow-proposal-receipt.v1', workflowId: WORKFLOW_ID,
  version: 1, definitionHash: HASH, status: 'proposed', preflight: { errors: [], warnings: [] } });
const events = [
  { type: 'RunStarted', input: { consegna: 'Avvia il workflow approvato.' } },
  { type: 'ToolCallStart', toolCallId: 'proposal-1', toolCallName: 'workflow_plan_propose' },
  { type: 'ToolCallArgs', toolCallId: 'proposal-1', delta: JSON.stringify({ draft: { title: 'Rivedi i test', objective: 'x', phases: [], nodes: [] } }) },
  { type: 'ToolCallResult', toolCallId: 'proposal-1', content: receipt },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((event, index) => ({ ...event, _sequenza: index + 1 }));
const run = (runId, createdAt) => ({ runId, workflowId: WORKFLOW_ID, version: 1, status: 'succeeded', createdAt });
const old = run('run-receipt', '2026-09-28T11:00:00.000Z');
const newer = run('run-new', '2026-09-28T12:00:00.000Z');
const json = (data) => ({ contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } }) });
const visualEvidence = resolve(process.cwd(), '..', '..', 'artifacts', 'visual-019');

async function openReceipt(page, { ambiguous = false } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.settings.v1',
    JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' } })));
  const calls = { starts: 0, started: false, graphIds: [] };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/v1/sessions/${SESSION_ID}/events`) {
      return route.fulfill({ contentType: 'text/event-stream',
        body: `retry: 3600000\n${[...events, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}` });
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/metrics`) {
      return route.fulfill(json({ registrato: true, cacheSessione: null, ragionamentiMs: {} }));
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/workflow-proposals`) return route.fulfill(json({ items: [] }));
    if (path === `/api/v1/workflows/${WORKFLOW_ID}/versions/1` && request.method() === 'GET') {
      return route.fulfill(json({ schema: 'talos.workflow-proposal-view.v2', workflowId: WORKFLOW_ID,
        version: 1, definitionHash: HASH, title: 'Rivedi i test', objective: 'Verifica il run esatto',
        status: 'approved', phases: [], budgets: {}, preflight: { errors: [], warnings: [] } }));
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/workflows`) {
      return route.fulfill(json({ items: calls.started ? [newer, old] : [], total: calls.started ? 2 : 0, nextOffset: null }));
    }
    const graph = path.match(new RegExp(`^/api/v1/sessions/${SESSION_ID}/workflows/([^/]+)/graph$`, 'u'));
    if (graph) {
      calls.graphIds.push(graph[1]);
      return route.fulfill(json({ schema: 'talos.workflow-graph-view.v2', runId: graph[1], graphVersion: 1,
        lastSeq: 1, revision: '1:1', status: 'succeeded', phaseSource: 'explicit', total: 0,
        terminated: 0, attention: 0, groups: [], groupConnections: [] }));
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/workflows/${old.runId}/history`) {
      return route.fulfill(json({ initialState: 'pending', offset: 0, limit: 50, total: 0, nextOffset: null, items: [] }));
    }
    if (path === `/api/v1/workflows/${WORKFLOW_ID}/versions/1/start` && request.method() === 'POST') {
      calls.starts += 1;
      calls.started = true;
      if (ambiguous) return route.abort();
      return route.fulfill({ status: 202, ...json({ runId: old.runId }) });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(
    sessionId, 'workspace', 'Ricevuta workflow', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSION_ID);
  const card = page.locator('#conversation [data-c="WorkflowProposalCard"]');
  await expect(card.locator('[data-azione="avvia"]')).toBeEnabled();
  return { calls, card };
}

test('F-013-BROWSER-EXACT: receipt survives reload and Board opens the exact older run', async ({ page }) => {
  const { calls, card } = await openReceipt(page);
  await card.locator('[data-azione="avvia"]').click();
  await expect(card).toContainText('run-receipt');
  await expect(card.locator('[data-azione="diagramma"]')).toHaveText('Apri in Board');
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(
    sessionId, 'workspace', 'Ricevuta workflow', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSION_ID);
  await expect(card).toContainText('run-receipt');
  const readsBeforeClick = calls.graphIds.length;
  await card.locator('[data-azione="diagramma"]').click();
  await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toHaveAttribute('data-sorgente', 'workflow');
  await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toContainText('Riuscito');
  await expect.poll(() => calls.graphIds.slice(readsBeforeClick).at(-1)).toBe('run-receipt');
  expect(calls.starts).toBe(1);
});

test('F-013-BROWSER-AMBIGUOUS: lost response never claims another run of the same version', async ({ page }) => {
  const { calls, card } = await openReceipt(page, { ambiguous: true });
  await card.locator('[data-azione="avvia"]').click();
  await expect(card.locator('[role="alert"]')).toContainText('Non si sa se il comando è arrivato');
  await expect(card).not.toContainText('run-new');
  await expect(card.locator('[data-azione="avvia"]')).toBeEnabled();
  expect(calls.starts).toBe(1);
});

test('VISUAL-019-RECEIPT: the exact run receipt stays legible in both themes and viewports', async ({ page }) => {
  const { card } = await openReceipt(page);
  await card.locator('[data-azione="avvia"]').click();
  await expect(card).toContainText('run-receipt');
  mkdirSync(visualEvidence, { recursive: true });
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['light', 'dark']) {
      await page.evaluate((value) => {
        const control = document.getElementById('colorModeSelect');
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      }, mode);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeInViewport();
      await page.evaluate(() => document.querySelector('.talos-toast:not([hidden]) [data-toast-chiudi]')?.click());
      await page.screenshot({ path: join(visualEvidence, `receipt-${width}x${height}-${mode}.png`), animations: 'disabled' });
    }
  }
});
