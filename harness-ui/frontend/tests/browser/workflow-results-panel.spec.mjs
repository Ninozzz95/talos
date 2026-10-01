import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test('WF-RESULT-PANEL-LAYOUT: full outputs live outside the compact graph footer', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-result-panel' });
  await instradaScena(page, scena);
  const selected = scena.tutte.find(row => row.label.includes('Agente 06'));
  const base = `/api/v1/sessions/${scena.sessionId}/workflows/${scena.runId}/nodes/${selected.nodeId}`;
  const refs = Array.from({ length: 21 }, (_, i) => ({
    resultId: `result-${i + 1}`, kind: i === 1 ? 'binary' : 'text',
    contentType: i === 1 ? 'application/octet-stream' : 'text/plain', bytes: i === 1 ? 4 : 1000,
    preview: i === 1 ? '' : `Anteprima ${i + 1}`, truncated: i !== 1,
  }));
  const requests = [];
  let letturaFallita = false;
  let rilasciaLetturaLenta;
  await page.route(`**${base}**`, async route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    if (url.pathname === `${base}/output`) {
      if (url.searchParams.get('resultId') === 'result-4') {
        await new Promise(resolve => { rilasciaLetturaLenta = resolve; });
        return route.fulfill({ json: { ok: true, data: { resultId: 'result-4', content: 'RISPOSTA DEL PANNELLO CHIUSO' } } });
      }
      if (url.searchParams.get('resultId') === 'result-3' && !letturaFallita) {
        letturaFallita = true;
        return route.fulfill({ status: 503, json: { ok: false, error: { code: 'TEMPORARY_UNAVAILABLE' } } });
      }
      return route.fulfill({ json: { ok: true, data: { schema: 'talos.workflow-node-output.v1',
        resultId: url.searchParams.get('resultId'), content: 'Testo integrale ' + 'lungo '.repeat(500), rawAvailable: true } } });
    }
    const offset = Number(url.searchParams.get('outputOffset') ?? 0);
    return route.fulfill({ json: { ok: true, data: { ...selected, attempt: 1,
      resultRefIds: refs.slice(offset, offset + 20).map(ref => ref.resultId),
      outputs: refs.slice(offset, offset + 20), totalOutputs: refs.length,
      nextOutputOffset: offset + 20 < refs.length ? offset + 20 : null } } });
  });

  const graph = await apriDiagrammaDellaScena(page, scena);
  const detail = graph.locator('.talos-wfg__dettaglio');
  await expect(detail).toContainText('Risultati (21)');
  await expect(detail.locator('.talos-wfg__output')).toHaveCount(0);
  const open = detail.getByRole('button', { name: 'Apri risultati' });
  await open.click();
  await expect(graph.locator('.talos-wfg__result-panel')).toBeVisible();
  const panel = graph.getByRole('complementary', { name: 'Risultati del passo' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.talos-wfg__output')).toHaveCount(20);
  await expect(panel).toContainText('Anteprima tagliata');
  await expect(requests.filter(url => url.includes('/output?'))).toHaveLength(0);
  await panel.locator('.talos-wfg__output').first().getByRole('button', { name: 'Mostra tutto' }).click();
  await expect(panel.locator('.talos-wfg__output-full').first()).toContainText('Testo integrale lungo');
  const terzo = panel.locator('.talos-wfg__output[data-result-id="result-3"]');
  await terzo.getByRole('button', { name: 'Mostra tutto' }).click();
  await expect(terzo).toContainText('Lettura fallita');
  await terzo.getByRole('button', { name: 'Riprova lettura' }).click();
  await expect(terzo.locator('.talos-wfg__output-full')).toContainText('Testo integrale lungo');
  await panel.getByRole('button', { name: /Mostra altri risultati/ }).click();
  await expect(panel.locator('.talos-wfg__output')).toHaveCount(21);
  const quarto = panel.locator('.talos-wfg__output[data-result-id="result-4"]');
  await quarto.getByRole('button', { name: 'Mostra tutto' }).click();
  await expect.poll(() => Boolean(rilasciaLetturaLenta)).toBe(true);
  await panel.getByRole('button', { name: 'Chiudi risultati' }).click();
  await expect(open).toBeFocused();
  // WF-RESULT-PANEL-NONMODAL: i comandi della testata restano utilizzabili col foglio aperto.
  await open.click();
  await expect(panel).toBeVisible();
  const rispostaLenta = page.waitForResponse(response => response.url().includes('resultId=result-4'));
  rilasciaLetturaLenta();
  await rispostaLenta;
  await expect(panel).not.toContainText('RISPOSTA DEL PANNELLO CHIUSO');
  await graph.getByRole('button', { name: 'Torna alla chat' }).click({ timeout: 3000 });
  await expect(graph).toBeHidden();
});
