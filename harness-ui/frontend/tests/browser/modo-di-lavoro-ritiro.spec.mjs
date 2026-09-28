import { expect, test } from '@playwright/test';

/*
 * F3-12 (24/09/2026) — il ritiro del modo «Workflow» dalla interfaccia.
 *
 * Decisione owner 23/09 notte: un solo selettore, Normale / Piano. Workflow e Ask diventano
 * attrezzi. Le sessioni salvate col modo Workflow si aprono con una fascia che lo dice e offre
 * «Continua in Normale» / «Continua in Piano»; il file della sessione non si riscrive.
 *
 * ⛔ Le prove girano sul server isolato della suite (porta 4176, store vuoto): ogni scrittura verso
 *   una sessione è intercettata con `page.route` e contata, niente arriva a un server vero.
 * ⛔ Il seme della preferenza segue lo schema di prova delle migrazioni di localStorage: si semina
 *   il valore vecchio, si avvia, si verifica il valore nuovo, si ricarica e si verifica che resti
 *   (idempotenza) — qaskills.sh «localStorage Migration Testing», letto il 24/09/2026.
 */

const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';

// La lingua dell'interfaccia segue il browser («sistema»): le frasi qui sotto sono quelle italiane.
test.use({ locale: 'it-IT' });

function raccogliErrori(page) {
  const errori = [];
  page.on('pageerror', (errore) => errori.push(`pageerror: ${errore.message}`));
  return errori;
}

async function apriApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {});
}

async function apriConversazione(page) {
  await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
  await expect(page.locator('#schermoChat')).toBeVisible();
}

async function apriFoglioPermessi(page) {
  await page.locator('[data-open-sheet="permissions"]:visible').first().click();
  const selettore = page.locator('#veloPermessi [data-work-mode-select]');
  await expect(selettore).toBeVisible();
  return selettore;
}

async function chiudiFoglioPermessi(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#veloPermessi')).toBeHidden();
}

async function simulaSessione(page, sessionId, { impostazioni = 'ok' } = {}) {
  const scritture = [];
  await page.route(`**/api/v1/sessions/${sessionId}/events*`, (route) => route.fulfill({
    contentType: 'text/event-stream', body: 'retry: 600000\n\n',
  }));
  await page.route(`**/api/v1/sessions/${sessionId}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sessionId}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sessionId}/settings`, (route) => {
    scritture.push(route.request().postDataJSON());
    if (impostazioni === 'rifiuta') {
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'SESSION_NOT_READY', message: 'La modalità di lavoro si cambia fra un giro e l’altro, non mentre il modello sta lavorando' } } });
    }
    return route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  return scritture;
}

test('MODE-SELECTOR-TWO-OPTIONS: il selettore del modo offre solo Normale e Piano', async ({ page }) => {
  const errori = raccogliErrori(page);
  await apriApp(page);
  await apriConversazione(page);
  const selettore = await apriFoglioPermessi(page);
  await expect(selettore.locator('option')).toHaveCount(2);
  expect(await selettore.locator('option').evaluateAll((opzioni) => opzioni.map((o) => o.value))).toEqual(['normale', 'piano']);
  const riga = page.locator('#veloPermessi .talos-list-row').filter({ has: page.locator('[data-work-mode-select]') });
  await expect(riga).not.toContainText(/workflow|sotto-agenti|Coordina più agenti/i);
  expect(errori).toEqual([]);
});

test('MODE-PREF-WORKFLOW-NORMALIZED: una preferenza salvata «workflow» diventa «normale» e non ricompare', async ({ page }) => {
  const errori = raccogliErrori(page);
  await page.addInitScript((chiave) => {
    try {
      if (sessionStorage.getItem('prova-modo-seminata')) return;
      sessionStorage.setItem('prova-modo-seminata', '1');
      localStorage.setItem(chiave, JSON.stringify({ version: 1, appearance: {}, chat: { modalitaOperativa: 'workflow', permissions: 'Workspace write' } }));
    } catch { /* la prova fallisce sotto, se il seme non c'è */ }
  }, CHIAVE_IMPOSTAZIONI);
  await apriApp(page);
  const salvataSubito = await page.evaluate((chiave) => JSON.parse(localStorage.getItem(chiave) || '{}').chat?.modalitaOperativa, CHIAVE_IMPOSTAZIONI);
  expect(salvataSubito).toBe('normale');
  await apriConversazione(page);
  const selettore = await apriFoglioPermessi(page);
  await expect(selettore).toHaveValue('normale');
  expect(await selettore.locator('option').evaluateAll((opzioni) => opzioni.map((o) => o.value))).toEqual(['normale', 'piano']);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  const dopoRicarica = await page.evaluate((chiave) => JSON.parse(localStorage.getItem(chiave) || '{}').chat?.modalitaOperativa, CHIAVE_IMPOSTAZIONI);
  expect(dopoRicarica).toBe('normale');
  expect(errori).toEqual([]);
});

test('MODE-REPLAY-HISTORIC-WORKFLOW: una sessione storica in Workflow si apre con la fascia e i due pulsanti', async ({ page }) => {
  const errori = raccogliErrori(page);
  const scritture = await simulaSessione(page, 'wf-storica');
  await simulaSessione(page, 'wf-altra');
  await apriApp(page);
  await apriConversazione(page);

  const apri = async (sessionId) => page.evaluate((id) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione(id, 'workspace', 'Sessione storica', 'z-ai/glm-5.3-flash', { conclusa: true });
    runtime.handleRealEvent({
      type: 'RunStarted', _sequenza: 8101,
      input: { consegna: 'Coordina la revisione' }, contesto: { modalitaOperativa: 'workflow', modello: 'z-ai/glm-5.3-flash' },
    }, runtime.realSessionState.generation);
  }, sessionId);

  await apri('wf-storica');
  const fascia = page.locator('#fasciaModoRitirato');
  await expect(fascia).toBeVisible();
  await expect(fascia).toContainText('Questa conversazione usava la modalità Workflow, che non c’è più.');
  const normale = fascia.getByRole('button', { name: 'Continua in Normale', exact: true });
  const piano = fascia.getByRole('button', { name: 'Continua in Piano', exact: true });
  await expect(normale).toBeVisible();
  await expect(piano).toBeVisible();

  // ⛔ Regola owner 11/09: nessuna scritta SOTTO il composer. La fascia sta sopra.
  const boxFascia = await fascia.boundingBox();
  const boxComposer = await page.locator('#composerForm').boundingBox();
  expect(boxFascia.y + boxFascia.height).toBeLessThanOrEqual(boxComposer.y + 0.5);

  // Nessuna etichetta falsa: il selettore non dichiara un modo che non esiste più.
  const selettore = await apriFoglioPermessi(page);
  await expect(selettore).toHaveValue('normale');
  await chiudiFoglioPermessi(page);

  await piano.click();
  await expect.poll(() => scritture.length).toBe(1);
  expect(scritture[0]).toEqual({ modalitaOperativa: 'piano' });
  await expect(fascia).toBeHidden();
  const dopoLaScelta = await apriFoglioPermessi(page);
  await expect(dopoLaScelta).toHaveValue('piano');
  await chiudiFoglioPermessi(page);

  // Non torna: si apre un'altra sessione, si torna a questa, la storia rigioca lo stesso giro Workflow.
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('wf-altra', 'workspace', 'Altra', 'm', { conclusa: true }));
  await expect(fascia).toBeHidden();
  await apri('wf-storica');
  await page.waitForTimeout(300);
  await expect(fascia).toBeHidden();
  expect(scritture).toHaveLength(1);
  expect(errori).toEqual([]);
});

test('MODE-REPLAY-HISTORIC-WORKFLOW-CONTRACT: la fascia vale anche quando lo dice il contratto della sessione, e un rifiuto la lascia al suo posto', async ({ page }) => {
  const errori = raccogliErrori(page);
  const scritture = await simulaSessione(page, 'wf-contratto', { impostazioni: 'rifiuta' });
  await apriApp(page);
  await apriConversazione(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione(
    'wf-contratto', 'workspace', 'Contratto storico', 'z-ai/glm-5.3-flash',
    { sessionId: 'wf-contratto', conclusa: true, modalitaOperativa: 'workflow' },
  ));
  const fascia = page.locator('#fasciaModoRitirato');
  await expect(fascia).toBeVisible();
  await fascia.getByRole('button', { name: 'Continua in Normale', exact: true }).click();
  await expect.poll(() => scritture.length).toBe(1);
  expect(scritture[0]).toEqual({ modalitaOperativa: 'normale' });
  // Il server ha detto no: la scelta non è avvenuta, la fascia resta e i pulsanti tornano usabili.
  await expect(fascia).toBeVisible();
  await expect(fascia.getByRole('button', { name: 'Continua in Normale', exact: true })).toBeEnabled();
  expect(errori).toEqual([]);
});

test('MODE-REPLAY-NEVER-WORKFLOW: una sessione mai stata in Workflow non mostra la fascia', async ({ page }) => {
  const errori = raccogliErrori(page);
  await simulaSessione(page, 'wf-mai');
  await apriApp(page);
  await apriConversazione(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('wf-mai', 'workspace', 'Normale', 'm', { sessionId: 'wf-mai', conclusa: true, modalitaOperativa: 'normale' });
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 8201, input: { consegna: 'ciao' }, contesto: { modalitaOperativa: 'piano' } }, runtime.realSessionState.generation);
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#fasciaModoRitirato')).toBeHidden();
  expect(errori).toEqual([]);
});
