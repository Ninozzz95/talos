import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * Twin repair of 0.2.2, round 3 (owner 14/11 09:56 «Nella 0.2.2», judge v1852-v1853): the card of a connector tool showed only the name of
 * the tool, never what goes out. MCP 2025-06-18 (server/tools, Security considerations): «Clients SHOULD show tool inputs to the user before
 * calling the server». Each argument must be a row of the card, inside its border, with the piece and the CSS of round 1 (a name of 289
 * characters wraps, its value stays visible); a nested object stays readable; a value past the cap ends with the cut sign and the card says
 * that values were cut; a secret never reaches the page.
 * ⛔ The event is the REAL action of the kernel: the test runs `talosLavora` with a fake model and a connector tool, catches what the gate
 *   asks (`chiediApprovazioneFn`) and sends that very action to the page. The test server of `playwright.config.mjs`, never the 4174.
 * 150% = viewport 1280×720 at scale 1.5, 200% = 960×540 at scale 2: every photo is 1920×1080.
 */
const CARTELLA_FOTO = process.env.CARTA_VALORE_FOTO
  ? path.resolve(process.env.CARTA_VALORE_FOTO, 'argomenti')
  : path.resolve(fileURLToPath(new URL('../../artifacts/carta-argomenti-connettore-022/', import.meta.url)));
const KERNEL = new URL('../../../src/kernel/talosHarness.mjs', import.meta.url).href;
const SESSIONE = 'carta-argomenti';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const NOME_LUNGO = `note_${'x'.repeat(280)}_END`; // 289 characters, no space to wrap on
const SEGRETO = 'sk-proj-9f3a1c7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a'; // a fake key made for this test, the shape of forme-di-segreto.mjs
const ARGOMENTI = {
  [NOME_LUNGO]: 'DELETE EVERYTHING',
  issue: { owner: 'acme', labels: ['bug', 'urgent'], meta: { api_key: SEGRETO, milestone: 3 } },
  body: `${'Weekly report line. '.repeat(110)}END`, // 2,203 characters: past the cap
};
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: {} } }];

/** The action the kernel's gate asks the person about, for one call of `create_issue` with ARGOMENTI. */
async function azioneVeraDelNucleo() {
  const { talosLavora } = await import(KERNEL);
  const cartella = await mkdtemp(path.join(tmpdir(), 'carta-arg-pagina-'));
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_arg_1', type: 'function', function: { name: 'mcp__github__create_issue', arguments: JSON.stringify(ARGOMENTI) } }] }, { role: 'assistant', content: 'done', tool_calls: [] }];
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

let AZIONE = null;
test.beforeAll(async () => { AZIONE = await azioneVeraDelNucleo(); });

for (const [scala, viewport, dsf] of [['100', { width: 1920, height: 1080 }, 1], ['150', { width: 1280, height: 720 }, 1.5], ['200', { width: 960, height: 540 }, 2]]) {
  for (const modo of ['light', 'dark']) {
    test.describe(`Twin 0.2.2 round 3: the arguments of a connector call on its card · ${modo} · ${scala}%`, () => {
      test.use({ colorScheme: modo, viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' });

      async function prepara(page, lingua) {
        const scritture = [];
        await page.addInitScript(({ colorMode, uiLanguage }) => {
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
        }, { colorMode: modo, uiLanguage: lingua });
        await page.route('**/api/**', (rotta) => {
          if (rotta.request().method() === 'GET') return rotta.fallback();
          scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
          return rotta.abort();
        });
        await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
        await page.goto('/');
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
        await page.evaluate(({ id, confine, titolo }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', titolo, 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
          r.handleRealEvent(confine, r.realSessionState.generation);
        }, { id: SESSIONE, confine: CONFINE, titolo: lingua === 'en' ? 'Issues of the week' : 'Issue della settimana' });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
        await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
        return scritture;
      }
      const manda = (page, eventi) => page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, eventi);
      const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
      /* each row is brought into the visible part of the list (it scrolls past 14em), then measured against the card and the list */
      const misura = (page) => carta(page).evaluate((card) => {
        const elenco = card.querySelector('.talos-approval__automazione');
        if (!elenco) return [];
        return [...elenco.querySelectorAll(':scope > .talos-kv')].map((riga) => {
          riga.scrollIntoView({ block: 'nearest' });
          const c = card.getBoundingClientRect(); const e = elenco.getBoundingClientRect();
          const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v');
          const rk = k.getBoundingClientRect(); const rv = v.getBoundingClientRect();
          return {
            nome: k.textContent, valore: v.textContent,
            nomeDentro: rk.left >= c.left - 0.5 && rk.right <= c.right + 0.5,
            nomeIntero: k.scrollWidth <= k.clientWidth + 1,
            valoreLargo: Math.round(rv.width),
            valoreDentro: rv.left >= c.left - 0.5 && rv.right <= c.right + 0.5,
            valoreSiVede: rv.width > 20 && rv.height > 0 && rv.top >= e.top - 0.5 && rv.top + 8 <= e.bottom,
          };
        });
      });

      for (const [lingua, notaTagliati] of [['it', /tagliat/iu], ['en', /cut/iu]]) {
        test(`CARTA-ARG-01 (${lingua}): every argument of the connector call is a visible row inside the card; secret masked, cut value signed`, async ({ page }) => {
          const scritture = await prepara(page, lingua);
          await manda(page, [{ type: 'ApprovalRequested', requestId: 'arg-req-1', azione: AZIONE, _sequenza: 2 }]);
          await expect(carta(page)).toHaveCount(1);
          const righe = await misura(page);
          console.log(`CARTA-ARG ${lingua} ${modo} ${scala}: ${JSON.stringify(righe.map((r) => ({ ...r, nome: r.nome.length, valore: r.valore.slice(0, 30) })))}`);
          await mkdir(CARTELLA_FOTO, { recursive: true });
          await carta(page).scrollIntoViewIfNeeded();
          await writeFile(path.join(CARTELLA_FOTO, `carta-arg-${lingua}-${modo}-${scala}.png`), await page.screenshot({ animations: 'disabled' }));
          expect(righe.length, 'one row per argument').toBe(3);
          for (const r of righe) {
            expect(r.nomeDentro, `the name «${r.nome.slice(0, 20)}» stays inside the card`).toBe(true);
            expect(r.nomeIntero, `the name «${r.nome.slice(0, 20)}» is shown whole`).toBe(true);
            expect(r.valoreDentro, `the value of «${r.nome.slice(0, 20)}» stays inside the card`).toBe(true);
            expect(r.valoreSiVede, `the value of «${r.nome.slice(0, 20)}» is in the visible part of the list`).toBe(true);
            expect(r.valoreLargo, 'the value is not squeezed to nothing').toBeGreaterThan(100);
          }
          const [lunga, issue, body] = righe;
          expect(lunga.nome.length).toBe(289);
          expect(lunga.valore).toBe('DELETE EVERYTHING');
          expect(issue.valore, 'the nested object stays readable').toContain('acme');
          expect(issue.valore).toContain('urgent');
          expect(body.valore.endsWith('…'), 'the cut value ends with the cut sign').toBe(true);
          expect(body.valore.includes('END'), 'the tail of the cut value is not on the card').toBe(false);
          const testo = await carta(page).innerText();
          expect(testo.includes(SEGRETO), 'the secret never reaches the page').toBe(false);
          expect(testo).toContain('[redacted]');
          await expect(carta(page).locator('.talos-approval__argomenti-tagliati'), 'the card says that values were cut').toHaveText(notaTagliati);
          /* the line about cuts is the small muted line of the card, inside its gutter like the rows (never flush with the border) */
          const nota = await carta(page).evaluate((card) => {
            const n = card.querySelector('.talos-approval__argomenti-tagliati'); const k = card.querySelector('.talos-approval__automazione .talos-kv__k');
            return { sinistra: Math.round(n.getBoundingClientRect().left - card.getBoundingClientRect().left + parseFloat(getComputedStyle(n).paddingLeft)), sinistraNome: Math.round(k.getBoundingClientRect().left - card.getBoundingClientRect().left),
              corpo: parseFloat(getComputedStyle(n).fontSize), corpoNome: parseFloat(getComputedStyle(k).fontSize) };
          });
          expect(nota.sinistra, 'the line about cuts starts where the names start').toBe(nota.sinistraNome);
          expect(nota.corpo, 'the line about cuts is small, as the names').toBeLessThanOrEqual(nota.corpoNome);
          /* no raw JSON of the whole call and no kernel key names on screen */
          expect(testo).not.toMatch(/argomentiTagliati|"argomenti"|mcp__github__create_issue/u);
          expect(scritture).toEqual([]);
        });
      }
    });
  }
}
