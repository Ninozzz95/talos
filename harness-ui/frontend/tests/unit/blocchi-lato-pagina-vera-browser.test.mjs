/*
 * 08/11/2026 (decision 399): «Open on the side» of an interactive block always opened the full screen. The bridge
 * (`src/bridge/legacy-dom.js`, `battezza(inspector, { id: 'inspectorPanel' })`) renames the right column `#inspectorSessione` →
 * `#inspectorPanel` before `app.js` runs, and `app.js` looked the column up by the old name: `colonna()` was always null and
 * `viste.js` fell back to the full screen (MDN, Document.querySelector: «or null if there are no matches»). The unit tests did not
 * see it because they hand `creaVisteDelBlocco` a fake aside.
 * Here nothing is fake: the REAL `index.template.html`, mounted by the REAL bridge, in a real Chrome; the selector is the one
 * `app.js` hands to `creaVisteDelBlocco` (read from its source, either `$('…')` inline or a `const x = $('…')` it names), and the
 * block menu is the real one. Every request of the page is stopped: no server, no network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const progetto = resolve(frontend, '..', '..');
const sorgenti = { name: 'sorgenti-lato', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(progetto, path).startsWith('..')) throw new Error('Source outside the project: ' + path);
    return { path, namespace: 'gl' };
  });
  b.onLoad({ filter: /.*/, namespace: 'gl' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.html' ? 'text' : est === '.ts' || est === '.mts' ? 'ts' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

const APP = readFileSync(resolve(frontend, 'src/legacy/app.js'), 'utf8');
const PAGINA = readFileSync(resolve(frontend, 'index.template.html'), 'utf8');
const TABELLA = readFileSync(resolve(progetto, 'harness-ui/tests/fixtures/blocchi/01-tabella.txt'), 'utf8').trim();

/** The selector `app.js` uses for the column of the side view: `colonna: () => $('#x')`, or `colonna: () => nome` with `const nome = $('#x');`. */
function selettoreDellaColonna(app) {
  const chiamata = app.match(/creaVisteDelBlocco\(\{ document, colonna: \(\) => ([^,]+?), apriColonna/u);
  assert.ok(chiamata, 'app.js still hands a column to creaVisteDelBlocco');
  const espressione = chiamata[1].trim();
  const diretto = espressione.match(/^\$\('([^']+)'\)$/u);
  if (diretto) return diretto[1];
  assert.match(espressione, /^[A-Za-z_$][\w$]*$/u, `unknown form for the column: ${espressione} (teach this test to read it)`);
  const definizione = app.match(new RegExp(`\\n  const ${espressione} = \\$\\('([^']+)'\\);`, 'u'));
  assert.ok(definizione, `the constant ${espressione} is not a plain $('…') lookup in app.js`);
  return definizione[1];
}

let browser; let script;
test.after(() => browser?.close());
test.before(async () => {
  const banco = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { montaPonteLegacy } from './src/bridge/legacy-dom.js';
    import { creaVisteDelBlocco } from './src/components/blocchi/viste.js';
    import { creaAggancioBlocchi } from './src/components/blocchi/aggancio.js';
    import { t } from './src/components/lingua.js';
    window.gl = { montaPonteLegacy, creaVisteDelBlocco, creaAggancioBlocchi, t };
  `, resolveDir: frontend, sourcefile: 'gl-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  script = banco.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

async function paginaVera(t) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  t.after(() => page.close());
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await page.route('**/*', (route) => route.abort());
  await page.setContent(PAGINA);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => window.gl.montaPonteLegacy(document));
  return { page, errori };
}

test('LATO-PAGINA-VERA-1 after the bridge, the column app.js names for the side view IS the right column of the page', async (t) => {
  const selettore = selettoreDellaColonna(APP);
  const { page, errori } = await paginaVera(t);
  const esito = await page.evaluate((sel) => {
    const trovata = document.querySelector(sel);
    const colonna = document.querySelector('aside.talos-inspector');
    return { trovata: Boolean(trovata), stessa: Boolean(trovata) && trovata === colonna, id: colonna?.id ?? null };
  }, selettore);
  assert.equal(esito.id, 'inspectorPanel', 'premise: the bridge renames the right column');
  assert.ok(esito.trovata, `app.js looks for the column with «${selettore}», which the page after the bridge does not have`);
  assert.ok(esito.stessa, `«${selettore}» finds something that is not the right column`);
  assert.deepEqual(errori, []);
});

test('LATO-PAGINA-VERA-2 «Open on the side» from the block menu lands in the right column, not in the full screen', async (t) => {
  const selettore = selettoreDellaColonna(APP);
  const { page, errori } = await paginaVera(t);
  const esito = await page.evaluate(([sel, testo]) => {
    const { creaVisteDelBlocco, creaAggancioBlocchi, t: tr } = window.gl;
    const aperte = [];
    const viste = creaVisteDelBlocco({ document, colonna: () => document.querySelector(sel), apriColonna: () => aperte.push('colonna') });
    const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna() {}, azioni: { lato: viste.lato, schermo: viste.schermo } });
    const nodo = a.blocco(testo, true);
    document.querySelector('#conversation').append(nodo);
    nodo.querySelector('button[aria-haspopup="menu"]').click();
    const voce = [...document.querySelectorAll('#menuDelBlocco [role="menuitem"]')].find((b) => b.textContent.trim().startsWith(tr('blocchi.actions.side')));
    if (!voce) return { voce: false };
    voce.click();
    const lato = document.querySelector('.gu-lato');
    return { voce: true, lato: Boolean(lato), nellaColonna: lato?.parentElement === document.querySelector('aside.talos-inspector'), schermo: Boolean(document.querySelector('.gu-schermo')), aperte };
  }, [selettore, TABELLA]);
  assert.ok(esito.voce, 'the block menu has «Open on the side»');
  assert.equal(esito.schermo, false, 'the full screen did not open in its place');
  assert.ok(esito.lato && esito.nellaColonna, 'the side view sits in the right column');
  assert.deepEqual(esito.aperte, ['colonna'], 'the column is asked to open once');
  assert.deepEqual(errori, []);
});
