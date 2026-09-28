import { expect, test } from '@playwright/test';

/*
 * ⭐ Owner 26/09/2026 («i run si eliminano con la loro sessione, e la conferma lo dice»): la finestra «Elimina sessione»
 *   dice PRIMA di premere quanti Workflow se ne vanno con la conversazione, e con un Workflow ancora in corso lo dice e
 *   disattiva il pulsante (il server rifiuta comunque: `WORKFLOW_RUN_NOT_FINISHED`, prova backend
 *   `workflow-eliminazione-con-la-sessione.test.mjs`). Nessuna scrittura: ogni POST si ferma e si conta.
 */
const SESSIONE = {
  sessionId: '40000000-0000-4000-8000-00000000abcd', taskId: 'libero:default', nome: 'Conversazione coi workflow',
  avviataAlle: '2026-09-26T07:00:00.000Z', conclusa: true, modello: 'z-ai/glm-5.3-flash', provider: 'cloud',
};

async function apriConferma(page, runs) {
  const scritture = [];
  await page.route('**/api/v1/**', async (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && r.method() !== 'HEAD') { scritture.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [SESSIONE] }, meta: { schema: 'talos.harness-ui.api.v1' } }) }));
  await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE.sessionId}/workflows`, (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { schema: 'talos.workflow-run-list.v1', sessionId: SESSIONE.sessionId, total: runs.length, offset: 0, limit: 50, nextOffset: null, items: runs }, meta: { schema: 'talos.harness-ui.api.v1' } }) }));
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SESSIONE.sessionId}"]`).click({ button: 'right' });
  await page.locator('.session-actions-menu').getByRole('menuitem', { name: 'Elimina' }).click();
  await expect(page.locator('#veloEliminaSessione')).toBeVisible();
  return scritture;
}

const run = (n, status) => ({ runId: `10000000-0000-4000-8000-00000000000${n}`, createdAt: '2026-09-26T07:10:00.000Z', workflowId: '30000000-0000-4000-8000-000000000001', version: 1, status });

test('ELIMINA-SESSIONE-WORKFLOW-01 — due Workflow finiti: la conferma dice che se ne vanno con la conversazione', async ({ page }) => {
  const scritture = await apriConferma(page, [run(1, 'succeeded'), run(2, 'cancelled')]);
  const riga = page.locator('#eliminaSessioneWorkflow');
  await expect(riga).toBeVisible();
  await expect(riga).toHaveText('Con la conversazione si eliminano anche i suoi 2 Workflow.');
  await expect(page.locator('#eliminaSessioneConferma')).toBeEnabled();
  expect(scritture).toEqual([]);
});

test('ELIMINA-SESSIONE-WORKFLOW-02 — AL CONTRARIO: un Workflow in corso blocca, e la conferma lo dice', async ({ page }) => {
  const scritture = await apriConferma(page, [run(1, 'succeeded'), run(3, 'running')]);
  await expect(page.locator('#eliminaSessioneWorkflow')).toHaveText('Un Workflow di questa conversazione è ancora in corso: annullalo prima di eliminarla.');
  await expect(page.locator('#eliminaSessioneConferma')).toBeDisabled();
  expect(scritture).toEqual([]);
});

test('ELIMINA-SESSIONE-WORKFLOW-03 — senza Workflow la finestra resta com era: nessuna riga in più', async ({ page }) => {
  await apriConferma(page, []);
  await expect(page.locator('#eliminaSessioneWorkflow')).toBeHidden();
  await expect(page.locator('#eliminaSessioneConferma')).toBeEnabled();
});
