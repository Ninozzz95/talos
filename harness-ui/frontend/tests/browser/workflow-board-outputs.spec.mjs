import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test('WF-BOARD-OUTPUTS-BROWSER: full text, raw bytes and results beyond the first 20 remain accessible', async ({ page }) => {
  const scene = costruisciScena(14, { sessionId: 'wf-output-board' });
  await instradaScena(page, scene);
  const selected = scene.tutte.find((row) => row.label.includes('Agente 06'));
  expect(selected).toBeTruthy();
  const base = `/api/v1/sessions/${scene.sessionId}/workflows/${scene.runId}/nodes/${selected.nodeId}`;
  const refs = Array.from({ length: 21 }, (_, i) => ({ resultId: `result-${i + 1}`, kind: i === 1 ? 'binary' : 'text',
    contentType: i === 1 ? 'application/octet-stream' : 'text/plain', bytes: i === 1 ? 4 : 40,
    preview: i === 1 ? '' : `Anteprima ${i + 1}`, truncated: true }));
  const queried = [];
  const requested = []; page.on('request', (request) => { if (request.url().includes('/output?')) requested.push(request.url()); });
  await page.route(`**${base}**`, async (route) => {
    const url = new URL(route.request().url()); queried.push(url.pathname + url.search);
    if (url.pathname === `${base}/output`) {
      const resultId = url.searchParams.get('resultId');
      if (url.searchParams.get('format') === 'raw') return route.fulfill({ status: 200, body: Buffer.from([0, 255, 1, 2]),
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="result.bin"' } });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
        schema: 'talos.workflow-node-output.v1', resultId,
        content: resultId === 'result-2' ? null : `Contenuto integrale di ${resultId}`,
        rawAvailable: true,
      } }) });
    }
    const offset = Number(url.searchParams.get('outputOffset') ?? 0);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
      ...selected, attempt: 1, resultRefIds: refs.slice(offset, offset + 20).map((ref) => ref.resultId),
      outputs: refs.slice(offset, offset + 20), totalOutputs: refs.length, nextOutputOffset: offset + 20 < refs.length ? offset + 20 : null,
    } }) });
  });
  const graph = await apriDiagrammaDellaScena(page, scene);
  const detail = graph.locator('.talos-wfg__dettaglio');
  await expect(detail.locator('.talos-wfg__output')).toHaveCount(20);
  await detail.locator('.talos-wfg__output').first().getByRole('button', { name: 'Mostra tutto' }).click();
  await expect.poll(() => requested).toEqual([`http://127.0.0.1:4176${base}/output?resultId=result-1`]);
  await expect(detail.locator('.talos-wfg__output-full').first()).toHaveText('Contenuto integrale di result-1');
  await expect(detail.locator('.talos-wfg__output').first().locator('.talos-wfg__output-preview')).toHaveCount(0);
  const raw = detail.locator('.talos-wfg__output').nth(1).getByRole('link', { name: 'Scarica' });
  await expect(detail.locator('.talos-wfg__output').nth(1).getByRole('button', { name: 'Mostra tutto' })).toHaveCount(0);
  await expect(raw).toHaveAttribute('href', `${base}/output?resultId=result-2&format=raw`);
  await expect(raw).toHaveAttribute('download', '');
  await detail.getByRole('button', { name: /Mostra altri risultati/u }).click();
  await expect(detail.locator('.talos-wfg__output')).toHaveCount(21);
  await expect(detail).toContainText('Anteprima 21');
  expect(queried.some((url) => url.endsWith('?outputOffset=20'))).toBe(true);
});
