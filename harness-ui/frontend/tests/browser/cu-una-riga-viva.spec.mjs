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
 * Giro 6 della bolla (owner 14/11 15:46, giudice v1884; ROSSO della prova dal vivo, punto 4): nella chat durante un compito del computer use si vedevano DUE
 *   righe «Uso del computer…» per lo stesso compito (la testa del gruppo e la riga viva sotto la carta, D20), oppure UNA sola ma coperta a metà dalla domanda
 *   ferma in cima (dopo le carte del computer use, che sono domande e non consensi, la riga viva D20 non tornava). Qui un server vero (registro, nucleo,
 *   flusso del modello finto) con un ospite del computer use finto che fa una carta e poi lavora: si guarda ciò che la persona vede.
 */
test.use({ viewport: { width: 1920, height: 1080 } });

const sse = (pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
const delta = (d, finish = null) => ({ id: 'c', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });
const COMPITO = 'Premi il pulsante Conferma prova nella finestra TALOS-PROVA-CTRL3.';

async function banco({ lavoro = 20_000 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-cu-riga-'));
  let turno = 0;
  const chiamata = (id, nome, argomenti) => sse([delta({ role: 'assistant', content: null, tool_calls: [{ index: 0, id, type: 'function', function: { name: nome, arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(argomenti) } }] }), delta({}, 'tool_calls')]);
  /* l'ospite finto: la carta del computer use sul canale delle domande (come `attrezzo.mjs`), poi il lavoro sullo schermo che dura */
  const ospiteComputerUseFn = async (_nome, _argomenti, { sessione, segnale }) => {
    await sessione.chiediDomanda([{ id: 'computer_use', header: 'TALOS', question: `TALOS wants to use this computer for: "${COMPITO}"`, multiSelect: false,
      options: [{ label: 'Consenti', description: 'Allow' }, { label: 'Ferma', description: 'Stop' }] }]);
    await new Promise((r) => { const t = setTimeout(r, lavoro); segnale?.addEventListener?.('abort', () => { clearTimeout(t); r(); }, { once: true }); });
    return { ok: true, testo: 'Computer use done: pressed the button.' };
  };
  const registry = createSessionRegistry({ cartellaStore: join(root, 'sessions'), modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {},
    ospiteComputerUseFn, computerUseAccesoFn: () => true,
    preparaEsecuzioneFn: (id) => ({ cartella: root, task: { id, consegna: COMPITO } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, cartella: root,
      contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: (args) => { let n = 0; turno += 1; const delTurno = turno; return talosLavora({ ...args,
        /* il computer use si offre al modello solo con l'attrezzo fra gli estesi e un modello che vede le immagini (`talosHarness.mjs`, `vedeLoSchermo`) */
        strumentiEstesi: [...new Set([...(args.strumentiEstesi ?? []), 'computer_use'])], vedeImmaginiFn: () => true, _giriMassimiInterno: 6, ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }),
        fetchDiRete: async () => {
          n += 1;
          if (n === 1) return chiamata(`cu${delTurno}`, 'computer_use', { task: COMPITO });
          return sse([delta({ role: 'assistant', content: 'Fatto.' }), delta({}, 'stop')]);
        } }); } }) });
  const { sessionId } = registry.avvia('fixture', { permessiScelto: 'On request', modalitaOperativaScelta: 'normale' });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: createStaticHandler(fileURLToPath(new URL('../../dist/', import.meta.url))), token: 'cu6', sessionRegistry: registry });
  const server = createServer(async (req, res) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/sessions')) return app(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"data":{}}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { root, registry, sessionId, base: `http://127.0.0.1:${server.address().port}`,
    async chiudi() { server.closeAllConnections(); await new Promise((r) => server.close(r)); await registry.chiudi(); await rimuoviCartellaDiProvaAttesa(root).catch(() => {}); } };
}

async function apri(page, b, lingua) {
  await page.context().addCookies([{ name: 'talos_token', value: 'cu6', url: b.base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript((l) => { if (window !== window.top) return; localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: l, interfaceMotion: false } })); }, lingua);
  await page.goto(b.base); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  const m = b.registry.elenca().find((r) => r.sessionId === b.sessionId);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s), m);
}

/** Le righe che dicono «in corso» il computer use (col «…»), quelle che si VEDONO, e per ognuna se il clic al suo centro arriva a lei (nessuno le sta sopra). */
const righeInCorso = (page, etichetta) => page.evaluate((testo) => {
  const fuori = [];
  for (const n of document.querySelectorAll('#conversation *')) {
    if (n.children.length > 0 || n.textContent.trim() !== testo) continue;
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(n).visibility === 'hidden') continue;
    const x = r.left + Math.min(40, r.width / 2); const y = r.top + r.height / 2;
    const sopra = document.elementFromPoint(x, y);
    fuori.push({ classe: n.className, scoperta: Boolean(sopra && (n.contains(sopra) || sopra.contains(n) || sopra === n)), y: Math.round(r.top) });
  }
  return fuori;
}, etichetta);

for (const [lingua, etichetta, consenti] of [['it', 'Uso del computer…', 'Consenti'], ['en', 'Using the computer…', 'Consenti']]) {
  test(`CU-RIGA-01 RED ${lingua}: dopo la carta del computer use una sola riga «in corso», viva sotto la carta e mai coperta`, async ({ page }) => {
    test.setTimeout(60_000);
    const b = await banco();
    try {
      await apri(page, b, lingua);
      const dock = page.locator('#userQuestionDock');
      await expect(dock.getByText(consenti, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await dock.getByText(consenti, { exact: true }).first().click();
      const invia = dock.getByRole('button', { name: /Conferma e invia|Confirm and send|Invia|Send/u });
      if (await invia.count()) await invia.first().click();
      await expect(dock.getByText(consenti, { exact: true })).toHaveCount(0, { timeout: 10_000 });
      await page.waitForTimeout(1500);
      const righe = await righeInCorso(page, etichetta);
      await page.screenshot({ path: test.info().outputPath(`cu-riga-${lingua}.png`) });
      expect(righe.length, `righe «${etichetta}» a schermo: ${JSON.stringify(righe)}`).toBe(1);
      expect(righe[0].scoperta, `la riga è coperta: ${JSON.stringify(righe)}`).toBe(true);
      await expect(page.locator('#conversation .talos-waiting[data-activity="comando"]'), 'la riga viva D20 sotto la carta').toBeVisible();
    } finally { await b.chiudi(); }
  });
}
