import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/*
 * Fiducia della cartella, giro 2 — reperto (a) del controllore (Desktop 11/11 14:05) dal vivo, nel pacchetto SERVITO, a 1920×1080, nei due
 * temi e nelle due lingue: DUE finestre sulla stessa conversazione trattenuta (Accesso pieno su una cartella mai chiesta). La carta
 * «Ti fidi di questa cartella?» c'è in tutte e due, e la riga fissa non ripete la domanda; il «Sì» in una manda la bandiera
 * `soloSeMaiChiesta`, la pillola torna «Accesso pieno», e l'altra finestra, alla fotografia che il server manda dopo, chiude la sua
 * carta senza pulsanti. Le rotte della fiducia e dell'elenco sono INTERCETTATE con la forma vera del server (`http-app.mjs`,
 * `/api/v1/folder-trust`: `{ cartella, fidata, cambiate }`; l'elenco: le righe con `fiduciaDaChiedere`/`pienoTrattenuto`).
 */
const ID = 'fid2-viva';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const FOTO = process.env.TALOS_FOTO_DIR || 'test-results/fiducia-giro-2';

function serverFinto() {
  const s = { fidata: null, post: [] };
  s.riga = () => ({ sessionId: ID, taskId: ID, nome: 'Riordino del progetto', conclusa: true, interrotta: false, modello: 'prova/modello',
    avviataAlle: '2026-11-11T13:00:00.000Z', permessi: s.fidata === true ? 'Full access' : 'On request',
    ...(s.fidata === null ? { fiduciaDaChiedere: true, pienoTrattenuto: true } : {}) });
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
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ cartella: 'C:\\progetti\\riordino', fidata: srv.fidata }) });
      const corpo = JSON.parse(req.postData() ?? '{}');
      srv.post.push(corpo);
      if (!(corpo.soloSeMaiChiesta === true && srv.fidata !== null)) srv.fidata = corpo.fidata;
      return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ cartella: 'C:\\progetti\\riordino', fidata: srv.fidata, cambiate: [ID] }) });
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
    r.passaASessione(id, 'workspace', 'Riordino del progetto', 'prova/modello', sessione);
    r.handleRealEvent({ ...confine, _sequenza: 1 }, r.realSessionState.generation);
  }, { id: ID, sessione: srv.riga(), confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return page;
}

const carta = (page) => page.locator('#schermoChat [data-fiducia-cartella]');
const chip = (page) => page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label');

for (const [tema, lingua] of [['light', 'it'], ['dark', 'it'], ['light', 'en'], ['dark', 'en']]) {
  test(`FID2-VIVA (${tema}, ${lingua}) — due finestre: il «Sì» in una chiude la carta nell'altra, senza pulsanti; una domanda sola sullo schermo`, async ({ browser }) => {
    mkdirSync(FOTO, { recursive: true });
    const srv = serverFinto();
    const context = await browser.newContext();
    const a = await finestra(context, srv, { tema, lingua });
    const b = await finestra(context, srv, { tema, lingua });
    for (const p of [a, b]) {
      await expect(carta(p)).toHaveCount(1);
      await expect(carta(p).locator('[data-fiducia-si]')).toBeVisible();
      await expect(p.locator('#fasciaFiducia:visible'), '(c): con la carta aperta la riga fissa non fa la stessa domanda').toHaveCount(0);
    }
    await expect(carta(a)).toContainText(lingua === 'it' ? 'restano accesi' : 'stay on');
    await expect(chip(a)).toHaveText(lingua === 'it' ? 'Chiede prima' : 'Asks first');
    await carta(a).scrollIntoViewIfNeeded();
    await a.screenshot({ path: `${FOTO}/1-carta-${tema}-${lingua}.png` });
    await carta(a).locator('[data-fiducia-si]').click();
    await expect(chip(a), 'C9: la pillola torna Accesso pieno').toHaveText(lingua === 'it' ? 'Accesso pieno' : 'Full access');
    await expect(carta(a).locator('[data-fiducia-si]')).toHaveCount(0);
    /* l'altra finestra riceve dal suo flusso la fotografia che il server manda dopo il «Sì» (`riapplicaFiducia` → `rialzaSeFidata` →
       `annunciaImpostazioni`, session-registry.mjs: `{ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa,
       permessi, motivo, istantanea } }`); il flusso qui è muto, la si consegna dove la consegna il flusso vero */
    await b.evaluate(({ istantanea }) => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: 2,
        value: { modalitaOperativa: istantanea.modalitaOperativa, permessi: istantanea.permessi, motivo: 'impostazioni', istantanea } }, r.realSessionState.generation);
    }, { istantanea: { ...srv.riga(), modalitaOperativa: 'normale', versione: 2 } });
    await expect(carta(b).locator('[data-fiducia-no]'), '(a): nessun pulsante resta acceso nell\'altra finestra').toHaveCount(0, { timeout: 8_000 });
    await expect(chip(b)).toHaveText(lingua === 'it' ? 'Accesso pieno' : 'Full access');
    await expect(carta(b).locator('.talos-approval__esito')).toBeVisible();
    await carta(b).scrollIntoViewIfNeeded();
    await b.screenshot({ path: `${FOTO}/2-altra-finestra-${tema}-${lingua}.png` });
    expect(srv.post, 'un solo salvataggio, con la bandiera della carta').toEqual([{ sessionId: ID, fidata: true, soloSeMaiChiesta: true }]);
    await context.close();
  });
}
