import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ 01/10/2026 notte (owner: «Rifiuto prefissi NT + chiedo per \\server») — la carta che chiede di aprire un file su un
 *   computer di rete. Il kernel chiede a ogni livello e anche con «sempre» (`controllaPercorsoDiRete`), quindi «Per questa
 *   sessione» sarebbe una promessa falsa: restano «Consenti una volta» e «Nega», e la frase è quella del kernel. Gira sul
 *   4174: ogni richiesta non GET che la prova non intercetta si FERMA e si conta; `/approve` lo risponde la prova. Le foto
 *   (TALOS_FOTO_DIR) vanno nello scratchpad, mai nel repo.
 */

/* L'azione com'è nel kernel: si chiede PRIMA di qualunque contatto, quindi niente contenuti (né prima né proposti). */
const azione = (tipo, verbo) => ({
  tipo, toolCallId: `c-${tipo}`, percorso: '\\\\nas-ufficio\\condivisa\\report.md',
  percorsoDiRete: { ospite: 'nas-ufficio', frase: `Vuole ${verbo} un file su un computer di rete (nas-ufficio): solo aprirlo manda a quel computer le credenziali di Windows. Serve il tuo sì.` },
});
/* `elenca` (owner 02/10/2026, «Sì, stessa regola»): la frase del kernel per una cartella. */
const ELENCA = { tipo: 'elenca', toolCallId: 'c-elenca', percorso: '\\\\nas-ufficio\\condivisa',
  percorsoDiRete: { ospite: 'nas-ufficio', frase: 'Vuole vedere i file di una cartella su un computer di rete (nas-ufficio): solo aprirla manda a quel computer le credenziali di Windows. Serve il tuo sì.' } };
const AZIONI = [['leggi', azione('leggi', 'leggere')], ['scrivi', azione('scrivi', 'scrivere')], ['modifica', azione('file_edit', 'modificare')], ['elenca', ELENCA]];

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
  await page.route('**/api/v1/sessions/rete-*/events*', () => { /* VELO-SPEC (08/10/2026): aperto e muto — un corpo che si chiude fa riaprire lo stream, e ogni onopen rimette la chat nella storia */ });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function domanda(page, { sessionId, requestId, azione }) {
  await page.evaluate(({ sessionId, requestId, azione }) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione(sessionId, 'workspace', 'Percorso di rete', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation); // VELO-SPEC: da A1-R3 una sessione aperta resta velata fino al confine, che il server manda SEMPRE (anche a storia vuota)
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Aggiorna il report sul NAS dell ufficio' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 1 }, g);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId, azione, _sequenza: 2 }, g);
  }, { sessionId, requestId, azione });
  const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
  await expect(scheda).toBeVisible();
  return scheda;
}

for (const [nome, a] of AZIONI) {
  test(`RETE-UI ${nome}: la frase del kernel, solo «Consenti una volta» e «Nega», e il sì non scrive «sempre»`, async ({ page }) => {
    const fermate = await guardia(page);
    const risposte = [];
    await page.route('**/api/v1/sessions/rete-*/approve', (rotta) => { risposte.push(rotta.request().postDataJSON()); return rotta.fulfill({ json: { ok: true, data: { ok: true } } }); });
    await apriApp(page);
    const scheda = await domanda(page, { sessionId: `rete-${nome}`, requestId: `rete-app-${nome}`, azione: a });
    await expect(scheda).toContainText(a.percorsoDiRete.frase);
    /* La carta dice COSA vuole fare, per ogni attrezzo (prima `file_edit` cadeva nel ripiego «Chiede il permesso»). */
    const [etichetta, descrizione] = {
      leggi: ['Chiede di leggere', 'Vuole leggere questo file:'], scrivi: ['Chiede di scrivere', 'Vuole scrivere questo file:'],
      file_edit: ['Chiede di modificare', 'Vuole modificare questo file:'], elenca: ['Chiede di aprire una cartella', 'Vuole vedere i file di questa cartella:'],
    }[a.tipo];
    await expect(scheda.locator('.talos-approval__head .talos-badge')).toHaveText(etichetta);
    await expect(scheda.locator('.talos-approval__why')).toHaveText(descrizione);
    await expect(scheda.locator('button')).toHaveText(['Consenti una volta', 'Nega']);
    await scheda.getByRole('button', { name: 'Consenti una volta' }).click();
    await expect.poll(() => risposte.length).toBe(1);
    expect(risposte[0]).toEqual({ requestId: `rete-app-${nome}`, approvato: true });
    expect(fermate, 'nessun permesso per attrezzo scritto').toEqual([]);
  });
}

/* 02/10/2026 (owner, «Una domanda per sessione»): la cartella della sessione su un computer di rete — un sì vale per la sessione. */
const SESSIONE = { tipo: 'leggi', toolCallId: 'c-sessione', percorso: 'report.md',
  percorsoDiRete: { ospite: 'nas-ufficio', via: 'cartella', ambito: 'sessione', frase: 'La cartella della sessione sta su un computer di rete (nas-ufficio): aprire i suoi file manda a quel computer le credenziali di Windows. Se lo consenti, vale per tutta la sessione.' } };
test('RETE-UI sessione: la cartella della sessione sulla rete — «Consenti per questa sessione» e «Nega», vale per tutta la sessione', async ({ page }) => {
  const fermate = await guardia(page);
  const risposte = [];
  await page.route('**/api/v1/sessions/rete-*/approve', (rotta) => { risposte.push(rotta.request().postDataJSON()); return rotta.fulfill({ json: { ok: true, data: { ok: true } } }); });
  await apriApp(page);
  const scheda = await domanda(page, { sessionId: 'rete-sessione', requestId: 'rete-app-sessione', azione: SESSIONE });
  await expect(scheda).toContainText(SESSIONE.percorsoDiRete.frase);
  await expect(scheda.locator('button')).toHaveText(['Consenti per questa sessione', 'Nega']);
  await expect(scheda.locator('.talos-approval__foot-note')).toHaveText('Vale per tutta la sessione');
  await scheda.getByRole('button', { name: 'Consenti per questa sessione' }).click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(risposte[0]).toEqual({ requestId: 'rete-app-sessione', approvato: true });
  expect(fermate).toEqual([]);
});

const CARTELLA_FOTO = process.env.TALOS_FOTO_DIR;
for (const tema of ['light', 'dark']) {
  for (const [nome, a] of [...AZIONI, ['sessione', SESSIONE]]) {
    test(`RETE-FOTO carta ${nome} (${tema})`, async ({ page }) => {
      test.skip(!CARTELLA_FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
      await guardia(page);
      await apriApp(page, tema);
      const scheda = await domanda(page, { sessionId: `rete-foto-${nome}-${tema}`, requestId: `rete-foto-${nome}-${tema}`, azione: a });
      await scheda.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${CARTELLA_FOTO}/rete-carta-${nome}-${tema}.png` });
    });
  }
}
