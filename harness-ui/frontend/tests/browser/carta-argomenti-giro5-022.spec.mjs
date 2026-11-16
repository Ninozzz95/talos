import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * Twin repair of 0.2.2, round 5 (reviewer 1, RED 3 and YELLOW; owner 14/11 14:15 choice A): the card of a connector call
 *   - whose arguments are a LIST: the kernel put it on the card and the tool received it, the page showed a card with no rows; now ONE row,
 *     its JSON;
 *   - with direction and zero width characters: «invoice<RLO>fdp.exe» read «invoiceexe.pdf», «pa<ZWSP>th» read «path»; now they are seen as
 *     the terminal writes them, `\u202e`, `\u200b`.
 * ⛔ The event is the REAL action of the kernel (`talosLavora` with a fake model and a connector tool). The test server of
 *   `playwright.config.mjs`, never the 4174. 150% = viewport 1280×720 at scale 1.5: every photo is 1920×1080.
 */
const CARTELLA_FOTO = process.env.CARTA_VALORE_FOTO
  ? path.resolve(process.env.CARTA_VALORE_FOTO, 'giro5')
  : path.resolve(fileURLToPath(new URL('../../artifacts/carta-argomenti-giro5-022/', import.meta.url)));
const KERNEL = new URL('../../../src/kernel/talosHarness.mjs', import.meta.url).href;
const SESSIONE = 'carta-giro5';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const B = String.fromCharCode(92); // the backslash, written so no editor turns an escape into the raw character
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);
const LISTA = ['--delete-all', '/'];
const DIREZIONE = { file: `invoice${RLO}fdp.exe`, path: '/safe', [`pa${ZWSP}th`]: '/etc/passwd' };
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: {} } }];

/** The action the kernel's gate asks the person about, for one call of `create_issue` with these arguments. */
async function azioneVeraDelNucleo(argomenti) {
  const { talosLavora } = await import(KERNEL);
  const cartella = await mkdtemp(path.join(tmpdir(), 'carta-g5-pagina-'));
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_g5_1', type: 'function', function: { name: 'mcp__github__create_issue', arguments: JSON.stringify(argomenti) } }] }, { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0; let azione = null;
  await talosLavora({
    cartella, task: { consegna: 'open the issue' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP,
    chiamaToolMcpFn: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    chiediApprovazioneFn: async (a) => { if (a.tipo === 'mcp_tool') azione ??= structuredClone(a); return false; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  if (!azione) throw new Error('the kernel asked no card');
  return azione;
}

let AZIONE_LISTA = null;
let AZIONE_DIREZIONE = null;
test.beforeAll(async () => { AZIONE_LISTA = await azioneVeraDelNucleo(LISTA); AZIONE_DIREZIONE = await azioneVeraDelNucleo(DIREZIONE); });

for (const [scala, viewport, dsf] of [['100', { width: 1920, height: 1080 }, 1], ['150', { width: 1280, height: 720 }, 1.5]]) {
  for (const modo of ['light', 'dark']) {
    test.describe(`Twin 0.2.2 round 5: a list and invisible characters on the card of a connector call · ${modo} · ${scala}%`, () => {
      test.use({ colorScheme: modo, viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' });

      async function prepara(page) {
        const scritture = [];
        await page.addInitScript(({ colorMode }) => {
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage: 'en' } }));
        }, { colorMode: modo });
        await page.route('**/api/**', (rotta) => {
          if (rotta.request().method() === 'GET') return rotta.fallback();
          scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
          return rotta.abort();
        });
        await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
        await page.goto('/');
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
        await page.evaluate(({ id, confine }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'Issues of the week', 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
          r.handleRealEvent(confine, r.realSessionState.generation);
        }, { id: SESSIONE, confine: CONFINE });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
        await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
        return scritture;
      }
      const manda = (page, azione) => page.evaluate((e) => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent(e, r.realSessionState.generation);
      }, { type: 'ApprovalRequested', requestId: 'g5-req-1', azione, _sequenza: 2 });
      const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
      const righe = (page) => carta(page).evaluate((card) => {
        const c = card.getBoundingClientRect();
        return [...card.querySelectorAll('.talos-approval__automazione > .talos-kv')].map((riga) => {
          const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v'); const rv = v.getBoundingClientRect();
          return { nome: k ? k.textContent : null, valore: v.textContent, dentro: rv.left >= c.left - 0.5 && rv.right <= c.right + 0.5, siVede: rv.width > 20 && rv.height > 0 };
        });
      });
      const foto = async (page, nome) => {
        await mkdir(CARTELLA_FOTO, { recursive: true });
        await carta(page).scrollIntoViewIfNeeded();
        await writeFile(path.join(CARTELLA_FOTO, `${nome}-${modo}-${scala}.png`), await page.screenshot({ animations: 'disabled' }));
      };

      test('CARTA-G5-01: a call whose arguments are a list shows ONE row, its JSON, inside the card', async ({ page }) => {
        const scritture = await prepara(page);
        await manda(page, AZIONE_LISTA);
        await expect(carta(page)).toHaveCount(1);
        const r = await righe(page);
        await foto(page, 'carta-g5-lista');
        /* round 7 (owner 19:57, variant A of the mockup): the row with no name says «value» in the names column */
        expect(r, 'one row, labelled «value», the JSON of the list').toEqual([{ nome: 'value', valore: '["--delete-all","/"]', dentro: true, siVede: true }]);
        expect(scritture).toEqual([]);
      });

      test('CARTA-G5-02: direction and zero width characters are seen as the terminal writes them; two names that read «path» are told apart', async ({ page }) => {
        const scritture = await prepara(page);
        await manda(page, AZIONE_DIREZIONE);
        await expect(carta(page)).toHaveCount(1);
        const r = await righe(page);
        await foto(page, 'carta-g5-direzione');
        expect(r.map((x) => x.valore)).toEqual([`invoice${B}u202efdp.exe`, '/safe', '/etc/passwd']);
        expect(r[2].nome, 'the zero width character of the name is seen').toContain(`${B}u200b`);
        expect(r[1].nome).not.toBe(r[2].nome);
        const testo = await carta(page).innerText();
        expect(testo.includes(RLO) || testo.includes(ZWSP), 'no raw direction or zero width character on the card').toBe(false);
        for (const x of r) expect(x.dentro && x.siVede, `«${x.valore}» visible inside the card`).toBe(true);
        expect(scritture).toEqual([]);
      });
    });
  }
}
