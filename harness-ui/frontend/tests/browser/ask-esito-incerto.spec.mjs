import { expect, test } from '@playwright/test';

/*
 * Revisione Codex del 02/10/2026, rilievi 2 e 3 (owner: «curali col blocco dei finding»).
 *   2. Un invio fallito SENZA status (la rete, una risposta persa) non prova niente: né che la risposta sia arrivata, né che
 *      no. La scheda la teneva lo stesso per «data da qui», e una risposta diversa arrivata poi da un'altra finestra si
 *      leggeva come propria.
 *   3. La ricevuta diceva «hai risposto alle …» sotto una testata «Risposta inviata da un’altra finestra».
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET che non è quella finta della domanda si FERMA e si conta.
 */
const SESSIONE = 'q-incerto';
const DOMANDA = { type: 'UserQuestionRequested', _sequenza: 7302, requestId: 'req-incerto',
  questions: [{ id: 'scelta', question: 'Quale?', options: [{ label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' }] }] };
const AT = '2026-10-03T10:02:00.000Z';

async function preparaScheda(page) {
  const conti = { posts: 0, exports: 0, fermate: 0 };
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && !r.url().includes(`/sessions/${SESSIONE}/`)) { conti.fermate += 1; return route.abort(); }
    return route.fallback();
  });
  /* la rigiocata finisce dal FLUSSO, come nel prodotto (`ask-ricevuta.spec.mjs`): da lì ciò che arriva è in diretta */
  await page.route(`**/api/v1/sessions/${SESSIONE}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  /* la rete cade: nessuno status, nessuna prova */
  await page.route(`**/api/v1/sessions/${SESSIONE}/question`, (route) => { conti.posts += 1; return route.abort('failed'); });
  /* e il registro non ha ancora la risposta: niente da riconciliare */
  await page.route(`**/api/v1/sessions/${SESSIONE}/export`, (route) => {
    conti.exports += 1;
    return route.fulfill({ json: { ok: true, data: { sessionId: SESSIONE, eventi: [] } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sessione) => window.__talosHarnessUiRuntime.passaASessione(sessione, 'workspace', 'Esito incerto', 'z-ai/glm-5.3-flash', { conclusa: false }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate((domanda) => {
    const rt = window.__talosHarnessUiRuntime;
    const g = rt.realSessionState.generation;
    rt.handleRealEvent({ type: 'RunStarted', _sequenza: 7301, input: { consegna: 'Chiarisci la scelta' }, contesto: {} }, g);
    rt.handleRealEvent(domanda, g);
  }, DOMANDA);
  await page.locator('[data-request-id="req-incerto"]').getByRole('radio').first().check(); // A
  await expect.poll(() => conti.exports).toBe(1);
  return conti;
}
const risolvi = (page, risposta) => page.evaluate(([scelta, at]) => {
  const rt = window.__talosHarnessUiRuntime;
  rt.handleRealEvent({ type: 'UserQuestionResolved', _sequenza: 7303, requestId: 'req-incerto', status: 'answered',
    answers: { scelta }, at, da: 'persona' }, rt.realSessionState.generation);
}, [risposta, AT]);

test('R4-ASK-NO-PROOF-REMOTE: dopo un invio senza prova, una risposta DIVERSA arrivata dal flusso è di un’altra finestra, anche nella ricevuta', async ({ page }) => {
  const conti = await preparaScheda(page);
  await risolvi(page, 'B');
  const scheda = page.locator('#conversation [data-request-id="req-incerto"]');
  await expect(scheda).toContainText('Risposta inviata da un’altra finestra');
  /* rilievo 3: la ricevuta non contraddice la testata */
  await expect(scheda).not.toContainText('hai risposto');
  await expect(scheda).toContainText('risposta da un’altra finestra alle');
  expect(conti.posts).toBe(1);
  expect(conti.fermate).toBe(0);
});

test('R4-ASK-NO-PROOF-SAME: dopo un invio senza prova, la STESSA risposta arrivata dal flusso è quella data da qui (l’ACK era solo perso)', async ({ page }) => {
  const conti = await preparaScheda(page);
  await risolvi(page, 'A');
  const scheda = page.locator('#conversation [data-request-id="req-incerto"]');
  await expect(scheda).toContainText('Risposta inviata');
  await expect(scheda).not.toContainText('da un’altra finestra');
  await expect(scheda).toContainText('hai risposto alle');
  expect(conti.fermate).toBe(0);
});
