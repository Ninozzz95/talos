/*
 * ⛔ 02/10/2026 sera — owner, due «sì» dopo le foto della scheda MCP sul 4174:
 *  · «come nella MCP»: l'esito della card del CONSENSO («Approvato»/«Negato») usciva a 17 px col colore del testo, perché
 *    dentro `.talos-message` `.talos-message p` (0,1,1) e `p:last-child` (0,2,1) battono `.talos-approval__esito` (0,1,0);
 *    la regola del 07/9 vuole una pillola da 12 px verde o rossa, l'unica cosa che distingue un sì da un no;
 *  · i pallini della scelta singola delle DOMANDE erano il blu di Chromium, a 13 px e col margine di serie.
 * Componenti veri e foglio VERO dell'app (`main.css` con i suoi @import), impacchettati con esbuild come in
 * `provider-modale-salva-browser.test.mjs`, in un Chromium senza server e senza porte.
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
    return { path, namespace: 'fc' };
  });
  b.onLoad({ filter: /.*/, namespace: 'fc' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: extname(args.path) === '.css' ? 'css' : 'js' }));
} };

let browser, script, foglio;
test.before(async () => {
  script = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], stdin: { contents: `
    import { creaApprovazione, segnaEsitoApprovazione } from './src/components/conversazione.js';
    import { mountUserQuestionDock } from './src/components/user-question-dock.js';
    window.fc = { creaApprovazione, segnaEsitoApprovazione, mountUserQuestionDock };
  `, resolveDir: frontend, sourcefile: 'fc-banco.js' }, bundle: true, write: false, format: 'iife', logLevel: 'silent' })).outputFiles[0].text;
  foglio = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], entryPoints: [resolve(frontend, 'src/styles/main.css')], bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
test.after(() => browser?.close());

async function pagina(t) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(() => page.close());
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  t.after(() => assert.deepEqual(errori, []));
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><div id="conversation"><article class="talos-message"><div class="talos-message__body" id="r"></div></article></div><div id="dock"></div><div id="composer"></div></body></html>');
  await page.addStyleTag({ content: foglio });
  await page.addScriptTag({ content: script });
  return page;
}

test('CONSENSO-ESITO-STILE: dentro la chat «Approvato» e «Negato» sono pillole da 12 px col loro tono, staccate dal fondo', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(() => {
    const r = document.getElementById('r');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; r.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const tinte = { si: tinta('--talos-success'), no: tinta('--talos-danger'), testo: tinta('--talos-assistant-text') };
    const esiti = [true, false].map((approvato) => {
      const { scheda: card } = window.fc.creaApprovazione({ badge: 'Chiede di eseguire', bersaglio: 'npm test', perche: 'Per provare la cura.', codice: 'npm test' });
      r.append(card);
      const riga = window.fc.segnaEsitoApprovazione(card, { approvato });
      const c = getComputedStyle(riga);
      return { testo: riga.textContent, fs: c.fontSize, colore: c.color, fondo: Math.round(card.getBoundingClientRect().bottom - parseFloat(getComputedStyle(card).borderBottomWidth) - riga.getBoundingClientRect().bottom) };
    });
    return { tinte, esiti };
  });
  assert.notEqual(m.tinte.si, m.tinte.testo, 'le tinte di prova devono essere diverse dal testo, o la prova non morde');
  assert.deepEqual(m.esiti.map((e) => e.testo), ['Approvato', 'Negato']);
  assert.deepEqual(m.esiti.map((e) => e.fs), ['12px', '12px']);
  assert.deepEqual(m.esiti.map((e) => e.colore), [m.tinte.si, m.tinte.no], 'il sì verde e il no rosso: la regola del 07/9');
  for (const e of m.esiti) assert.ok(e.fondo >= 10, `l’esito non tocca il fondo della carta (${e.fondo}px)`);
});

test('CONSENSO-MOTIVO-STILE: dentro la chat il motivo del consenso è a 12,5 px e attenuato (D1), non a misura di chat', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(() => {
    const r = document.getElementById('r');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; r.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const { scheda, motivo } = window.fc.creaApprovazione({ badge: 'Chiede di eseguire', bersaglio: 'ping', perche: 'Vuole eseguire questo comando nel terminale:', codice: 'ping -c 60 127.0.0.1', motivo: 'Questo comando gira in Linux (WSL) come root.' });
    r.append(scheda);
    const c = getComputedStyle(motivo);
    return { fs: c.fontSize, colore: c.color, muto: tinta('--talos-muted'), testo: tinta('--talos-assistant-text') };
  });
  assert.notEqual(m.muto, m.testo);
  assert.deepEqual([m.fs, m.colore], ['12.5px', m.muto]);
});

test('ASK-PALLINO-STILE: i pallini della scelta singola hanno l’accento del tema, 15 px, senza il margine di serie a sinistra', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(() => {
    const dock = document.getElementById('dock');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; dock.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    window.fc.mountUserQuestionDock({ root: dock, composer: document.getElementById('composer'), onSubmit: () => {}, question: { requestId: 'req-pallino', sessionId: 's', questions: [
      { id: 'strada', question: 'Quale strada prendo?', options: [{ label: 'Veloce' }, { label: 'Completa' }] },
      { id: 'canali', question: 'Su quali canali?', multiSelect: true, options: [{ label: 'Stabile' }, { label: 'Anteprima' }] },
    ] } });
    const radio = dock.querySelector('input[type="radio"]');
    const c = getComputedStyle(radio);
    return { accento: tinta('--talos-accent'), colore: c.accentColor, w: c.width, h: c.height, ml: c.marginLeft, mt: c.marginTop };
  });
  assert.equal(m.colore, m.accento, 'non il blu di Chromium');
  assert.deepEqual([m.w, m.h, m.ml, m.mt], ['15px', '15px', '0px', '3px']);
});
