import { test, expect } from '@playwright/test';

/*
 * C1 (owner 10/10/2026) — la scheda Processi della colonna destra, sulle decisioni dell'owner (AskUserQuestion):
 *  · CPU e memoria per comando, «misurate da noi, solo a scheda aperta» (`GET …/processes/resources`, ogni 5 s, la seconda dopo 1,5 s);
 *  · Ferma, Sfondo e Togli in un menu «⋯» più il tasto destro; «Togli» resta tolta (evento durevole `talos.processo-tolto`);
 *  · «Ferma tutti» con conferma; i comandi in sfondo nella loro sezione.
 * Scena rigiocata dal browser: il server (4177) non conosce questa sessione. Le richieste che scriverebbero (stop, remove) non
 * arrivano MAI al server: si fermano qui, si contano e si risponde come lui.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const comando = (id, cmd, descrizione) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', giro: 1 },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: cmd, descrizione }) },
];
const SCENA = [
  { type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Prepara la build e lancia i test' } },
  ...comando('p-test', 'npm run test:unit', 'Lancia i test unitari'),
  ...comando('p-dev', 'npm run dev', 'Avvia il server di sviluppo'),
  { type: 'ToolCallResult', toolCallId: 'p-dev', content: 'IN BACKGROUND: the command keeps running.', inSfondo: true, fileSfondo: 'C:/progetto/.talos/sfondo/p-dev.log', sfondoDa: 'modello' },
  ...comando('p-git', 'git status --short', 'Controlla cosa è cambiato'),
  { type: 'ToolCallResult', toolCallId: 'p-git', content: 'exit 0\n M src/app.js', uscita: 0 },
  ...comando('p-build', 'node scripts/build.mjs', 'Ricostruisce il pacchetto'),
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const MISURE = [
  { toolCallId: 'p-test', cpuPercento: 37.5, memoriaByte: 432_013_312, processi: 6 },
  { toolCallId: 'p-dev', cpuPercento: 1.2, memoriaByte: 102_760_448, processi: 3 },
  { toolCallId: 'p-build', cpuPercento: null, memoriaByte: null, processi: null },
];

/* La seconda sessione delle prove della review (Y2): quieta, con un solo comando vivo in sfondo. */
const SCENA_B = [
  { type: 'RunStarted', threadId: 't', runId: 'r-b', input: { consegna: 'Avvia il watcher' } },
  ...comando('p-watch', 'npm run watch', 'Tiene d occhio i file'),
  { type: 'ToolCallResult', toolCallId: 'p-watch', content: 'IN BACKGROUND: the command keeps running.', inSfondo: true, sfondoDa: 'modello' },
  { type: 'RunFinished', threadId: 't', runId: 'r-b' },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const MISURE_B = [{ toolCallId: 'p-watch', cpuPercento: 3.5, memoriaByte: 52_428_800, processi: 2 }];

async function apri(page, { tema = 'dark', larghezza = 1920, altezza = 1080, attesaRisorseA = 0 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const conto = { risorse: 0, risorseB: 0, ferma: [], togli: [], altreScritture: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const b = percorso.match(/^\/api\/v1\/sessions\/sp-processi-b1\/(.+)$/);
    if (b && req.method() === 'GET') {
      if (b[1] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENA_B, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (b[1] === 'processes/resources') { conto.risorseB += 1; conto.tB ??= Date.now(); return route.fulfill({ json: busta({ metodo: 'cim', misuratoAlle: '2026-10-10T10:00:00.000Z', processi: MISURE_B }) }); }
      if (b[1] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    }
    const m = percorso.match(/^\/api\/v1\/sessions\/(sp-processi-a1)\/(.+)$/);
    if (m && req.method() === 'POST') {
      const azione = m[2].match(/^processes\/([^/]+)\/(stop|remove)$/);
      if (azione?.[2] === 'stop') { conto.ferma.push(azione[1]); return route.fulfill({ json: busta({ stopped: true }) }); }
      if (azione?.[2] === 'remove') { conto.togli.push(azione[1]); return route.fulfill({ json: busta({ removed: true }) }); }
    }
    if (req.method() !== 'GET') { conto.altreScritture.push(percorso); return route.abort(); }
    if (m) {
      if (m[2] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENA, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (m[2] === 'processes/resources') {
        conto.risorse += 1;
        if (attesaRisorseA) await new Promise((r) => setTimeout(r, attesaRisorseA));
        conto.tA = Date.now();
        return route.fulfill({ json: busta({ metodo: 'cim', misuratoAlle: '2026-10-10T10:00:00.000Z', processi: MISURE }) });
      }
      if (m[2] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => {
    window.__talosHarnessUiRuntime.passaASessione('sp-processi-a1', 'workspace', 'Scheda dei processi', 'prova/modello', { conclusa: false, modello: 'prova/modello' });
  });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await page.locator('#railTabs [data-rail="processi"]').click();
  await expect(riga(page, 'p-test')).toBeVisible();
  return conto;
}
const riga = (page, id) => page.locator(`#railProcessi .talos-process[data-processo="${id}"]`);
const menu = (page) => page.locator('.ft-actions-menu');
/** Come se il server avesse scritto l'evento: entra dalla stessa porta degli eventi veri. */
async function evento(page, e) {
  await page.evaluate((ev) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ ...ev, _sequenza: 1000 + Math.floor(performance.now()) }, r.realSessionState.generation);
  }, e);
}

test.describe('C1 — la scheda Processi', () => {
  test('C1-PROC-01 — CPU e memoria dei comandi vivi, lette solo a scheda aperta; «—» se il comando non è stato misurato', async ({ page }) => {
    const conto = await apri(page);
    await expect(riga(page, 'p-test').locator('.talos-process__risorse')).toHaveText('CPU 38% · 412 MB', { timeout: 5_000 });
    await expect(riga(page, 'p-dev').locator('.talos-process__risorse')).toHaveText('CPU 1,2% · 98 MB');
    await expect(riga(page, 'p-build').locator('.talos-process__risorse')).toHaveText('CPU —');
    await expect(riga(page, 'p-git').locator('.talos-process__risorse')).toBeHidden();
    await expect.poll(() => conto.risorse, { timeout: 4_000 }).toBeGreaterThanOrEqual(2); // la seconda dopo 1,5 s: la CPU è una differenza
    // ⛔ al contrario: con un'altra scheda aperta non si legge più niente
    await page.locator('#railTabs [data-rail="contesto"]').click();
    await page.waitForTimeout(500);
    const ferme = conto.risorse;
    await page.waitForTimeout(6_000);
    expect(conto.risorse).toBe(ferme);
    // e riaperta, si riparte
    await page.locator('#railTabs [data-rail="processi"]').click();
    await expect.poll(() => conto.risorse, { timeout: 3_000 }).toBeGreaterThan(ferme);
    expect(conto.altreScritture).toEqual([]);
  });

  test('C1-PROC-02 — il «⋯» e il tasto destro aprono la stessa lista; Ferma ferma QUEL comando; Togli toglie e la riga sparisce', async ({ page }) => {
    const conto = await apri(page);
    await riga(page, 'p-test').locator('.talos-process__azioni').click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator('[role="menuitem"]')).toHaveText(['Manda in sfondo', 'Ferma questo comando']);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    // ⛔ col giro VIVO, Esc chiudeva il velo sbagliato: apriva «fermo il giro?» e lasciava il menu aperto
    await expect(page.locator('#veloFermaGiro')).toBeHidden();
    // ⛔ un menu aperto sopra un altro: il vecchio non deve più rubare il fuoco al primo clic che segue
    await riga(page, 'p-test').locator('.talos-process__azioni').click();
    await riga(page, 'p-git').click({ button: 'right' });
    await expect(menu(page)).toHaveCount(1);
    await expect(menu(page).locator('[role="menuitem"]')).toHaveText(["Togli dall'elenco"]);
    await page.locator('#conversation').click({ position: { x: 20, y: 20 } });
    await expect(menu(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('talos-process__azioni'))).toBe(false);
    await riga(page, 'p-build').click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: 'Ferma questo comando' }).click();
    await expect.poll(() => conto.ferma).toEqual(['p-build']);
    await expect(riga(page, 'p-build').locator('.talos-process__avviso-ferma')).toHaveText('Fermo il comando…');
    await riga(page, 'p-git').click({ button: 'right' });
    await expect(menu(page).locator('[role="menuitem"]')).toHaveText(["Togli dall'elenco"]);
    await menu(page).getByRole('menuitem', { name: "Togli dall'elenco" }).click();
    await expect.poll(() => conto.togli).toEqual(['p-git']);
    await expect(riga(page, 'p-git')).toBeVisible(); // resta finché il server non lo scrive
    await evento(page, { type: 'CUSTOM', name: 'talos.processo-tolto', value: { toolCallId: 'p-git', toltoAlle: '2026-10-10T10:01:00.000Z' } });
    await expect(riga(page, 'p-git')).toHaveCount(0);
    expect(conto.altreScritture).toEqual([]);
  });

  test('C1-PROC-03 — la sezione «In sfondo» sopra «Altri comandi»; «Ferma tutti» chiede conferma e ferma i tre vivi', async ({ page }) => {
    const conto = await apri(page);
    const sezione = page.locator('#railProcessi .talos-process-sezione');
    await expect(sezione.locator('.talos-process-sezione__titolo')).toHaveText('In sfondo');
    await expect(sezione.locator('.talos-process')).toHaveCount(1);
    await expect(sezione.locator('.talos-process')).toHaveAttribute('data-processo', 'p-dev');
    await expect(page.locator('#railProcessi > .talos-process-sezione__titolo')).toHaveText('Altri comandi');
    await page.locator('#railProcessi .talos-process-ferma-tutti').click();
    const dialogo = page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'Fermare tutti i comandi?' }).last();
    await expect(dialogo).toContainText('Fermare i 3 comandi in corso adesso?');
    expect(conto.ferma).toEqual([]);
    await dialogo.locator('.talos-button--danger').click();
    await expect.poll(() => [...conto.ferma].sort()).toEqual(['p-build', 'p-dev', 'p-test']);
    expect(conto.altreScritture).toEqual([]);
  });

  test('C1-PROC-04 (review Y2) — una lettura della sessione di prima arriva dopo il cambio: si butta, e la sessione nuova legge la sua', async ({ page }) => {
    const conto = await apri(page, { attesaRisorseA: 2_000 });
    await expect.poll(() => conto.risorse).toBeGreaterThanOrEqual(1); // la lettura di A è in volo per 2 s
    await page.evaluate(() => {
      window.__talosHarnessUiRuntime.passaASessione('sp-processi-b1', 'workspace', 'Seconda sessione', 'prova/modello', { conclusa: false, modello: 'prova/modello' });
    });
    await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
    await expect(riga(page, 'p-watch')).toBeVisible();
    // B è quieta: nessun evento ridisegnerà la colonna. Senza la cura, la lettura di A si butta e nessuno chiede quella di B.
    await expect.poll(() => conto.risorseB, { timeout: 6_000 }).toBeGreaterThanOrEqual(1);
    /* misurato il 10/10: con la cura B legge 3 ms dopo la risposta di A; senza, 1.919 ms dopo, quando un ridisegno qualunque
       capita (e col parcheggio B1 può non capitare mai) */
    expect(conto.tB - conto.tA, 'B reads right after the discarded answer of A').toBeLessThan(500);
    await expect(riga(page, 'p-watch').locator('.talos-process__risorse')).toHaveText('CPU 3,5% · 50 MB');
    await expect(riga(page, 'p-test')).toHaveCount(0); // niente della sessione di prima
    expect(conto.altreScritture).toEqual([]);
  });

  test('C1-PROC-05 (review N3) — arrivando sulla scheda coi tasti freccia, la lettura parte come col clic', async ({ page }) => {
    const conto = await apri(page);
    await page.locator('#railTabs [data-rail="agenti"]').click();
    await page.waitForTimeout(300);
    const ferme = conto.risorse;
    await page.waitForTimeout(6_000);
    expect(conto.risorse).toBe(ferme); // scheda chiusa: niente
    await page.locator('#railTabs [data-rail="agenti"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#railTabs [data-rail="processi"]')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => conto.risorse, { timeout: 3_000 }).toBeGreaterThan(ferme);
  });

  for (const tema of ['light', 'dark']) {
    test(`C1-PROC-FOTO ${tema} — la scheda col menu aperto e la conferma di «Ferma tutti», 1920×1080`, async ({ page }, info) => {
      await apri(page, { tema });
      await expect(riga(page, 'p-test').locator('.talos-process__risorse')).toHaveText(/CPU 38%/u, { timeout: 5_000 });
      const cartella = process.env.TALOS_FOTO_DIR || info.outputPath('');
      await riga(page, 'p-test').locator('.talos-process__azioni').click();
      await expect(menu(page)).toBeVisible();
      await page.screenshot({ path: `${cartella}/c1-processi-menu-${tema}.png` });
      await page.keyboard.press('Escape');
      await page.locator('#railProcessi .talos-process-ferma-tutti').click();
      await expect(page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'Fermare tutti i comandi?' }).last()).toBeVisible();
      await page.screenshot({ path: `${cartella}/c1-processi-ferma-tutti-${tema}.png` });
    });
  }
});
