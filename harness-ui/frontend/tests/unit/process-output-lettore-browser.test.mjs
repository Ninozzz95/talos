/*
 * ⛔ 02/10/2026 sera — owner («sì, tutti e tre»), dalle foto del 4174: nel lettore «Consulta output conservato» le due righe di
 * stato uscivano a 17 px col colore del testo (dentro `.talos-message`, `.talos-message p` batte le loro regole), e la riga
 * diceva «La separazione dei dati di controllo non è confermata» anche su un flusso VUOTO. Componente vero e foglio VERO
 * (`main.css`), in un Chromium senza server e senza porte: le letture passano da un `fetchFn` finto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const sorgente = await readFile(new URL('../../src/components/process-output.js', import.meta.url), 'utf8');
const soloFrontend = { name: 'solo-frontend', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'po' };
  });
  b.onLoad({ filter: /.*/, namespace: 'po' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: 'css' }));
} };
const foglio = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], entryPoints: [resolve(frontend, 'src/styles/main.css')], bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text;

const RICEVUTA = { schema: 'talos.process-output.v1', sessionId: 's1', runId: 'run1', toolCallId: 'call1', outputId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'complete' };
const pagina = (extra) => ({ schema: 'talos.process-output-page.v1', outputId: RICEVUTA.outputId, runId: 'run1', toolCallId: 'call1', stream: 'stdout', offset: 0, state: 'complete', encoding: 'utf-8', nextOffset: null, ...extra });
const CASI = {
  vuoto: pagina({ bytes: 0, availableBytes: 0, storedBytes: 0, observedBytes: 0, text: '', footerStatus: 'not-found' }),
  conTesto: pagina({ bytes: 4, availableBytes: 4, storedBytes: 4, observedBytes: 4, text: 'ciao', footerStatus: 'pending-marker-prefix' }),
  tolto: pagina({ bytes: 4, availableBytes: 4, storedBytes: 4, observedBytes: 4, text: 'ciao', footerStatus: 'excluded' }),
};

let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(() => browser?.close());

test('LETTORE-OUTPUT-STILE: dentro la chat le righe di stato sono piccole e attenuate; l’avviso del segno di fine è in parole e solo quando serve', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(() => page.close());
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><div id="conversation"><article class="talos-message"><div class="talos-message__body" id="r"></div></article></div></body></html>');
  await page.addStyleTag({ content: foglio });
  await page.addScriptTag({ type: 'module', content: `${sorgente}\nwindow.__po = { creaLettoreOutput };` });
  await page.waitForFunction(() => window.__po);
  const m = await page.evaluate(async ([ricevuta, casi]) => {
    const r = document.getElementById('r');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; r.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const esiti = {};
    for (const [nome, p] of Object.entries(casi)) {
      const lettore = window.__po.creaLettoreOutput({ receipt: ricevuta, API: (x) => `http://127.0.0.1:9${x}`, fetchFn: async () => ({ ok: true, json: async () => ({ ok: true, data: p }) }) });
      r.append(lettore.element);
      lettore.element.open = true;
      await new Promise((ok) => setTimeout(ok, 50));
      const stato = lettore.element.querySelector('.talos-process-output__status');
      const s = getComputedStyle(stato);
      esiti[nome] = { testo: stato.textContent, fs: s.fontSize, colore: s.color, rangeFs: getComputedStyle(lettore.element.querySelector('.talos-process-output__range')).fontSize };
    }
    return { esiti, muto: tinta('--talos-muted'), testo: tinta('--talos-assistant-text') };
  }, [RICEVUTA, CASI]);
  assert.notEqual(m.muto, m.testo, 'le tinte di prova devono essere diverse, o la prova non morde');
  for (const e of Object.values(m.esiti)) {
    assert.equal(e.fs, '13px');
    assert.equal(e.rangeFs, '13px');
    assert.equal(e.colore, m.muto);
  }
  assert.equal(m.esiti.vuoto.testo, 'Registrazione conclusa.', 'su un flusso vuoto non c’è niente da avvisare');
  assert.equal(m.esiti.conTesto.testo, 'Registrazione conclusa. In fondo potrebbe esserci un segno interno di TALOS, che non fa parte dell’output del comando.');
  assert.equal(m.esiti.tolto.testo, 'Registrazione conclusa.');
  for (const e of Object.values(m.esiti)) assert.doesNotMatch(e.testo, /dati di controllo/u);
});
