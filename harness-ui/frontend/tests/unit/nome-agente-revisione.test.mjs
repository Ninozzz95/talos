/*
 * Revisione avversaria di L3-17 (0c0109336, 16/10/2026) — «un nome solo ovunque».
 *
 * NOME-REV-01: il diagramma delle deleghe che la persona vede (`runDalleDeleghe`, montato da `creaClientDeleghe`) legge ancora
 *   `nomeIntero` (taskCorto PRIMA di nome): due sorelle «Controlla i test-2» e «-3» nel pannello sono due «Controlla i test»
 *   nel diagramma. La prova del ramo (NOME-AGENTE-CLIENT-02) guarda `modelloGrafoAgenti`, che oggi serve solo il pannello.
 * NOME-REV-02: `children` non manda più `task` quando è uguale a `taskCorto`; il foglio e il velo «Albero» leggono `figlio.task`
 *   senza ripiego: «compito non registrato», e la sessione si apre con un nome undefined.
 * NOME-REV-03: la scheda compatta del pannello Agenti mette sotto il nome `a.task || a.modello`: senza `task` dice il modello.
 * NOME-REV-04: un nome fatto solo di caratteri che ingannano (una rinomina a mano lo accetta: `trim()` non li toglie) ripulito è
 *   vuoto, e `nomeDellAgente` non passa al compito: l'agente diventa «senza nome».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nomeDellAgente, runDalleDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';
import { disegnaAgenti } from '../../src/components/inspector.js';

test('NOME-REV-01 — il diagramma delle deleghe porta lo stesso nome del pannello (nomeDellAgente), col «-N» fra sorelle', () => {
  const corrente = { sessionId: 'madre', nome: 'La madre', avviataAlle: '2026-10-16T09:00:00.000Z' };
  const figli = [
    { sessionId: 'f1', padreId: 'madre', nome: 'Controlla i test-2', taskCorto: 'Controlla i test', avviataAlle: '2026-10-16T09:01:00.000Z' },
    { sessionId: 'f2', padreId: 'madre', nome: 'Controlla i test-3', taskCorto: 'Controlla i test', avviataAlle: '2026-10-16T09:01:01.000Z' },
  ];
  const run = runDalleDeleghe({ corrente, sessioni: [corrente], figli });
  const righe = run.tutte; // le righe di tutti i lotti (`righe` è una mappa lotto → righe)
  const etichetta = (id) => righe.find((r) => r.sessionId === id)?.label;
  assert.ok(etichetta('f1') !== undefined && etichetta('f2') !== undefined, 'premessa: le due figlie sono nel diagramma');
  assert.equal(etichetta('f1'), nomeDellAgente(figli[0]), `il diagramma dice «${etichetta('f1')}», il pannello «${nomeDellAgente(figli[0])}»`);
  assert.notEqual(etichetta('f1'), etichetta('f2'), 'due sorelle con lo stesso compito restano distinguibili');
});

test('NOME-REV-02 — chi legge `children[].task` ripiega su taskCorto (o usa nomeDellAgente): il foglio e il velo «Albero»', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const senzaRipiego = app.split('\n').map((riga, i) => [i + 1, riga])
    .filter(([, riga]) => /\bfiglio\.task\b/u.test(riga) && !/taskCorto|nomeDellAgente/u.test(riga) && !/^\s*(\*|\/\/|\/\*)/u.test(riga) && !riga.includes('aperture di una figlia')); // l'ultima è un commento a blocco
  assert.deepEqual(senzaRipiego.map(([n, r]) => `${n}: ${r.trim().slice(0, 90)}`), [],
    'con `task` omesso (uguale a taskCorto) queste righe dicono «compito non registrato» e aprono la sessione con un nome undefined');
});

/** Il documento finto della prova del ramo (inspector-agenti), con `prepend` per la scheda compatta. */
function documentoFinto() {
  const crea = (tag) => {
    const attributi = new Map();
    const nodo = {
      tag, classi: new Set(), dataset: {}, figli: [], ascolti: [], testoProprio: '', tabIndex: -1, style: {},
      get className() { return [...nodo.classi].join(' '); },
      set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: { add: (...c) => c.forEach((x) => nodo.classi.add(x)), remove: (...c) => c.forEach((x) => nodo.classi.delete(x)), contains: (c) => nodo.classi.has(c), toggle: (c, s) => (s ?? !nodo.classi.has(c)) ? nodo.classi.add(c) : nodo.classi.delete(c) },
      get childNodes() { return nodo.figli; },
      get textContent() { return nodo.testoProprio !== '' ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { nodo.testoProprio = String(v); },
      setAttribute: (k, v) => { if (k === 'class') { nodo.className = String(v); return; } attributi.set(k, String(v)); },
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      append: (...x) => nodo.figli.push(...x),
      prepend: (...x) => nodo.figli.unshift(...x),
      appendChild: (x) => { nodo.figli.push(x); return x; },
      replaceChildren: (...x) => { nodo.figli = [...x]; },
      addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
      trova: (classe) => (nodo.classi.has(classe) ? nodo : nodo.figli.map((f) => f.trova?.(classe)).find(Boolean) || null),
    };
    return nodo;
  };
  return { createElement: crea, createElementNS: (_ns, tag) => crea(tag) };
}

test('NOME-REV-03 — la scheda compatta dice il compito, non il modello, anche quando `children` non ripete `task`', () => {
  const d = documentoFinto();
  const contenitore = d.createElement('div');
  disegnaAgenti(d, contenitore, [{ sessionId: 'figlia-1', nome: 'Riassumi il file-2', taskCorto: 'Riassumi il file', modello: 'z-ai/glm-5.3-flash', conclusa: true, esitoDelega: 'concluso' }], { compatta: true });
  const compito = contenitore.figli[0]?.trova('talos-agenti-compito');
  assert.ok(compito, 'premessa: la riga sotto il nome c\'è');
  assert.equal(compito.textContent, 'Riassumi il file', `dice «${compito.textContent}»`);
});

test('NOME-REV-04 — un nome di soli caratteri che ingannano non cancella l\'agente: si passa al compito', () => {
  const nome = String.fromCodePoint(0x202E, 0x2066); // U+202E e U+2066, nella classe di testo-a-schermo.js: trim() non li toglie, la rinomina del server li accetta
  assert.notEqual(nome.trim(), '', 'premessa: per il server è un nome valido');
  assert.equal(nomeDellAgente({ nome, taskCorto: 'Controlla i test' }), 'Controlla i test');
});
