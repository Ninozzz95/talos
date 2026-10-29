import { expect, test } from '@playwright/test';

/*
 * Revisione avversaria della testa del gruppo «aspetta il tuo consenso» (29/10/2026). Proposta: NON committata.
 * Stessa forma di `riga-in-consenso.spec.mjs` (eventi veri: `azione.toolCallId`, `ApprovalResolved.requestId`).
 */
async function apri(page, eventi, { rigiocata = false } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate(({ eventi, rigiocata }) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('rev-consenso', 'workspace', 'Consenso', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    const g = runtime.realSessionState.generation;
    if (!rigiocata) runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    let seq = 1;
    for (const e of eventi) runtime.handleRealEvent({ ...e, _sequenza: seq++ }, g);
    if (rigiocata) runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: seq++ }, g);
    window.__manda = (altri) => { for (const e of altri) runtime.handleRealEvent({ ...e, _sequenza: seq++ }, g); };
  }, { eventi, rigiocata });
  return page.locator('#conversation');
}
const avvio = { type: 'RunStarted', input: { consegna: 'Elenca i file' }, contesto: { cartella: 'C:\\progetti\\AVM' } };
const chiamata = (id, comando) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell' },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) },
];
const domanda = (requestId, toolCallId, comando) => ({ type: 'ApprovalRequested', requestId, azione: { tipo: 'shell', comando, toolCallId } });

test('REV-CONSENSO-01 — due chiamate in attesa, una risolta: la testa dice ancora «aspetta il tuo consenso» per l\'altra', async ({ page }) => {
  const chat = await apri(page, [avvio, ...chiamata('t1', 'ls'), ...chiamata('t2', 'pwd'), domanda('a1', 't1', 'ls'), domanda('a2', 't2', 'pwd')]);
  const testa = chat.locator('[data-c="ActivityBundle"]').last().locator('.tool-note-summary-text').first();
  await expect(testa).toContainText('Aspetta il tuo consenso');
  await expect(testa).not.toContainText('Esecuzione di');
  await page.evaluate(() => window.__manda([{ type: 'ApprovalResolved', requestId: 'a1', approvato: true }]));
  await expect(testa).toContainText('Esecuzione di 1 comando');
  await expect(testa).toContainText('aspetta il tuo consenso');
});

test('REV-CONSENSO-02 — una domanda che arriva per una chiamata GIÀ finita non riaccende «aspetta il tuo consenso»', async ({ page }) => {
  const chat = await apri(page, [avvio, ...chiamata('t1', 'ls'), { type: 'ToolCallResult', toolCallId: 't1', content: 'a\nb' }, domanda('a1', 't1', 'ls')]);
  await expect(chat.locator('.talos-approval')).toHaveCount(1); // la carta c'è
  const testa = chat.locator('[data-c="ActivityBundle"]').last().locator('.tool-note-summary-text').first();
  await expect(testa).not.toContainText('Aspetta il tuo consenso');
  await expect(testa).not.toContainText('aspetta il tuo consenso');
});

test('REV-CONSENSO-03 — rigiocata di una sessione con la domanda ancora aperta: dopo la fine della rigiocata la testa aspetta te', async ({ page }) => {
  const chat = await apri(page, [avvio, ...chiamata('t1', 'ls'), domanda('a1', 't1', 'ls')], { rigiocata: true });
  const testa = chat.locator('[data-c="ActivityBundle"]').last().locator('.tool-note-summary-text').first();
  await expect(testa).toContainText('Aspetta il tuo consenso');
  await expect(testa).not.toContainText('Esecuzione di');
});

test('REV-CONSENSO-04 — la chiamata finisce senza ApprovalResolved (negata dal kernel con il solo esito): la testa non resta su «aspetta»', async ({ page }) => {
  const chat = await apri(page, [avvio, ...chiamata('t1', 'ls'), ...chiamata('t2', 'pwd'), domanda('a1', 't1', 'ls'),
    { type: 'ToolCallResult', toolCallId: 't1', content: 'Denied.' }]);
  const testa = chat.locator('[data-c="ActivityBundle"]').last().locator('.tool-note-summary-text').first();
  await expect(testa).toContainText(/esecuzione di 1 comando/iu);
  await expect(testa).not.toContainText('aspetta il tuo consenso');
});
