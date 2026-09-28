import { test, expect } from '@playwright/test';

/*
 * I due difetti del giro vero GLM del 25/09 sul 4174 (fase Workflow UI), riverificati il 26/09 prima della cura:
 *  (11) una proposta di workflow RESPINTA dal server appariva nella conversazione identica a una riuscita;
 *  (12) nell'Indice dei giri la proposta si chiamava «1 altra azione», senza nome.
 * Scene rigiocate in `handleRealEvent` dal server finto (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const RICEVUTA = JSON.stringify({ schema: 'talos.workflow-proposal-receipt.v1', workflowId: '902e47a4-b29b-854e-8cd6-8f5d1bb43acd', version: 1,
  definitionHash: 'sha256:4722c46308a444b48819116d0b4e12e02b5f5cc015dfbe6b1df3d9a946f16bb2', status: 'proposed', preflight: { errors: [], warnings: [] } });
const RESPINTA = 'workflow_plan_propose failed [WORKFLOW_DEFINITION_INVALID]: phase "p2" has no nodes';

const scena = (esito, extra = []) => [
  { type: 'RunStarted', input: { consegna: 'Proponi un workflow per rivedere i test.' } },
  { type: 'ToolCallStart', toolCallId: 'p-1', toolCallName: 'workflow_plan_propose' },
  { type: 'ToolCallArgs', toolCallId: 'p-1', delta: JSON.stringify({ draft: { title: 'Rivedi i test', objective: 'x', phases: [], nodes: [] } }) },
  { type: 'ToolCallResult', toolCallId: 'p-1', content: esito },
  ...extra,
  { type: 'TextMessageStart', messageId: 'm-1' },
  { type: 'TextMessageContent', messageId: 'm-1', delta: 'Fatto il passo della proposta.' },
  { type: 'TextMessageEnd', messageId: 'm-1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));

const SCENE = {
  riuscita: scena(RICEVUTA),
  respinta: scena(RESPINTA),
  /* Due attrezzi senza parole nostre nello stesso gruppo: si nominano tutti e due, mai «2 altre azioni». */
  due: scena(RICEVUTA, [
    { type: 'ToolCallStart', toolCallId: 'p-2', toolCallName: 'mcp__github__create_issue' },
    { type: 'ToolCallArgs', toolCallId: 'p-2', delta: '{"title":"x"}' },
    { type: 'ToolCallResult', toolCallId: 'p-2', content: '{"number":7}' },
  ]),
};

async function apri(page, chiave) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = url.pathname.match(/\/api\/v1\/sessions\/pg-(\w+)-[a-z0-9]+\/(events|metrics)$/);
    if (m) {
      if (m[2] === 'metrics') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENE[m[1]], CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Proposta nel giro', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
  }, `pg-${chiave}-a1`);
  await expect(page.locator('#conversation')).toContainText('Fatto il passo della proposta.', { timeout: 10_000 });
  await page.locator('#railTabs [data-rail="contesto"]').click();
  await expect(page.locator('#railContesto')).toBeVisible();
  return contatore;
}

const indice = (page) => page.locator('#railContesto [data-c="TurnIndex"]');

test.describe('Proposta di workflow nel giro — riga e Indice dei giri', () => {
  test('PROPOSTA-INDICE-12 — nell\'Indice dei giri la proposta si chiama col suo nome, mai «altra azione»', async ({ page }) => {
    const c = await apri(page, 'riuscita');
    await expect(indice(page)).toContainText('Proposta di workflow');
    await expect(indice(page)).not.toContainText(/altr[ae] azion/u);
    expect(c.nonGet, 'nessuna scrittura verso il server').toBe(0);
  });

  test('PROPOSTA-INDICE-12b — due attrezzi senza parole nostre nello stesso gruppo: tutti e due per nome', async ({ page }) => {
    const c = await apri(page, 'due');
    const testa = page.locator('#conversation [data-c="ActivityBundle"]:not(.talos-activity--segment) .tool-note-summary-text').first();
    await expect(testa).toHaveText(/Proposta di workflow/u);
    await expect(testa).toHaveText(/create issue \(github\)/u);
    await expect(testa).not.toHaveText(/altr[ae] azion/u);
    await expect(indice(page)).not.toContainText(/altr[ae] azion/u);
    expect(c.nonGet).toBe(0);
  });

  test('PROPOSTA-RESPINTA-11 — una proposta respinta dal server porta il segno dell\'errore, e nessuna card', async ({ page }) => {
    const c = await apri(page, 'respinta');
    const riga = page.locator('#conversation [data-c="ToolRow"]').first();
    await expect(riga).toHaveAttribute('data-tool-state', 'error');
    await expect(page.locator('#conversation [data-c="WorkflowProposalCard"]')).toHaveCount(0);
    await expect(indice(page)).not.toContainText(/altr[ae] azion/u);
    expect(c.nonGet).toBe(0);
  });

  test('PROPOSTA-RESPINTA-11b — AL CONTRARIO: una proposta riuscita resta verde', async ({ page }) => {
    const c = await apri(page, 'riuscita');
    await expect(page.locator('#conversation [data-c="ToolRow"]').first()).toHaveAttribute('data-tool-state', 'complete');
    expect(c.nonGet).toBe(0);
  });
});
