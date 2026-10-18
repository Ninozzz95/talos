import { expect, test } from '@playwright/test';
import { TESTI } from '../../src/i18n/testi/index.js';

/*
 * 17/10/2026 (owner: «la fiducia vecchia non vale più, e la carta lo dice»). Hook e server MCP del progetto ora contano anche gli
 * script che eseguono (`src/script-del-progetto.mjs`, la regola condivisa con la CLI); chi li aveva approvati con la regola di prima
 * li riapprova una volta. La scheda deve dire PERCHÉ, nella lingua dell'interfaccia, accanto allo stato — come la frase dei plugin
 * (`estensioni-frase-e-falliti.spec.mjs`). Le risposte del server sono finte e solo in lettura: nessuna scrittura parte.
 */
const HOOK = { id: 'guardia', eventi: ['pre_tool_call'], fidato: false, motivo: 'regola-precedente',
  frase: TESTI.en['server.hook.trust.scriptsNowCovered'], fraseChiave: 'server.hook.trust.scriptsNowCovered' };
const MCP = { id: 'mio-server', comando: 'node', argomenti: ['server/mcp.mjs'], allowlist: ['cerca'], fidato: false, motivo: 'regola-precedente',
  frase: TESTI.en['server.mcp.trust.scriptsNowCovered'], fraseChiave: 'server.mcp.trust.scriptsNowCovered' };

async function apri(page, { tema, lingua }) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata */ }
  }, { colorMode: tema, uiLanguage: lingua });
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(`${r.method()} ${r.url()}`); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions/fs-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/*/hooks', (r) => r.fulfill({ json: { ok: true, data: { hooks: [HOOK], errore: null } } }));
  await page.route('**/api/v1/sessions/*/mcp', (r) => r.fulfill({ json: { ok: true, data: { server: [MCP], errore: null } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('fs-uno', 'workspace', 'Fiducia', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' }));
  await page.locator('#testataGruppoStrumenti').click();
  await page.locator('nav [data-vaia="capability"]').first().click();
  return scritture;
}

for (const tema of ['dark', 'light']) {
  for (const lingua of ['en', 'it']) {
    test(`FIDUCIA-SCRIPT-SCHERMO (${tema}, ${lingua}) — hook e server MCP: la scheda dice perché va ridata la fiducia`, async ({ page }) => {
      const scritture = await apri(page, { tema, lingua });
      for (const [scheda, chiave] of [['hooks', 'server.hook.trust.scriptsNowCovered'], ['mcp', 'server.mcp.trust.scriptsNowCovered']]) {
        await page.locator(`[data-cap-tab="${scheda}"]`).click();
        const pannello = page.locator(`#capPanel-${scheda}`);
        const frase = pannello.locator('[data-ext-frase]');
        await expect(frase).toBeVisible();
        await expect(frase).toHaveText(TESTI[lingua][chiave]);
        await page.screenshot({ path: `artifacts/fiducia-script/${scheda}-${tema}-${lingua}.png` });
      }
      expect(scritture, 'nessuna scrittura verso il server').toEqual([]);
    });
  }
}
