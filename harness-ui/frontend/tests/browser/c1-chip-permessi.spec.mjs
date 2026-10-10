import { test, expect } from '@playwright/test';

/*
 * C1 (owner 10/10/2026, AskUserQuestion «Elenco corto, come Cline») — il chip «Permessi» del compositore dice cosa passa senza
 * chiedere; la politica, ciò che chiede sempre e gli attrezzi spenti stanno nel suggerimento. Il clic apre la modale di oggi.
 * Scene aperte dal browser con le impostazioni della sessione (`passaASessione`, come all'apertura vera): il server (4177) non
 * conosce queste sessioni, e ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const chip = (page) => page.locator('#schermoChat .talos-chat-foot [data-open-sheet="permissions"]');

async function apri(page, { tema = 'dark' } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const conto = { nonGet: [], appesi: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(percorso); return route.abort(); }
    /* ⛔ vista nelle foto: un corpo SSE che finisce subito è, per un EventSource, una CHIUSURA — la app segnava la rete caduta
       («Collegato di nuovo» due volte) e la scena restava su «Apro la cronologia…». Un flusso vivo che non ha ancora niente da
       dire è una richiesta che resta APPESA (la lezione di browser-p0, 16/09); il confine della rigiocata lo consegna `scena`. */
    if (/^\/api\/v1\/sessions\/cp-[a-z0-9-]+\/events$/.test(percorso)) { conto.appesi.push(route); return undefined; }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return conto;
}
async function scena(page, id, permessi, permessiPerAttrezzo = null) {
  await page.evaluate(({ id, permessi, permessiPerAttrezzo, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Chip dei permessi', 'prova/modello', { conclusa: true, modello: 'prova/modello', permessi, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}) });
    r.handleRealEvent({ ...confine, _sequenza: 1 }, r.realSessionState.generation); // la storia (vuota) è finita: il flusso resta aperto
  }, { id, permessi, permessiPerAttrezzo, confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
}

test.describe('C1 — il chip dei Permessi', () => {
  test('C1-CHIP-01 — ogni politica dice cosa passa senza chiedere; eccezioni e spenti entrano; la politica sta nel suggerimento', async ({ page }) => {
    const conto = await apri(page);
    await scena(page, 'cp-ww', 'Workspace write');
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, comandi, documenti');
    await expect(chip(page)).toHaveAttribute('title', 'Permesso: Scrive nel progetto\nChiede sempre: scritture fuori dal progetto, file con segreti, azioni dopo un contenuto sospetto\nCambia il permesso');
    /* ⛔ visto nella prima foto: a 220 px il testo si tagliava e la scala riduceva il chip allo scudo anche a 1920, con 400 px
       vuoti nella barra. A 1920 la scala resta a 0 e l'etichetta si legge intera. */
    await page.evaluate(() => window.__talosHarnessUiRuntime.adattaScalaComposer());
    const misura = await chip(page).locator('.talos-chip__label').evaluate((l) => ({ scala: l.closest('.talos-composer__bar').dataset.scala ?? '0', tagliata: l.scrollWidth > l.clientWidth + 1 }));
    expect(misura).toEqual({ scala: '0', tagliata: false });
    await scena(page, 'cp-fa', 'Full access');
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: tutto');
    await scena(page, 'cp-or', 'On request', { shell: 'sempre' });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: comandi (tranne i test)');
    await scena(page, 'cp-or2', 'On request');
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Chiede tutto');
    await scena(page, 'cp-ro', 'Read only');
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Solo lettura');
    await scena(page, 'cp-nega', 'Workspace write', { shell: 'nega', prova: 'nega' });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, documenti');
    await expect(chip(page)).toHaveAttribute('title', /Spenti: comandi/u);
    // review Y2 (owner 10/10): un gruppo a metà si scrive col nome della parte
    await scena(page, 'cp-meta', 'Full access', { shell: 'chiedi' });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, comandi (solo test), documenti');
    /* ⛔ vista nella foto, non da `toHaveText` (che legge anche un testo nascosto): con la parte nel nome l'etichetta superava il
       tetto di 340 px, la scala saltava allo stadio 2 e il chip diventava lo scudo a 1920. Il permesso deve leggersi intero; a
       cedere per primo è «Terminale» (stadio 1). */
    await page.evaluate(() => window.__talosHarnessUiRuntime.adattaScalaComposer());
    const lunga = await chip(page).locator('.talos-chip__label').evaluate((l) => ({ scala: Number(l.closest('.talos-composer__bar').dataset.scala ?? 0), tagliata: l.scrollWidth > l.clientWidth + 1, visibile: l.getClientRects().length > 0 && getComputedStyle(l).position !== 'absolute' }));
    expect(lunga.scala).toBeLessThanOrEqual(1);
    expect(lunga).toMatchObject({ tagliata: false, visibile: true });
    // review Y1 (owner 10/10): in Piano il cancello nega tutto tranne le letture, e il chip lo dice; uscendo, torna com'era
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'piano' }, _sequenza: 900 }, r.realSessionState.generation);
    });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Piano: solo lettura');
    await expect(chip(page)).toHaveAttribute('title', 'Permesso: Accesso pieno\nTorna attivo quando esci dal Piano\nCambia il permesso');
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'normale' }, _sequenza: 901 }, r.realSessionState.generation);
    });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, comandi (solo test), documenti');
    // il clic apre la modale di oggi
    await chip(page).click();
    await expect(page.getByRole('dialog', { name: 'Quanto può fare TALOS qui' })).toBeVisible();
    expect(conto.nonGet).toEqual([]);
  });

  /* review delta Y (bugfixer, facoltativo): l'etichetta parziale più LUNGA attraverso le larghezze. Le viste strette si provano sul
     DOM, senza foto (owner 29/09: foto mai sotto 1920). Mai tagliata; e se la barra deve cedere, «Terminale» cede prima del permesso. */
  test('C1-CHIP-02 — the longest partial label is never cut, and «Terminale» yields before the permission', async ({ page }) => {
    const conto = await apri(page);
    await scena(page, 'cp-lunga', 'Workspace write', { scrivi: 'chiedi', shell: 'chiedi', generate_image: 'chiedi' });
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file (solo modifiche), comandi (solo test), documenti (solo testi)');
    for (const larghezza of [1024, 1440, 1920]) {
      await page.setViewportSize({ width: larghezza, height: 1080 });
      await page.evaluate(() => window.__talosHarnessUiRuntime.adattaScalaComposer());
      const m = await chip(page).locator('.talos-chip__label').evaluate((l) => {
        const barra = l.closest('.talos-composer__bar');
        const scala = Number(barra.dataset.scala ?? 0);
        const terminale = barra.querySelector('#pillTerminale .talos-chip__label');
        const visibile = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).position !== 'absolute';
        return { scala, tagliata: visibile(l) && l.scrollWidth > l.clientWidth + 1, permessoIntero: visibile(l), terminaleIntero: visibile(terminale) };
      });
      expect(m.tagliata, `${larghezza}: never cut`).toBe(false);
      // il permesso intero con «Terminale» ridotto, mai il contrario
      if (m.terminaleIntero) expect(m.permessoIntero, `${larghezza}: Terminale whole implies permission whole`).toBe(true);
    }
    expect(conto.nonGet).toEqual([]);
  });

  for (const tema of ['light', 'dark']) {
    test(`C1-CHIP-FOTO ${tema} — il compositore con il chip, 1920×1080`, async ({ page }, info) => {
      await apri(page, { tema });
      await scena(page, `cp-foto-${tema}`, 'Workspace write');
      await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, comandi, documenti');
      const cartella = process.env.TALOS_FOTO_DIR || info.outputPath('');
      await page.screenshot({ path: `${cartella}/c1-chip-permessi-${tema}.png` });
      await scena(page, `cp-foto-fa-${tema}`, 'Full access', { shell: 'chiedi' });
      await expect(chip(page).locator('.talos-chip__label')).toHaveText('Senza chiedere: file, comandi (solo test), documenti');
      await page.screenshot({ path: `${cartella}/c1-chip-permessi-pieno-${tema}.png` });
    });
  }
});
