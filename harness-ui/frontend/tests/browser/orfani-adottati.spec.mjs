import { test, expect } from '@playwright/test';

/*
 * Owner 17/10/2026 («Adottarli come Hermes, con "Ferma"») — un comando in sottofondo sopravvissuto a una morte di colpo del server,
 *   ripreso dal server di adesso (`talos.sfondo-adottato`, durevole): la riga dei Processi torna «In sfondo» con «Ferma questo comando»
 *   invece di «Non più seguito». Scena rigiocata dal browser; ogni scrittura si ferma qui e si conta (lo stop risponde come il server).
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const scena = (adottato) => [
  { type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Avvia il server di sviluppo' } },
  { type: 'ToolCallStart', toolCallId: 'p-orf', toolCallName: 'shell', giro: 1 },
  { type: 'ToolCallArgs', toolCallId: 'p-orf', delta: JSON.stringify({ comando: 'sleep 600', descrizione: 'Aspetta dieci minuti' }) },
  { type: 'ToolCallResult', toolCallId: 'p-orf', content: 'IN BACKGROUND: started in the background on request.', inSfondo: true, sfondoDa: 'modello' },
  { type: 'CUSTOM', name: 'talos.sfondo-impronta', value: { toolCallId: 'p-orf', pid: 4242, gruppo: 4242, impronta: 'proc:b:1', ospite: { pid: 111, impronta: 'proc:b:2' } } },
  { type: 'RunFinished', threadId: 't', runId: 'r-1' },
  // ── fin qui il server di PRIMA (sequenzaAlRipristino: 6); poi il server di adesso
  ...(adottato ? [{ type: 'CUSTOM', name: 'talos.sfondo-adottato', value: { toolCallId: 'p-orf', pid: 4242, membri: [4242], ospite: { pid: 222, impronta: 'proc:b:3' } } }] : []),
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SESSIONI = { 'sp-orfani-a': scena(true), 'sp-orfani-b': scena(false) };

async function apri(page, id, { tema = 'dark' } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const conto = { ferma: [], altreScritture: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const m = percorso.match(/^\/api\/v1\/sessions\/(sp-orfani-[ab])\/(.+)$/);
    if (m && req.method() === 'POST') {
      const azione = m[2].match(/^processes\/([^/]+)\/stop$/);
      if (azione) { conto.ferma.push(azione[1]); return route.fulfill({ json: busta({ stopped: true }) }); }
    }
    if (req.method() !== 'GET') { conto.altreScritture.push(percorso); return route.abort(); }
    if (percorso === '/api/v1/sessions') {
      return route.fulfill({ json: busta({ items: Object.keys(SESSIONI).map((sessionId) => ({ sessionId, nome: `Orfani ${sessionId.at(-1)}`, conclusa: false, interrotta: true,
        sequenzaAlRipristino: 6, avviataAlle: '2026-10-17T08:00:00.000Z' })) }) });
    }
    if (m) {
      if (m[2] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SESSIONI[m[1]], CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (m[2] === 'processes/resources') return route.fulfill({ json: busta({ metodo: 'proc', misuratoAlle: '2026-10-17T10:00:00.000Z', processi: [{ toolCallId: 'p-orf', cpuPercento: 0, memoriaByte: 1_048_576, processi: 1 }] }) });
      if (m[2] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  // la riga della sessione (con `sequenzaAlRipristino`) deve essere nell'elenco PRIMA dell'apertura: è da lì che la colonna lo legge
  await expect(page.getByText(`Orfani ${id.at(-1)}`, { exact: true }).first()).toBeAttached({ timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Orfani', 'prova/modello', { conclusa: false, interrotta: true, modello: 'prova/modello' }), id);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await page.locator('#railTabs [data-rail="processi"]').click();
  await page.locator('#railProcessi [data-controllo="ambito-tutti"]').click(); // v2: un comando non più seguito sta fra i finiti, l'ambito di serie mostra gli accesi
  await expect(riga(page)).toBeVisible();
  return conto;
}
/* pannello v2 (29/10/2026): la riga è `.pn-riga` con la chiave del comando; lo stato in `data-stato` e nella parola del segno */
const riga = (page) => page.locator('#railProcessi .pn-riga[data-chiave="p-orf"]');
const menu = (page) => page.locator('.ft-actions-menu');
async function evento(page, e) {
  await page.evaluate((ev) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ ...ev, _sequenza: 1000 + Math.floor(performance.now()) }, r.realSessionState.generation); }, e);
}

test.describe('Orfani ripresi — la scheda Processi', () => {
  test('ORF-UI-B01 — ripreso dal server di adesso: «In sfondo» con «Ferma questo comando», e «Ferma» chiede lo stop di QUEL comando', async ({ page }) => {
    const conto = await apri(page, 'sp-orfani-a');
    await expect(riga(page)).toHaveAttribute('data-stato', 'in-sfondo');
    await expect(riga(page).locator('.pn-segno')).toHaveAttribute('aria-label', 'In sfondo');
    await riga(page).click({ button: 'right' });
    await expect(menu(page).locator('[role="menuitem"]')).toHaveText(["Mostra l'uscita", 'Ferma']);
    await menu(page).getByRole('menuitem', { name: 'Ferma', exact: true }).click();
    await expect.poll(() => conto.ferma).toEqual(['p-orf']);
    await evento(page, { type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'p-orf', esito: 'terminato', codice: null, segnale: 'SIGTERM', finitoAlle: '2026-10-17T10:01:00.000Z', fermatoDallaPersona: true, comando: 'sleep 600' } });
    await expect(riga(page)).toHaveAttribute('data-stato', 'annullato');
    expect(conto.altreScritture).toEqual([]);
  });

  test('ORF-UI-B02 — AL CONTRARIO: senza adozione resta «Non più seguito», e il menu non offre «Ferma»', async ({ page }) => {
    const conto = await apri(page, 'sp-orfani-b');
    await page.locator('#railProcessi [data-controllo="ambito-tutti"]').click(); // v2: un comando non più seguito sta fra i finiti
    await expect(riga(page)).toHaveAttribute('data-stato', 'perso');
    await expect(riga(page)).toContainText('Non più seguito');
    await riga(page).click({ button: 'right' });
    await expect(menu(page).locator('[role="menuitem"]')).toHaveText(["Mostra l'uscita", "Togli dall'elenco"]);
    expect(conto.ferma).toEqual([]);
  });

  test('ORF-UI-B03 — il ripreso uscito da solo dice «Finito (esito non noto)»; foto in tema scuro e chiaro', async ({ page }, info) => {
    for (const tema of ['dark', 'light']) {
      await apri(page, 'sp-orfani-a', { tema });
      await riga(page).click(); // v2: la riga si apre sul posto
      const dettaglio = riga(page).locator('.pn-dettaglio');
      await expect(dettaglio).toBeVisible();
      await expect(dettaglio).toContainText('Ripreso dopo un riavvio');
      await expect(dettaglio).toContainText('4242');
      await page.locator('#railProcessi').screenshot({ path: info.outputPath(`orfano-ripreso-${tema}.png`) });
      await evento(page, { type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'p-orf', esito: 'terminato', codice: null, segnale: null, finitoAlle: '2026-10-17T10:01:00.000Z', esitoIgnoto: true } });
      await page.locator('#railProcessi [data-controllo="ambito-tutti"]').click();
      await expect(riga(page)).toHaveAttribute('data-stato', 'finito-ignoto');
      await expect(riga(page)).toContainText('Finito (esito non noto)');
      await page.locator('#railProcessi').screenshot({ path: info.outputPath(`orfano-finito-${tema}.png`) });
    }
  });
});
