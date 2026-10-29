import { test, expect } from '@playwright/test';

/*
 * ⭐ Owner 27/10/2026: «da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare tutte le impostazioni e sul
 *   pc devono essere visibili subito come modello, ragionamento etc». La finestra del PC applica la FOTOGRAFIA delle impostazioni
 *   (`talos.impostazioni-sessione` col campo `istantanea`, contratto §F del censimento) senza ricaricare niente: modello, permesso,
 *   modo e titolo. Una fotografia più vecchia si scarta; mentre una scelta di questa finestra è in viaggio, quella che arriva da fuori
 *   aspetta la risposta (come il client di Codex, `agents_overview_threads.rs:169-185`).
 * Scene aperte dal browser con le impostazioni della sessione (`passaASessione`, come all'apertura vera): ogni non-GET si ferma e si conta,
 *   tranne la POST /settings della prova IV-03, che la prova trattiene e poi risponde lei.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const chip = (page) => page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"] .talos-chip__label');
const modello = (page) => page.locator('[data-open-sheet="model"] span').first();
const titolo = (page) => page.locator('#sessionTitle');

async function apri(page, { tema = 'dark' } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const conto = { nonGet: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(percorso); return route.abort(); }
    if (/^\/api\/v1\/sessions\/iv-[a-z0-9-]+\/events$/.test(percorso)) return undefined; // flusso vivo che resta appeso
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
    r.passaASessione(id, 'workspace', 'Titolo di prima', 'prova/modello-a', { conclusa: true, modello: 'prova/modello-a', permessi: 'Workspace write',
      reasoning: { effort: 'low' }, versioneImpostazioni: 10 });
    r.handleRealEvent({ ...confine, _sequenza: 1 }, r.realSessionState.generation);
  }, { id, confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
}
const fotografia = (cambi) => ({ modello: 'prova/modello-a', modelId: 'prova/modello-a', provider: 'cloud', runtimeId: null, modelloPlanner: null,
  reasoning: { effort: 'low' }, permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale', fallbackProviders: [],
  doveGiranoIComandi: null, comandiNellaConversazione: false, nome: 'Titolo di prima', versione: 10, ...cambi });
async function annuncia(page, istantanea, seq, motivo = 'impostazioni') {
  await page.evaluate(({ istantanea, seq, motivo }) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: seq,
      value: { modalitaOperativa: istantanea.modalitaOperativa, permessi: istantanea.permessi, motivo, origine: { tipo: 'dispositivo', dispositivoId: 'd-1' }, istantanea } },
    r.realSessionState.generation);
  }, { istantanea, seq, motivo });
}

for (const tema of ['dark', 'light']) {
  test(`IV-01 (${tema}) — un cambio dal dispositivo si vede SUBITO sul PC: modello, permesso e titolo, senza ricaricare`, async ({ page }) => {
    const conto = await apri(page, { tema });
    await scena(page, 'iv-uno');
    await expect(modello(page)).toContainText('modello-a');
    await expect(chip(page)).toHaveText('Scrive nel progetto');
    await annuncia(page, fotografia({ modello: 'prova/modello-b', modelId: 'prova/modello-b', permessi: 'Full access', reasoning: { effort: 'high' },
      nome: 'Titolo dal telefono', versione: 20 }), 2);
    await expect(modello(page)).toContainText('modello-b');
    await expect(chip(page)).toHaveText('Accesso pieno');
    await expect(titolo(page)).toHaveText('Titolo dal telefono');
    await page.screenshot({ path: `test-results/iv-01-${tema}.png` });
    expect(conto.nonGet, 'applicare la fotografia non scrive niente sul server').toEqual([]);
  });
}

test('IV-02 — AL CONTRARIO: una fotografia più vecchia (il ripasso di un flusso, due cambi incrociati) non torna indietro', async ({ page }) => {
  await apri(page);
  await scena(page, 'iv-due');
  await annuncia(page, fotografia({ permessi: 'Full access', versione: 30 }), 2);
  await expect(chip(page)).toHaveText('Accesso pieno');
  await annuncia(page, fotografia({ permessi: 'Read only', modello: 'vecchio/m', modelId: 'vecchio/m', versione: 25 }), 3);
  await page.waitForTimeout(150);
  await expect(chip(page)).toHaveText('Accesso pieno');
  await expect(modello(page)).toContainText('modello-a');
  /* e una versione più vecchia di quella con cui la sessione si è aperta (10) non vale nemmeno lei */
  await scena(page, 'iv-due-b');
  await annuncia(page, fotografia({ permessi: 'Read only', versione: 5 }), 2);
  await page.waitForTimeout(150);
  await expect(chip(page)).toHaveText('Scrive nel progetto');
});

test('IV-03 — mentre una scelta di QUESTA finestra è in viaggio, la fotografia da fuori aspetta; poi vince la risposta del server', async ({ page }) => {
  await apri(page);
  let trattenuta = null;
  await page.route('**/api/v1/sessions/iv-tre/settings', (route) => { trattenuta = route; });
  await scena(page, 'iv-tre');
  await page.locator('#pillRagionamento').click();
  await page.locator('[role="menuitemradio"][data-livello="high"]').first().click();
  await expect.poll(() => trattenuta !== null, { message: 'la scelta parte verso il server' }).toBe(true);
  expect(trattenuta.request().postDataJSON()).toEqual({ reasoning: { effort: 'high' } });
  await annuncia(page, fotografia({ permessi: 'Read only', versione: 40 }), 2);
  await page.waitForTimeout(150);
  await expect(chip(page), 'in viaggio: la fotografia da fuori non scavalca la scelta di questa finestra').toHaveText('Scrive nel progetto');
  await trattenuta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
    data: { updated: true, istantanea: fotografia({ permessi: 'Read only', reasoning: { effort: 'high' }, versione: 50 }) } }) });
  await expect(chip(page), 'la risposta porta lo stato vero, che comprende il cambio arrivato da fuori').toHaveText('Solo lettura');
});
