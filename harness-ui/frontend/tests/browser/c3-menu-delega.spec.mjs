import { test, expect } from '@playwright/test';

/*
 * ⭐ C3 tappa 4 (owner 09/10/2026, ciclo di vita comune delle deleghe) — Pausa, Riprendi e Riprova dal menu della delega.
 *   Decisioni: pausa = «finisce l'attrezzo, poi si ferma»; Riprendi e Riprova = un messaggio nuovo «nella stessa figlia».
 *   Il menu offre solo ciò che vale ADESSO: Pausa (e Ferma) su una figlia viva, Riprendi su una in pausa, Riprova su una fallita.
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174): `/children` e gli stream si intercettano. Le tre POST
 *   `…/delegation/<azione>` si rispondono con la busta vera di `successEnvelope`; ogni ALTRA richiesta non-GET si ferma e si conta.
 *   La forma della figlia è quella di `snapshotFiglio` (subagent-orchestrator.mjs); una figlia in pausa chiude il suo turno con un
 *   RunError «in-pausa» (`ultimoEsito:'errore'`, `motivoChiusura:'in-pausa'`, `esitoDelega:'in-pausa'`).
 */
const MADRE = 'md-madre';
const FIGLIA = 'md-figlia';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });
const BASE = {
  sessionId: FIGLIA, parentId: MADRE, padreId: MADRE, task: 'Rileggi il README e riassumilo', taskCorto: 'Rileggi il README',
  modello: 'z-ai/glm-5.3-flash', collisioni: [], interrotta: false, evidenzaDelega: null, approvalPendingCount: 0, operazioneCorrente: null,
};
const VIVA = { ...BASE, conclusa: false, esitoDelega: null };
const IN_PAUSA = { ...BASE, conclusa: true, esitoDelega: 'in-pausa', ultimoEsito: 'errore', motivoChiusura: 'in-pausa' };
const FALLITA = { ...BASE, conclusa: true, esitoDelega: 'fallito', ultimoEsito: 'errore', motivoChiusura: 'errore' };
const FERMATA = { ...BASE, conclusa: true, esitoDelega: 'fallito', ultimoEsito: 'errore', motivoChiusura: 'fermata' };
const CONCLUSA = { ...BASE, conclusa: true, esitoDelega: 'completata' };

async function prepara(page, figlio) {
  const traffico = { altriNonGet: 0, controlli: [] };
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch {}
  });
  await page.route((url) => /\/sessions\/md-(madre|figlia)\/events$/u.test(url.pathname), (route) => route.fulfill({
    contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify(CONFINE)}\n\n`,
  }));
  await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/children`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [figlio] }) }));
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { traffico.altriNonGet += 1; return route.abort(); }
    return route.fallback();
  });
  // registrata DOPO: Playwright prova per prima l'ultima rotta registrata
  await page.route((url) => /\/sessions\/[^/]+\/delegation\/(pause|resume|retry)$/u.test(url.pathname), (route) => {
    const req = route.request();
    traffico.controlli.push({ metodo: req.method(), percorso: new URL(req.url()).pathname, corpo: req.postData() });
    return route.fulfill({ contentType: 'application/json', body: busta({ sessionId: FIGLIA, esito: 'ok' }) });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Madre della prova', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
  }, MADRE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 10_000 });
  await page.getByRole('tab', { name: 'Agenti' }).first().click();
  const scheda = page.locator(`[data-session-id="${FIGLIA}"], [data-agente-id="${FIGLIA}"], [data-sessione-figlia="${FIGLIA}"]`).first();
  await expect(scheda, 'premessa: la scheda della figlia c’è').toBeVisible();
  await scheda.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Apri come sessione intera' }).first(), 'premessa: il menu della delega è aperto').toBeVisible();
  traffico.scheda = scheda;
  return traffico;
}

const voci = (page) => ({
  pausa: page.getByRole('menuitem', { name: 'Metti in pausa questa delega' }),
  riprendi: page.getByRole('menuitem', { name: 'Riprendi questa delega' }),
  riprova: page.getByRole('menuitem', { name: 'Riprova questa delega' }),
  ferma: page.getByRole('menuitem', { name: 'Ferma questa delega' }),
});

test.describe('C3 tappa 4 — Pausa, Riprendi e Riprova dal menu della delega', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'it-IT' });

  for (const [caso, figlio, azione, voce] of [
    ['viva → Metti in pausa', VIVA, 'pause', 'pausa'],
    ['in pausa → Riprendi', IN_PAUSA, 'resume', 'riprendi'],
    ['fallita → Riprova', FALLITA, 'retry', 'riprova'],
    // owner 09/10: anche una delega fermata dalla persona si riprova (per il server è «fallito», come per il menu)
    ['fermata → Riprova', FERMATA, 'retry', 'riprova'],
  ]) {
    test(`C3-MENU-DELEGA — ${caso}: la voce c’è, le altre due no, e manda la POST giusta con un corpo vuoto`, async ({ page }) => {
      const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message || e)));
      const traffico = await prepara(page, figlio);
      if (figlio === IN_PAUSA) await expect(traffico.scheda, 'the card says «In pausa», not «Non riuscita»').toContainText('In pausa');
      const v = voci(page);
      for (const altra of ['pausa', 'riprendi', 'riprova'].filter((k) => k !== voce)) {
        await expect(v[altra], `«${altra}» non vale per una figlia ${caso.split(' ')[0]}`).toHaveCount(0);
      }
      await expect(v.ferma).toHaveCount(voce === 'pausa' ? 1 : 0);
      await v[voce].first().click();
      await expect.poll(() => traffico.controlli.length).toBe(1);
      expect(traffico.controlli[0]).toEqual({ metodo: 'POST', percorso: `/api/v1/sessions/${FIGLIA}/delegation/${azione}`, corpo: '{}' });
      expect(traffico.altriNonGet).toBe(0);
      expect(errori).toEqual([]);
    });
  }

  test('C3-MENU-DELEGA — AL CONTRARIO: una figlia conclusa bene non offre né Pausa, né Riprendi, né Riprova, né Ferma', async ({ page }) => {
    const traffico = await prepara(page, CONCLUSA);
    const v = voci(page);
    for (const k of ['pausa', 'riprendi', 'riprova', 'ferma']) await expect(v[k], `conclusa: niente «${k}»`).toHaveCount(0);
    expect(traffico.controlli).toEqual([]);
  });
});

/* Prova dal vivo (09/10/2026, glm-5.3-flash sulla 4177): dal server vero `taskCorto` mancava, e l'avviso della Pausa portava il
   compito INTERO (centinaia di caratteri) con un titolo lungo in una pillola senza a capo: usciva dalla finestra a destra. */
test.describe('C3 tappa 4 — l’avviso dopo Pausa resta nella finestra', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'it-IT' });
  test('C3-MENU-DELEGA-AVVISO — no `taskCorto` and a 400-character task: the toast has a short title, a cut name, and stays inside the window', async ({ page }) => {
    const lungo = `Lavora nella cartella corrente del progetto. ${'Leggi ogni file della cartella docs e scrivi una riga di riassunto. '.repeat(6)}`;
    const traffico = await prepara(page, { ...VIVA, taskCorto: undefined, task: lungo });
    await voci(page).pausa.first().click();
    await expect.poll(() => traffico.controlli.length).toBe(1);
    const avviso = page.locator('.talos-toast').filter({ hasText: 'Delega in pausa' }).last();
    await expect(avviso).toBeVisible();
    const testo = await avviso.innerText();
    expect(testo.length, 'not the whole task').toBeLessThan(200);
    expect(testo).toContain('Lavora nella cartella corrente');
    const box = await avviso.boundingBox();
    expect(box.x + box.width, 'inside the window').toBeLessThanOrEqual(1920);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });
});
