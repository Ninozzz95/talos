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
    const tinte = { si: tinta('--talos-success'), no: tinta('--talos-muted'), testo: tinta('--talos-assistant-text') };
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
  assert.deepEqual(m.esiti.map((e) => e.testo), ['Approvato', 'Hai detto di no']);
  assert.deepEqual(m.esiti.map((e) => e.fs), ['12px', '12px']);
  assert.deepEqual(m.esiti.map((e) => e.colore), [m.tinte.si, m.tinte.no], 'il sì verde e il no della persona neutro (decisione 89, 03/11/2026)');
  for (const e of m.esiti) assert.ok(e.fondo >= 10, `l’esito non tocca il fondo della carta (${e.fondo}px)`);
});

/* ⛔ Decisioni 89 e 92 dell'owner (03/11/2026): il no detto dalla persona non è un guasto. Sulla carta chiusa si legge
   «Hai detto di no», neutro come la riga del passo («non consentito»), anche quando arriva da un'altra finestra; e il pulsante
   «Nega» è grigio, non rosso. Restano col loro tono: il no chiuso dal server («nessuno poteva rispondere»), anche sulla carta
   di un'automazione, e lo Stop. «Modificata da te» è una scelta della persona: neutra anche lei (allineata al telefono).
   Decisione 96 (03/11/2026): anche l'«Annullata» delle automazioni e dei fornitori, quando è la persona a dire no, è grigia;
   la parola resta la stessa. */
test('NO-NEUTRO-PC: il no della persona, «Modificata da te» e l’«Annullata» sono neutri; il no del server e lo Stop no', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(() => {
    const r = document.getElementById('r');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; r.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const esito = (opz, carta = '') => {
      const { scheda } = window.fc.creaApprovazione({ badge: 'Chiede di scrivere', bersaglio: 'note/a.txt' });
      if (carta) scheda.dataset[carta] = '1';
      r.append(scheda);
      const riga = window.fc.segnaEsitoApprovazione(scheda, opz);
      return { testo: riga.textContent, colore: getComputedStyle(riga).color, classe: riga.className };
    };
    const { pulsanti } = window.fc.creaApprovazione({ badge: 'Chiede di scrivere', bersaglio: 'note/a.txt' });
    r.append(pulsanti.nega.closest('article') || pulsanti.nega.parentElement);
    return {
      muto: tinta('--talos-muted'), rosso: tinta('--talos-danger'),
      qui: esito({ approvato: false }),
      altrove: esito({ approvato: false, altrove: true }),
      modificata: esito({ approvato: false, motivo: 'modificata-dalla-persona' }),
      server: esito({ approvato: false, motivo: 'nessuna-interfaccia' }),
      fermata: esito({ approvato: false, motivo: 'fermato' }),
      annullata: esito({ approvato: false }, 'cartaAutomazione'),
      annullataAltrove: esito({ approvato: false, altrove: true }, 'cartaAutomazione'),
      fornitori: esito({ approvato: false }, 'cartaFornitori'),
      automazioneServer: esito({ approvato: false, motivo: 'nessuna-interfaccia' }, 'cartaAutomazione'),
      nega: { testo: pulsanti.nega.textContent, classe: pulsanti.nega.className, colore: getComputedStyle(pulsanti.nega).color },
    };
  });
  assert.notEqual(m.muto, m.rosso, 'le tinte di prova devono essere diverse, o la prova non morde');
  assert.deepEqual([m.qui.testo, m.qui.colore], ['Hai detto di no', m.muto]);
  assert.match(m.qui.classe, /talos-approval__esito--neutro/u);
  assert.deepEqual([m.altrove.testo, m.altrove.colore], ['Hai detto di no da un’altra finestra', m.muto], 'neutro anche col suffisso, come il telefono');
  assert.deepEqual([m.modificata.testo, m.modificata.colore], ['Modificata e salvata da te', m.muto]);
  assert.deepEqual([m.server.testo, m.server.colore], ['Negato: nessuno poteva rispondere in questa sessione automatica', m.rosso], 'il no del server resta un no');
  assert.equal(m.fermata.testo, 'Fermata prima della risposta');
  assert.match(m.fermata.classe, /talos-approval__esito--no/u, '«Fermata» fuori da questo giro (Desktop, 03/11)');
  assert.deepEqual([m.annullata.testo, m.annullata.colore], ['Annullata', m.muto], 'decisione 96: l’automazione ha la sua parola, in grigio');
  assert.match(m.annullata.classe, /talos-approval__esito--neutro/u);
  assert.deepEqual([m.annullataAltrove.testo, m.annullataAltrove.colore], ['Annullata da un’altra finestra', m.muto]);
  assert.deepEqual([m.fornitori.testo, m.fornitori.colore], ['Annullata', m.muto], 'la carta dei fornitori dice la stessa parola, nello stesso tono');
  assert.deepEqual([m.automazioneServer.testo, m.automazioneServer.colore], ['Negato: nessuno poteva rispondere in questa sessione automatica', m.rosso], 'il no del server resta rosso anche sulla carta di un’automazione');
  assert.equal(m.nega.testo, 'Nega');
  assert.doesNotMatch(m.nega.classe, /talos-button--danger/u, 'decisione 92: il «Nega» è grigio');
  assert.notEqual(m.nega.colore, m.rosso);
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
