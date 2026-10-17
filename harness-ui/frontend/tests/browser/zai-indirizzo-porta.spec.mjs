import { expect, test } from '@playwright/test';

/*
 * Owner 14/10/2026 (mockup approvato, carta «Sì, così»): una sessione Z.AI senza indirizzo scelto si ferma prima della rete
 * (`PROVIDER_ENDPOINT_NOT_CHOSEN`, `src/model-destination.mjs`) e la chat lo dice con la carta gialla «Da scegliere» e UNA
 * porta, «Scegli l'indirizzo», che apre la modale «Configura Z.AI» con le due domande.
 * ⛔ La porta nasce in chat, dove la lista dei fornitori spesso NON è ancora caricata (trovato dal vivo sul 4177 il 14/10: la
 *   prima stesura cercava l'id subito e apriva solo la scheda Provider). La prova parte proprio da lì: nessuna visita al
 *   Laboratorio prima del clic.
 * Ermetica come `velo-fornitori.spec.mjs`: `/api/v1/providers` è intercettata, ogni richiesta non-GET è FERMATA e contata,
 * e la prova chiude con `expect(tentate).toEqual([])`.
 */
const FORNITORI = [
  { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
  { id: 'zai', label: 'Z.AI', requiresKey: true, keyConfigured: true, supportsEndpoint: true, endpoint: 'https://api.z.ai/api/paas/v4', endpointConfigured: false, endpointDaScegliere: true, endpointPredefinito: true, timeoutSeconds: 600, execution: 'cloud',
    pool: [{ impronta: 'e'.repeat(64), origine: 'custodia', stato: 'disponibile' }] },
];
const SETUP = { ok: true, data: { introDisattivato: false, provider: { pronto: true, conChiave: ['openrouter', 'zai'], conIndirizzo: [], agenteEsterno: false, localeConfigurato: false }, cartelleProgetto: 0 }, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: '2026-10-14T08:00:00.000Z' } };

async function avvia(page, colorMode) {
  const tentate = [];
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.route('**/api/v1/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: FORNITORI }, meta: { schema: 'talos.harness-ui.api.v1' } }) }));
  await page.route('**/api/v1/setup/stato', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SETUP) }));
  await page.addInitScript((modo) => {
    if (sessionStorage.getItem('__provaAvviata')) return;
    sessionStorage.setItem('__provaAvviata', '1');
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modo, themePreset: 'calm', themePresetVersione: 2 }, chat: {}, workspaces: {} }));
  }, colorMode);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15_000 });
  return tentate;
}

/** Il giro fermato come lo manda il server: il ramo `RunError` VERO costruisce la carta con la sua porta. */
async function giroSenzaIndirizzo(page) {
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    document.querySelector('.talos-sidebar [data-vaia="chat"]')?.click();
    r.handleRealEvent({ type: 'RunError', code: 'PROVIDER_ENDPOINT_NOT_CHOSEN', message: 'Choose where your Z.AI key goes: Model Lab → Providers → Configure.', _sequenza: 910001 }, r.realSessionState.generation);
  });
  return page.locator('#conversation .real-session-status').filter({ hasText: 'indirizzo da scegliere' });
}

for (const tema of ['dark', 'light']) {
  test(`ZAI-PORTA-01 (${tema}) — la carta è gialla «Da scegliere» col nome, e «Scegli l’indirizzo» apre la modale di Z.AI anche se il Laboratorio non era mai stato aperto`, async ({ page }) => {
    const tentate = await avvia(page, tema);
    const nota = await giroSenzaIndirizzo(page);
    await expect(nota).toHaveCount(1);
    await expect(nota).toHaveAttribute('data-tone', 'warning');
    await expect(nota.locator('.talos-badge')).toHaveText('Da scegliere');
    await expect(nota.locator('.talos-system-note__title')).toHaveText('Z.AI · indirizzo da scegliere');
    await expect(nota).not.toHaveClass(/real-session-error/u);
    const porte = nota.locator('[data-nota-azione]');
    await expect(porte).toHaveCount(1);
    await porte.first().click();
    const modale = page.locator('dialog[data-provider-modale="zai"]');
    await expect(modale).toBeVisible();
    await expect(modale.locator('[data-zai-domanda]')).toHaveCount(2);
    await expect(modale.getByRole('button', { name: 'Salva', exact: true })).toBeDisabled();
    expect(tentate).toEqual([]);
  });
}
