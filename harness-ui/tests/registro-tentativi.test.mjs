/*
 * ⭐ L1 1.2 del motore locale (owner 26/10/2026, «Sì, tutte e due»; contratto con la CLI `CONTRATTO-FRENO-CICLI-2026-10-26.md`) — il
 *   registro dei tentativi: il freno guarda l'ESITO, non la chiamata. Misura in ombra (`scripts/misura-registro-tentativi.mjs`, 26/10):
 *   652 sessioni salvate, 933 giri, 9.284 chiamate ⇒ scatta solo sui due giri del ciclo di Granite (sessione 873b87ed), zero sui 931
 *   giri sani. Qui i casi, compresi quelli che NON devono farlo scattare («never break user space»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  creaRegistroTentativi, esitoDellaVerifica, FERMATA_DA_RITORNI, FERMATA_DA_STAGNANTI,
} from '../src/kernel/registro-tentativi.mjs';

const scrivi = (percorso, contenuto, mode) => ({ nome: 'scrivi', argomenti: JSON.stringify({ percorso, contenuto, ...(mode ? { mode } : {}) }), esito: `written: ${percorso}` });
const test_ = (comando, esito) => ({ nome: 'shell', argomenti: { comando }, esito });
const ERRORE = (uuid) => `[shell output: stdout and stderr combined]\nexit 1\n<<<TALOS_DATA id=${uuid.slice(0, 12)} from="shell">>>\n[TALOS output reference: ${uuid}; retained 705 of 705 bytes.]\nTypeError: somma is not a function\n    at Object.<anonymous> (/w/test.js:6:5)\n<<<END_TALOS_DATA id=${uuid.slice(0, 12)}>>>`;
const uuid = (n) => `${String(n).padStart(8, '0')}-0c34-48d7-ba6d-1afe2b68ee47`;

function gioca(registro, chiamate) {
  return chiamate.map((c) => registro.osserva(c));
}

test('REG-01 il caso Granite: copie identiche e lo stesso errore ⇒ nota, poi il livello di fermata', () => {
  const r = creaRegistroTentativi();
  const esiti = gioca(r, [
    scrivi('calc.js', 'v1'), test_('node test.js', ERRORE(uuid(1))),
    scrivi('calc.js', 'v1'), test_('node test.js', ERRORE(uuid(2))),
    scrivi('calc.js', 'v1'), scrivi('calc.js', 'v1'), test_('node test.js', ERRORE(uuid(3))),
    scrivi('calc.js', 'v1'), scrivi('calc.js', 'v1'), test_('node test.js', ERRORE(uuid(4))),
  ]);
  const primaNota = esiti.findIndex((e) => e.livello >= 1);
  const primaFermata = esiti.findIndex((e) => e.livello === 3);
  assert.ok(primaNota > 0 && esiti[primaNota].nota, 'la nota arriva, ed è testo per il modello');
  assert.match(esiti[primaNota].nota, /^\[TALOS: .*somma is not a function/u, 'la nota porta l\'errore vero');
  assert.ok(primaFermata > primaNota, 'la fermata dopo la nota');
  assert.equal(esiti[primaFermata].motivo, 'ritorni');
  assert.ok(esiti[primaFermata].B >= FERMATA_DA_RITORNI);
});

test('REG-02 l\'alternanza «riscrivi / aggiungi in coda» (88 ↔ 177 byte su Granite) è un ritorno a stati già visti', () => {
  const r = creaRegistroTentativi();
  gioca(r, [scrivi('calc.js', 'v'), test_('node test.js', ERRORE(uuid(1)))]);
  const ciclo = [scrivi('calc.js', 'x', 'append'), scrivi('calc.js', 'v'), test_('node test.js', ERRORE(uuid(2)))];
  gioca(r, ciclo); // il primo giro dell'alternanza: lo stato con la coda è nuovo
  gioca(r, ciclo); // il secondo: tutti ritorni
  assert.equal(r.stato().B >= 1, true, 'il ciclo di periodo 2 si vede');
});

test('REG-11 AL CONTRARIO: la stessa aggiunta in coda su due versioni DIVERSE dà due stati diversi (lo stato si calcola a catena)', () => {
  const r = creaRegistroTentativi();
  gioca(r, [scrivi('a.js', 'v1'), scrivi('a.js', 'x', 'append'), test_('npm test', ERRORE(uuid(1)))]); // stato v1+x
  gioca(r, [scrivi('a.js', 'v2'), test_('npm test', ERRORE(uuid(2)))]); // v2: nuovo
  gioca(r, [scrivi('a.js', 'x', 'append'), test_('npm test', ERRORE(uuid(3)))]); // v2+x: nuovo anche lui, anche se «x» si è già visto
  assert.equal(r.stato().B, 0, 'v2+x non è un ritorno a v1+x');
  assert.equal(r.stato().A, 2, 'ma sono tentativi stagnanti: stesso errore dopo una modifica');
});

test('REG-03 AL CONTRARIO: un vero TDD (rosso, rosso DIVERSO, verde) non fa mai scattare niente', () => {
  const r = creaRegistroTentativi();
  const esiti = gioca(r, [
    scrivi('a.js', 'v1'), test_('npm test', 'exit 1\nError: expected 3 got 2'),
    scrivi('a.js', 'v2'), test_('npm test', 'exit 1\nError: expected 3 got 4'),
    scrivi('a.js', 'v3'), test_('npm test', 'exit 0\n12 passing'),
  ]);
  assert.ok(esiti.every((e) => e.livello === 0 && !e.nota));
});

test('REG-04 AL CONTRARIO (le 133 sessioni vere della CLI): rilanciare dopo ogni modifica comandi che RIESCONO non è un ciclo', () => {
  const r = creaRegistroTentativi();
  const passi = [];
  for (let i = 0; i < 12; i += 1) passi.push(scrivi('t.mjs', `v${i}`), test_('node --check t.mjs', 'exit 0'), test_('git diff --stat', 'exit 0\n 1 file changed'));
  assert.ok(gioca(r, passi).every((e) => e.livello === 0));
});

test('REG-05 AL CONTRARIO: errori di rete e limiti di traffico non sono mai «lo stesso esito»', () => {
  const r = creaRegistroTentativi();
  const passi = [];
  // contenuti diversi: si misura solo la rete (dieci copie identiche sarebbero un ciclo vero, rete o no)
  for (let i = 0; i < 10; i += 1) passi.push(scrivi('a.js', `v${i}`), test_('npm install', 'exit 1\nnpm ERR! code ECONNRESET'));
  const esiti = gioca(r, passi);
  assert.ok(esiti.every((e) => e.livello === 0), 'mai un tentativo stagnante per la rete');
  assert.equal(esitoDellaVerifica('shell', { comando: 'x' }, 'HTTP 429 Too Many Requests').esito, null);
});

test('REG-06 AL CONTRARIO: aspettare una build (stesso comando, stesso esito, nessuna scrittura) non è un tentativo', () => {
  const r = creaRegistroTentativi();
  const passi = Array.from({ length: 20 }, () => test_('cat build.log', 'exit 1\nError: still building'));
  assert.ok(gioca(r, passi).every((e) => e.livello === 0));
});

test('REG-07 l\'impronta dell\'esito non cambia per uuid, id del confine, durate e orari; cambia per un errore diverso', () => {
  // un id casuale anche nell'uscita del PROGRAMMA (non solo nella riga di TALOS, che si toglie per intero)
  const a = esitoDellaVerifica('shell', { comando: 'node t.js' }, `${ERRORE(uuid(1))}\ntrace ${uuid(1)}\ndone in 120 ms at 2026-10-26T12:00:01Z`);
  const b = esitoDellaVerifica('shell', { comando: 'node t.js' }, `${ERRORE(uuid(9))}\ntrace ${uuid(9)}\ndone in 87 ms at 2026-10-26T12:04:55Z`);
  const c = esitoDellaVerifica('shell', { comando: 'node t.js' }, ERRORE(uuid(1)).replace('somma', 'sottrazione'));
  assert.equal(a.esito, b.esito);
  assert.notEqual(a.esito, c.esito);
  assert.equal(a.fallisce, true);
});

test('REG-08 un debugging vero (codice DIVERSO a ogni tentativo, stesso errore): nota presto, fermata solo all\'8°', () => {
  const r = creaRegistroTentativi();
  gioca(r, [scrivi('a.js', 'v0'), test_('npm test', ERRORE(uuid(0)))]);
  const livelli = [];
  for (let i = 1; i <= 8; i += 1) { // 8 scritto, non la costante: la prova dice il numero del contratto
    r.osserva(scrivi('a.js', `tentativo ${i}`));
    livelli.push(r.osserva(test_('npm test', ERRORE(uuid(i)))).livello);
  }
  assert.equal(livelli.indexOf(1), 2, 'nota al 3° tentativo stagnante');
  assert.equal(livelli.indexOf(3), 7, 'fermata solo all\'8°: non si interrompe un debugging vero prima');
  assert.equal(FERMATA_DA_STAGNANTI, 8);
});

test('REG-09 la nota non esce a ogni chiamata: all\'ingresso nel livello, poi ogni due passi', () => {
  const r = creaRegistroTentativi();
  gioca(r, [scrivi('a.js', 'v0'), test_('npm test', ERRORE(uuid(0)))]);
  const note = [];
  for (let i = 1; i <= 6; i += 1) { r.osserva(scrivi('a.js', `t${i}`)); note.push(Boolean(r.osserva(test_('npm test', ERRORE(uuid(i)))).nota)); }
  assert.deepEqual(note, [false, false, true, false, true, false]);
});

test('REG-10 una scrittura FALLITA non conta, e un esito nuovo azzera tutto', () => {
  const r = creaRegistroTentativi();
  gioca(r, [scrivi('a.js', 'v'), test_('npm test', ERRORE(uuid(0))), scrivi('a.js', 'v'), scrivi('a.js', 'v')]);
  assert.equal(r.stato().B, 1, 'la prima copia dopo un controllo non conta da sola; la seconda, subito dopo la stessa, sì');
  r.osserva({ ...scrivi('a.js', 'v'), fallito: true });
  assert.equal(r.stato().B, 1, 'fallita: non conta');
  r.osserva(scrivi('a.js', 'w'));
  r.osserva(test_('npm test', 'exit 1\nError: a different one'));
  assert.deepEqual(r.stato(), { A: 0, B: 0, livello: 0 });
});

/* ------------------------------------------------------------------ lungo tutto il filo: il kernel vero */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
const chiamataScrivi = (id) => () => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'stessa cosa' }) } }] } }] }]);
const fine = () => flusso([{ choices: [{ delta: { content: 'finito' } }] }]);

async function giroConTreCopie(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-registro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sequenza = [chiamataScrivi('c1'), chiamataScrivi('c2'), chiamataScrivi('c3')];
  let n = 0;
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', permessiSessione: { scrivi: 'sempre' },
    onDelta: () => {}, onGiro: (e) => eventi.push(e), fetchDiRete: async () => (n < sequenza.length ? sequenza[n++]() : fine()), ...opzioni,
  });
  return { esiti: esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => String(m.content)), eventi };
}

test('REG-20 lungo il filo: con `registroTentativi` la terza copia identica porta la nota al modello e l\'evento in ombra', async (t) => {
  const { esiti, eventi } = await giroConTreCopie(t, { registroTentativi: true });
  assert.match(esiti.at(-1), /\[TALOS: "a\.txt" was written back to a content you already wrote before/u);
  assert.ok(eventi.some((e) => e.tipo === 'registro-tentativi' && e.ritorni === 2));
});

test('REG-21 AL CONTRARIO: spento (di serie) non cambia niente — nessuna nota, nessun evento', async (t) => {
  const { esiti, eventi } = await giroConTreCopie(t, {});
  assert.ok(esiti.every((e) => !e.includes('was rewritten with exactly')));
  assert.ok(!eventi.some((e) => e.tipo === 'registro-tentativi'));
});

/* ------------------------------------------------------------------ le riserve della revisione avversaria del 26/10 */
import { modalitaDiScrittura } from '../src/kernel/talosHarness.mjs';

test('REG-30 (R2) una copia identica di un file ACCESSORIO a ogni tentativo, mentre il codice cambia davvero: fermata non prima dell\'8°', () => {
  const r = creaRegistroTentativi({ modalitaDiScrittura });
  gioca(r, [scrivi('test.js', 'prova fissa'), scrivi('code.js', 'v0'), test_('npm test', ERRORE(uuid(0)))]);
  const livelli = [];
  for (let i = 1; i <= 8; i += 1) {
    r.osserva(scrivi('code.js', `tentativo ${i}`));
    r.osserva(scrivi('test.js', 'prova fissa'));
    livelli.push(r.osserva(test_('npm test', ERRORE(uuid(i)))).livello);
  }
  assert.equal(livelli.indexOf(3), 7, 'la fermata solo all\'8°, come per il debugging vero');
});

test('REG-31 (R3) un `grep` che non trova più niente (exit 1, nessuna riga d\'errore) dopo modifiche non è un fallimento', () => {
  const r = creaRegistroTentativi({ modalitaDiScrittura });
  const passi = [];
  for (let i = 0; i < 6; i += 1) passi.push(scrivi('f.js', `x${i}`), test_('grep -rn vecchioNome src', 'exit 1')); // lo STESSO file: la prova resta sul solo grep (R5 del blocco 2 azzera i file nuovi)
  assert.ok(gioca(r, passi).every((e) => e.livello === 0));
});

test('REG-32 (R4) gli accodamenti in TUTTE le forme che il kernel accetta crescono il file: nessuna nota «stesso contenuto»', () => {
  for (const forma of [{ mode: 'append' }, { append: true }, { modalita: 'accoda' }, { mode: 'add' }]) {
    const r = creaRegistroTentativi({ modalitaDiScrittura });
    const accoda = { nome: 'scrivi', argomenti: { percorso: 'log.txt', contenuto: 'riga', ...forma }, esito: 'appended' };
    const esiti = gioca(r, [accoda, accoda, accoda, accoda]);
    assert.ok(esiti.every((e) => e.livello === 0 && !e.nota), JSON.stringify(forma));
  }
});

test('REG-33 (R5) `node --test` con la sua riga `duration_ms` e un «429» dentro un messaggio: lo stesso fallimento resta lo stesso', () => {
  const uscita = (ms) => `exit 1\nnot ok 1 - somma\n  error: 'expected 429 to equal 430'\n# duration_ms ${ms}\nℹ duration_ms ${ms}`;
  const a = esitoDellaVerifica('shell', { comando: 'node --test' }, uscita('52.06'));
  const b = esitoDellaVerifica('shell', { comando: 'node --test' }, uscita('61.9'));
  assert.notEqual(a.esito, null, 'un 429 dentro un messaggio d\'errore non rende l\'esito «di rete»');
  assert.equal(a.esito, b.esito);
  assert.equal(esitoDellaVerifica('shell', { comando: 'x' }, 'exit 1\nError: HTTP 429').esito, null, 'uno stato HTTP 429 sì');
});

test('REG-34 (N5) la nota ha un tetto: sotto i 400 caratteri, anche con un comando e un errore lunghissimi', () => {
  const r = creaRegistroTentativi({ modalitaDiScrittura });
  const lungo = `exit 1\nError: ${'x'.repeat(2000)}`;
  const comando = `node scripts/run.js ${'--flag-molto-lungo '.repeat(40)}`; // come la prova L6 del revisore: comando e errore insieme sforano
  gioca(r, [scrivi('a.js', 'v0'), test_(comando, lungo)]);
  let nota = null;
  for (let i = 1; i <= 3 && !nota; i += 1) { r.osserva(scrivi('a.js', `v${i}`)); nota = r.osserva(test_(comando, lungo)).nota; }
  assert.ok(nota && nota.length < 400, String(nota?.length));
});

test('REG-35 (blocco 2, R4) un test che fallisce SENZA scriverlo in inglese (exit 1, «wrong result») e un errore di cmd in italiano sono fallimenti; il grep no', () => {
  for (const esito of ['exit 1\nsomma(1,2) = 4\nwrong result, expected 3', "exit 9009\n'nodo' non è riconosciuto come comando interno o esterno,"]) {
    const r = creaRegistroTentativi({ modalitaDiScrittura });
    const passi = [];
    for (let i = 0; i <= FERMATA_DA_STAGNANTI; i += 1) passi.push(scrivi('calc.js', `const somma = (a, b) => a + b + ${i}`), test_('node test.js', esito)); // la prima corsa è l'esito nuovo, poi 8 uguali
    const esiti = gioca(r, passi);
    assert.ok(esiti.some((e) => e.livello >= 1 && e.nota), esito);
    assert.ok(esiti.some((e) => e.livello === 3), `otto tentativi sullo stesso file con lo stesso esito (il primo è l'esito nuovo) arrivano alla fermata: ${esito}`);
  }
  for (const comando of ['grep -rn vecchioNome src', 'git diff --quiet', 'rg somma | findstr x']) {
    assert.equal(esitoDellaVerifica('shell', { comando }, 'exit 1').fallisce, false, comando);
    assert.equal(esitoDellaVerifica('shell', { comando }, 'exit 2\ngrep: src: No such file or directory').fallisce, true, `${comando}: il 2 resta un fallimento`);
  }
  assert.equal(esitoDellaVerifica('shell', { comando: 'grep x a' }, 'exit 1\nError: boom').fallisce, true, 'l\'1 con una riga d\'errore resta un fallimento');
  assert.equal(esitoDellaVerifica('shell', { comando: 'npm test' }, 'exit 1').fallisce, true);
  assert.equal(esitoDellaVerifica('shell', { comando: 'npm test' }, 'exit 0\n0 failed').fallisce, false);
});

test('REG-36 (blocco 2, R5) un refactor su otto file DIVERSI con un rosso vecchio non toccato: niente; rimettere mano a uno di quei file: si conta', () => {
  const ROSSO = 'exit 1\nnot ok 3 - vecchio test rotto\nError: expected 2';
  const r = creaRegistroTentativi({ modalitaDiScrittura });
  const passi = [];
  for (let i = 1; i <= 8; i += 1) passi.push(scrivi(`src/modulo${i}.js`, `export const n${i} = ${i}`), test_('npm test', ROSSO));
  assert.ok(gioca(r, passi).every((e) => e.livello === 0 && !e.nota), 'file sempre nuovi: è lavoro, non un ciclo');
  // al contrario: lo stesso rosso dopo essere tornati più volte sugli STESSI file
  const ancora = [];
  for (let i = 0; i < 4; i += 1) ancora.push(scrivi('src/modulo1.js', `export const n1 = ${10 + i}`), test_('npm test', ROSSO));
  assert.ok(gioca(r, ancora).some((e) => e.livello >= 1 && e.nota), 'tornare sullo stesso file con lo stesso rosso è un tentativo stagnante');
});
