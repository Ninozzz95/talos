import { test, expect } from '@playwright/test';

/*
 * C3b (owner 09/10/2026 sera) — la carta di un Workflow avviato DA SOLO con la Coordinazione accesa. La ricevuta della proposta
 *   porta `startedOnItsOwn.runId` (registro, `avvioDaSoloDelWorkflow`): la carta segue QUEL run, dice «Avviato da solo
 *   (Coordinazione accesa)», non offre Approva né Avvia, e porta Pausa e Annulla. Pausa manda il comando del run con un
 *   commandId; Annulla chiede prima, con le conseguenze, e «Non ora» non manda niente.
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174): tutto intercettato; ogni altra richiesta non-GET si ferma e si conta.
 */
const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const ALTRO_RUN = '33333333-3333-4333-8333-333333333333';
const HASH = `sha256:${'b'.repeat(64)}`;
const SESSION_ID = 'wf-c3b-da-solo';
const ricevuta = JSON.stringify({ schema: 'talos.workflow-proposal-receipt.v1', workflowId: WORKFLOW_ID, version: 1, definitionHash: HASH,
  status: 'proposed', preflight: { errors: [], warnings: [] }, startedOnItsOwn: { runId: RUN_ID, steps: 3 },
  note: 'Coordination is on in this conversation: this Workflow was approved and started on its own.' });
const eventi = [
  { type: 'RunStarted', input: { consegna: 'Proponi un workflow di tre passi.' } },
  { type: 'ToolCallStart', toolCallId: 'proposta-1', toolCallName: 'workflow_plan_propose' },
  { type: 'ToolCallArgs', toolCallId: 'proposta-1', delta: JSON.stringify({ draft: { title: 'Leggi e confronta', objective: 'x', phases: [], nodes: [] } }) },
  { type: 'ToolCallResult', toolCallId: 'proposta-1', content: ricevuta },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((evento, i) => ({ ...evento, _sequenza: i + 1 }));
const json = (data) => ({ contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } }) });
const run = { runId: RUN_ID, workflowId: WORKFLOW_ID, version: 1, status: 'running', createdAt: '2026-10-09T15:00:00.000Z' };

async function apri(page) {
  const traffico = { comandi: [], altriNonGet: 0 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' } })); } catch { /* */ } });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === `/api/v1/sessions/${SESSION_ID}/events`) {
      return route.fulfill({ contentType: 'text/event-stream',
        body: `retry: 3600000\n${[...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/metrics`) return route.fulfill(json({ registrato: true, cacheSessione: null, ragionamentiMs: {} }));
    if (path === `/api/v1/sessions/${SESSION_ID}/workflow-proposals`) return route.fulfill(json({ items: [] }));
    if (path === `/api/v1/workflows/${WORKFLOW_ID}/versions/1` && req.method() === 'GET') {
      return route.fulfill(json({ schema: 'talos.workflow-proposal-view.v2', workflowId: WORKFLOW_ID, version: 1, definitionHash: HASH,
        title: 'Leggi e confronta', objective: 'Leggere tre file e confrontarli', status: 'approved', phases: [], budgets: {},
        preflight: { errors: [], warnings: [] }, policy: { capabilityCeiling: 'read' } }));
    }
    // un altro run dello stesso Workflow, PIÙ RECENTE e finito: la carta deve seguire quello della ricevuta, non il più nuovo
    if (path === `/api/v1/sessions/${SESSION_ID}/workflows`) return route.fulfill(json({ items: [{ ...run, runId: ALTRO_RUN, status: 'succeeded', createdAt: '2026-10-09T16:00:00.000Z' }, run], total: 2, nextOffset: null }));
    if (path === `/api/v1/sessions/${SESSION_ID}/workflows/${RUN_ID}/events`) return route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' });
    if (path === `/api/v1/sessions/${SESSION_ID}/workflows/${RUN_ID}/graph`) {
      return route.fulfill(json({ schema: 'talos.workflow-graph-view.v2', runId: RUN_ID, graphVersion: 1, lastSeq: 3, revision: '1:3',
        status: 'running', phaseSource: 'explicit', total: 3, terminated: 0, attention: 0,
        groups: [{ phaseId: 'f', label: 'Fase', order: 0, total: 3, terminated: 0, attention: 0, counts: { running: 1, blocked: 2 }, progress: 0, roles: {}, kinds: { agent: 3 } }],
        groupConnections: [] }));
    }
    const comando = path.match(new RegExp(`^/api/v1/sessions/${SESSION_ID}/workflows/${RUN_ID}/(pause|resume|cancel)$`, 'u'));
    if (comando && req.method() === 'POST') {
      traffico.comandi.push({ azione: comando[1], corpo: req.postDataJSON() });
      return route.fulfill({ status: 202, ...json({ runId: RUN_ID, status: 'running', deduplicated: false }) });
    }
    if (req.method() !== 'GET') { traffico.altriNonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Avvio da solo', 'z-ai/glm-5.3-flash',
    { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSION_ID);
  const card = page.locator('#conversation [data-c="WorkflowProposalCard"]');
  await expect(card).toContainText('Avviato da solo');
  return { traffico, card };
}

test.describe('C3b — la carta di un Workflow avviato da solo', () => {
  test('C3B-CARD-BROWSER: says it started on its own, no Approve/Start, and Pause sends the run command with a commandId', async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message ?? e)));
    const { traffico, card } = await apri(page);
    await expect(card).toContainText('(Coordinazione accesa)');
    await expect(card).toContainText(RUN_ID, { timeout: 5000 });
    await expect(card.locator('[data-azione="approva"], [data-azione="avvia"]')).toHaveCount(0);
    await expect(card.locator('[data-azione="annulla-run"]')).toBeVisible();
    await card.locator('[data-azione="pausa"]').click();
    await expect.poll(() => traffico.comandi.length).toBe(1);
    expect(traffico.comandi[0].azione).toBe('pause');
    expect(Object.keys(traffico.comandi[0].corpo)).toEqual(['commandId']);
    expect(traffico.altriNonGet).toBe(0);
    expect(errori).toEqual([]);
  });

  test('C3B-CARD-CANCEL-ASKS: Cancel asks first with the consequences; «Non ora» sends nothing, confirming sends cancel', async ({ page }) => {
    const { traffico, card } = await apri(page);
    await card.locator('[data-azione="annulla-run"]').click();
    const conferma = page.locator('dialog.talos-wfg-conferma');
    await expect(conferma).toBeVisible();
    await expect(conferma).toContainText('in corso');
    await conferma.getByRole('button', { name: 'Non ora' }).click();
    await expect(conferma).toHaveCount(0);
    expect(traffico.comandi).toEqual([]);
    await card.locator('[data-azione="annulla-run"]').click();
    await page.locator('dialog.talos-wfg-conferma').getByRole('button').filter({ hasNotText: /^Non ora$/u }).last().click();
    await expect.poll(() => traffico.comandi.map((c) => c.azione)).toEqual(['cancel']);
    expect(traffico.altriNonGet).toBe(0);
  });
});
