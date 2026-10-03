import { expect, test } from '@playwright/test';

/*
 * Owner 03/10/2026, «Sì, stessa regola (Consigliato)»: le carte del CONSENSO e della richiesta MCP seguono la regola che la
 *   revisione Codex del 02/10 (rilievo 2) ha dato alla domanda di TALOS (`ask-esito-incerto.spec.mjs`):
 *   - un invio caduto SENZA status (la rete, una risposta persa) non prova niente, né che la risposta sia arrivata né che no;
 *   - la carta non la tiene per «data da qui» e nemmeno per «non da qui»: decide quando arriva la risoluzione, confrontandola con
 *     ciò che aveva mandato;
 *   - un invio respinto CON uno status (409, 400…) invece prova che il server non l'ha presa.
 * Prima: a invio caduto la carta metteva «non da qui», e un consenso arrivato davvero, solo con l'ACK perso, si leggeva «da
 *   un’altra finestra».
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET che non è quella finta della carta si FERMA e si conta.
 */
const SESSIONE = 'c-incerto';
const AT = '2026-10-03T10:02:00.000Z';

async function prepara(page, { rotta, status = null }) {
  const conti = { posts: 0, fermate: 0 };
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && !r.url().includes(`/sessions/${SESSIONE}/`)) { conti.fermate += 1; return route.abort(); }
    return route.fallback();
  });
  await page.route(`**/api/v1/sessions/${SESSIONE}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${SESSIONE}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  /* l'invio della carta: senza status (la rete cade) o respinto con uno status */
  await page.route(`**/api/v1/sessions/${SESSIONE}/${rotta}`, (route) => {
    conti.posts += 1;
    return status === null ? route.abort('failed') : route.fulfill({ status, json: { ok: false, error: { code: 'CONFLICT', message: 'già risolta' } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sessione) => window.__talosHarnessUiRuntime.passaASessione(sessione, 'workspace', 'Esito incerto', 'z-ai/glm-5.3-flash', { conclusa: false }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return conti;
}
const evento = (page, e) => page.evaluate((e) => { const rt = window.__talosHarnessUiRuntime; rt.handleRealEvent(e, rt.realSessionState.generation); }, e);
const avvio = (page) => evento(page, { type: 'RunStarted', _sequenza: 7401, input: { consegna: 'Scrivi il file' }, contesto: {} });

async function cartaConsenso(page, opzioni) {
  const conti = await prepara(page, { rotta: 'approve', ...opzioni });
  await avvio(page);
  await evento(page, { type: 'ApprovalRequested', _sequenza: 7402, requestId: 'app-incerto', azione: { tipo: 'scrivi', percorso: 'esito.txt' } });
  const carta = page.locator('#conversation [data-request-id="app-incerto"]');
  await carta.getByRole('button', { name: 'Consenti una volta' }).click();
  await expect.poll(() => conti.posts).toBe(1);
  /* ⛔ la rotta conta la richiesta PRIMA che la pagina gestisca il fallimento: si aspetta che la carta l'abbia gestito (i pulsanti
     tornano attivi), o la risoluzione arriverebbe con l'invio ancora in volo e la prova misurerebbe la gara, non la regola */
  await expect(carta.getByRole('button', { name: 'Consenti una volta' })).toBeEnabled();
  return { conti, carta };
}
async function cartaMcp(page, opzioni) {
  const conti = await prepara(page, { rotta: 'mcp-elicitation', ...opzioni });
  await avvio(page);
  await evento(page, { type: 'McpElicitationRequested', _sequenza: 7402, requestId: 'mcp-incerto', server: 'github', mode: 'form', message: 'Il titolo della PR',
    requestedSchema: { type: 'object', properties: { titolo: { type: 'string' } } } });
  const carta = page.locator('#conversation [data-request-id="mcp-incerto"]');
  await carta.getByRole('button', { name: 'Rifiuta' }).click();
  await expect.poll(() => conti.posts).toBe(1);
  await expect(carta.getByRole('button', { name: 'Rifiuta' })).toBeEnabled(); // il fallimento gestito, come sopra
  return { conti, carta };
}

test('CONSENSO-INCERTO-STESSO: invio senza prova, poi lo STESSO consenso dal flusso: è quello dato da qui (l’ACK era solo perso)', async ({ page }) => {
  const { conti, carta } = await cartaConsenso(page);
  await evento(page, { type: 'ApprovalResolved', _sequenza: 7403, requestId: 'app-incerto', approvato: true });
  await expect(carta.locator('.talos-approval__esito')).toHaveText('Approvato');
  expect(conti.fermate).toBe(0);
});

test('CONSENSO-INCERTO-DIVERSO: invio senza prova, poi un DINIEGO dal flusso: viene da un’altra finestra', async ({ page }) => {
  const { conti, carta } = await cartaConsenso(page);
  await evento(page, { type: 'ApprovalResolved', _sequenza: 7403, requestId: 'app-incerto', approvato: false });
  await expect(carta.locator('.talos-approval__esito')).toContainText('da un’altra finestra');
  expect(conti.fermate).toBe(0);
});

test('CONSENSO-RESPINTO: un invio respinto con uno status non è partito da qui, anche se la decisione coincide', async ({ page }) => {
  const { conti, carta } = await cartaConsenso(page, { status: 409 });
  await evento(page, { type: 'ApprovalResolved', _sequenza: 7403, requestId: 'app-incerto', approvato: true });
  await expect(carta.locator('.talos-approval__esito')).toContainText('da un’altra finestra');
  expect(conti.fermate).toBe(0);
});

test('MCP-INCERTO-STESSO: invio senza prova, poi lo STESSO rifiuto dal flusso: è quello dato da qui', async ({ page }) => {
  const { conti, carta } = await cartaMcp(page);
  await evento(page, { type: 'McpElicitationResolved', _sequenza: 7403, requestId: 'mcp-incerto', action: 'decline', at: AT, da: 'persona' });
  await expect(carta.locator('.talos-approval__esito')).toHaveText('Rifiutato');
  expect(conti.fermate).toBe(0);
});

test('MCP-INCERTO-DIVERSO: invio senza prova, poi un INVIO dal flusso: viene da un’altra finestra', async ({ page }) => {
  const { conti, carta } = await cartaMcp(page);
  await evento(page, { type: 'McpElicitationResolved', _sequenza: 7403, requestId: 'mcp-incerto', action: 'accept', at: AT, da: 'persona' });
  await expect(carta.locator('.talos-approval__esito')).toContainText('da un’altra finestra');
  expect(conti.fermate).toBe(0);
});
