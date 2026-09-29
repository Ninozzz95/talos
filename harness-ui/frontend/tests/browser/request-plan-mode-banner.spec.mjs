import { expect, test } from '@playwright/test';

const modeEvent = (mode, reason, sequence) => ({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: sequence,
  value: { modalitaOperativa: mode, permessi: 'Read only', motivo: reason } });
const sse = (events) => `retry: 3600000\n${[...events, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}`;

async function open(page, sessionId, { mode = 'normale', replay = [] } = {}) {
  await page.route(`**/api/v1/sessions/${sessionId}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse(replay) }));
  await page.route(`**/api/v1/sessions/${sessionId}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([id, currentMode]) => window.__talosHarnessUiRuntime.passaASessione(
    id, 'workspace', 'Piano richiesto', 'test/model', { sessionId: id, conclusa: true, modalitaOperativa: currentMode, permessi: 'Read only' }),
  [sessionId, mode]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
}

const deliver = (page, event) => page.evaluate((value) => {
  const runtime = window.__talosHarnessUiRuntime;
  runtime.handleRealEvent(value, runtime.realSessionState.generation);
}, event);

test('PLAN-BANNER-LIVE/FAIL-STOP: only a durable mode event promises the next turn', async ({ page }) => {
  await open(page, 'plan-banner-live');
  const banner = page.locator('#fasciaPianoRichiesto');
  await expect(banner).toBeHidden();
  await deliver(page, { type: 'RunError', code: 'SESSION_STORE_WRITE_FAILED', _sequenza: 100 });
  await expect(banner).toBeHidden();
  await deliver(page, modeEvent('piano', 'piano-richiesto-dal-modello', 101));
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('status')).toHaveText('Piano attivo dal prossimo giro');
  await deliver(page, { type: 'RunStarted', _sequenza: 102, input: { consegna: 'Prepara il piano' }, contesto: { modalitaOperativa: 'piano' } });
  await expect(banner).toBeHidden();
});

test('PLAN-BANNER-REPLAY: saved mode event survives reload until another turn starts', async ({ page }) => {
  const sessionId = 'plan-banner-replay';
  const replay = [
    { type: 'RunStarted', _sequenza: 1, input: { consegna: 'Chiedo un piano' }, contesto: { modalitaOperativa: 'normale' } },
    { type: 'RunFinished', _sequenza: 2 },
    modeEvent('piano', 'piano-richiesto-dal-modello', 3),
  ];
  await open(page, sessionId, { mode: 'piano', replay });
  const banner = page.locator('#fasciaPianoRichiesto');
  await expect(banner).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(
    id, 'workspace', 'Piano richiesto', 'test/model', { sessionId: id, conclusa: true, modalitaOperativa: 'piano', permessi: 'Read only' }), sessionId);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(banner).toBeVisible();
  replay.push({ type: 'RunStarted', _sequenza: 4, input: { consegna: 'Secondo giro' }, contesto: { modalitaOperativa: 'piano' } });
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(
    id, 'workspace', 'Piano richiesto', 'test/model', { sessionId: id, conclusa: true, modalitaOperativa: 'piano', permessi: 'Read only' }), sessionId);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(banner).toBeHidden();
});

test('PLAN-BANNER-SESSION-FOCUS: narrow reduced-motion view keeps composer focus and clears on switch', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'plan-banner-focus');
  await page.locator('#composerInput').focus();
  await deliver(page, modeEvent('piano', 'piano-richiesto-dal-modello', 200));
  const banner = page.locator('#fasciaPianoRichiesto');
  await expect(banner).toBeVisible();
  await expect(page.locator('#composerInput')).toBeFocused();
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione(
    'another-session', 'workspace', 'Altra sessione', 'test/model',
    { sessionId: 'another-session', conclusa: true, modalitaOperativa: 'normale' }));
  await expect(banner).toBeHidden();
});
