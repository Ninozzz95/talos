/*
 * UIG-1.R1 (G-B2, scenes 1+4, FE-081, 05/11/2026): the block versions in the real chat. Written, NOT yet run (brief B2: no browser
 * runs in this group); it belongs to the night suite. The events are the server's, handed to the page handler as in
 * `blocchi-chat.spec.mjs`: real turns through `window.__talosHarnessUiRuntime.handleRealEvent`, never a model.
 * ⛔ Only GETs reach a server: every non-GET is aborted and counted, and the count must stay 0 (the switch and «Back to v1» are local).
 */
import { expect, test } from '@playwright/test';

const ID = 'chat-blocchi-versioni';
const TABELLA = 'root = Tabella("spese", "Spese", null, ["Mese", "Euro"], [["Gennaio", 1200], ["Febbraio", 980.5], ["Marzo", 1100]])';
const RECINTO = (corpo, nome = 'b1') => `Ecco:\n\n\`\`\`talos-blocco nome=${nome}\n${corpo}\n\`\`\`\n\nDimmi tu.`;

async function apri(page, { salvataggi = [] } = {}) {
  const scritture = [];
  await page.route('**/api/**', (route) => {
    /* G-B3 (UIG-1.18): a version made on the PC is saved with ONE POST to this route, answered here (never the real server) */
    if (route.request().method() === 'POST' && route.request().url().endsWith(`/sessions/${ID}/blocchi/versione`)) {
      const valore = route.request().postDataJSON();
      salvataggi.push(valore);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, blocco: valore.blocco, versione: valore.versione } }) });
    }
    if (route.request().method() !== 'GET') { scritture.push(route.request().url()); return route.abort(); }
    if (route.request().url().includes(`/sessions/${ID}/events`)) return undefined; // stays pending: the events come from the test
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Versioni', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  return scritture;
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
const giro = (n, testo) => [
  { type: 'RunStarted', threadId: ID, runId: `r${n}` },
  { type: 'TextMessageStart', messageId: `m${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m${n}`, delta: testo },
  { type: 'TextMessageEnd', messageId: `m${n}` },
  { type: 'RunFinished', threadId: ID, runId: `r${n}`, outcome: { type: 'success' } },
];
const CINQUE_GIRI = [giro(1, RECINTO(TABELLA)), ...[2, 3, 4, 5].map((n) => giro(n, `Risposta ${n}, solo testo.`))].flat();
const voce = (page, testo) => page.locator('#menuDelBlocco [role="menuitem"]', { hasText: testo });
const blocco = (page) => page.locator('#conversation .gu').first();

test.use({ viewport: { width: 1280, height: 860 } });

for (const tema of ['light', 'dark']) {
  test(`UIG-1.R1 (${tema}) the block at turn 1 and after turn 5, a reload, «Bars ↔ Table» then «Back to v1», «Versions»`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    const salvataggi = [];
    let scritture = await apri(page, { salvataggi });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await manda(page, giro(1, RECINTO(TABELLA)));
    await expect(blocco(page)).toHaveAttribute('data-nome', 'b1');
    await expect(blocco(page)).toHaveAttribute('data-tipo', 'tabella');
    await manda(page, [2, 3, 4, 5].flatMap((n) => giro(n, `Risposta ${n}, solo testo.`)));
    await expect(page.locator('#conversation .gu')).toHaveCount(1);
    await expect(blocco(page)).toHaveAttribute('data-nome', 'b1');

    /* reload: the same events replayed give the same block with the same name */
    await page.reload();
    scritture = scritture.concat(await apri(page, { salvataggi }));
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await manda(page, CINQUE_GIRI);
    await expect(page.locator('#conversation .gu')).toHaveCount(1);
    await expect(blocco(page)).toHaveAttribute('data-nome', 'b1');

    /* «Bars ↔ Table»: a new version on the PC, the label under the title says v2 */
    await blocco(page).locator('.gu__testa button[aria-haspopup="menu"]').click();
    await expect(voce(page, 'Versions')).toHaveCount(0);
    await voce(page, 'Bars ↔ Table').click();
    await expect(blocco(page)).toHaveAttribute('data-tipo', 'grafico');
    await expect(blocco(page).locator('.gu__versione')).toHaveText(/^v2 · /);

    /* «Back to v1»: v3 copies v1, nothing deleted */
    await blocco(page).locator('.gu__testa button[aria-haspopup="menu"]').click();
    await voce(page, 'Back to v1').click();
    await expect(blocco(page)).toHaveAttribute('data-tipo', 'tabella');
    await expect(blocco(page).locator('.gu__versione')).toHaveText(/^v3 · /);

    /* «Versions»: three entries, the current one marked; the person never sees b1 or a tool name */
    await blocco(page).locator('.gu__testa button[aria-haspopup="menu"]').click();
    await voce(page, 'Versions').click();
    await expect(blocco(page).locator('.gu__versioni button')).toHaveCount(3);
    await expect(blocco(page).locator('.gu__versioni button[aria-current="true"]')).toHaveAttribute('data-versione', '3');
    await expect(blocco(page)).not.toContainText(/\bb1\b|blocco_aggiorna/);
    await page.screenshot({ path: `test-results/uig-1-r1-${tema === 'light' ? 'chiaro' : 'scuro'}.png`, fullPage: true });
    expect(scritture, 'no other write to the server').toEqual([]);
    /* UIG-1.18: one save per version made on the PC, no turn (no sendMessage), no toast */
    expect(salvataggi.map((v) => [v.blocco, v.versione, v.origine])).toEqual([['b1', 2, 'vista'], ['b1', 3, 'ritorno']]);
    await expect(page.locator('#regioneToast, #toastRegion')).not.toContainText(/not saved|non è stata salvata/);
  });
}

/* G-B3 closed the G-B2 gap: the host's `talos.blocco.versione` event (v2 written by the model through the update tool) is routed by
   app.js to `aggancio.aggiornaVersione`, which redraws the named block in place; a reload replays the same events. */
const V2_DEL_MODELLO = { type: 'CUSTOM', name: 'talos.blocco.versione', value: {
  conversazione: ID, messaggio: '', blocco: 'b1', versione: 2, origine: 'modello', cosaECambiato: 'Marzo: 1100 → 1300',
  sorgente: TABELLA.replace('1100', '1300'), quando: '2026-11-05T21:00:00.000Z',
} };
for (const tema of ['light', 'dark']) {
  test(`UIG-1.R1b (${tema}) after turn 5 the model updates b1: the block on screen shows v2, and after a reload still v2`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    let scritture = await apri(page);
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await manda(page, CINQUE_GIRI);
    await manda(page, [V2_DEL_MODELLO]);
    await expect(page.locator('#conversation .gu')).toHaveCount(1);
    await expect(blocco(page).locator('.gu__versione')).toHaveText(/^v2 · Marzo/);
    await expect(blocco(page)).toContainText('1300');
    await page.reload();
    scritture = scritture.concat(await apri(page));
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await manda(page, [...CINQUE_GIRI, V2_DEL_MODELLO]);
    await expect(page.locator('#conversation .gu')).toHaveCount(1);
    await expect(blocco(page).locator('.gu__versione')).toHaveText(/^v2 · Marzo/);
    await blocco(page).locator('.gu__testa button[aria-haspopup="menu"]').click();
    await voce(page, 'Versions').click();
    await expect(blocco(page).locator('.gu__versioni button')).toHaveCount(2);
    await page.screenshot({ path: `test-results/uig-1-r1b-${tema === 'light' ? 'chiaro' : 'scuro'}.png`, fullPage: true });
    expect(scritture, 'a version from the model writes nothing from the page').toEqual([]);
  });
}
