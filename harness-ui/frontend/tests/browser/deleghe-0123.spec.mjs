import { test, expect } from '@playwright/test';

/*
 * ⛔ 0.1.23 (bugfixer, 08/10/2026) — «APRI COME SESSIONE INTERA» DAL MENU DELLA DELEGA APRE LA FIGLIA.
 *   Il menu chiamava `passaASessione({ id, modello })`: un OGGETTO al posto dell'id. Riprodotto sulla 4176 (fornitore finto, delega
 *   vera): l'id della sessione aperta diventava `{id, modello}`, la testata «Sessione senza nome», la chat ferma su «Apro la
 *   cronologia…» e «Contatto col server perso».
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174): `/children` e gli stream si intercettano, ogni non-GET si ferma e si
 *   conta. La forma della figlia è quella di `snapshotFiglio` (subagent-orchestrator.mjs), la busta quella di `successEnvelope`.
 * ⛔ Nello stesso lotto, i due difetti segnalati dalla sessione desktop:
 *   - negata la delega, il compositore proponeva «Com'è andata: [compito]» per un agente mai partito (riprodotto sulla 4176);
 *   - la scheda dell'agente diceva «Che cosa ha riportato: concluso» — lo STATO al posto del resoconto (`riassuntoDelega`).
 */
const RIFIUTO = 'REFUSED. the person did not approve starting this agent. No child was started.'; // il testo vero del kernel
const giroConDelega = (esito) => [
  { type: 'RunStarted', threadId: 't', runId: 'r-delega', input: { consegna: 'Delega la creazione di un file.', seguito: true } },
  { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask' },
  { type: 'ToolCallArgs', toolCallId: 'd1', delta: JSON.stringify({ task: 'Crea il file prova.txt con una riga' }) },
  { type: 'ToolCallEnd', toolCallId: 'd1' },
  { type: 'ToolCallResult', toolCallId: 'd1', content: esito },
  { type: 'RunFinished', threadId: 't', runId: 'r-delega' },
];
const MADRE = 'md-madre';
const FIGLIA = 'md-figlia';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });
const FIGLIO = {
  sessionId: FIGLIA, parentId: MADRE, padreId: MADRE, task: 'Rileggi il README e riassumilo', taskCorto: 'Rileggi il README',
  modello: 'z-ai/glm-5.3-flash', collisioni: [], conclusa: true, interrotta: false, esitoDelega: 'completata', evidenzaDelega: null,
  approvalPendingCount: 0, operazioneCorrente: null,
};

async function prepara(page, { figlio = FIGLIO } = {}) {
  const traffico = { nonGet: 0 };
  await page.addInitScript(() => {
    // gira anche negli iframe isolati della pagina (senza allow-same-origin), dove localStorage lancia
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch {}
  });
  await page.route((url) => /\/sessions\/md-(madre|figlia)\/events$/u.test(url.pathname), (route) => route.fulfill({
    contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify(CONFINE)}\n\n`,
  }));
  await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/children`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [figlio] }) }));
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { traffico.nonGet += 1; return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Madre della prova', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
  }, MADRE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 10_000 });
  return traffico;
}

test.describe('Menu della delega — «Apri come sessione intera»', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'it-IT' });

  test('MENU-DELEGA-APRI-01 — apre la FIGLIA, con l’id come stringa e il suo compito in testata', async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message || e)));
    const traffico = await prepara(page);
    await page.getByRole('tab', { name: 'Agenti' }).first().click();
    const scheda = page.locator(`[data-session-id="${FIGLIA}"], [data-agente-id="${FIGLIA}"], [data-sessione-figlia="${FIGLIA}"]`).first();
    await expect(scheda, 'premessa: la scheda della figlia c’è').toBeVisible();
    await scheda.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Apri come sessione intera' }).first().click();
    await page.getByRole('button', { name: 'Apri la delega' }).first().click();
    await page.waitForFunction((figlia) => window.__talosHarnessUiRuntime.realSessionState.id === figlia, FIGLIA, { timeout: 8000 });
    expect(typeof await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('string');
    await expect(page.locator('#sessionTitleButton')).toContainText('Rileggi il README');
    expect(errori).toEqual([]);
    expect(traffico.nonGet).toBe(0);
  });

  test('MENU-DELEGA-APRI-02 — AL CONTRARIO: un id che non è una stringa si ferma prima di toccare la sessione aperta', async ({ page }) => {
    await prepara(page);
    const esito = await page.evaluate((madre) => {
      const r = window.__talosHarnessUiRuntime;
      let errore = null;
      try { r.passaASessione({ id: 'md-figlia', modello: null }); } catch (e) { errore = e instanceof TypeError ? 'TypeError' : String(e); }
      return { errore, aperta: r.realSessionState.id, restaLaMadre: r.realSessionState.id === madre };
    }, MADRE);
    expect(esito.errore).toBe('TypeError');
    expect(esito.restaLaMadre, `aperta: ${JSON.stringify(esito.aperta)}`).toBe(true);
  });
});

/** Un giro dal vivo con una delega, poi il testo che il compositore propone. */
async function suggerimentoDopo(page, esito) {
  return page.evaluate(async (eventi) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation);
    await new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(fatto)));
    return document.querySelector('#composerInput').getAttribute('placeholder') || '';
  }, giroConDelega(esito));
}

test.describe('Delega rifiutata e resoconto della figlia', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'it-IT' });

  test('DELEGA-RIFIUTATA-03 — negata la delega, il compositore non chiede «Com’è andata» a un agente mai partito', async ({ page }) => {
    await prepara(page);
    const testo = await suggerimentoDopo(page, RIFIUTO);
    expect(testo).not.toContain('Com’è andata');
    expect(testo).not.toContain('Com\'è andata');
    expect(testo).not.toContain('prova.txt');
  });

  test('DELEGA-RIFIUTATA-04 — AL CONTRARIO: una delega partita propone ancora «Com’è andata»', async ({ page }) => {
    await prepara(page);
    const testo = await suggerimentoDopo(page, 'Sub-agent md-figlia started in the background (with the parent\'s permissions).');
    expect(testo).toMatch(/Com.è andata: Crea il file prova\.txt/u);
  });

  for (const [nome, figlio, atteso] of [
    ['DELEGA-RESOCONTO-05 — «Che cosa ha riportato» è il resoconto della figlia, non il suo stato',
      { ...FIGLIO, esitoDelega: 'concluso', riassuntoDelega: 'Ho letto il README: descrive un progetto di prova.' }, 'Ho letto il README: descrive un progetto di prova.'],
    ['DELEGA-RESOCONTO-06 — AL CONTRARIO: senza resoconto la sezione non c’è (mai lo stato «concluso» al suo posto)',
      { ...FIGLIO, esitoDelega: 'concluso' }, null],
  ]) {
    test(nome, async ({ page }) => {
      const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message || e)));
      await prepara(page, { figlio });
      await page.getByRole('tab', { name: 'Agenti' }).first().click();
      const scheda = page.locator(`[data-session-id="${FIGLIA}"], [data-agente-id="${FIGLIA}"], [data-sessione-figlia="${FIGLIA}"]`).first();
      await scheda.click();
      const panoramica = page.locator('[data-c="PannelloFiglia"]');
      await expect(panoramica, 'premessa: il dettaglio della figlia è aperto').toContainText('Rileggi il README');
      const sezione = panoramica.locator('.talos-agente__compito').filter({ hasText: 'Che cosa ha riportato' });
      if (atteso) await expect(sezione).toContainText(atteso);
      else await expect(sezione).toHaveCount(0);
      await expect(panoramica).not.toContainText('Che cosa ha riportato concluso');
      expect(errori).toEqual([]);
    });
  }
});
