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
/* Corsia C della lingua (03/10/2026): il componente importa `lingua.js` e il dizionario, che una pagina senza server non
   può risolvere. Si inietta il suo PACCHETTO (esbuild, come la build), non il sorgente nudo. */
const pacchetto = (await build({ entryPoints: [fileURLToPath(new URL('../../src/components/process-output.js', import.meta.url))], bundle: true, format: 'iife', globalName: '__poModulo', write: false, logLevel: 'silent' })).outputFiles[0].text;
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
  await page.addScriptTag({ content: `${pacchetto}\nwindow.__po = { creaLettoreOutput: __poModulo.creaLettoreOutput };` });
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

/* Owner 08/10/2026 notte: un comando passato in sottofondo ha la ricevuta conclusa con terminazione 'background'. La riga di
   stato non deve dire «Registrazione conclusa» (il comando gira ancora): dice che è in sottofondo e che il resto va nel suo file. */
test('LETTORE-OUTPUT-SOTTOFONDO: la ricevuta di un comando in sottofondo dice «in sottofondo», prima e dopo la lettura', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(() => page.close());
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><div id="r"></div></body></html>');
  await page.addScriptTag({ content: `${pacchetto}\nwindow.__po = { creaLettoreOutput: __poModulo.creaLettoreOutput };` });
  await page.waitForFunction(() => window.__po);
  const testi = await page.evaluate(async ([ricevuta, p]) => {
    const fuori = {};
    for (const [nome, r] of [['sfondo', { ...ricevuta, termination: 'background' }], ['sfondoLimite', { ...ricevuta, state: 'limited', termination: 'background' }], ['normale', ricevuta], ['limite', { ...ricevuta, state: 'limited' }]]) {
      /* la pagina vera porta lo stato della registrazione: «limited» per una ricevuta col tetto raggiunto */
      const dati = { ...p, state: r.state };
      const lettore = window.__po.creaLettoreOutput({ receipt: r, API: (x) => `http://127.0.0.1:9${x}`, fetchFn: async () => ({ ok: true, json: async () => ({ ok: true, data: dati }) }) });
      document.getElementById('r').append(lettore.element);
      const stato = lettore.element.querySelector('.talos-process-output__status');
      const prima = stato.textContent;
      lettore.element.open = true;
      await new Promise((ok) => setTimeout(ok, 50));
      fuori[nome] = { prima, dopo: stato.textContent };
    }
    return fuori;
  }, [RICEVUTA, CASI.vuoto]);
  /* Review del collega, 08/10: la frase è una FOTOGRAFIA del passaggio di mano — mai «ancora in corso», che diventa falso quando il
     comando finisce o lo fermi; lo stato vivo sta nella scheda Processi. E col tetto già raggiunto lo dice. */
  const atteso = 'Passato in sottofondo: questo è ciò che aveva scritto fino a lì. Il resto va nel suo file di output; nella scheda Processi vedi se è ancora in corso.';
  const attesoLimite = 'Passato in sottofondo dopo aver raggiunto il limite di conservazione: una parte di ciò che aveva scritto fino a lì non è stata conservata. Il resto va nel suo file di output; nella scheda Processi vedi se è ancora in corso.';
  assert.equal(testi.sfondo.prima, atteso);
  assert.equal(testi.sfondo.dopo, atteso);
  assert.equal(testi.sfondoLimite.prima, attesoLimite);
  assert.equal(testi.sfondoLimite.dopo, attesoLimite);
  for (const e of [testi.sfondo, testi.sfondoLimite]) assert.doesNotMatch(e.prima, /ancora in corso:/u, 'mai «ancora in corso» come fatto');
  assert.equal(testi.normale.prima, 'Registrazione conclusa.', 'AL CONTRARIO: senza la terminazione la frase è quella di sempre');
  assert.equal(testi.limite.prima, 'Limite di conservazione raggiunto: una parte dell’output non è stata conservata.', 'AL CONTRARIO: limited senza sottofondo resta com’era');
});
