import { test, expect } from '@playwright/test';

/*
 * LINGUA-7 (08/10/2026, bugfixer; condizione della review di «talos desktop») — sotto l'esito di un attrezzo più lungo di 200 righe
 *   (`RIGHE_ESITO_IN_CHAT`) la chat dice quante ne nasconde. Con UNA riga nascosta diceva «Altre 1 righe non sono mostrate qui»: il
 *   plurale lo sceglie il numero (`trn`, app.js), nei due rami che disegnano l'esito — il flusso unico e i flussi separati
 *   (stdout/stderr). La sessione si apre come la apre il server: stream aperto e muto, confine prima degli eventi (VELO-SPEC).
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const righe = (n) => Array.from({ length: n }, (_, i) => `riga ${i + 1}`).join('\n');

async function apri(page, id, risultato) {
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' }, chat: {}, workspaces: {} })); } catch {}
  });
  await page.route((url) => url.pathname.endsWith(`/sessions/${id}/events`), () => { /* aperto e muto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.evaluate(({ id, risultato, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Righe nascoste', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent(confine, g);
    let seq = 500;
    const evento = (e) => r.handleRealEvent({ ...e, _sequenza: seq += 1 }, g);
    evento({ type: 'RunStarted', input: { consegna: 'esegui' }, contesto: { cartella: 'C:\\progetti\\prova', modello: 'glm-5.3-flash' } });
    evento({ type: 'ToolCallStart', toolCallId: 'r1', toolCallName: 'shell', giro: 1 });
    evento({ type: 'ToolCallArgs', toolCallId: 'r1', delta: JSON.stringify({ comando: 'npm test' }) });
    evento({ type: 'ToolCallResult', toolCallId: 'r1', errore: false, ricevutoA: 2000, ...risultato });
  }, { id, risultato, confine: CONFINE });
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'));
}
const taglio = (page) => page.locator('#conversation .tool-result-tagliato');

test('LINGUA-7-B1 — flusso unico, 201 righe: «Un’altra riga non è mostrata qui (in tutto 201).»', async ({ page }) => {
  await apri(page, 'righe-nascoste-uno', { content: righe(201) });
  await expect(taglio(page)).toHaveCount(1);
  await expect(taglio(page)).toHaveText('Un’altra riga non è mostrata qui (in tutto 201).');
});

test('LINGUA-7-B2 — flussi separati, 201 righe di uscita: lo stesso singolare nell\'altro ramo', async ({ page }) => {
  await apri(page, 'righe-nascoste-flussi', { content: righe(201), stdout: righe(201), stderr: '', exitCode: 0 });
  await expect(taglio(page).first()).toHaveText('Un’altra riga non è mostrata qui (in tutto 201).');
});

test('LINGUA-7-B3 — al contrario: 205 righe restano al plurale, «Altre 5 righe…»', async ({ page }) => {
  await apri(page, 'righe-nascoste-molte', { content: righe(205) });
  await expect(taglio(page)).toHaveText('Altre 5 righe non sono mostrate qui (in tutto 205).');
});
