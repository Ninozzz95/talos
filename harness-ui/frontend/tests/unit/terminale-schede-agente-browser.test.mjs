/*
 * ⭐ PO-10 passo 2 (02/10/2026) — le linguette delle schede AGENTE del Terminale (`components/terminale.js`), in un Chromium
 * vero col foglio vero (`main.css`). Decisioni dell'owner: si riconoscono (icona dello sprite, come Hermes `rail.tsx:144-145`),
 * il pallino finito è verde o rosso se un comando è fallito, si chiudono ma NON si rinominano (né doppio clic, né F2, né menu).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const soloFrontend = { name: 'solo-frontend', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'ts' };
  });
  b.onLoad({ filter: /.*/, namespace: 'ts' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: extname(args.path) === '.css' ? 'css' : 'js' }));
} };

let browser, script, foglio;
test.before(async () => {
  script = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], stdin: { contents: `
    import { creaSchedeTerminale } from './src/components/terminale.js';
    window.ts = { creaSchedeTerminale };
  `, resolveDir: frontend, sourcefile: 'ts-banco.js' }, bundle: true, write: false, format: 'iife', logLevel: 'silent' })).outputFiles[0].text;
  foglio = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], entryPoints: [resolve(frontend, 'src/styles/main.css')], bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
test.after(() => browser?.close());

const SCHEDE = [
  { terminalId: 's1', origine: 'tu', titolo: null, shell: 'git-bash', stato: 'live', cartella: 'C:/p' },
  { terminalId: 'agente-giro-2', origine: 'agente', giro: 2, titolo: null, stato: 'live' },
  { terminalId: 'agente-giro-3', origine: 'agente', giro: 3, titolo: null, stato: 'con-errori' },
  { terminalId: 'agente-giro-4', origine: 'agente', giro: 4, titolo: null, stato: 'concluso' },
];

test('PO10-LINGUETTE: icona e pallino delle schede agente; niente rinomina per loro, sì per le tue', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(() => page.close());
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><section class="talos-terminal" id="pane"><div class="talos-terminal__tabs" role="tablist"></div><div id="pannelloSchedaTerminale"></div><div class="talos-terminal__foot"></div></section></body></html>');
  await page.addStyleTag({ content: foglio });
  await page.addScriptTag({ content: script });
  await page.evaluate((schede) => {
    window.rinominate = []; window.chiuse = [];
    window.ui = window.ts.creaSchedeTerminale(document.getElementById('pane'), { azioni: { seleziona: () => {}, chiudi: (id) => window.chiuse.push(id), rinomina: (id, n) => window.rinominate.push([id, n]) } });
    window.ui.aggiorna({ schede, attiva: 's1', puoAprire: true, badges: [], piede: { chi: "Lanciata dall'agente al giro 2", dettaglio: 'C:/p', stato: 'in corso', nota: 'Sola lettura: qui si guardano i comandi dell’agente.' } });
  }, SCHEDE);
  const linguette = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((b) => ({
    testo: b.textContent.trim(), origine: b.dataset.origine ?? null, icona: b.querySelector('use')?.getAttribute('href') ?? null,
    pallino: b.querySelector('.talos-dot')?.className, descrizione: b.getAttribute('aria-description'),
  })));
  assert.deepEqual(linguette.map((l) => [l.testo, l.origine, l.icona]), [
    ['tu · Git Bash', null, null],
    ['agente · giro 2', 'agente', '#i-robot'],
    ['agente · giro 3', 'agente', '#i-robot'],
    ['agente · giro 4', 'agente', '#i-robot'],
  ]);
  assert.deepEqual(linguette.slice(1).map((l) => l.pallino), ['talos-dot talos-dot--live', 'talos-dot talos-dot--danger', 'talos-dot talos-dot--success']);
  assert.equal(linguette[1].descrizione, 'Comandi dell’agente, in sola lettura');
  assert.match(await page.locator('.talos-terminal__foot').textContent(), /Lanciata dall'agente al giro 2.*in corso.*Sola lettura/u);

  // la scheda agente: doppio clic e F2 non aprono la rinomina, il menu non la offre
  const agente = page.locator('[role=tab]', { hasText: 'agente · giro 2' });
  await agente.dblclick();
  assert.equal(await page.locator('.talos-terminal__rinomina').count(), 0, 'doppio clic: niente campo');
  await agente.focus(); await page.keyboard.press('F2');
  assert.equal(await page.locator('.talos-terminal__rinomina').count(), 0, 'F2: niente campo');
  await agente.click({ button: 'right' });
  const vociAgente = await page.locator('#menuSchedaTerminale [role=menuitem]').allTextContents();
  assert.ok(vociAgente.includes('Chiudi') && !vociAgente.includes('Rinomina'), `menu della scheda agente: ${vociAgente.join(', ')}`);
  await page.keyboard.press('Escape');
  // AL CONTRARIO: la tua scheda si rinomina ancora
  const tua = page.locator('[role=tab]', { hasText: 'tu · Git Bash' });
  await tua.click({ button: 'right' });
  assert.ok((await page.locator('#menuSchedaTerminale [role=menuitem]').allTextContents()).includes('Rinomina'));
  await page.keyboard.press('Escape');
  await tua.dblclick();
  assert.equal(await page.locator('.talos-terminal__rinomina').count(), 1, 'la tua scheda si rinomina col doppio clic');
  assert.deepEqual(errori, []);
});
