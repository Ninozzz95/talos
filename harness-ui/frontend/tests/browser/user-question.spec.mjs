import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('R4-ASK-AMBIGUOUS-REPLAY: lost POST response reconciles exact persisted answer without a second POST', async ({ page }) => {
  let posts = 0;
  let exports = 0;
  await page.route('**/api/v1/sessions/q-ambiguous/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/q-ambiguous/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/q-ambiguous/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.route('**/api/v1/sessions/q-ambiguous/question', (route) => {
    posts += 1;
    return route.abort('failed');
  });
  await page.route('**/api/v1/sessions/q-ambiguous/export', (route) => {
    exports += 1;
    return route.fulfill({ json: { ok: true, data: {
      sessionId: 'q-ambiguous',
      eventi: [{ type: 'UserQuestionResolved', _sequenza: 7103,
        requestId: 'req-ambiguous', status: 'answered', answers: { scelta: 'A' } }],
    } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('q-ambiguous', 'workspace', 'Ask replay', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({
      type: 'RunStarted', _sequenza: 7101,
      input: { consegna: 'Chiarisci la scelta' }, contesto: {},
    }, generation);
    runtime.handleRealEvent({
      type: 'UserQuestionRequested', _sequenza: 7102, requestId: 'req-ambiguous',
      questions: [{ id: 'scelta', question: 'Quale?', options: [
        { label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' },
      ] }],
    }, generation);
  });
  await page.locator('[data-request-id="req-ambiguous"]').getByRole('radio').first().check();
  await expect(page.locator('#conversation [data-request-id="req-ambiguous"]')).toContainText('Risposta inviata');
  expect(posts).toBe(1);
  expect(exports).toBe(1);
  await expect(page.locator('#userQuestionDock')).toBeHidden();
});

test('R4-ASK-DUPLICATE-409-REPLAY: a conflict reads the same requestId and preserves a different answer as remote', async ({ page }) => {
  let posts = 0;
  let exports = 0;
  await page.route('**/api/v1/sessions/q-conflict/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/q-conflict/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/q-conflict/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.route('**/api/v1/sessions/q-conflict/question', (route) => {
    posts += 1;
    return route.fulfill({ status: 409, json: {
      error: { code: 'QUESTION_NOT_PENDING', message: 'Domanda non più attiva' },
    } });
  });
  await page.route('**/api/v1/sessions/q-conflict/export', (route) => {
    exports += 1;
    return route.fulfill({ json: { ok: true, data: {
      sessionId: 'q-conflict',
      eventi: [{ type: 'UserQuestionResolved', _sequenza: 7203,
        requestId: 'req-conflict', status: 'answered', answers: { scelta: 'B' } }],
    } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('q-conflict', 'workspace', 'Ask conflict', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 7201,
      input: { consegna: 'Chiarisci la scelta' }, contesto: {} }, generation);
    runtime.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 7202,
      requestId: 'req-conflict', questions: [{ id: 'scelta', question: 'Quale?',
        options: [{ label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' }] }] }, generation);
  });
  await page.locator('[data-request-id="req-conflict"]').getByRole('radio').first().check();
  const resolved = page.locator('#conversation [data-request-id="req-conflict"]');
  await expect(resolved).toContainText('Risposta inviata');
  await expect(resolved).toContainText('da un’altra finestra');
  expect(posts).toBe(1);
  expect(exports).toBe(1);
});

/*
 * ⛔ 20/09/2026 — regressione Ask Question: in multi-select «Altro…» non deve
 * cancellare dal payload le checkbox che restano visivamente selezionate.
 * La prova osserva la POST reale costruita dalla card, non una helper isolata.
 */
test('R4-ASK-DOCK-PLACEMENT / DOMANDA-UI-MULTI-ALTRO — richiesta sopra composer e payload integro', async ({ page }) => {
  let bodyRicevuto = null;
  await page.route('**/api/v1/sessions/q-ui/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/q-ui/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-ui/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-ui/question', async (route) => {
    bodyRicevuto = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });

  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('q-ui', 'workspace', 'Domanda UI', 'qwen/qwen3.8-flash', {
      conclusa: false, modello: 'qwen/qwen3.8-flash',
    });
    const g = r.realSessionState.generation;
    r.handleRealEvent({
      type: 'RunStarted', _sequenza: 9901,
      input: { consegna: 'chiedi' },
      contesto: { cartella: 'C:\\progetti\\domanda-ui' },
    }, g);
    r.handleRealEvent({
      type: 'UserQuestionRequested', _sequenza: 9902, requestId: 'req-multi',
      questions: [{
        id: 'scelta',
        question: 'Quali opzioni?',
        multiSelect: true,
        options: [
          { label: 'A', description: 'Prima' },
          { label: 'B', description: 'Seconda' },
        ],
      }],
    }, g);
  });

  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-multi"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#conversation [data-c="UserQuestionCard"]')).toHaveCount(0);
  expect(await card.evaluate((node) => node.parentElement?.nextElementSibling?.id)).toBe('composerForm');
  await card.getByRole('checkbox').nth(0).check();
  await card.getByRole('checkbox').nth(1).check();
  await card.getByRole('textbox', { name: 'Altra risposta' }).fill('C personalizzata');
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await expect(card).toContainText('A, B, C personalizzata');
  expect(bodyRicevuto).toBeNull();
  if (process.env.TALOS_UI_A_SCREENSHOTS) {
    await mkdir(process.env.TALOS_UI_A_SCREENSHOTS, { recursive: true });
    for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        const closeToast = page.locator('[data-c="Toast"] [data-toast-chiudi]');
        await closeToast.evaluateAll((buttons) => buttons.forEach((button) => button.click()));
        await expect(closeToast).toHaveCount(0);
        await page.screenshot({
          path: join(process.env.TALOS_UI_A_SCREENSHOTS, `R4-ask-review-${width}x${height}-${theme}.png`),
          animations: 'disabled',
        });
      }
    }
  }
  await card.getByRole('button', { name: 'Conferma e invia' }).click();

  await expect.poll(() => bodyRicevuto).not.toBeNull();
  expect(bodyRicevuto).toEqual({
    requestId: 'req-multi',
    status: 'answered',
    answers: { scelta: ['A', 'B', 'C personalizzata'] },
  });
  await expect(page.locator('#conversation [data-c="UserQuestionCard"]')).toHaveCount(0);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({
      type: 'UserQuestionResolved', _sequenza: 9903,
      requestId: 'req-multi', status: 'answered',
    }, runtime.realSessionState.generation);
  });
  await expect(page.locator('#conversation [data-c="UserQuestionCard"]')).toHaveCount(1);
  await expect(page.locator('#conversation [data-c="UserQuestionCard"]')).toContainText('Risposta inviata');
  await expect(page.locator('#userQuestionDock')).toBeHidden();
});

test('R4-ASK-SINGLE-AUTOSUBMIT — la scelta esplicita invia senza review e non cattura il composer', async ({ page }) => {
  const bodies = [];
  await page.route('**/api/v1/sessions/q-quick/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/q-quick/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-quick/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-quick/question', async (route) => {
    bodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('q-quick', 'workspace', 'Scelta rapida', 'qwen/qwen3.8-flash', { conclusa: false });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9941, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, g);
    document.getElementById('composerInput').focus();
    r.handleRealEvent({
      type: 'UserQuestionRequested', _sequenza: 9942, requestId: 'req-quick',
      questions: [{ id: 'scelta', question: 'Quale?', options: [
        { label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' },
      ] }],
    }, g);
  });
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-quick"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#composerInput')).toBeFocused();
  expect(bodies).toEqual([]);
  await card.getByRole('radio').first().check();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-quick', status: 'answered', answers: { scelta: 'A' } });
  await expect(card.getByRole('button', { name: 'Conferma e invia' })).toBeHidden();
});

test('DOMANDA-UI-SINGLE-ALTRO — Altro richiede review senza auto-invio', async ({ page }) => {
  let bodyRicevuto = null;
  await page.route('**/api/v1/sessions/q-single/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/q-single/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-single/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-single/question', async (route) => {
    bodyRicevuto = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });

  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('q-single', 'workspace', 'Domanda single', 'qwen/qwen3.8-flash', { conclusa: false });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9911, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, g);
    r.handleRealEvent({
      type: 'UserQuestionRequested', _sequenza: 9912, requestId: 'req-single',
      questions: [{
        id: 'scelta',
        question: 'Quale?',
        options: [{ label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' }],
      }],
    }, g);
  });

  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-single"]');
  const radio = card.getByRole('radio').first();
  await card.getByRole('textbox', { name: 'Altra risposta' }).fill('C');
  await expect(radio).not.toBeChecked();
  expect(bodyRicevuto).toBeNull();
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await card.getByRole('button', { name: 'Conferma e invia' }).click();
  await expect.poll(() => bodyRicevuto).not.toBeNull();
  expect(bodyRicevuto.answers).toEqual({ scelta: 'C' });
});


test('DOMANDA-UI-LIBERA — soli spazi non completano la card e il testo inviato è normalizzato', async ({ page }) => {
  let bodyRicevuto = null;
  await page.route('**/api/v1/sessions/q-free/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/q-free/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-free/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-free/question', async (route) => {
    bodyRicevuto = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('q-free', 'workspace', 'Domanda libera', 'qwen/qwen3.8-flash', { conclusa: false });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9921, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, g);
    r.handleRealEvent({
      type: 'UserQuestionRequested', _sequenza: 9922, requestId: 'req-free',
      questions: [{ id: 'nota', question: 'Scrivi un dettaglio?' }],
    }, g);
  });

  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-free"]');
  const input = card.getByRole('textbox');
  await input.fill('   ');
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await expect(card.getByRole('button', { name: 'Conferma e invia' })).toBeDisabled();
  await expect.poll(() => bodyRicevuto, { timeout: 500 }).toBeNull();

  await card.getByRole('button', { name: 'Modifica risposte' }).click();
  await input.fill('  dettaglio utile  ');
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await card.getByRole('button', { name: 'Conferma e invia' }).click();
  await expect.poll(() => bodyRicevuto).not.toBeNull();
  expect(bodyRicevuto.answers).toEqual({ nota: 'dettaglio utile' });
});

test('R4-ASK-OVERLAP-DOCK — una seconda richiesta non cancella la prima; 409 resta visibile', async ({ page }) => {
  await page.route('**/api/v1/sessions/q-overlap/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/q-overlap/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-overlap/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-overlap/question', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.requestId === 'req-old') {
      return route.fulfill({ status: 409, json: { error: { code: 'QUESTION_STALE', message: 'Domanda non più attiva' } } });
    }
    return route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('q-overlap', 'workspace', 'Domande sovrapposte', 'qwen/qwen3.8-flash', { conclusa: false });
    const generation = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9931, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, generation);
    r.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 9932, requestId: 'req-old', questions: [{ id: 'old', question: 'Prima?' }] }, generation);
    r.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 9933, requestId: 'req-new', questions: [{ id: 'next', question: 'Seconda?' }] }, generation);
  });
  const oldCard = page.locator('[data-c="UserQuestionCard"][data-request-id="req-old"]');
  const newCard = page.locator('[data-c="UserQuestionCard"][data-request-id="req-new"]');
  await expect(oldCard).toBeVisible();
  await expect(newCard).toBeVisible();
  await oldCard.getByRole('textbox').fill('Risposta precedente');
  await oldCard.getByRole('button', { name: 'Rivedi risposte' }).click();
  await oldCard.getByRole('button', { name: 'Conferma e invia' }).click();
  await expect(oldCard).toContainText('Domanda non più attiva');
  await expect(oldCard.getByRole('button', { name: 'Conferma e invia' })).toBeHidden();
  await newCard.getByRole('textbox').fill('Risposta corrente');
  await newCard.getByRole('button', { name: 'Rivedi risposte' }).click();
  await newCard.getByRole('button', { name: 'Conferma e invia' }).click();
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'UserQuestionResolved', _sequenza: 9934, requestId: 'req-new', status: 'answered' }, r.realSessionState.generation);
  });
  expect(await newCard.evaluate((node) => node.closest('#conversation') ? 'conversation'
    : node.closest('#userQuestionDock') ? 'dock' : 'elsewhere')).toBe('conversation');
  await expect(oldCard).toBeVisible();
  await expect(page.locator('#userQuestionDock')).toBeVisible();
});

test('R4-ASK-COMPOSER-REDIRECT: Enter indirizza Ask, Ctrl+Enter mantiene la coda', async ({ page }) => {
  const queue = [];
  const redirects = [];
  await page.route('**/api/v1/sessions/q-steer/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/q-steer/children', (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route('**/api/v1/sessions/q-steer/tree*', (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route('**/api/v1/sessions/q-steer/queue', (route) => {
    queue.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ json: { ok: true, data: { posizione: queue.length } } });
  });
  await page.route('**/api/v1/sessions/q-steer/redirect', (route) => {
    redirects.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ json: { ok: true, data: { redirectId: redirects.at(-1).redirectId } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('q-steer', 'workspace', 'Ask steering', 'qwen/qwen3.8-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 9951, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, generation);
    runtime.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 9952, requestId: 'req-steer',
      questions: [{ id: 'scelta', question: 'Quale strada?' }] }, generation);
  });
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-steer"]');
  await expect(card).toBeVisible();
  const composer = page.locator('#composerInput');
  await expect(composer).toHaveAttribute('placeholder', /Invio.*indirizza.*Ctrl\+Invio.*accoda/i);
  await composer.fill('Da leggere dopo');
  await composer.press('Control+Enter');
  await expect.poll(() => queue.length).toBe(1);
  expect(redirects).toEqual([]);
  await composer.fill('Cambio di direzione');
  await composer.press('Enter');
  await expect.poll(() => redirects.length).toBe(1);
  expect(redirects[0].messaggio).toBe('Cambio di direzione');
  expect(queue).toHaveLength(1);
  await expect(card).toBeVisible();
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'UserQuestionResolved', _sequenza: 9953, requestId: 'req-steer', status: 'cancelled' }, runtime.realSessionState.generation);
  });
  await expect(page.locator('#userQuestionDock')).toBeHidden();
  await expect(page.locator('#conversation [data-request-id="req-steer"]')).toContainText(/annull|scadut|interrott/i);
  await expect(composer).toHaveAttribute('placeholder', /Invio.*scegli/i);
});

/*
 * ⛔ 23/09/2026 — riparazione della corsia Ask dopo la revisione avversaria (RAPPORTO-UI §3, D1 D2 D7 e
 * MUT-8). Le prime tre prove sono le sonde del revisore (`zz-rev-ask.spec.mjs`), portate qui. A
 * differenza di R4-ASK-SINGLE-AUTOSUBMIT, qui la domanda arriva DAL VIVO (`inRigiocata === false`):
 * è lo stato in cui il furto del fuoco viveva e che la prova di prima non esercitava mai.
 */
const sseRip = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const domandaRip = (id) => ({ type: 'UserQuestionRequested', _sequenza: 2, requestId: id, questions: [{ id: 'scelta', question: 'Quale canale?',
  options: [{ label: 'Stabile', description: 'Per tutti' }, { label: 'Anteprima', description: 'Solo tester' }, { label: 'Notturna', description: 'Ogni sera' }] }] });
const avvioRip = { type: 'RunStarted', _sequenza: 1, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\p' } };
const eventoRip = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);

async function preparaDalVivo(page, sid, bodies) {
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sseRip([]) }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/question`, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Ask dal vivo', 'z-ai/glm-5.3-flash', { conclusa: false }), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await eventoRip(page, avvioRip);
}

test('R4-ASK-LIVE-NO-FOCUS-STEAL (D1): una domanda dal vivo non ruba il fuoco e viene annunciata', async ({ page }) => {
  const bodies = [];
  await preparaDalVivo(page, 'rip-focus', bodies);
  await page.locator('#composerInput').click();
  await page.keyboard.type('sto scriv');
  await eventoRip(page, domandaRip('req-focus'));
  await expect(page.locator('[data-c="UserQuestionCard"][data-request-id="req-focus"]')).toBeVisible();
  await expect(page.locator('#composerInput')).toBeFocused();
  await page.keyboard.type('endo');
  await expect(page.locator('#composerInput')).toHaveValue('sto scrivendo');
  const annuncio = page.locator('#talosAnnuncioDomanda');
  await expect(annuncio).toHaveAttribute('role', 'status');
  await expect(annuncio).toHaveAttribute('aria-live', 'polite');
  await expect(annuncio).toContainText('Quale canale?');
  expect(bodies).toEqual([]);
});

test('R4-ASK-LIVE-SPACE-IN-COMPOSER (D1): uno spazio battuto nel composer non è una risposta', async ({ page }) => {
  const bodies = [];
  await preparaDalVivo(page, 'rip-space', bodies);
  await page.locator('#composerInput').click();
  await page.keyboard.type('prima');
  await eventoRip(page, domandaRip('req-space'));
  await expect(page.locator('[data-c="UserQuestionCard"][data-request-id="req-space"]')).toBeVisible();
  await page.keyboard.type(' parola');
  await page.waitForTimeout(500);
  expect(bodies).toEqual([]);
  await expect(page.locator('#composerInput')).toHaveValue('prima parola');
});

test('R4-ASK-ARROW-NO-SUBMIT (D2): le frecce scorrono le opzioni senza inviare; lo spazio sceglie', async ({ page }) => {
  const bodies = [];
  await preparaDalVivo(page, 'rip-arrow', bodies);
  await eventoRip(page, domandaRip('req-arrow'));
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-arrow"]');
  await expect(card).toBeVisible();
  await card.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);
  expect(bodies, 'la navigazione a frecce non è una scelta esplicita').toEqual([]);
  await expect(card.getByRole('radio', { name: 'Anteprima' })).toBeChecked();
  await expect(card.getByRole('radio', { name: 'Anteprima' })).toBeFocused();
  // Lo spazio su un radio già spuntato non cambia niente (APG): si passa a un altro e lo si sceglie col clic.
  await card.getByText('Notturna', { exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ requestId: 'req-arrow', status: 'answered', answers: { scelta: 'Notturna' } });
});

test('R4-ASK-OPTION-NAME (D7): etichetta e descrizione separate a schermo e nel nome accessibile', async ({ page }) => {
  const bodies = [];
  await preparaDalVivo(page, 'rip-name', bodies);
  await eventoRip(page, domandaRip('req-name'));
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-name"]');
  const radio = card.getByRole('radio', { name: 'Stabile', exact: true });
  await expect(radio).toHaveCount(1);
  await expect(radio).toHaveAccessibleDescription('Per tutti');
  const geo = await card.locator('label').first().evaluate((label) => {
    const [nome, descr] = label.querySelectorAll('strong, small');
    const a = nome.getBoundingClientRect(), b = descr.getBoundingClientRect();
    return { nomeBottom: a.bottom, descrTop: b.top, testo: label.innerText };
  });
  expect(geo.descrTop, 'la descrizione va a capo sotto l’etichetta').toBeGreaterThanOrEqual(geo.nomeBottom - 1);
  expect(geo.testo).not.toContain('StabilePer tutti');
});

test('R4-ASK-FOCUS-RETURN (MUT-8): dopo la risposta il fuoco torna al composer, non a <body>', async ({ page }) => {
  const bodies = [];
  await preparaDalVivo(page, 'rip-return', bodies);
  await eventoRip(page, domandaRip('req-return'));
  const card = page.locator('[data-c="UserQuestionCard"][data-request-id="req-return"]');
  await card.getByRole('radio', { name: 'Stabile', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  // Durante l'attesa il radio è disabilitato e il browser manda il fuoco al <body> (focus fixup rule):
  // è proprio il caso in cui il vecchio controllo «il fuoco è nella scheda?» non riportava niente.
  await eventoRip(page, { type: 'UserQuestionResolved', _sequenza: 3, requestId: 'req-return', status: 'answered' });
  await expect(page.locator('#conversation [data-c="UserQuestionCard"]')).toContainText('Risposta inviata');
  await expect(page.locator('#composerInput')).toBeFocused();
});
