import { test, expect } from '@playwright/test';

/*
 * ⛔ Revisione avversaria del blocco 11 (27/10/2026), D-R1 — una fotografia delle impostazioni che arriva MENTRE una scelta di questa
 *   finestra è in volo per la stessa sessione si TRATTIENE (la più nuova) e si applica quando la richiesta finisce, bene o male; il conto
 *   di ciò che è in volo è PER SESSIONE. Prima si buttava: si perdevano il cambio più nuovo del dispositivo e i cambi di un'altra sessione.
 *   Contratto §F.3 punto 5. Prove del revisore (handoff revisione-blocco-11-prove-2026-10-27/D-in-volo-b11.spec.mjs), portate qui: rosse
 *   sul codice di prima, per il motivo giusto.
 *   DV-1 il cambio del dispositivo arriva in volo con versione 60, la risposta di questa finestra ha la 50
 *   DV-2 la richiesta di questa finestra fallisce (500): la fotografia del dispositivo arrivata in volo resta
 *   DV-3 richiesta in volo per la sessione A, si passa alla B e arriva un cambio per B: B lo mostra
 *   Ogni non-GET si ferma e si conta; i WebSocket si chiudono.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const chip = (page) => page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label');

async function apri(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  const conto = { nonGet: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(percorso); return route.abort(); }
    if (/^\/api\/v1\/sessions\/dv-[a-z0-9-]+\/events$/.test(percorso)) return undefined;
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return conto;
}
async function scena(page, id) {
  await page.evaluate(({ id, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Titolo', 'prova/modello-a', { conclusa: true, modello: 'prova/modello-a', permessi: 'Workspace write',
      reasoning: { effort: 'low' }, versioneImpostazioni: 10 });
    r.handleRealEvent({ ...confine, _sequenza: 1 }, r.realSessionState.generation);
  }, { id, confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
}
const fotografia = (cambi) => ({ modello: 'prova/modello-a', modelId: 'prova/modello-a', provider: 'cloud', runtimeId: null, modelloPlanner: null,
  reasoning: { effort: 'low' }, permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale', fallbackProviders: [],
  doveGiranoIComandi: null, comandiNellaConversazione: false, nome: 'Titolo', versione: 10, ...cambi });
async function annuncia(page, istantanea, seq) {
  await page.evaluate(({ istantanea, seq }) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: seq,
      value: { modalitaOperativa: istantanea.modalitaOperativa, permessi: istantanea.permessi, motivo: 'impostazioni', origine: { tipo: 'dispositivo', dispositivoId: 'd-1' }, istantanea } },
    r.realSessionState.generation);
  }, { istantanea, seq });
}
async function cambiaSforzo(page, id) {
  let trattenuta = null;
  await page.route(`**/api/v1/sessions/${id}/settings`, (route) => { trattenuta = route; });
  await page.locator('#pillRagionamento').click();
  await page.locator('[role="menuitemradio"][data-livello="high"]').first().click();
  await expect.poll(() => trattenuta !== null, { message: 'la scelta parte verso il server' }).toBe(true);
  return () => trattenuta;
}

test('DV-1 il cambio del dispositivo arriva MENTRE la scelta di questa finestra è in volo, con una versione PIÙ ALTA della risposta: deve vincere', async ({ page }) => {
  await apri(page);
  await scena(page, 'dv-uno');
  const presa = await cambiaSforzo(page, 'dv-uno');
  /* sul server: prima la scelta del PC (versione 50), poi quella del dispositivo (60). L'evento del 60 arriva prima della risposta del 50. */
  await annuncia(page, fotografia({ permessi: 'Read only', reasoning: { effort: 'high' }, versione: 60 }), 2);
  await presa().fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
    data: { updated: true, istantanea: fotografia({ reasoning: { effort: 'high' }, versione: 50 }) } }) });
  await page.waitForTimeout(300);
  await expect(chip(page), 'il cambio del dispositivo (versione 60, la più nuova) è sparito dalla finestra del PC').toHaveText('Solo lettura');
});

test('DV-2 la scelta di questa finestra FALLISCE: la fotografia del dispositivo arrivata in volo deve restare applicata', async ({ page }) => {
  await apri(page);
  await scena(page, 'dv-due');
  const presa = await cambiaSforzo(page, 'dv-due');
  await annuncia(page, fotografia({ permessi: 'Read only', versione: 60 }), 2);
  await presa().fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }) });
  await page.waitForTimeout(300);
  await expect(chip(page), 'la richiesta è fallita e il cambio del dispositivo arrivato intanto è perso').toHaveText('Solo lettura');
});

test('DV-3 scelta in volo per la sessione A; si passa alla B e arriva un cambio per B: B deve mostrarlo', async ({ page }) => {
  await apri(page);
  await scena(page, 'dv-tre-a');
  const presa = await cambiaSforzo(page, 'dv-tre-a');
  await scena(page, 'dv-tre-b');
  await annuncia(page, fotografia({ permessi: 'Read only', versione: 70 }), 2);
  await page.waitForTimeout(300);
  const visto = await chip(page).textContent();
  await presa().fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
    data: { updated: true, istantanea: fotografia({ reasoning: { effort: 'high' }, versione: 50 }) } }) });
  expect(visto, 'nella sessione B il cambio del dispositivo è stato buttato perché la sessione A aveva una richiesta in volo').toBe('Solo lettura');
});
