import { expect, test } from '@playwright/test';

/*
 * Owner 29/10/2026 (`local_page`, due consigliate): il modello apre la pagina del server locale nella STESSA scheda Browser che vede la
 * persona, ma la vista non si sposta da sola; in chat una riga coi pezzi di «Server pronto»: «Pagina guardata dal modello ·
 * localhost:5173/about — Apri nel Browser». Gli eventi portano l'esito VERO del nucleo (`LOCAL PAGE :porta/percorso · url`,
 * `talosHarness.mjs`), non un testo inventato.
 */
const SID = 'pagina-locale-chat';
const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

const schedeVive = (page) => page.evaluate(() => (window.__talosHarnessUiRuntime.realSessionState.browserVive ?? []).map((x) => x.url));

async function apri(page) {
  const aperti = [];
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route(`**/api/v1/sessions/${SID}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([]) }));
  await page.route('**/api/v1/browser/vivo/apri*', async (route) => { aperti.push(JSON.parse(route.request().postData() || '{}').url); return route.fulfill({ json: { ok: true, data: { ok: true, stato: 200 } } }); });
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Pagina locale', 'z-ai/glm-5.3-flash', { conclusa: false }), SID);
  await page.waitForTimeout(500);
  await evento(page, { type: 'RunStarted', input: { consegna: 'guarda la pagina about' }, _sequenza: 1 });
  return aperti;
}
async function chiamata(page, { id, argomenti, esito, sequenza }) {
  await evento(page, { type: 'ToolCallStart', toolCallId: id, toolCallName: 'local_page', _sequenza: sequenza });
  await evento(page, { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti), _sequenza: sequenza + 1 });
  await evento(page, { type: 'ToolCallEnd', toolCallId: id, _sequenza: sequenza + 2 });
  await evento(page, { type: 'ToolCallResult', toolCallId: id, content: esito, _sequenza: sequenza + 3 });
}

test('PAGINA-LOCALE-UI-01 la riga in chat dice la pagina guardata; la vista resta nella chat; «Apri nel Browser» apre quella pagina', async ({ page }) => {
  await apri(page);
  await chiamata(page, { id: 'call_lp', sequenza: 2, argomenti: { port: 5173, path: '/about' }, esito: 'LOCAL PAGE :5173/about · http://127.0.0.1:5173/about\nAbout page text' });
  const riga = page.locator('[data-pagina-locale]');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('Pagina guardata dal modello · localhost:5173/about');
  await expect(page.locator('#schermoChat')).toBeVisible(); // owner: la vista non si sposta da sola
  await riga.getByRole('button', { name: 'Apri nel Browser' }).click();
  await expect(page.locator('#schermoBrowser')).toBeVisible(); // al clic, e solo al clic, si va nel Browser
  await expect.poll(() => schedeVive(page)).toEqual(['http://localhost:5173/about']);
});

test('PAGINA-LOCALE-UI-02 AL CONTRARIO: un rifiuto non fa la riga, e un percorso storto non apre un altro host', async ({ page }) => {
  await apri(page);
  await chiamata(page, { id: 'call_no', sequenza: 2, argomenti: { port: 4174 }, esito: 'REFUSED. Port 4174 is not a ready development server of this conversation. Ready ones: 5173.' });
  await expect(page.locator('[data-pagina-locale]')).toHaveCount(0);
  await chiamata(page, { id: 'call_storto', sequenza: 10, argomenti: { port: 5173, path: '//evil.com' }, esito: 'LOCAL PAGE :5173/ · http://127.0.0.1:5173/\nx' });
  const riga = page.locator('[data-pagina-locale]');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('localhost:5173');
  await expect(riga).not.toContainText('evil');
  await riga.getByRole('button', { name: 'Apri nel Browser' }).click();
  await expect.poll(() => schedeVive(page)).toEqual(['http://localhost:5173/']);
});
