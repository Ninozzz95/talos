import { expect, test } from '@playwright/test';
import { apriRailDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const SESSION_ID = 'wf-deleghe-miste';
const FIGLIA_ID = 'delega-normale-1';
const json = (data) => ({ contentType: 'application/json',
  body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });

test('WF-MIXED-GRAPHS: workflow then ordinary delegation keeps both diagrams reachable', async ({ page }) => {
  const scena = costruisciScena(3, { sessionId: SESSION_ID });
  await instradaScena(page, scena);
  await page.route(url => url.pathname === '/api/v1/sessions', route => route.fulfill(json({ items: [{
    sessionId: SESSION_ID, taskId: 'workspace', nome: 'Workflow e deleghe', modello: 'z-ai/glm-5.3-flash', conclusa: false,
  }] })));
  await page.route(`**/api/v1/sessions/${SESSION_ID}/children`, route => route.fulfill(json({ figli: [{
    sessionId: FIGLIA_ID, parentId: SESSION_ID, task: 'Controlla il file di prova', taskCorto: 'Controlla il file',
    modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false, avviataAlle: '2026-09-29T12:00:00.000Z',
    attivita: { file: [], chiamate: 0, passi: [] },
  }] })));

  const rail = await apriRailDellaScena(page, scena);
  await expect(rail.locator('[data-c="WorkflowRail"]')).toBeVisible();
  await rail.getByRole('tab', { name: 'Deleghe' }).click();
  await expect(rail.locator(`[data-sessione-figlia="${FIGLIA_ID}"]`)).toBeVisible();
  await rail.locator(`[data-sessione-figlia="${FIGLIA_ID}"]`).click();
  await page.getByRole('button', { name: 'Apri questo agente nel diagramma' }).click();

  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(grafo.locator(`[data-nodo-id="${FIGLIA_ID}"]`)).toHaveAttribute('data-selezionato', 'true');
  await grafo.getByRole('button', { name: 'Workflow', exact: true }).click();
  await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toHaveAttribute('data-sorgente', 'workflow');
  await page.locator('#schermoChat > [data-c="GrafoAgenti"]').getByRole('button', { name: 'Deleghe', exact: true }).click();
  await expect(page.locator(`#schermoChat > [data-c="GrafoAgenti"] [data-nodo-id="${FIGLIA_ID}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`#schermoChat > [data-c="GrafoAgenti"] [data-nodo-id="${FIGLIA_ID}"]`)).toBeVisible();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti').getByRole('tab', { name: 'Deleghe' })).toHaveAttribute('aria-selected', 'true');
});

test('WF-GRAPH-SOURCES-KEYBOARD: focus and selection remain distinct in the rail', async ({ page }) => {
  const scena = costruisciScena(3, { sessionId: SESSION_ID });
  await instradaScena(page, scena);
  const rail = await apriRailDellaScena(page, scena);
  const workflow = rail.getByRole('tab', { name: 'Workflow' });
  const deleghe = rail.getByRole('tab', { name: 'Deleghe' });
  await expect(workflow).toHaveAttribute('aria-selected', 'true');
  await expect(workflow).toHaveAttribute('tabindex', '0');
  await expect(deleghe).toHaveAttribute('tabindex', '-1');
  const idPannello = await deleghe.getAttribute('aria-controls');
  await expect(rail.locator(`[id="${idPannello}"]`)).toHaveAttribute('role', 'tabpanel');

  await workflow.focus();
  await workflow.press('ArrowRight');
  await expect(deleghe).toBeFocused();
  await expect(workflow).toHaveAttribute('aria-selected', 'true');
  await deleghe.press('Enter');
  await expect(deleghe).toHaveAttribute('aria-selected', 'true');
  await expect(rail.locator(`[id="${idPannello}"]`)).toHaveAttribute('data-attivo', 'true');
  await deleghe.press('Home');
  await expect(workflow).toBeFocused();
  await expect(deleghe).toHaveAttribute('aria-selected', 'true');
  await workflow.press('Space');
  await expect(workflow).toHaveAttribute('aria-selected', 'true');
  await workflow.press('End');
  await expect(deleghe).toBeFocused();
});
