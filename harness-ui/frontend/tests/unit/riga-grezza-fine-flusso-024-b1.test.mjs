import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { argomentiDellaRiga, argomentiGrezziDellaRiga, leggiArgomentiDellaRiga } from '../../src/components/carta-dal-testo.js';
import { oscuraFormeDiSegreto } from '../../../src/forme-di-segreto.mjs';

/*
 * 0.2.4, block 1, round 2, item B (reviewer YELLOW 2, a visible regression): while raw (non JSON) arguments arrive, a last word that is the
 * start of a key form is held back as «…». The row had no redraw when the arguments were complete, so `which npm` stayed `which …` for
 * good. Now the end of the arguments (the call's output, its result, or an interruption) redraws the raw row with the plain masks, once,
 * without wiping what was appended below it. The REAL functions are cut out of the `app.js` IIFE (as SUGG-01 does) and run on a tiny fake
 * DOM. Fake secrets only. Red on 7ec3e9c3d: RIGA-FINE-01 still shows «which …».
 */
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

function corpoFunzione(sorgente, nome) {
  const inizio = sorgente.search(new RegExp(`(async )?function ${nome}\\s*\\(`));
  if (inizio === -1) return null;
  const dopo = /\)\s*\{\s*\n/u.exec(sorgente.slice(inizio)); // the body's brace, not one in a default parameter
  const apertura = inizio + dopo.index + dopo[0].indexOf('{');
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') { livello -= 1; if (livello === 0) return sorgente.slice(inizio, i + 1); }
  }
  return null;
}

/** just what the row drawing uses: createElement, className, textContent, dataset, children, replaceChildren, appendChild */
function elemento(tag) {
  const el = {
    tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], _testo: '',
    get firstElementChild() { return el.children[0] ?? null; },
    get textContent() { return el.children.length ? el.children.map((c) => c.textContent).join('') : el._testo; },
    set textContent(v) { el.children = []; el._testo = String(v); },
    appendChild(c) { el.children.push(c); return c; },
    replaceChildren(...c) { el.children = [...c]; },
    setAttribute() {},
  };
  return el;
}

const NOMI = ['textElement', 'renderizzaArgomentiAttrezzo', 'aggiornaVistaArgomentiAttrezzo', 'disegnaArgomentiSeInAttesa', 'chiudiArgomentiInArrivo'];
function banco() {
  const fonti = NOMI.map((nome) => corpoFunzione(APP, nome));
  for (const [i, fonte] of fonti.entries()) assert.ok(fonte, `app.js: function ${NOMI[i]} found`);
  const ambiente = {
    document: { createElement: elemento, createTextNode: (testo) => { const n = elemento('#text'); n.textContent = testo; return n; } }, argomentiAttrezzoInAttesa: new Set(), argomentiDellaRiga, argomentiGrezziDellaRiga, leggiArgomentiDellaRiga,
    tr: (k) => k, etichettaArgomento: (k) => k, riassuntoAttrezzoInCorso: () => '', dettaglioRigaAttrezzo: () => '',
  };
  const nomi = Object.keys(ambiente);
  return new Function(...nomi, `${fonti.join('\n')}\nreturn { ${NOMI.join(', ')} };`)(...nomi.map((k) => ambiente[k]));
}

function flusso(f, testo) {
  const info = { nome: 'shell', argomenti: '', detail: elemento('div') };
  for (const pezzo of testo.match(/[\s\S]{1,3}/gu)) { info.argomenti += pezzo; f.aggiornaVistaArgomentiAttrezzo(info); }
  return info;
}

test('RIGA-FINE-01: at the end of the arguments the raw row shows the whole text, its last word too', () => {
  const f = banco();
  for (const testo of ['which npm', 'ls gh', 'pip install sk', 'echo done --', 'use the key AKI']) {
    const info = flusso(f, testo);
    assert.match(info.detail.textContent, /…$/u, `${testo}: held while it arrives (as before)`);
    f.chiudiArgomentiInArrivo(info);
    assert.equal(info.detail.textContent, testo, `${testo}: whole at the end`);
    f.aggiornaVistaArgomentiAttrezzo(info);
    assert.equal(info.detail.textContent, testo, `${testo}: a later redraw of the row keeps it whole`);
  }
});

test('RIGA-FINE-02: the final row is the masked text, never a secret; and the redraw keeps what was appended below', () => {
  const f = banco();
  const segreto = 'sk-proj-' + 'FINTO0a1b2c3d4e5f6g7h8i9j0k1l2';
  const testo = `deploy --key ${segreto}`;
  const info = flusso(f, testo);
  const uscita = info.detail.appendChild(elemento('pre'));
  uscita.textContent = 'live output';
  f.chiudiArgomentiInArrivo(info);
  assert.equal(info.detail.children[0].textContent, oscuraFormeDiSegreto(testo));
  assert.ok(!info.detail.textContent.includes('FINTO'));
  assert.equal(info.detail.children[1], uscita, 'the live output below is not wiped');
  f.chiudiArgomentiInArrivo(info);
  assert.equal(info.detail.children.length, 2, 'a second end is a no-op');
});

test('RIGA-FINE-03: JSON rows and the person\'s own command are not touched by the end of the arguments', () => {
  const f = banco();
  const json = flusso(f, JSON.stringify({ comando: 'which npm' }));
  const prima = json.detail.textContent;
  f.chiudiArgomentiInArrivo(json);
  assert.equal(json.detail.textContent, prima);
  const persona = { nome: 'shell', argomenti: 'which np', detail: elemento('div'), comandoDellaPersona: true };
  f.chiudiArgomentiInArrivo(persona);
  assert.equal(persona.detail.children.length, 0);
  assert.equal(argomentiGrezziDellaRiga('which npm', { finito: true }), 'which npm');
  assert.equal(argomentiGrezziDellaRiga('which npm'), 'which …', 'while it arrives the tail is still held');
});

test('RIGA-FINE-04: every end of the arguments in app.js goes through the redraw (output, process output, result, interruption)', () => {
  const chiamate = APP.match(/chiudiArgomentiInArrivo\(info\);/gu) ?? []; // the calls, not the definition
  assert.ok(chiamate.length >= 4, `found ${chiamate.length}`);
  for (const caso of ["case 'ToolCallOutput'", "case 'ToolCallResult'"]) {
    const da = APP.lastIndexOf(caso); // the live event switch is the last one in the file
    assert.ok(da > 0 && APP.slice(da, da + 800).includes('chiudiArgomentiInArrivo(info)'), caso);
  }
});
