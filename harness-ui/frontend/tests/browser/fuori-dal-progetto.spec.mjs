import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ F4-03 (owner 01/10/2026 sera) — la carta che chiede di scrivere FUORI dalla cartella della sessione con «Scrive nel
 *   progetto». Decisioni dell'owner: il secondo pulsante diventa «Consenti in questa cartella per la sessione» (sottocartelle
 *   comprese) e manda `ambito: 'cartella'` — mai «Scrittura: sempre», che il confine non ascolta; se la cartella non si è
 *   potuta verificare, quel pulsante non c'è. Gira sul 4174: ogni richiesta non GET che la prova non intercetta si FERMA e si
 *   conta; `/approve` lo risponde la prova. Le foto (TALOS_FOTO_DIR) vanno nello scratchpad, mai nel repo.
 */

const FRASE = 'Vuole scrivere fuori dalla cartella della sessione, in C:\\altro\\docs. Con «Scrive nel progetto» qui serve il tuo sì.';
const FRASE_NON_VERIFICATA = 'Non è stato possibile verificare dove finisce «link\\a.txt»: potrebbe essere fuori dalla cartella della sessione. Con «Scrive nel progetto» qui serve il tuo sì.';
const FUORI = { verificato: true, cartella: 'C:\\altro\\docs', chiave: 'locale|C:\\altro\\docs', frase: FRASE };

async function guardia(page) {
  const fermate = [];
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    fermate.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  return fermate;
}

async function apriApp(page, tema = 'dark') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiFontScale: 'default' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/fuori-*/events*', (rotta) => rotta.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

/*
 * L'azione com'è nel kernel (talosHarness.mjs, rami `scrivi` e `file_edit`: `{ tipo, toolCallId, percorso, contenutoPrima,
 * contenutoProposto }`, più `fuoriDalProgetto` che aggiunge `verificaPermessoScrittura`). Un evento finto senza i contenuti
 * disegnava una carta senza differenze, che il server vero non manda mai.
 */
const AZIONE_SCRIVI = { tipo: 'scrivi', toolCallId: 'c1', percorso: 'C:\\altro\\docs\\a.txt', contenutoPrima: null, contenutoProposto: '# Guida\n\nPassi per installare TALOS.\n' };
const AZIONE_MODIFICA = { tipo: 'file_edit', toolCallId: 'c2', percorso: 'C:\\altro\\docs\\guida.md', contenutoPrima: '# Guida\n\nPassi per installare.\n', contenutoProposto: '# Guida\n\nPassi per installare TALOS sul desktop.\n' };

/** Una sessione finta con una domanda «fuori dal progetto» (e, se serve, già risolta). */
async function domanda(page, { sessionId, requestId, fuori, risolta = null, azione = AZIONE_SCRIVI }) {
  await page.evaluate(({ sessionId, requestId, fuori, risolta, azione }) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione(sessionId, 'workspace', 'F4-03 fuori dal progetto', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Aggiorna la guida nella cartella docs' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 1 }, g);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId, azione: { ...azione, fuoriDalProgetto: fuori }, _sequenza: 2 }, g);
    if (risolta) runtime.handleRealEvent({ type: 'ApprovalResolved', requestId, ...risolta, _sequenza: 3 }, g);
  }, { sessionId, requestId, fuori, risolta, azione });
  const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
  await expect(scheda).toBeVisible();
  return scheda;
}

test('FUORI-UI-01: la carta dice dove vuole scrivere, e «Consenti in questa cartella per la sessione» manda ambito cartella, senza scrivere «sempre»', async ({ page }) => {
  const fermate = await guardia(page);
  const risposte = [];
  await page.route('**/api/v1/sessions/fuori-*/approve', (rotta) => { risposte.push(rotta.request().postDataJSON()); return rotta.fulfill({ json: { ok: true, data: { ok: true } } }); });
  await apriApp(page);
  const scheda = await domanda(page, { sessionId: 'fuori-uno', requestId: 'fuori-app-1', fuori: FUORI });
  await expect(scheda).toContainText(FRASE);
  await expect(scheda.locator('button')).toHaveText(['Consenti una volta', 'Consenti in questa cartella per la sessione', 'Nega']);
  await scheda.getByRole('button', { name: 'Consenti in questa cartella per la sessione' }).click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(risposte[0]).toEqual({ requestId: 'fuori-app-1', approvato: true, ambito: 'cartella' });
  expect(fermate, 'nessun permesso per attrezzo scritto: il consenso vive nella sessione, non in «scrivi: sempre»').toEqual([]);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'ApprovalResolved', requestId: 'fuori-app-1', approvato: true, ambito: 'cartella', _sequenza: 3 }, runtime.realSessionState.generation);
  });
  await expect(scheda.locator('.talos-approval__esito')).toHaveText('Consentito in questa cartella per la sessione');
});

test('FUORI-UI-02: se la cartella non si è potuta verificare, il pulsante della cartella non c è', async ({ page }) => {
  await guardia(page);
  await apriApp(page);
  const scheda = await domanda(page, { sessionId: 'fuori-due', requestId: 'fuori-app-2', fuori: { verificato: false, cartella: null, frase: FRASE_NON_VERIFICATA } });
  await expect(scheda).toContainText(FRASE_NON_VERIFICATA);
  await expect(scheda.locator('button')).toHaveText(['Consenti una volta', 'Nega']);
});

test('FUORI-UI-03: in una sessione automatica la carta si chiude da sé e lo dice', async ({ page }) => {
  await guardia(page);
  await apriApp(page);
  const scheda = await domanda(page, { sessionId: 'fuori-tre', requestId: 'fuori-app-3', fuori: FUORI, risolta: { approvato: false, motivo: 'nessuna-interfaccia' } });
  await expect(scheda.locator('.talos-approval__esito')).toHaveText('Negato: nessuno poteva rispondere in questa sessione automatica');
  await expect(scheda.locator('button')).toHaveCount(0);
});

const CARTELLA_FOTO = process.env.TALOS_FOTO_DIR;
for (const tema of ['light', 'dark']) {
  for (const [nome, azione] of [['scrivi', AZIONE_SCRIVI], ['modifica', AZIONE_MODIFICA]]) {
    test(`FUORI-FOTO carta ${nome} (${tema})`, async ({ page }) => {
      test.skip(!CARTELLA_FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
      await guardia(page);
      await apriApp(page, tema);
      const scheda = await domanda(page, { sessionId: `fuori-foto-${nome}-${tema}`, requestId: `fuori-foto-${nome}-${tema}`, fuori: FUORI, azione });
      await scheda.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${CARTELLA_FOTO}/fuori-carta-${nome}-${tema}.png` });
    });
  }
}
