import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
 * D20 (collaudo del treno, 02/11/2026): dopo una carta approvata, durante un comando lungo la chat non mostrava più niente. Server vero
 * (registro, nucleo, flusso SSE del modello finto come in rete, comando vero che dura); si guarda ciò che la persona vede.
 */
test.use({ viewport: { width: 1920, height: 1080 } });

const sse = (pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
const delta = (d, finish = null) => ({ id: 'c', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });
const CONSEGNA = 'In src/wrap-text.ts long lines that contain emoji ZWJ sequences and CJK characters seem to wrap one column too late in a narrow Box. Prove it with a failing test first; if there is no bug, say so and show me the evidence. Do not touch anything else. '.repeat(3);

async function banco({ secondi = 25 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-d20-'));
  const script = join(root, 'lungo.cjs');
  writeFileSync(script, `setTimeout(() => console.log('fine'), ${secondi * 1000});`);
  const comando = `"${process.execPath}" "${script}"`;
  let turno = 0;
  const chiamata = (id, nome) => sse([delta({ role: 'assistant', content: null, tool_calls: [{ index: 0, id, type: 'function', function: { name: nome, arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }), delta({}, 'tool_calls')]);
  const registry = createSessionRegistry({ cartellaStore: join(root, 'sessions'), modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (id) => ({ cartella: root, task: { id, consegna: CONSEGNA }, comandoProva: comando }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, cartella: root,
      contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: (args) => { let n = 0; turno += 1; const delTurno = turno; return talosLavora({ ...args, _giriMassimiInterno: 6, ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }),
        fetchDiRete: async () => {
          n += 1;
          if (n <= 2) return chiamata(`pre${delTurno}-${n}`, 'elenca'); // due attrezzi prima: il gruppo entra nel segmento, come nel giro vero
          if (n === 3) return chiamata(`lungo${delTurno}`, 'prova');
          await new Promise((r) => setTimeout(r, 2500)); // il modello ci mette: la riga del comando deve andarsene all'esito, non alla prima parola
          return sse([delta({ role: 'assistant', content: 'Fatto.' }), delta({}, 'stop')]);
        } }); } }) });
  const { sessionId } = registry.avvia('fixture', { permessiScelto: 'On request', modalitaOperativaScelta: 'normale' });
  const altra = registry.avvia('altra', { permessiScelto: 'On request', modalitaOperativaScelta: 'normale' }).sessionId;
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: createStaticHandler(fileURLToPath(new URL('../../dist/', import.meta.url))), token: 'd20', sessionRegistry: registry });
  const server = createServer(async (req, res) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/sessions')) return app(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"data":{}}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { root, registry, sessionId, altra, base: `http://127.0.0.1:${server.address().port}`,
    async chiudi() { server.closeAllConnections(); await new Promise((r) => server.close(r)); await registry.chiudi(); await rimuoviCartellaDiProvaAttesa(root).catch(() => {}); } };
}

async function vaiA(page, b, id) {
  const m = b.registry.elenca().find((r) => r.sessionId === id);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s), m);
}
async function apri(page, b) {
  await page.context().addCookies([{ name: 'talos_token', value: 'd20', url: b.base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('talos.harness.desktop.barra.gruppi.v1', '{"lavoro":true}'); });
  await page.goto(b.base); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await vaiA(page, b, b.sessionId);
}
const rigaViva = (page) => page.locator('#conversation .talos-waiting[data-activity="comando"]');
/** La riga si vede davvero: sotto la carta, dentro lo schermo, e nessuno le sta sopra. */
async function inVista(page) {
  return page.evaluate(() => {
    const r = document.querySelector('#conversation .talos-waiting[data-activity="comando"]');
    const c = [...document.querySelectorAll('.real-approval-card')].at(-1);
    if (!r || !c) return { riga: Boolean(r), carta: Boolean(c) };
    const a = r.getBoundingClientRect(); const b = c.getBoundingClientRect();
    const sopra = document.elementFromPoint(a.left + 40, a.top + a.height / 2);
    return { sottoLaCarta: a.top >= b.bottom - 1, dentroLoSchermo: a.top >= 60 && a.bottom <= window.innerHeight, scoperta: Boolean(sopra && (r.contains(sopra) || sopra.contains(r))) };
  });
}
const secondi = async (page) => {
  const testo = await rigaViva(page).textContent();
  const m = /(\d+)\s*s\b/u.exec(testo);
  return m ? Number(m[1]) : -1;
};

for (const [tema, lingua] of [['light', 'en'], ['dark', 'it']]) {
  test(`D20-${tema}: dopo la carta, sotto la carta, la riga del comando è viva, coi secondi, e se ne va quando il comando finisce`, async ({ page }) => {
    test.setTimeout(60_000);
    const b = await banco({ secondi: 12 });
    try {
      await page.addInitScript(([t, l]) => { if (window !== window.top) return; localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: t, uiLanguage: l, interfaceMotion: false } })); }, [tema, lingua]);
      await apri(page, b);
      await expect(page.locator('.real-approval-card')).toBeVisible({ timeout: 15_000 });
      await expect(rigaViva(page)).toHaveCount(0);
      await page.locator('.real-approval-card button').first().click();
      await expect(rigaViva(page)).toBeVisible();
      await expect(rigaViva(page).locator('.run-activity-label')).toHaveText(lingua === 'en' ? 'Running the tests…' : 'Esecuzione dei test…');
      expect(await inVista(page)).toEqual({ sottoLaCarta: true, dentroLoSchermo: true, scoperta: true });
      await page.waitForTimeout(1200);
      const primo = await secondi(page);
      await page.waitForTimeout(2200);
      expect(await secondi(page)).toBeGreaterThan(primo); // i secondi salgono
      await page.screenshot({ path: test.info().outputPath(`d20-${tema}.png`) });
      await page.locator('[data-rail="processi"]').click();
      await expect(page.locator('[data-rail="processi"]')).toContainText('1');
      await expect(page.locator('.talos-process-row, [data-processo], .talos-inspector').filter({ hasText: 'lungo.cjs' }).first()).toBeVisible(); // la riga dice il comando, non «–»
      await page.screenshot({ path: test.info().outputPath(`d20-${tema}-processi.png`) });
      await expect(rigaViva(page)).toHaveCount(0, { timeout: 20_000 }); // finito il comando se ne va
      await expect(page.locator('#conversation')).not.toContainText('Fatto.'); // all'esito, non alla prima parola del modello
      await expect(page.locator('#conversation .talos-waiting .run-activity-elapsed')).toHaveText(/^[0-2]s$/u); // e l'attesa del modello conta da capo, non continua i secondi del comando
      await expect(page.locator('#conversation')).toContainText('Fatto.');
    } finally { await b.chiudi(); }
  });
}

test('D20-PERCORSI: la riga resta e conta dall\'inizio vero dopo ricarica, cambio di sessione e ritorno', async ({ page }) => {
  test.setTimeout(90_000);
  const b = await banco({ secondi: 40 });
  try {
    await apri(page, b);
    await expect(page.locator('.real-approval-card')).toBeVisible({ timeout: 15_000 });
    await page.locator('.real-approval-card button').first().click();
    await expect(rigaViva(page)).toBeVisible();
    await page.waitForTimeout(5000);
    // ricarica
    await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
    await vaiA(page, b, b.sessionId);
    await expect(rigaViva(page)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => secondi(page), { timeout: 8_000 }).toBeGreaterThanOrEqual(5); // non riparte da zero
    // un'altra sessione: lì la riga non c'è
    await vaiA(page, b, b.altra);
    await expect(rigaViva(page)).toHaveCount(0);
    // ritorno
    await vaiA(page, b, b.sessionId);
    await expect(rigaViva(page)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => secondi(page), { timeout: 8_000 }).toBeGreaterThanOrEqual(7);
    await expect(rigaViva(page)).toHaveCount(0, { timeout: 40_000 }); // e alla fine se ne va anche qui
  } finally { await b.chiudi(); }
});

test('D20-SEGUITO: nel giro dopo, con la stessa sessione, riga viva e Processi ci sono ancora', async ({ page }) => {
  test.setTimeout(60_000);
  const b = await banco({ secondi: 5 });
  try {
    await apri(page, b);
    await expect(page.locator('.real-approval-card')).toBeVisible({ timeout: 15_000 });
    await page.locator('.real-approval-card button').first().click();
    await expect(page.locator('#conversation')).toContainText('Fatto.', { timeout: 20_000 });
    await page.locator('#composerInput').fill('Altro giro');
    await page.locator('#composerInput').press('Enter');
    await expect(page.locator('.real-approval-card')).toHaveCount(2, { timeout: 15_000 });
    await page.locator('.real-approval-card button').last().waitFor();
    await page.locator('.real-approval-card').last().locator('button').first().click();
    await expect(rigaViva(page)).toBeVisible();
    await expect(page.locator('[data-rail="processi"]')).toContainText('1');
    await expect(rigaViva(page)).toHaveCount(0, { timeout: 15_000 });
  } finally { await b.chiudi(); }
});

test('D20-DUE-CHIAMATE: finita la prima, se la seconda gira la riga dice lei, non «sta preparando la risposta»', async ({ page }) => {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('d20-due', 'workspace', 'Due', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    for (const e of [
      { type: 'RunStarted', input: { consegna: 'prova' }, _sequenza: 1 },
      { type: 'ToolCallStart', _sequenza: 2, toolCallId: 'c1', toolCallName: 'prova' },
      { type: 'ToolCallStart', _sequenza: 3, toolCallId: 'c2', toolCallName: 'shell' },
      { type: 'ToolCallArgs', _sequenza: 4, toolCallId: 'c2', delta: '{"comando":"npm run lungo"}' },
      { type: 'ApprovalRequested', _sequenza: 5, requestId: 'r1', azione: { tipo: 'prova', toolCallId: 'c1', comando: 'npm test' } },
      { type: 'ApprovalResolved', _sequenza: 6, requestId: 'r1', approvato: true },
      { type: 'ToolCallResult', _sequenza: 7, toolCallId: 'c1', content: 'exit 0' },
    ]) r.handleRealEvent(e, r.realSessionState.generation);
  });
  await expect(rigaViva(page).locator('.run-activity-label')).toContainText('npm run lungo');
  await expect(page.locator('#conversation .talos-waiting[data-activity="preparing"]')).toHaveCount(0);
});

test('D20-MINUTI: oltre il minuto la riga dice «1m 15s», come la barra', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('d20-minuti', 'workspace', 'Minuti', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    for (const e of [
      { type: 'RunStarted', input: { consegna: 'prova' }, _sequenza: 1 },
      { type: 'ToolCallStart', _sequenza: 2, toolCallId: 'c1', toolCallName: 'prova' },
      { type: 'ApprovalRequested', _sequenza: 3, requestId: 'r1', azione: { tipo: 'prova', toolCallId: 'c1', comando: 'npm test' } },
      { type: 'ApprovalResolved', _sequenza: 4, requestId: 'r1', approvato: true },
    ]) r.handleRealEvent(e, r.realSessionState.generation);
  });
  await expect(rigaViva(page)).toBeVisible();
  await page.clock.fastForward(75_000);
  await expect(rigaViva(page).locator('.run-activity-elapsed')).toHaveText(/^1m 1[5-9]s$/u);
});

test('D20-CONCLUSA: riaprendo una sessione chiusa col comando a metà nessuna riga dice che gira', async ({ page }) => {
  const sid = 'd20-conclusa';
  const eventi = [
    { type: 'RunStarted', _sequenza: 1, input: { consegna: 'prova' }, contesto: { cartella: 'C:\\p' } },
    { type: 'ToolCallStart', _sequenza: 2, toolCallId: 'c1', toolCallName: 'prova' },
    { type: 'ApprovalRequested', _sequenza: 3, requestId: 'r1', azione: { tipo: 'prova', toolCallId: 'c1', comando: 'npm test' } },
    { type: 'ApprovalResolved', _sequenza: 4, requestId: 'r1', approvato: true },
    { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null },
  ];
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Chiusa', 'z-ai/glm-5.3-flash', { conclusa: true }), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(page.locator('.real-approval-card')).toHaveCount(1);
  await expect(rigaViva(page)).toHaveCount(0);
});

test('D20-AL-CONTRARIO: con la carta negata non parte niente e nessuna riga dice che gira', async ({ page }) => {
  test.setTimeout(45_000);
  const b = await banco({ secondi: 20 });
  try {
    await page.addInitScript(() => { new MutationObserver(() => { if (document.querySelector('.talos-waiting[data-activity="comando"]')) window.__rigaApparsa = true; }).observe(document, { childList: true, subtree: true }); });
    await apri(page, b);
    const carta = page.locator('.real-approval-card');
    await expect(carta).toBeVisible({ timeout: 15_000 });
    await carta.locator('button').last().click();
    await expect(carta.locator('.talos-approval__esito')).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__rigaApparsa === true)).toBe(false); // nemmeno per un attimo
  } finally { await b.chiudi(); }
});
