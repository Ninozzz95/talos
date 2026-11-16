import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { test, expect } from '@playwright/test';

import { createStaticHandler } from '../../../src/static-files.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { avviaSessione } from '../../../src/agent-service.mjs';
import { talosLavora } from '../../../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * Twin repair of 0.2.2, round 7 (owner 14/11 19:46), POINT ZERO: the tool row in the conversation of the PC page. Reviewer 3 after round 6
 *   found on the terminal that the row of a connector tool printed `api key: …` and `password: …` in clear above the card that hid them;
 *   the same row of the page was «not verified». Here: the real server (registry, agent-service, kernel gate, the route that answers the
 *   card), a FAKE model that streams the call in three pieces and a FAKE connector (MCP) with `password`, `api_key`, a nested `password`,
 *   a `token` in a list and a cookie. The row is read in its head and in its expanded detail while the card waits, while the tool runs,
 *   when the call is over and after a reload; the whole page HTML must hold none of the five secret values. The tool gets them all.
 * Plus point 6 (owner 19:57, variant A of the mockup): a row with no name reads «value»/«valore», at 100, 150 and 200%, it and en, light
 *   and dark, beside the mockup; and C5 of the page reviewer: a long value wraps inside the card (never `white-space: nowrap`).
 * ⛔ Ports 7400-7449 only (agent of round 7); never the 4174. Photos ≥ 1920×1080.
 */
const CARTELLA_FOTO = process.env.RIGA_ATTREZZO_FOTO
  ? path.resolve(process.env.RIGA_ATTREZZO_FOTO)
  : path.resolve(fileURLToPath(new URL('../../artifacts/riga-attrezzo-segreti-022/', import.meta.url)));
const PORTA = Number(process.env.RIGA_ATTREZZO_PORTA || 7402);
const BOZZETTO = process.env.BOZZETTO_RIGA_SENZA_NOME || '';
const PWD = 'QZXJ7pwd', KEY = 'QZXJ8key', NEST = 'QZXJ9nest', LIST = 'QZXJ6list', COOKIE = 'QZXJ5cook';
const SEGRETI = [PWD, KEY, NEST, LIST, COOKIE];
const ARGOMENTI = { title: 'Login button does nothing', password: PWD, api_key: KEY, config: { db: { host: 'db.local', password: NEST } }, tags: [{ name: 'bug', token: LIST }], session_cookie: COOKIE };
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: {} } }];
const sse = (pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
const delta = (d, finish = null) => ({ id: 'c', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });

/** The real server with a fake model and a fake connector; `cancello` holds the tool until the test opens it. */
async function banco() {
  const root = mkdtempSync(join(tmpdir(), 'talos-riga-g7-'));
  const eseguite = [];
  let apri; const cancello = new Promise((r) => { apri = r; });
  const testo = JSON.stringify(ARGOMENTI);
  const terzi = [testo.slice(0, 40), testo.slice(40, testo.indexOf(NEST) + 3), testo.slice(testo.indexOf(NEST) + 3)]; // a secret cut between two pieces
  const chiamaToolMcpFn = async (nome, argomenti) => { eseguite.push({ nome, json: JSON.stringify(argomenti) }); await cancello; return { content: [{ type: 'text', text: 'Issue #42 opened.' }], isError: false }; };
  const registry = createSessionRegistry({ cartellaStore: join(root, 'sessions'), modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (id) => ({ cartella: root, task: { id, consegna: 'Open the issue for the login bug.' }, comandoProva: null }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, cartella: root, contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      cartellaTrustMcp: root, preparaToolMcpPerSessioneFn: async () => ({ toolMcp: TOOL_MCP, chiamaToolMcpFn, chiudiTutti: async () => {} }),
      talosLavoraFn: (args) => { let n = 0; return talosLavora({ ...args, _giriMassimiInterno: 4, ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }),
        fetchDiRete: async () => {
          n += 1;
          if (n > 1) return sse([delta({ role: 'assistant', content: 'Fatto.' }), delta({}, 'stop')]);
          return sse([delta({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'g7mcp', type: 'function', function: { name: 'mcp__github__create_issue', arguments: '' } }] }),
            ...terzi.map((p) => delta({ tool_calls: [{ index: 0, function: { arguments: p } }] })), delta({}, 'tool_calls')]);
        } }); } }) });
  const { sessionId } = registry.avvia('fixture', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: createStaticHandler(fileURLToPath(new URL('../../dist/', import.meta.url))), token: 'g7', sessionRegistry: registry });
  const server = createServer(async (req, res) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/sessions')) return app(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"data":{}}');
  });
  await new Promise((r) => server.listen(PORTA, '127.0.0.1', r));
  return { eseguite, apri, registry, sessionId, base: `http://127.0.0.1:${PORTA}`,
    async chiudi() { apri(); server.closeAllConnections(); await new Promise((r) => server.close(r)); await registry.chiudi(); await rimuoviCartellaDiProvaAttesa(root).catch(() => {}); } };
}
async function vaiA(page, b) {
  const m = b.registry.elenca().find((r) => r.sessionId === b.sessionId);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s), m);
}
async function apri(page, b, { tema, lingua }) {
  await page.context().addCookies([{ name: 'talos_token', value: 'g7', url: b.base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(([t, l]) => { if (window !== window.top) return; localStorage.setItem('talos.harness.desktop.barra.gruppi.v1', '{"lavoro":true}'); localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: t, uiLanguage: l, interfaceMotion: false } })); }, [tema, lingua]);
  await page.goto(b.base); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await vaiA(page, b);
}
async function ricarica(page, b) {
  await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime); await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await vaiA(page, b);
}
const carta = (page) => page.locator('.real-approval-card');
const riga = (page) => page.locator('#conversation .talos-tool-row').first();
/** The row open as a person opens it: the group of the turn (if closed), then the row itself. */
async function apriRiga(page) {
  await expect(riga(page)).toHaveCount(1, { timeout: 15_000 });
  const testa = page.locator('#conversation .talos-activity__head').first();
  if (await testa.count() && await testa.getAttribute('aria-expanded') === 'false') await testa.click();
  if (await riga(page).getAttribute('aria-expanded') !== 'true') await riga(page).click();
  await expect(riga(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#conversation .talos-tool-row__body .tool-arg-row').first()).toBeVisible();
}
/** What the row and the page show: the head text, the detail rows, and every secret value found anywhere in the page HTML. */
const leggi = (page) => page.evaluate((segreti) => {
  const r = document.querySelector('#conversation .talos-tool-row');
  const corpo = r?.parentElement?.querySelector('.talos-tool-row__body') ?? document.querySelector('#conversation .talos-tool-row__body');
  const html = document.documentElement.outerHTML;
  return {
    testa: (r?.textContent ?? '').replace(/\s+/gu, ' ').trim(),
    dettaglio: [...(corpo?.querySelectorAll('.tool-arg-row') ?? [])].map((x) => x.textContent.replace(/\s+/gu, ' ').trim()),
    inChiaro: segreti.filter((s) => html.includes(s.slice(0, 5))),
  };
}, SEGRETI);
async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.waitForFunction(() => document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).every((a) => a.playState !== 'running'), null, { timeout: 5_000 });
  await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot({ animations: 'disabled' }));
}

for (const [tema, lingua] of [['light', 'en'], ['dark', 'it']]) {
  test(`RIGA-G7-01 (${tema}, ${lingua}): the tool row of a connector shows no secret in its head and detail: card open, tool running, call over, after a reload; the tool gets them all`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    const b = await banco();
    try {
      await apri(page, b, { tema, lingua });
      await expect(carta(page)).toBeVisible({ timeout: 20_000 });
      await apriRiga(page);
      const conCarta = await leggi(page);
      await foto(page, `riga-g7-carta-${tema}-${lingua}.png`);
      expect(conCarta.inChiaro, `card open: ${JSON.stringify(conCarta)}`).toEqual([]);
      expect(conCarta.dettaglio.join(' | ')).toContain('[redacted]');

      await carta(page).locator('[data-approva-una-volta]').click();
      await expect.poll(() => b.eseguite.length, { timeout: 15_000 }).toBe(1);
      await apriRiga(page);
      const inCorso = await leggi(page);
      await foto(page, `riga-g7-in-corso-${tema}-${lingua}.png`);
      expect(inCorso.inChiaro, `tool running: ${JSON.stringify(inCorso)}`).toEqual([]);

      b.apri();
      await expect(page.locator('#conversation')).toContainText('Fatto.', { timeout: 15_000 });
      await apriRiga(page);
      const finita = await leggi(page);
      await foto(page, `riga-g7-finita-${tema}-${lingua}.png`);
      expect(finita.inChiaro, `call over: ${JSON.stringify(finita)}`).toEqual([]);
      expect(finita.dettaglio.some((x) => x.includes('Login button does nothing')), 'an honest value stays readable').toBe(true);

      await ricarica(page, b);
      await apriRiga(page);
      const ricaricata = await leggi(page);
      await foto(page, `riga-g7-ricarica-${tema}-${lingua}.png`);
      expect(ricaricata.inChiaro, `after a reload: ${JSON.stringify(ricaricata)}`).toEqual([]);

      for (const s of SEGRETI) expect(b.eseguite[0].json, 'the tool receives the real value').toContain(s);
    } finally { await b.chiudi(); }
  });
}

/* ------------------------------------------------------------ point 6: the row with no name, and C5 ------------------------------------------------------------ */
const KERNEL = new URL('../../../src/kernel/talosHarness.mjs', import.meta.url).href;
async function azioneVeraDelNucleo(argomenti) {
  const cartella = await mkdtemp(path.join(tmpdir(), 'riga-g7-pagina-'));
  const { talosLavora: lavora } = await import(KERNEL);
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_g7_1', type: 'function', function: { name: 'mcp__github__create_issue', arguments: JSON.stringify(argomenti) } }] }, { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0; let azione = null;
  await lavora({
    cartella, task: { consegna: 'open the issue' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP,
    chiamaToolMcpFn: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    chiediApprovazioneFn: async (a) => { if (a.tipo === 'mcp_tool') azione ??= structuredClone(a); return false; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  if (!azione) throw new Error('the kernel asked no card');
  return azione;
}
const SESSIONE = 'riga-g7';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const LUNGO = Array.from({ length: 60 }, (_, i) => `parola${i}`).join(' ');
let AZIONE_LISTA = null; let AZIONE_LUNGA = null;
test.beforeAll(async () => { AZIONE_LISTA = await azioneVeraDelNucleo(['bug', 'urgent', 'frontend']); AZIONE_LUNGA = await azioneVeraDelNucleo({ body: LUNGO }); });

for (const [scala, viewport, dsf] of [['100', { width: 1920, height: 1080 }, 1], ['150', { width: 1280, height: 720 }, 1.5], ['200', { width: 960, height: 540 }, 2]]) {
  for (const lingua of ['it', 'en']) {
    for (const modo of ['light', 'dark']) {
      test.describe(`RIGA-G7-P6 the row with no name · ${scala}% · ${lingua} · ${modo}`, () => {
        test.use({ colorScheme: modo, viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
        async function prepara(page) {
          await page.addInitScript(({ colorMode, uiLanguage }) => {
            localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
          }, { colorMode: modo, uiLanguage: lingua });
          await page.route('**/api/**', (rotta) => (rotta.request().method() === 'GET' ? rotta.fallback() : rotta.abort()));
          await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
          await page.goto('/');
          await page.waitForFunction(() => window.__talosHarnessUiRuntime);
          await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
          await page.evaluate(({ id, confine }) => {
            const r = window.__talosHarnessUiRuntime;
            r.passaASessione(id, 'workspace', 'Issues', 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
            r.handleRealEvent(confine, r.realSessionState.generation);
          }, { id: SESSIONE, confine: CONFINE });
          await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
          /* the photo shows the card, not «opening the history…» (the same wait as carta-argomenti-giro5-022.spec.mjs) */
          await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
        }
        const manda = (page, azione, id) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, { type: 'ApprovalRequested', requestId: id, azione, _sequenza: 2 });
        const cartaP = (page) => page.locator('#conversation [data-c="ApprovalCard"]');

        test(`RIGA-G7-P6-01: a list at the top reads «${lingua === 'it' ? 'valore' : 'value'}» in the names column, aligned like a named row`, async ({ page }) => {
          await prepara(page);
          await manda(page, AZIONE_LISTA, 'g7-lista');
          await expect(cartaP(page)).toHaveCount(1);
          const g = await cartaP(page).evaluate((card) => {
            const riga = card.querySelector('.talos-approval__automazione > .talos-kv');
            const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v');
            const rk = k?.getBoundingClientRect(); const rv = v.getBoundingClientRect(); const c = card.getBoundingClientRect();
            return { nome: k?.textContent ?? null, classe: k?.className ?? null, valore: v.textContent, nomeASinistra: !!rk && rk.right <= rv.left + 0.5, stessaRiga: !!rk && Math.abs(rk.top - rv.top) < 12, dentro: rv.right <= c.right + 0.5 && (rk?.left ?? 0) >= c.left - 0.5 };
          });
          await cartaP(page).scrollIntoViewIfNeeded();
          await foto(page, `p6-valore-${scala}-${lingua}-${modo}.png`);
          expect(g).toEqual({ nome: lingua === 'it' ? 'valore' : 'value', classe: 'talos-kv__k talos-kv__k--generico', valore: '["bug","urgent","frontend"]', nomeASinistra: true, stessaRiga: true, dentro: true });
        });

        test('RIGA-G7-C5: a long value wraps inside the card, it never runs on one line past the edge', async ({ page }) => {
          await prepara(page);
          await manda(page, AZIONE_LUNGA, 'g7-lungo');
          await expect(cartaP(page)).toHaveCount(1);
          const g = await cartaP(page).evaluate((card) => {
            const v = card.querySelector('.talos-approval__automazione .talos-kv__v'); const rv = v.getBoundingClientRect(); const c = card.getBoundingClientRect();
            const riga = parseFloat(getComputedStyle(v).lineHeight) || 16;
            return { aCapo: rv.height > riga * 1.8, dentro: rv.right <= c.right + 0.5, senzaScorrere: v.scrollWidth <= v.clientWidth + 1, spazi: getComputedStyle(v).whiteSpace };
          });
          expect(g).toEqual({ aCapo: true, dentro: true, senzaScorrere: true, spazi: 'pre-wrap' });
        });
      });
    }
  }
}

/* the mockup beside the product: variant A, same four configurations as the photos above at 100% (only when the mockup is given) */
for (const lingua of ['it', 'en']) {
  for (const modo of ['light', 'dark']) {
    test(`RIGA-G7-BOZZETTO (${lingua}, ${modo}): the mockup's variant A has the same label, the same class and the same grid`, async ({ page }) => {
      test.skip(!BOZZETTO, 'BOZZETTO_RIGA_SENZA_NOME not given');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(pathToFileURL(BOZZETTO).href);
      await page.locator('[data-gruppo="variante"] [data-v="a"]').click();
      for (const [gruppo, v] of [['lingua', lingua], ['tema', modo === 'light' ? 'light' : 'dark']]) {
        const b = page.locator(`[data-gruppo="${gruppo}"] [data-v="${v}"]`);
        if (await b.count()) await b.click();
      }
      const g = await page.evaluate(() => {
        const riga = document.querySelector('.talos-approval__automazione > .talos-kv');
        const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v');
        return { nome: k?.textContent ?? null, classe: k?.className ?? null, nomeASinistra: k.getBoundingClientRect().right <= v.getBoundingClientRect().left + 0.5 };
      });
      await foto(page, `p6-bozzetto-${lingua}-${modo}.png`);
      expect(g).toEqual({ nome: lingua === 'it' ? 'valore' : 'value', classe: 'talos-kv__k talos-kv__k--generico', nomeASinistra: true });
    });
  }
}

/* the row of a kernel tool, by the server's own events (agui-events.mjs: RunStarted, ToolCallStart, ToolCallArgs, ToolCallResult): its mono
   detail shows the command (dettaglioRigaAttrezzo), and when the call is over that detail is written again from the parsed arguments; both
   times with the card's masks (a mutant that masks only while the call runs is seen at the end) */
const COMANDO = 'export DB_PASSWORD=QZXJ7pwd && make deploy';
for (const [modo, lingua] of [['light', 'en'], ['dark', 'it']]) {
  test.describe(`RIGA-G7-02 the row of a command · ${lingua} · ${modo}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    test(`RIGA-G7-02 (${modo}, ${lingua}): a secret in the command of a kernel tool is masked in the row while it runs and when it is over`, async ({ page }) => {
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => (rotta.request().method() === 'GET' ? rotta.fallback() : rotta.abort()));
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Deploy', 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      const manda = (eventi) => page.evaluate((es) => { const r = window.__talosHarnessUiRuntime; for (const e of es) r.handleRealEvent(e, r.realSessionState.generation); }, eventi);
      const html = () => page.locator('#conversation').evaluate((c) => c.outerHTML);
      await manda([
        { type: 'RunStarted', threadId: SESSIONE, runId: 'g7-run', _sequenza: 10 },
        { type: 'ToolCallStart', toolCallId: 'g7-shell', toolCallName: 'shell', _sequenza: 11 },
        { type: 'ToolCallArgs', toolCallId: 'g7-shell', delta: JSON.stringify({ comando: COMANDO }), _sequenza: 12 },
      ]);
      await expect(page.locator('#conversation .talos-tool-row')).toHaveCount(1, { timeout: 10_000 });
      await expect.poll(html).toContain('make deploy');
      const inCorso = await html();
      expect(inCorso.includes('QZXJ7'), 'while it runs').toBe(false);
      await manda([{ type: 'ToolCallResult', messageId: 'g7-m', toolCallId: 'g7-shell', content: 'deployed', role: 'tool', _sequenza: 13 }]);
      await expect.poll(() => page.locator('#conversation [aria-busy="false"]').count(), { timeout: 10_000 }).toBeGreaterThan(0);
      await expect.poll(html, { timeout: 10_000 }).not.toBe(inCorso);
      const finita = await html();
      await foto(page, `riga-g7-comando-${modo}-${lingua}.png`);
      expect(finita.includes('QZXJ7'), 'when it is over').toBe(false);
      expect(finita).toContain('make deploy');
    });
  });
}
