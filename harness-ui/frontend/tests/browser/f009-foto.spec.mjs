import { expect, test } from '@playwright/test';

/*
 * F009 — le foto per la verifica visiva (owner: sempre sul 4174, mai sotto 1920×1080, chiaro e scuro). Il velo dei permessi usa
 * i dati VERI del 4174 (`GET /api/v1/wsl`); la carta di conferma nasce dall'evento del kernel con la frase vera. Ogni richiesta
 * non GET si ferma. Le foto vanno nella cartella indicata da TALOS_FOTO_DIR (scratchpad), mai nel repo.
 */
const CARTELLA = process.env.TALOS_FOTO_DIR;
test.skip(!CARTELLA, 'solo su richiesta: TALOS_FOTO_DIR');

const FRASE = 'Questo comando gira in Linux (WSL, Ubuntu) come root, e con i permessi di questa sessione nessuno lo approva: può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Se lo confermi, vale per tutta la sessione.';
const ETICHETTA = "wsl2 (Linux in WSL come root; nessun isolamento: /mnt/c è il disco di Windows con i diritti dell'utente Windows di TALOS, e lì i permessi Linux non valgono)";

async function apri(page, tema) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  await page.route('**/api/v1/sessions/f009foto-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiFontScale: 'default' }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

for (const tema of ['light', 'dark']) {
  test(`F009-FOTO velo permessi (${tema})`, async ({ page }) => {
    await apri(page, tema);
    await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    await page.locator('[data-open-sheet="permissions"]:visible').first().click();
    await expect(page.locator('#veloPermessiWsl')).toBeVisible();
    await page.locator('#veloPermessiWsl').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CARTELLA}/f009-velo-${tema}.png` });
  });

  test(`F009-FOTO carta e esito (${tema})`, async ({ page }) => {
    await apri(page, tema);
    await page.evaluate(({ frase, etichetta }) => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.passaASessione('f009foto-uno', 'workspace', 'F009 foto', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
      const g = runtime.realSessionState.generation;
      runtime.handleRealEvent({ type: 'ComandoUtenteIniziato', comandoId: 'k1', comando: 'id -un', _sequenza: 1 }, g);
      runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', _sequenza: 2 }, g);
      runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ comando: 'id -un' }), _sequenza: 3 }, g);
      runtime.handleRealEvent({ type: 'ToolCallResult', messageId: 'm1', toolCallId: 't1', content: `exit 0 [sandbox: ${etichetta}]\nroot`, role: 'tool', _sequenza: 4 }, g);
      runtime.handleRealEvent({ type: 'ComandoUtenteFinito', comandoId: 'k1', codice: 0, enforcement: 'wsl2', _sequenza: 5 }, g);
      runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Elenca i file della cartella' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 6 }, g);
      runtime.handleRealEvent({ type: 'ApprovalRequested', requestId: 'f009-foto-1', azione: { tipo: 'shell', toolCallId: 'c1', comando: 'ls -la', wslRoot: { distro: 'Ubuntu', utente: 'root', frase } }, _sequenza: 7 }, g);
    }, { frase: FRASE, etichetta: ETICHETTA });
    const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
    await expect(scheda).toBeVisible();
    await scheda.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CARTELLA}/f009-carta-${tema}.png` });
  });
}
