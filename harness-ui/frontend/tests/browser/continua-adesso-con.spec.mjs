import { test, expect } from '@playwright/test';

/*
 * «Continua adesso con…» (owner 27/10/2026 notte, «Sì, un clic per continuare»; bozzetto approvato il 28/10, scena «Limite del piano»).
 *
 * Il giro della chat aspetta il reset del piano ChatGPT (evento `talos.provider-retry`, 429 `limite-del-piano`, la forma che il server
 * manda: `provider-retry.js`, `valoreRetry`). La carta propone i modelli già configurati: qui OpenRouter ha la chiave, e una conversazione
 * recente ha usato glm-5.3-flash. Un clic deve fare tre cose in quest'ordine:
 *   1. il modello della conversazione cambia (`POST /settings` con `modello`, come il selettore);
 *   2. il giro in attesa si ferma (`POST /stop`) e se ne aspetta la fine;
 *   3. lo stesso giro riparte (`POST /resume` senza messaggio).
 * Poi la carta resta nella chat come «Continuo con glm-5.3-flash», e la pillola del modello dice glm-5.3-flash.
 *
 * ⛔ Banco: il webServer di `playwright.config.mjs` (store isolato). Le rotte che scrivono sono intercettate e contate; ogni altra
 *   richiesta non-GET si ferma e si dichiara. Il flusso SSE è una fixture; gli eventi del giro arrivano dal vivo con `handleRealEvent`.
 */
test.use({ locale: 'it-IT' });

const ID = 'cc-piano';
const MODELLO_PIANO = 'chatgpt:gpt-6-luna';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const sse = (eventi) => `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;
const ATTESA = { type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: 3, value: { schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'r1',
  fase: 'attesa', tentativo: 2, tentativiMassimi: 11, httpStatus: 429, motivo: 'limite-del-piano', modello: MODELLO_PIANO, retryAt: Date.now() + 1_800_000, attesaMs: 1_800_000 } };

test('CONTINUA-UI-01 — un clic su un modello proposto: modello, Ferma, ripresa, in quest\'ordine; la carta resta come «Continuo con …»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message || e)));
  const chiamate = [];
  const altre = [];
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/v1/providers') return route.fulfill({ json: { ok: true, data: { items: [{ id: 'openrouter', keyConfigured: true }, { id: 'deepseek', keyConfigured: false }] }, meta: {} } });
    if (req.method() === 'GET' && url.pathname === '/api/v1/auth/chatgpt/stato') return route.fulfill({ json: { ok: true, data: { collegato: true, pianoAbilitato: true }, meta: {} } });
    if (req.method() === 'GET' && url.pathname === '/api/v1/sessions') {
      return route.fulfill({ json: { ok: true, data: { items: [
        { sessionId: ID, nome: 'Export CSV', modelId: MODELLO_PIANO, modello: MODELLO_PIANO, provider: 'cloud', avviataAlle: '2026-10-28T07:00:00.000Z', ultimaRispostaAlle: '2026-10-28T07:10:00.000Z', conclusa: false },
        { sessionId: 'altra', nome: 'Un\'altra chat', modelId: 'z-ai/glm-5.3-flash', modello: 'z-ai/glm-5.3-flash', provider: 'cloud', avviataAlle: '2026-10-25T21:00:00.000Z', ultimaRispostaAlle: '2026-10-25T21:39:39.263Z', conclusa: true },
        { sessionId: 'vecchia', nome: 'DeepSeek', modelId: 'deepseek:deepseek-v4-flash', modello: 'deepseek:deepseek-v4-flash', provider: 'cloud', avviataAlle: '2026-10-27T21:00:00.000Z', ultimaRispostaAlle: '2026-10-27T21:00:00.000Z', conclusa: true },
      ] }, meta: {} } });
    }
    if (req.method() === 'GET' && url.pathname === `/api/v1/sessions/${ID}/events`) {
      /* la storia è vuota: il giro arriva dal vivo, e la ripresa si riscrive qui senza rigiocarlo */
      return route.fulfill({ contentType: 'text/event-stream', body: sse([CONFINE]) });
    }
    if (req.method() === 'GET') return route.fallback();
    const corpo = req.postDataJSON?.() ?? null;
    if (url.pathname === `/api/v1/sessions/${ID}/settings` && corpo && 'modello' in corpo) {
      chiamate.push(['settings', corpo.modello]);
      return route.fulfill({ json: { ok: true, data: { updated: true }, meta: {} } });
    }
    if (url.pathname === `/api/v1/sessions/${ID}/settings`) return route.fulfill({ json: { ok: true, data: { updated: true }, meta: {} } }); // la lingua dell'interfaccia, prima della ripresa
    if (url.pathname === `/api/v1/sessions/${ID}/stop`) {
      chiamate.push(['stop']);
      await route.fulfill({ json: { ok: true, data: { stopped: true }, meta: {} } });
      /* il server chiude il giro fermato con l'evento VERO: `talosHarness.mjs:17227` (esito 'fermato', «⛔ stopped on request.») tradotto da
         `agent-service.mjs:209` in un RunError senza runId */
      await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunError', message: '⛔ stopped on request.', code: 'fermato' }, r.realSessionState.generation); });
      return undefined;
    }
    if (url.pathname === `/api/v1/sessions/${ID}/resume`) {
      chiamate.push(['resume', corpo && Object.keys(corpo).length ? corpo : null]);
      return route.fulfill({ json: { ok: true, data: { sessionId: ID }, meta: {} } });
    }
    altre.push(`${req.method()} ${url.pathname}`);
    return route.abort();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ ID, MODELLO_PIANO }) => {
    window.__talosHarnessUiRuntime.passaASessione(ID, 'workspace', 'Export CSV', MODELLO_PIANO, { conclusa: false, modello: MODELLO_PIANO });
  }, { ID, MODELLO_PIANO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  /* il giro, dal vivo: parte e si mette ad aspettare il reset del piano */
  await page.evaluate((eventi) => { const r = window.__talosHarnessUiRuntime; for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation); },
    [{ type: 'RunStarted', runId: 'run1', threadId: 'thread1', _sequenza: 1, input: { consegna: 'Porta l\'export CSV su stream' } }, ATTESA]);
  const carta = page.locator('#conversation [data-provider-retry]');
  await expect(carta).toContainText('Limite d’uso raggiunto');
  const riga = carta.locator('[data-provider-retry-continua]');
  await expect(riga).toContainText('Continua adesso con');
  /* proposte: glm-5.3-flash (OpenRouter ha la chiave); MAI il piano bloccato, MAI DeepSeek (senza chiave) */
  await expect(riga.locator('[data-continua-con]')).toHaveText(['GLM 5.3 Flash · OpenRouter']); // 68ebab480 (revisione d'uso 04/11, reperto 11)
  await expect(riga.locator('[data-continua-altro]')).toHaveText('Altro modello…');
  await riga.locator('[data-continua-con]').click();
  const nota = page.locator('#conversation [data-provider-retry-continuato]');
  await expect(nota).toContainText('Continuo con GLM 5.3 Flash'); // 68ebab480 (revisione d'uso 04/11, reperto 11): il nome del catalogo
  await expect(nota).toContainText(/Il piano ChatGPT torna alle \d{2}[:.]\d{2}: lo riprendi dal menu del modello quando vuoi\./u);
  expect(chiamate).toEqual([['settings', 'z-ai/glm-5.3-flash'], ['stop'], ['resume', null]]);
  /* lo stop fa parte della scelta: niente carta «Hai fermato il giro… scrivi un altro messaggio» (non l'ha fermato la persona, e il giro
     riparte da solo); la nota «Continuo con …» dice già che cosa è successo */
  await expect(page.locator('#conversation').getByText('Hai fermato il giro')).toHaveCount(0);
  /* il giro ripreso dice già il modello nuovo nella sua testata, prima che arrivi il suo RunStarted */
  await expect(page.locator('#conversation > .talos-turn').last()).toContainText('GLM 5.3 Flash'); // 68ebab480 (revisione d'uso 04/11, reperto 11)
  await expect(nota.locator('button, a')).toHaveCount(0);
  await expect(page.locator('#composerForm [data-open-sheet="model"] .talos-chip__label').first(), 'la pillola del modello dice quello nuovo').toContainText('GLM 5.3 Flash'); // 68ebab480 (revisione d'uso 04/11, reperto 11)
  /* AL CONTRARIO: il giro ripreso, fermato poi dalla persona, mostra la sua carta — il segno della scelta non resta acceso */
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; for (const e of [{ type: 'RunStarted', runId: 'run2', threadId: 'thread1', _sequenza: 10 },
    { type: 'RunError', message: '⛔ stopped on request.', code: 'fermato' }]) r.handleRealEvent(e, r.realSessionState.generation); });
  await expect(page.locator('#conversation').getByText('Hai fermato il giro')).toHaveCount(1);
  expect(altre, 'nessun\'altra scrittura').toEqual([]);
  expect(errori).toEqual([]);
});
