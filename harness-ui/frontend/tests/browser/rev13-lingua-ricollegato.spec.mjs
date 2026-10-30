import { expect, test } from '@playwright/test';

import { CONFINE } from './aiuto-confine.mjs';

/*
 * Revisione avversaria del blocco 13 (28/10/2026), prova ROSSA. Il server tiene la lingua delle risposte SOLO in memoria
 * (`impostaLinguaDelleRisposte`, «non si scrive su disco»): dopo un riavvio la dimentica. La finestra ricorda cosa ha già detto al
 * server (`linguaRisposteDettaAlServer`) e, al «ricollegato», svuota solo la mappa della lingua dell'interfaccia (K3b): la lingua
 * delle risposte non viene ridetta, e il server ripartito risponde in Automatica.
 * ⛔ Nessuna scrittura vera: ogni POST è finta.
 */
const S = 'rev13-lingua';
const ok = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data } });
const giro = (runId, consegna, seq) => [
  { type: 'RunStarted', runId, _sequenza: seq, input: { consegna, seguito: seq > 1 }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } },
  { type: 'TextMessageStart', messageId: `m-${runId}`, _sequenza: seq + 1 },
  { type: 'TextMessageContent', messageId: `m-${runId}`, delta: `Risposta a «${consegna}».`, _sequenza: seq + 2 },
  { type: 'TextMessageEnd', messageId: `m-${runId}`, _sequenza: seq + 3 },
  { type: 'RunFinished', runId, _sequenza: seq + 4 },
];

test('R13-D — dopo un riavvio del server (ricollegato) la lingua delle risposte scelta si ridice, come quella dell\'interfaccia', async ({ page }) => {
  const impostazioni = [];
  const riprese = [];
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', replyLanguage: 'fa' }, chat: { model: 'qwen/qwen3.8-flash' } }));
  });
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && r.method() !== 'HEAD') return route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'finto' } } });
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET'
    ? ok(route, { items: [{ sessionId: S, taskId: S, nome: 'Lingua', conclusa: true, modello: 'qwen/qwen3.8-flash', avviataAlle: '2026-10-28T10:00:00Z' }] }) : route.fallback()));
  const storia = giro('r1', 'domanda 1', 1);
  await page.route(`**/api/v1/sessions/${S}/events*`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 3600000\n${[...storia, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.route(`**/api/v1/sessions/${S}/export`, (route) => ok(route, { sessionId: S, eventi: storia }));
  await page.route(`**/api/v1/sessions/${S}/settings`, (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    impostazioni.push(route.request().postDataJSON());
    return ok(route, {});
  });
  await page.route(`**/api/v1/sessions/${S}/resume`, (route) => { riprese.push(route.request().postDataJSON()); return ok(route, { sessionId: S }); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, s, 'Lingua', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' }), S);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });

  /* primo seguito: la finestra dice al server tutte e due le lingue (premessa) */
  await page.locator('#composerInput').fill('seconda domanda');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => riprese.length).toBe(1);
  expect(impostazioni[0]).toEqual({ linguaInterfaccia: 'it', linguaDelleRisposte: 'fa' });
  await page.evaluate((eventi) => { const r = window.__talosHarnessUiRuntime; for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation); }, giro('r2', 'seconda domanda', 20));

  /* il server si riavvia: la sorveglianza passa da «riconnessione» a «ricollegato» (lo stesso segnale del K3b) */
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(() => document.querySelector('#schermoChat .talos-statusbar')?.textContent ?? ''), { timeout: 10_000 })
    .toMatch(/ricollegat|riconness|collegat/iu);
  await page.waitForTimeout(1500);

  await page.locator('#composerInput').fill('terza domanda');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => riprese.length).toBe(2);
  expect(impostazioni.length, 'premessa: la lingua dell\'interfaccia si è ridetta dopo il ricollegamento').toBe(2);
  /* ROSSO atteso: il server ripartito ha perso «fa», e la finestra non lo ridice */
  expect(impostazioni[1]).toEqual({ linguaInterfaccia: 'it', linguaDelleRisposte: 'fa' });
});
