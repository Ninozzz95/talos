import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { avviaSessione } from '../../../src/agent-service.mjs';
import { talosLavora } from '../../../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * D4 (collaudo del treno, 02/11/2026; decisione 35 dell'owner con la domanda modificabile): dalla chat la ricerca approfondita chiede
 * sempre una carta, anche in Accesso pieno, con domanda modificabile, profondità e costo, Avvia e Annulla. Server vero (registro, nucleo,
 * rotta della risposta); finto solo il modello e l'avvio della ricerca.
 */
test.use({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });

const sse = (pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
const delta = (d, finish = null) => ({ id: 'c', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });
const DOMANDA = 'Come gestiscono le approvazioni Hermes e Codex?';

async function banco({ permessi = 'Full access' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-d4-'));
  const avviate = [];
  let turno = 0;
  const registry = createSessionRegistry({ cartellaStore: join(root, 'sessions'), modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (id) => ({ cartella: root, task: { id, consegna: 'Fammi una ricerca sulle approvazioni.' }, comandoProva: null }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, cartella: root, contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: (args) => { let n = 0; turno += 1; const delTurno = turno; return talosLavora({ ...args, _giriMassimiInterno: 4, ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }),
        strumentiEstesi: [...(args.strumentiEstesi ?? []), 'research_start'], ricercaDavanti: true,
        onRicercaAvvia: async (a) => { avviate.push(a); return { ok: true, esito: 'The research is underway.' }; },
        fetchDiRete: async () => {
          n += 1;
          if (n > 1) return sse([delta({ role: 'assistant', content: 'Fatto.' }), delta({}, 'stop')]);
          return sse([delta({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `ric${delTurno}`, type: 'function', function: { name: 'research_start', arguments: '' } }] }),
            delta({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ question: DOMANDA, depth: 'quick' }) } }] }), delta({}, 'tool_calls')]);
        } }); } }) });
  const { sessionId } = registry.avvia('fixture', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: createStaticHandler(fileURLToPath(new URL('../../dist/', import.meta.url))), token: 'd4', sessionRegistry: registry });
  const server = createServer(async (req, res) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/sessions')) return app(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"data":{}}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { avviate, registry, sessionId, base: `http://127.0.0.1:${server.address().port}`,
    async chiudi() { server.closeAllConnections(); await new Promise((r) => server.close(r)); await registry.chiudi(); await rimuoviCartellaDiProvaAttesa(root).catch(() => {}); } };
}
async function vaiA(page, b) {
  const m = b.registry.elenca().find((r) => r.sessionId === b.sessionId);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s), m);
}
async function apri(page, b, { tema = 'light', lingua = 'en' } = {}) {
  await page.context().addCookies([{ name: 'talos_token', value: 'd4', url: b.base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(([t, l]) => { if (window !== window.top) return; localStorage.setItem('talos.harness.desktop.barra.gruppi.v1', '{"lavoro":true}'); localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: t, uiLanguage: l, interfaceMotion: false } })); }, [tema, lingua]);
  await page.goto(b.base); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await vaiA(page, b);
}
const carta = (page) => page.locator('.real-approval-card');

for (const [tema, lingua, avvia, annulla, frase, nota] of [
  ['light', 'en', 'Start', 'Cancel', /Depth: quick\. Estimated cost: searches ~2, pages ~10, tokens ~\d+k, time ~\d+ min\./u, 'This card shows up even with Full access.'],
  ['dark', 'it', 'Avvia', 'Annulla', /Profondità: rapida\. Costo stimato: ricerche ~2, pagine ~10, token ~\d+k, tempo ~\d+ min\./u, 'Questa carta esce anche con l’Accesso pieno.'],
]) {
  test(`D4-CARTA-${tema}: in Accesso pieno domanda modificabile, profondità e costo, Avvia e Annulla; la domanda corretta è quella che parte`, async ({ page }) => {
    test.setTimeout(45_000);
    const b = await banco();
    try {
      await apri(page, b, { tema, lingua });
      await expect(carta(page)).toBeVisible({ timeout: 15_000 });
      const area = carta(page).locator('.talos-approval__domanda textarea');
      await expect(area).toHaveValue(DOMANDA);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText(frase);
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText(nota);
      await expect(carta(page).locator('[data-approva-una-volta]')).toHaveText(avvia);
      await expect(carta(page).locator('[data-nega]')).toHaveText(annulla);
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveCount(2); // niente «Per questa sessione»
      await page.mouse.move(1900, 1070);
      await page.screenshot({ path: test.info().outputPath(`d4-${tema}.png`) });
      expect(b.avviate).toEqual([]); // finché la persona non dice sì non parte niente
      await area.fill('');
      await expect(carta(page).locator('[data-approva-una-volta]')).toBeDisabled(); // una domanda vuota non si avvia
      await area.fill('Solo Hermes e Codex');
      await carta(page).locator('[data-approva-una-volta]').click();
      await expect(carta(page).locator('.talos-approval__esito')).toBeVisible();
      await expect(area).toHaveAttribute('readonly', '');
      await expect.poll(() => b.avviate).toEqual([{ question: 'Solo Hermes e Codex', depth: 'quick' }]);
      await expect(page.locator('#conversation')).toContainText('Fatto.', { timeout: 10_000 });
      await expect(page.locator('#conversation .talos-tool-row__name').filter({ hasText: 'Solo Hermes e Codex' })).toHaveCount(1); // la riga dice ciò che è partito
      await page.screenshot({ path: test.info().outputPath(`d4-${tema}-avviata.png`) });
      await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
      await vaiA(page, b);
      await expect(carta(page).locator('.talos-approval__domanda textarea')).toHaveValue('Solo Hermes e Codex'); // anche alla riapertura
      await expect(page.locator('#conversation .talos-tool-row__name').filter({ hasText: 'Solo Hermes e Codex' })).toHaveCount(1);
    } finally { await b.chiudi(); }
  });
}

test('D4-CHIEDE-PRIMA: con «Chiede prima» una carta sola, senza «Per questa sessione»', async ({ page }) => {
  test.setTimeout(45_000);
  const b = await banco({ permessi: 'On request' });
  try {
    await apri(page, b);
    await expect(carta(page)).toBeVisible({ timeout: 15_000 });
    await expect(carta(page).locator('[data-approva-una-volta]')).toHaveText('Start');
    await expect(carta(page).locator('.talos-approval__foot button')).toHaveCount(2);
    await carta(page).locator('[data-approva-una-volta]').click();
    await expect.poll(() => b.avviate.length).toBe(1);
    await expect(carta(page)).toHaveCount(1);
  } finally { await b.chiudi(); }
});

test('D4-RIAPERTURA: ricaricando con la carta aperta la carta torna e funziona; a cose fatte è di sola lettura', async ({ page }) => {
  test.setTimeout(45_000);
  const b = await banco();
  try {
    await apri(page, b);
    await expect(carta(page)).toBeVisible({ timeout: 15_000 });
    await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
    await vaiA(page, b);
    await expect(carta(page)).toBeVisible({ timeout: 10_000 });
    await expect(carta(page).locator('.talos-approval__domanda textarea')).toHaveValue(DOMANDA);
    await carta(page).locator('[data-approva-una-volta]').click(); // senza cambiare niente
    await expect.poll(() => b.avviate).toEqual([{ question: DOMANDA, depth: 'quick' }]);
    await expect(page.locator('#conversation')).toContainText('Fatto.', { timeout: 10_000 });
    await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
    await vaiA(page, b);
    await expect(carta(page).locator('.talos-approval__esito')).toBeVisible({ timeout: 10_000 });
    await expect(carta(page).locator('.talos-approval__domanda textarea')).toHaveAttribute('readonly', '');
  } finally { await b.chiudi(); }
});

test('D4-UNA-PER-RICERCA: Annulla non avvia niente, e la ricerca dopo ha la sua carta', async ({ page }) => {
  test.setTimeout(45_000);
  const b = await banco();
  try {
    await apri(page, b);
    await expect(carta(page)).toBeVisible({ timeout: 15_000 });
    await carta(page).locator('[data-nega]').click();
    await expect(page.locator('#conversation')).toContainText('Fatto.', { timeout: 10_000 });
    expect(b.avviate).toEqual([]);
    await page.locator('#composerInput').fill('Falla adesso');
    await page.locator('#composerInput').press('Enter');
    await expect(carta(page)).toHaveCount(2, { timeout: 15_000 });
    await carta(page).last().locator('[data-approva-una-volta]').click();
    await expect.poll(() => b.avviate.length).toBe(1);
    await expect(carta(page)).toHaveCount(2);
  } finally { await b.chiudi(); }
});
