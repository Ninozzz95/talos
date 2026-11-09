/*
 * Decisione 116 C, D5 (accesso riuscito a giro in corso ⇒ la ripresa parte a giro finito, una volta) e C1 della revisione del blocco chat
 * (04/11/2026): la ripresa automatica non deve ribaltare lo Stop della PERSONA. Il modello chiama `chatgpt_account` `sign_in`, la scheda nasce
 * dall'attrezzo, la persona accede mentre il giro corre; poi il giro finisce in tre modi diversi.
 * Eventi copiati dalle prove dei rami (passi-chat-nuova.spec) e dalla forma di `agui-events.mjs` (`schedaChatgpt: true` sul ToolCallResult);
 * il testo dell'attrezzo è quello di `fornitori-per-il-modello.mjs`. Nessuna chiave, nessun accesso vero: le rotte di accesso sono finte.
 * AG-UI (docs.ag-ui.com/concepts/events, letta il 04/11/2026): ogni giro finisce con RunFinished o RunError, e lo standard non distingue
 * l'annullamento: lo dice solo il nostro `code: 'fermato'`.
 */
import { expect, test } from '@playwright/test';

const S = 'sessione-accesso-116';
const MODELLO = 'chatgpt:gpt-prova';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const sse = (storia) => `retry: 3600000\n${[...storia, CONFINE].map((e) => `${typeof e._sequenza === 'number' ? `id: ${e._sequenza}\n` : ''}data: ${JSON.stringify(e)}\n\n`).join('')}`;
const ok = (route, data) => route.fulfill({ json: { ok: true, data, meta: {} } });
const manda = (page, eventi) => page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation); }, eventi);

test.use({ viewport: { width: 1920, height: 1080 } });

/** La scena: scheda nata dall'attrezzo, accesso riuscito mentre il giro corre, poi `fine`. Torna le riprese chieste al server. */
async function scenaAccesso(page, fine) {
  const riprese = [];
  await page.route(`**/api/v1/sessions/${S}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: sse([{ type: 'RunStarted', threadId: S, runId: 'r1', _sequenza: 1 }]) }));
  await page.route(`**/api/v1/sessions/${S}/resume`, (route) => { riprese.push(route.request().postDataJSON()); return ok(route, { sessionId: S }); });
  await page.route('**/api/v1/auth/chatgpt/inizia', (route) => ok(route, { indirizzo: 'about:blank', scadeTraMs: 600_000 }));
  await page.route('**/api/v1/auth/chatgpt/stato', (route) => ok(route, { collegato: true, pianoAbilitato: true, accessoInCorso: false,
    email: 'prova@example.invalid', ultimoEsito: { ok: true, email: 'prova@example.invalid', pianoAbilitato: true } }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(([s, m]) => window.__talosHarnessUiRuntime.passaASessione(s, s, s, m, { conclusa: false, modello: m }), [S, MODELLO]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await manda(page, [
    { type: 'ToolCallStart', toolCallId: 'call_accesso', toolCallName: 'chatgpt_account' },
    { type: 'ToolCallArgs', toolCallId: 'call_accesso', delta: JSON.stringify({ action: 'sign_in' }) },
    { type: 'ToolCallEnd', toolCallId: 'call_accesso' },
    { type: 'ToolCallResult', toolCallId: 'call_accesso', role: 'tool', isError: false, schedaChatgpt: true,
      content: 'The ChatGPT sign-in card is now in the conversation. The person signs in from it with "Sign in and resume", and the turn picks up after the sign-in. Do not ask again.' },
  ]);
  const scheda = page.locator('#conversation [data-scheda-accesso-attrezzo="call_accesso"]');
  await expect(scheda).toBeVisible();
  const [finestra] = await Promise.all([page.waitForEvent('popup').catch(() => null), scheda.locator('button').first().click()]);
  await finestra?.close().catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(3_000); // il seguito dell'accesso rilegge lo stato al fuoco e ogni 2 s
  expect(riprese, 'il giro corre: nessuna ripresa adesso').toHaveLength(0);
  await manda(page, [fine]);
  await page.waitForTimeout(1_500);
  return riprese;
}

test('R116-B-01 (C1) accesso riuscito a giro in corso, poi la persona preme Ferma: nessuna ripresa automatica', async ({ page }) => {
  const riprese = await scenaAccesso(page, { type: 'RunError', threadId: S, runId: 'r1', code: 'fermato', message: 'Stopped by the person.' });
  expect(riprese, 'lo Stop della persona non si ribalta da solo con una ripresa').toHaveLength(0);
  // la scheda resta: la persona riprende quando vuole, dal suo pulsante
  await expect(page.locator('#conversation [data-scheda-accesso-attrezzo="call_accesso"] button').first()).toBeVisible();
});

test('R116-B-02 (D5) AL CONTRARIO: accesso riuscito a giro in corso, il giro finisce da solo: una ripresa', async ({ page }) => {
  const riprese = await scenaAccesso(page, { type: 'RunFinished', threadId: S, runId: 'r1', outcome: { type: 'success' } });
  expect(riprese).toEqual([{ ripresaDopo: 'accesso-rifatto' }]);
});

test('R116-B-03 (D5) AL CONTRARIO: accesso riuscito a giro in corso, il giro finisce con un RunError che non è della persona: una ripresa', async ({ page }) => {
  /* `giri-esauriti`: un esito vero del task (agent-service.mjs, ESITI_DEL_TASK), RunError come `fermato` ma non chiesto dalla persona */
  const riprese = await scenaAccesso(page, { type: 'RunError', threadId: S, runId: 'r1', code: 'giri-esauriti', message: 'The turn limit was reached.' });
  expect(riprese).toEqual([{ ripresaDopo: 'accesso-rifatto' }]);
});
