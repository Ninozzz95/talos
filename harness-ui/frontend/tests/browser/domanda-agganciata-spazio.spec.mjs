import { expect, test } from '@playwright/test';

/*
 * Owner 03/10/2026 («Sì, va stretto»): con una domanda di TALOS agganciata sopra il composer, fra la fine della conversazione e la
 *   domanda restavano ~134 px vuoti — la riserva della «coda a metà pagina» (decisione del 26/09, opzione C), che serve mentre
 *   il testo scorre. Con la domanda il giro è fermo: la conversazione finisce subito sopra di lei.
 * Gli eventi sono quelli del server (`agui-events.mjs`, `userQuestionRequested`) ed entrano da `handleRealEvent`.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
const SESSIONE = 'domanda-agganciata-spazio';
const PARAGRAFI = Array.from({ length: 40 }, (_, i) => `Paragrafo ${i + 1}: le note di rilascio raccolgono le modifiche del giro.`).join('\n\n');

async function apri(page) {
  const conti = { nonGet: 0 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/*', (route) => {
    if (route.request().method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    return route.fallback();
  });
  await page.route(`**/api/v1/sessions/${SESSIONE}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Domanda agganciata', 'z-ai/glm-5.3-flash', { conclusa: false }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return conti;
}
const eventi = (page, lista) => page.evaluate((lista) => {
  const rt = window.__talosHarnessUiRuntime;
  lista.forEach((e) => rt.handleRealEvent(e, rt.realSessionState.generation));
}, lista);
const misura = (page) => page.evaluate(() => {
  const conv = document.querySelector('#conversation');
  const sc = conv.closest('.talos-conversation') || conv.parentElement;
  sc.scrollTop = sc.scrollHeight;
  const ultimo = [...conv.children].at(-1).getBoundingClientRect().bottom;
  const dock = document.querySelector('#userQuestionDock');
  const riserva = getComputedStyle(sc).getPropertyValue('--stream-follow-space').trim();
  return { riserva, ultimo, dockTop: dock && !dock.hidden ? dock.getBoundingClientRect().top : null };
});

test('DOCK-SPAZIO — con la domanda agganciata la conversazione finisce subito sopra la domanda, senza la riserva', async ({ page }) => {
  const conti = await apri(page);
  await eventi(page, [
    { type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Prepara le note di rilascio' }, contesto: {} },
    { type: 'TextMessageStart', _sequenza: 9302, messageId: 'm1', role: 'assistant' },
    { type: 'TextMessageContent', _sequenza: 9303, messageId: 'm1', delta: PARAGRAFI },
    { type: 'TextMessageEnd', _sequenza: 9304, messageId: 'm1' },
  ]);
  /* AL CONTRARIO, prima della domanda: la conversazione supera la vista e la riserva c'è (la regola del 26/09 resta) */
  await expect.poll(async () => parseFloat((await misura(page)).riserva)).toBeGreaterThan(0);
  await eventi(page, [{ type: 'UserQuestionRequested', _sequenza: 9305, requestId: 'q-spazio', at: '2026-10-03T12:00:00.000Z',
    questions: [{ id: 'formato', question: 'Quale formato?', options: [{ label: 'Markdown', description: 'Un file nel progetto' }, { label: 'PDF', description: 'Da condividere' }] }] }]);
  await expect(page.locator('#userQuestionDock')).toBeVisible();
  await expect.poll(async () => (await misura(page)).riserva).toBe('0px');
  const m = await misura(page);
  const vuoto = m.dockTop - m.ultimo;
  expect(vuoto, `spazio fra la fine della conversazione e la domanda: ${Math.round(vuoto)} px`).toBeLessThan(48);
  expect(vuoto).toBeGreaterThanOrEqual(0);
  expect(conti.nonGet).toBe(0);
});
