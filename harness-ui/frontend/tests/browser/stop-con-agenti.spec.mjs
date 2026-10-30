import { test, expect } from '@playwright/test';

/*
 * Owner 29/10/2026 sera: «se fermo la chat i sub agenti non si fermano, bisogna mettere un avviso se stoppare solo la chat o anche i
 * sub agenti». Bozzetto approvato («Sì, procedi»), contratto CONTRATTO-FERMA-TUTTE-2026-10-29:
 *  · con figlie al lavoro lo Stop apre un piccolo menu sopra di sé — «Ferma tutto» in evidenza, «Ferma solo la chat», «Ricorda la scelta»;
 *  · senza figlie al lavoro lo Stop resta immediato e il corpo è quello di sempre (nessun campo nuovo);
 *  · Esc chiede le stesse due cose nel velo «Fermo il giro?»;
 *  · l'evento durevole `talos.figlie-fermate` mette in chat «Fermati anche N agenti».
 * Scena rigiocata dal browser: le richieste che scriverebbero (lo stop) non arrivano MAI al server: si fermano qui e si contano.
 */
const SESSIONE = 'sp-stop-agenti-a1';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const SCENA = [
  { type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Dividi il lavoro fra due agenti' } },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const figlia = (sessionId, taskCorto, conclusa) => ({ sessionId, task: `Compito: ${taskCorto}`, taskCorto, conclusa, interrotta: false,
  avviataAlle: new Date().toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', collisioni: [], esitoDelega: conclusa ? 'concluso' : null,
  attivita: { file: [], fileTagliati: 0, attrezzoCorrente: conclusa ? null : 'leggi', chiamate: 1, passi: [], passiTagliati: 0 } });
const AL_LAVORO = [figlia('sp-f1', 'leggi il registro', false), figlia('sp-f2', 'controlla i test', false), figlia('sp-f3', 'riassumi', true)];
const FINITE = [figlia('sp-f3', 'riassumi', true)];

async function apri(page, { tema = 'light', figli = AL_LAVORO, preferenza = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, preferenza }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it', ...(preferenza ? { stopWithAgents: preferenza } : {}) } }));
  }, { colorMode: tema, preferenza });
  const conto = { stop: [], altreScritture: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const m = percorso.match(new RegExp(`^/api/v1/sessions/${SESSIONE}/(.+)$`));
    if (m && req.method() === 'POST' && m[1] === 'stop') {
      conto.stop.push(req.postDataJSON());
      return route.fulfill({ json: busta({ stopped: true }) });
    }
    if (req.method() !== 'GET') { conto.altreScritture.push(percorso); return route.abort(); }
    if (m) {
      if (m[1] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENA, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (m[1] === 'children') return route.fulfill({ json: busta({ figli }) });
      if (m[1] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Stop con agenti', 'prova/modello', { conclusa: false, modello: 'prova/modello' });
  }, SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('.send-btn.is-stop')).toBeVisible();
  // la conversazione davvero a schermo: finché c'è «Apro la cronologia…» la chat è coperta e una foto non prova niente
  await expect(page.locator('.talos-caricamento-cronologia')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  // la lista delle figlie arriva da `/children` come per il pannello Agenti
  await expect.poll(() => page.evaluate(() => (window.__talosHarnessUiRuntime.realSessionState.figli || []).length)).toBe(figli.length);
  return conto;
}
const menu = (page) => page.locator('#menuStop');
const fotoDi = (nome) => `artifacts/stop-con-agenti/${nome}.png`;

test.describe('Stop con sotto-agenti al lavoro', () => {
  test('STOP-AG-01 con 2 agenti al lavoro lo Stop apre il menu sopra di sé; Esc lo chiude senza fermare niente', async ({ page }) => {
    const conto = await apri(page);
    await page.locator('.send-btn').click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toContainText('2 agenti stanno ancora lavorando');
    await expect(menu(page).locator('[role="menuitem"]')).toHaveCount(2);
    await expect(menu(page).locator('[role="menuitem"]').first()).toContainText('Ferma tutto');
    await expect(menu(page).locator('[role="menuitem"]').first()).toContainText('La chat e 2 agenti');
    await expect(menu(page).locator('.talos-context-menu__ricorda')).toContainText('Ricorda la scelta');
    // il menu sta SOPRA il compositore (non copre ciò che vi è scritto), col bordo destro su quello dello Stop, dentro la finestra
    const [m, s, c] = await Promise.all([menu(page).boundingBox(), page.locator('.send-btn').boundingBox(), page.locator('#composerForm').boundingBox()]);
    expect(m.y + m.height).toBeLessThanOrEqual(c.y + 1);
    expect(Math.abs((m.x + m.width) - (s.x + s.width))).toBeLessThanOrEqual(2);
    expect(m.x).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: fotoDi('menu-chiaro') });
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(page.locator('#veloFermaGiro')).toBeHidden(); // Esc chiude il menu, non apre «Fermo il giro?»
    await page.waitForTimeout(200);
    expect(conto.stop).toEqual([]);
    expect(conto.altreScritture).toEqual([]);
  });

  test('STOP-AG-02 «Ferma tutto» manda figlie:\'tutte\'', async ({ page }) => {
    const conto = await apri(page, { tema: 'dark' });
    await page.locator('.send-btn').click();
    await expect(menu(page)).toBeVisible();
    await page.screenshot({ path: fotoDi('menu-scuro') });
    await menu(page).locator('[role="menuitem"]').first().click();
    await expect.poll(() => conto.stop).toEqual([{ figlie: 'tutte' }]);
    await expect(menu(page)).toBeHidden();
  });

  test('STOP-AG-03 «Ricorda» + «Ferma solo la chat»: la volta dopo niente menu, e la scelta si vede nelle Impostazioni', async ({ page }) => {
    const conto = await apri(page);
    await page.locator('.send-btn').click();
    await menu(page).locator('.talos-context-menu__ricorda input').check();
    await menu(page).locator('[role="menuitem"]').nth(1).click();
    await expect.poll(() => conto.stop).toEqual([{ figlie: 'nessuna' }]);
    await expect(page.locator('.talos-toast, [role="status"]').filter({ hasText: '2 agenti continuano a lavorare' }).first()).toBeVisible();
    const salvata = await page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1') || '{}')?.appearance?.stopWithAgents);
    expect(salvata).toBe('solo-chat');
    await page.locator('.send-btn').click();
    await expect.poll(() => conto.stop).toEqual([{ figlie: 'nessuna' }, { figlie: 'nessuna' }]);
    await expect(menu(page)).toBeHidden();
    expect(await page.locator('#stopWithAgentsSelect').inputValue()).toBe('solo-chat');
  });

  test('STOP-AG-04 AL CONTRARIO: senza agenti al lavoro lo Stop è immediato e il corpo è quello di sempre', async ({ page }) => {
    const conto = await apri(page, { figli: FINITE });
    await page.locator('.send-btn').click();
    await expect.poll(() => conto.stop).toEqual([{}]);
    await expect(menu(page)).toBeHidden();
  });

  test('STOP-AG-05 la scelta ricordata «Ferma tutto» salta il menu', async ({ page }) => {
    const conto = await apri(page, { preferenza: 'tutte' });
    await page.locator('.send-btn').click();
    await expect.poll(() => conto.stop).toEqual([{ figlie: 'tutte' }]);
    await expect(menu(page)).toBeHidden();
  });

  test('STOP-AG-06 Esc con agenti al lavoro: il velo offre le due scelte al posto di «Ferma il giro»', async ({ page }) => {
    const conto = await apri(page);
    await page.locator('#conversation').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Escape');
    const velo = page.locator('#veloFermaGiro');
    await expect(velo).toBeVisible();
    await expect(velo.locator('#fermaGiroAgenti')).toHaveText('2 agenti stanno ancora lavorando');
    await expect(velo.locator('#fermaGiroConferma')).toBeHidden();
    await expect(velo.locator('#fermaGiroTutto')).toBeVisible();
    await expect(velo.locator('#fermaGiroSoloChat')).toBeVisible();
    await page.screenshot({ path: fotoDi('esc-chiaro') });
    await velo.locator('#fermaGiroTutto').click();
    await expect.poll(() => conto.stop).toEqual([{ figlie: 'tutte' }]);
  });

  test('STOP-AG-07 AL CONTRARIO: Esc senza agenti al lavoro resta il velo di sempre, con «Ferma il giro» e il corpo di sempre', async ({ page }) => {
    const conto = await apri(page, { figli: FINITE });
    await page.locator('#conversation').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Escape');
    const velo = page.locator('#veloFermaGiro');
    await expect(velo).toBeVisible();
    await expect(velo.locator('#fermaGiroAgenti')).toBeHidden();
    await expect(velo.locator('#fermaGiroTutto')).toBeHidden();
    await velo.locator('#fermaGiroConferma').click();
    await expect.poll(() => conto.stop).toEqual([{}]);
  });

  /* 29/10/2026 sera (trovato dal Mobile, cura c5b88e5a2): quando li ferma il MODELLO il suo giro continua, quindi niente «anche» */
  test('STOP-AG-08 l\'evento talos.figlie-fermate mette in chat «Fermati anche N agenti»; da modello senza «anche» e lo dice', async ({ page }) => {
    await apri(page);
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.figlie-fermate', value: { quante: 2, ids: ['sp-f1', 'sp-f2'], da: 'persona' }, _sequenza: 50 }, r.realSessionState.generation);
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.figlie-fermate', value: { quante: 1, ids: ['sp-f1'], da: 'modello' }, _sequenza: 51 }, r.realSessionState.generation);
    });
    const conv = page.locator('#conversation');
    await expect(conv.getByText('Fermati anche 2 agenti')).toBeVisible();
    await expect(conv.getByText('Fermato 1 agente', { exact: true })).toBeVisible();
    await expect(conv).toContainText('Fermati anche 2 agenti');
    await expect(conv).toContainText('I loro risultati restano in coda e partono col tuo prossimo messaggio');
    await expect(conv).not.toContainText('Fermato anche 1 agente');
    await expect(conv).toContainText('Fermati dal modello su richiesta');
    await page.screenshot({ path: fotoDi('riga-in-chat-chiaro') });
  });
});

test('STOP-AG-09 la carta del permesso dice cosa e quanti: «tutti i sotto-agenti» con childId "all", «un sotto-agente» col singolo', async ({ page }) => {
  await apri(page);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'ft-req-1', azione: { tipo: 'stop_child', childId: 'all', toolCallId: 'c1' }, _sequenza: 60 }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'ft-req-2', azione: { tipo: 'pause_child', childId: 'sp-f1', toolCallId: 'c2' }, _sequenza: 61 }, r.realSessionState.generation);
  });
  const carte = page.locator('#conversation [data-c="ApprovalCard"]');
  await expect(carte).toHaveCount(2);
  await expect(carte.nth(0)).toContainText('Vuole fermare tutti i sotto-agenti al lavoro');
  await expect(carte.nth(1)).toContainText('Vuole mettere in pausa un sotto-agente');
  await expect(carte.nth(0)).not.toContainText('modifica qualcosa');
  await page.screenshot({ path: fotoDi('carta-tutti-chiaro') });
});
