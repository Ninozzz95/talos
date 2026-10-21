import { expect, test } from '@playwright/test';

/*
 * 18/10/2026 — R5.8 «test e riconnessione di un MCP» (decisione owner del 17/10, dal PC e dal telefono). Nei Connettori, per un server
 * GIÀ fidato, «Prova il collegamento» sta dove sta «Fida» per un server da fidare: un'azione sola alla volta. La prova parte, il
 * toast dice l'esito, e l'inventario si rilegge. Le risposte del server sono finte; l'unica scrittura ammessa è la prova.
 */
const FIDATO = { id: 'documentazione', comando: 'node', argomenti: ['mcp-finto.mjs'], allowlist: ['cerca'], fidato: true, connessione: { esito: 'non-partito', motivo: 'spawn node ENOENT' } };
const DA_FIDARE = { id: 'archivio', comando: 'node', argomenti: ['a.mjs'], allowlist: ['leggi'], fidato: false };

async function apri(page, { tema, risposta }) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* */ }
  }, { colorMode: tema });
  const scritture = [];
  const letture = { mcp: 0 };
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions/mp-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/*/mcp', (r) => { letture.mcp += 1; return r.fulfill({ json: { ok: true, data: { server: [FIDATO, DA_FIDARE], errore: null } } }); });
  await page.route('**/api/v1/sessions/*/mcp/*/test', (r) => { scritture.push(`POST ${new URL(r.request().url()).pathname}`); return r.fulfill({ json: { ok: true, data: risposta } }); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('mp-uno', 'workspace', 'Connettori', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' }));
  await page.locator('#testataGruppoStrumenti').click();
  await page.locator('nav [data-vaia="capability"]').first().click();
  await page.locator('[data-cap-tab="mcp"]').click();
  return { scritture, letture };
}

for (const tema of ['dark', 'light']) {
  test(`MCP-PROVA-UI-01 (${tema}) — per un server fidato «Prova il collegamento», per uno da fidare solo «Fida»; la prova dice l'esito`, async ({ page }, testInfo) => {
    const { scritture, letture } = await apri(page, { tema, risposta: { ok: true, esito: 'collegato', attrezzi: 1, ms: 120 } });
    const pannello = page.locator('#capPanel-mcp');
    await pannello.locator('[data-ext-id="documentazione"]').click();
    const prova = pannello.locator('[data-ext-test]');
    await expect(prova).toBeVisible();
    await expect(prova).toHaveText('Prova il collegamento');
    await expect(pannello.locator('[data-ext-trust]')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`connettori-${tema}.png`) });
    const lettePrima = letture.mcp;
    await prova.click();
    await expect(page.locator('.talos-toast').filter({ hasText: 'documentazione è collegato con 1 attrezzo' })).toBeVisible();
    await expect.poll(() => letture.mcp).toBeGreaterThan(lettePrima);
    await pannello.locator('[data-ext-id="archivio"]').click();
    await expect(prova).toBeHidden();
    await expect(pannello.locator('[data-ext-trust]')).toBeVisible();
    expect(scritture).toEqual(['POST /api/v1/sessions/mp-uno/mcp/documentazione/test']);
  });
}

test('MCP-PROVA-UI-02 — al contrario: un server che non parte lo dice col motivo, come avviso', async ({ page }) => {
  await apri(page, { tema: 'dark', risposta: { ok: true, esito: 'non-partito', attrezzi: 0, ms: 30, motivo: 'spawn node ENOENT' } });
  const pannello = page.locator('#capPanel-mcp');
  await pannello.locator('[data-ext-id="documentazione"]').click();
  await pannello.locator('[data-ext-test]').click();
  await expect(page.locator('.talos-toast').filter({ hasText: 'documentazione non parte: spawn node ENOENT' })).toBeVisible();
});
