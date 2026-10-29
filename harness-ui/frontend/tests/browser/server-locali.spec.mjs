import { test, expect } from '@playwright/test';

/*
 * ⭐ Owner 27/10/2026 — i server locali di `npm run dev`: la riga in chat «Server pronto · localhost:5173 · Vite — Apri nel Browser»
 *   (bozzetto A1) e la striscia «Server locali» nella scheda Browser (bozzetto A2), dagli eventi `talos.server-locale` come li manda il
 *   server (`src/server-locali.mjs`, `session-registry.mjs`). Nei due temi, a 1920×1080. Ogni non-GET si ferma e si conta.
 *   Al contrario: al confine della rigiocata lo stato VIVO (la rotta) vince sulla storia — un server che la storia dice pronto e che un
 *   riavvio ha spento resta nella chat come storia, ma la striscia lo mostra fermato.
 */
const SESSIONE = 'sl-ui';
const server = (porta, stato, framework = null) => ({ porta, origine: stato === 'pronto' ? `http://127.0.0.1:${porta}` : null, framework, comando: null, toolCallId: `call-${porta}`, stato, fonti: ['uscita', 'porta'], aggiornatoAlle: 1 });

async function apri(page, modo, { vivi = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: modo, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* niente */ }
  }, modo);
  const conto = { nonGet: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(percorso); return route.abort(); }
    if (percorso === `/api/v1/sessions/${SESSIONE}/events`) return undefined; // aperto e muto
    if (percorso === `/api/v1/sessions/${SESSIONE}/local-servers`) return route.fulfill({ json: { ok: true, data: { server: vivi ?? [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return conto;
}
async function eventi(page, lista, { confine = true } = {}) {
  await page.evaluate(({ id, lista, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    if (r.realSessionState.id !== id) r.passaASessione(id, 'workspace', 'Sito dell\'officina', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    if (confine) r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
  }, { id: SESSIONE, lista, confine });
}
const evento = (s, n) => ({ type: 'CUSTOM', name: 'talos.server-locale', value: s, _sequenza: n });
const riga = (page, porta) => page.locator(`#conversation .talos-server-locale[data-porta="${porta}"]`);

for (const modo of ['dark', 'light']) {
  test(`SL-UI-01 la riga «Server pronto» e la striscia del Browser; «fermato» aggiorna la stessa riga (${modo})`, async ({ page }, testInfo) => {
    const conto = await apri(page, modo, { vivi: [] });
    await eventi(page, [
      { type: 'RunStarted', input: { consegna: 'Avvia il sito e controlla che la home si veda bene' }, _sequenza: 1 },
      evento(server(5173, 'pronto', 'Vite'), 2),
      { type: 'RunFinished', _sequenza: 3 },
    ]);
    await expect(riga(page, 5173)).toHaveCount(1);
    await expect(riga(page, 5173)).toContainText('Server pronto · localhost:5173 · Vite');
    await expect(riga(page, 5173).getByRole('button', { name: 'Apri nel Browser' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`sl-riga-${modo}.png`) });
    await riga(page, 5173).getByRole('button', { name: 'Apri nel Browser' }).click();
    await expect(page.locator('#schermoBrowser')).toBeVisible();
    const chip = page.locator('#browserServerLocali .talos-server-chip[data-porta="5173"]');
    await expect(chip).toContainText('localhost:5173');
    await expect(chip).toContainText('Vite');
    await expect(page.locator('#browserServerLocali')).toContainText('Server locali');
    await page.screenshot({ path: testInfo.outputPath(`sl-striscia-${modo}.png`) });
    await eventi(page, [evento(server(5173, 'fermato', 'Vite'), 4)], { confine: false });
    await expect(chip).toHaveAttribute('data-stato', 'fermato');
    await expect(chip).toBeDisabled();
    await expect(chip).toContainText('fermato');
    expect(conto.nonGet.every((p) => /\/browser/u.test(p)), `scritture inattese: ${conto.nonGet}`).toBe(true);
  });
}

test('SL-UI-02 «fermato»: la riga resta UNA, cambia in posto e perde «Apri nel Browser»', async ({ page }) => {
  await apri(page, 'dark', { vivi: [] });
  await eventi(page, [evento(server(3000, 'pronto', 'Next.js'), 1), evento(server(3000, 'fermato', 'Next.js'), 2)]);
  await expect(riga(page, 3000)).toHaveCount(1);
  await expect(riga(page, 3000)).toContainText('Server fermato · localhost:3000');
  await expect(riga(page, 3000).getByRole('button', { name: 'Apri nel Browser' })).toBeHidden();
});

test('SL-UI-03 AL CONTRARIO: al confine della rigiocata vince lo stato vivo della rotta, non la storia', async ({ page }) => {
  await apri(page, 'dark', { vivi: [server(5173, 'fermato', 'Vite')] });
  await eventi(page, [evento(server(5173, 'pronto', 'Vite'), 1)], { confine: false }); // la storia dice «pronto»
  await eventi(page, [], { confine: true }); // il confine rilegge la rotta: il server è fermato
  await page.evaluate(() => window.__talosHarnessUiRuntime.setView?.('browser'));
  await page.locator('[data-vaia="browser"]').first().click();
  const chip = page.locator('#browserServerLocali .talos-server-chip[data-porta="5173"]');
  await expect(chip).toHaveAttribute('data-stato', 'fermato');
  await expect(riga(page, 5173)).toContainText('Server pronto', { timeout: 2000 }); // la riga in chat resta la storia
});
