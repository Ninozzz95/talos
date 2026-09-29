import { expect, test } from '@playwright/test';
import { apriRailDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test('WF-HISTORY-BROWSER-EXACT: history opens the older exact run after reload, with server filters', async ({ page }) => {
  const scene = costruisciScena(14, { sessionId: 'wf-history-browser', runId: 'run-old', workflowId: 'wf-history' });
  await instradaScena(page, scene);
  const queried = [];
  await page.route(`**/api/v1/sessions/${scene.sessionId}/workflows?*`, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    queried.push(query.toString());
    const old = { runId: scene.runId, workflowId: scene.workflowId, version: 1, status: 'failed', title: 'Run vecchio',
      createdAt: '2026-09-28T10:00:00.000Z', steps: { total: 14, terminal: 14 }, model: 'unknown' };
    const newest = { ...old, runId: 'run-new', status: 'succeeded', title: 'Run nuovo', createdAt: '2026-09-28T11:00:00.000Z' };
    const all = query.get('stato') === 'failed' ? [old] : [newest, old];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
      items: all, total: all.length, nextOffset: null,
    } }) });
  });
  await apriRailDellaScena(page, scene);
  const history = page.locator('#railAgenti .talos-wfh');
  await expect(history).toContainText('Cronologia automazioni');
  await expect(history.locator('.talos-wfh__open')).toHaveCount(2);
  await page.reload();
  await apriRailDellaScena(page, scene);
  await expect(history.locator('.talos-wfh__open')).toHaveCount(2);
  await history.locator('.talos-wfh__status').selectOption('failed');
  await expect(history.locator('.talos-wfh__open')).toHaveCount(1);
  await expect(history).toContainText('Run vecchio');
  await history.locator('.talos-wfh__open').click();
  await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toHaveAttribute('data-sorgente', 'workflow');
  expect(queried.some((query) => query.includes('stato=failed'))).toBe(true);
});
