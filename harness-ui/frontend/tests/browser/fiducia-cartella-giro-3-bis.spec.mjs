import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/*
 * Fiducia della cartella, giro 3-bis (owner 11/11/2026 16:35, giudice v1491) dal vivo, nel pacchetto SERVITO, a 1920×1080, nei due temi e
 * nelle due lingue: una conversazione in Accesso pieno trattenuta su un DISCO INTERO (`C:\`). La carta nomina il disco, dice che lì la
 * fiducia non si salva e offre «Mi fido solo per questa conversazione»; il clic manda `soloPerLaConversazione: true` e la pillola torna
 * «Accesso pieno». La rotta della fiducia e l'elenco sono INTERCETTATI con la forma vera del server (`http-app.mjs`, `/api/v1/folder-trust`:
 * `{ cartella, fidata, soloPerLaConversazione }`; l'elenco: le righe con `fiduciaDaChiedere`, `fiduciaSoloConversazione`).
 */
const ID = 'fid3bis-disco';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const FOTO = process.env.TALOS_FOTO_DIR || 'test-results/fiducia-giro-3-bis';

function serverFinto() {
  const s = { fidata: null, post: [] };
  s.riga = () => ({ sessionId: ID, taskId: ID, nome: 'Pulizia del disco', conclusa: true, interrotta: false, modello: 'prova/modello',
    avviataAlle: '2026-11-11T16:00:00.000Z', permessi: s.fidata === true ? 'Full access' : 'On request',
    ...(s.fidata === null ? { fiduciaDaChiedere: true, pienoTrattenuto: true, fiduciaSoloConversazione: true } : {}) });
  return s;
}

async function finestra(context, srv, { tema, lingua }) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
  }, { colorMode: tema, uiLanguage: lingua });
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/v1/folder-trust') {
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ cartella: 'C:\\', fidata: srv.fidata, soloPerLaConversazione: true }) });
      const corpo = JSON.parse(req.postData() ?? '{}');
      srv.post.push(corpo);
      if (!(corpo.soloSeMaiChiesta === true && srv.fidata !== null)) srv.fidata = corpo.fidata;
      return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ cartella: 'C:\\', fidata: srv.fidata, cambiate: [ID], soloPerLaConversazione: true }) });
    }
    if (url.pathname === '/api/v1/sessions' && req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ items: [srv.riga()] }) });
    if (url.pathname === `/api/v1/sessions/${ID}/events`) return undefined; // il flusso resta aperto e muto
    if (req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(({ id, sessione, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Pulizia del disco', 'prova/modello', sessione);
    r.handleRealEvent({ ...confine, _sequenza: 1 }, r.realSessionState.generation);
  }, { id: ID, sessione: srv.riga(), confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return page;
}

const carta = (page) => page.locator('#schermoChat [data-fiducia-cartella]');
const chip = (page) => page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label');

for (const [tema, lingua] of [['light', 'it'], ['dark', 'it'], ['light', 'en'], ['dark', 'en']]) {
  test(`FID3BIS (${tema}, ${lingua}) — disco intero: la carta lo nomina e offre la fiducia solo per questa conversazione`, async ({ browser }) => {
    mkdirSync(FOTO, { recursive: true });
    const srv = serverFinto();
    const context = await browser.newContext();
    const a = await finestra(context, srv, { tema, lingua });
    await expect(carta(a)).toHaveCount(1);
    await expect(carta(a)).toContainText('C:\\');
    await expect(carta(a).locator('[data-fiducia-si]')).toHaveText(lingua === 'it' ? 'Mi fido solo per questa conversazione' : 'Trust for this conversation only');
    await expect(carta(a)).toContainText(lingua === 'it' ? 'non salva mai la fiducia' : 'never saves trust here');
    await expect(chip(a)).toHaveText(lingua === 'it' ? 'Chiede prima' : 'Asks first');
    await carta(a).scrollIntoViewIfNeeded();
    /* la foto DOPO che il velo «Apro la cronologia…» è sparito: prima la carta c'è ma è coperta */
    await expect(a.getByText(/Apro la cronologia|Opening history/u)).toBeHidden({ timeout: 15_000 });
    await expect(carta(a)).toBeVisible();
    await a.screenshot({ path: `${FOTO}/3bis-carta-disco-${tema}-${lingua}.png` });
    await carta(a).locator('[data-fiducia-si]').click();
    await expect(chip(a)).toHaveText(lingua === 'it' ? 'Accesso pieno' : 'Full access');
    expect(srv.post).toEqual([{ sessionId: ID, fidata: true, soloSeMaiChiesta: true, soloPerLaConversazione: true }]);
    await a.screenshot({ path: `${FOTO}/3bis-dopo-il-si-${tema}-${lingua}.png` });
    await context.close();
  });
}
