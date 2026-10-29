import { expect, test } from '@playwright/test';

/*
 * 29/10/2026 (foto della sonda della prova di luna): la testa del gruppo diceva «Esecuzione di 1 comando… · 0 s» mentre il comando
 * ASPETTAVA la carta del consenso; la scheda Processi diceva già «Aspetta il tuo consenso» (owner 02/10). Gli eventi sono quelli veri:
 * il kernel mette `toolCallId` nell'`azione` di ogni domanda (misurato anche dalla CLI su un evento vero, 29/10).
 */
async function apri(page, { conId = true } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate(({ conId }) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('riga-in-consenso', 'workspace', 'Consenso', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation);
    const g = runtime.realSessionState.generation;
    let seq = 1;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Elenca i file' }, contesto: { cartella: 'C:\\progetti\\AVM' }, _sequenza: seq++ }, g);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', _sequenza: seq++ }, g);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: '{"comando":"ls -la"}', _sequenza: seq++ }, g);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId: 'a1', azione: { tipo: 'shell', comando: 'ls -la', ...(conId ? { toolCallId: 't1' } : {}) }, _sequenza: seq++ }, g);
    window.__risolvi = () => runtime.handleRealEvent({ type: 'ApprovalResolved', requestId: 'a1', approvato: true, _sequenza: seq++ }, g);
  }, { conId });
  return page.locator('#conversation');
}

test('RIGA-CONSENSO-01 — il comando che aspetta la carta non è «in esecuzione»: lo dice, e dopo il sì torna in esecuzione', async ({ page }) => {
  const conversazione = await apri(page);
  await expect(conversazione).toContainText('Aspetta il tuo consenso');
  await expect(conversazione).not.toContainText('Esecuzione di 1 comando');
  await page.screenshot({ path: 'test-results/riga-in-consenso.png' });
  await page.evaluate(() => window.__risolvi());
  await expect(conversazione).toContainText('Esecuzione di 1 comando');
  await expect(conversazione).not.toContainText('Aspetta il tuo consenso');
});

test('RIGA-CONSENSO-02 — AL CONTRARIO: una domanda che non dice la chiamata non cambia nessuna riga', async ({ page }) => {
  const conversazione = await apri(page, { conId: false });
  await expect(conversazione).toContainText('Esecuzione di 1 comando');
  await expect(conversazione).not.toContainText('Aspetta il tuo consenso');
});
