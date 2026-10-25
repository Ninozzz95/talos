/*
 * 24/10/2026 — la parte pura dei rami di «Riprova» / «Modifica e rimanda» (`src/components/rami.js`): le versioni di un punto, la
 * catena della storia ereditata, il taglio degli eventi e la differenza fra un «Riprova» e una «Modifica».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { versioniDelPunto, catenaDellaStoria, eventiFinoAlGiro, eUnRiprova } from '../../src/components/rami.js';

const righe = [
  { sessionId: 'A' },
  { sessionId: 'B', forkDa: 'A', forkPrimaDelGiro: 'r2', avviataAlle: '2026-10-24T10:00:02Z' },
  { sessionId: 'C', forkDa: 'A', forkPrimaDelGiro: 'r2', avviataAlle: '2026-10-24T10:00:01Z' },
  { sessionId: 'D', forkDa: 'A', forkPrimaDelGiro: 'r3', avviataAlle: '2026-10-24T10:00:03Z' },
  { sessionId: 'E', forkDa: 'A' }, // ramo dell'intera conversazione: nessun punto
  { sessionId: 'F', forkDa: 'C', forkPrimaDelGiro: 'r9', avviataAlle: '2026-10-24T10:00:04Z' },
];

test('RAMI-UI-01 le versioni di un punto: la sorgente per prima, poi i rami di QUEL punto in ordine di nascita', () => {
  assert.deepEqual(versioniDelPunto(righe, 'A', 'r2'), ['A', 'C', 'B']);
  assert.deepEqual(versioniDelPunto(righe, 'A', 'r3'), ['A', 'D']);
  assert.deepEqual(versioniDelPunto(righe, 'A', 'r1'), [], 'un punto senza rami non ha frecce');
  assert.deepEqual(versioniDelPunto(righe, 'E', 'r2'), []);
  assert.deepEqual(versioniDelPunto(null, 'A', 'r2'), []);
});

test('RAMI-UI-02 la catena della storia: dal più antico, ognuno col giro del suo taglio; un ramo intero o una sorgente non ne hanno', () => {
  assert.deepEqual(catenaDellaStoria(righe, 'B'), [{ sessionId: 'A', primaDelGiro: 'r2' }]);
  assert.deepEqual(catenaDellaStoria(righe, 'F'), [{ sessionId: 'A', primaDelGiro: 'r2' }, { sessionId: 'C', primaDelGiro: 'r9' }]);
  assert.deepEqual(catenaDellaStoria(righe, 'A'), []);
  assert.deepEqual(catenaDellaStoria(righe, 'E'), []);
  assert.deepEqual(catenaDellaStoria(righe, 'sconosciuta'), []);
});

test('RAMI-UI-03 al contrario: un ciclo nell\'elenco non gira per sempre, e la catena ha un tetto', () => {
  const ciclo = [{ sessionId: 'X', forkDa: 'Y', forkPrimaDelGiro: 'r1' }, { sessionId: 'Y', forkDa: 'X', forkPrimaDelGiro: 'r1' }];
  assert.deepEqual(catenaDellaStoria(ciclo, 'X'), [{ sessionId: 'Y', primaDelGiro: 'r1' }]);
  const lunga = Array.from({ length: 20 }, (_, i) => ({ sessionId: `s${i}`, forkDa: `s${i + 1}`, forkPrimaDelGiro: 'r1' }));
  assert.equal(catenaDellaStoria(lunga, 's0').length, 8);
});

test('RAMI-UI-04 gli eventi ereditati: fino al giro del taglio, senza sequenza e senza la fine della rigiocata; giro assente ⇒ niente', () => {
  const eventi = [
    { type: 'RunStarted', runId: 'r1', _sequenza: 1 }, { type: 'TEXT', _sequenza: 2 }, { type: 'RunFinished', runId: 'r1', _sequenza: 3 },
    { type: 'CUSTOM', name: 'talos.fine-rigiocata', _sequenza: 4 },
    { type: 'RunStarted', runId: 'r2', _sequenza: 5 }, { type: 'TEXT', _sequenza: 6 },
  ];
  const fino = eventiFinoAlGiro(eventi, 'r2');
  assert.deepEqual(fino, [{ type: 'RunStarted', runId: 'r1' }, { type: 'TEXT' }, { type: 'RunFinished', runId: 'r1' }]);
  assert.equal(fino.some((e) => Object.hasOwn(e, '_sequenza')), false, '⛔ con la sequenza, «Elimina» colpirebbe il padre');
  assert.equal(Object.hasOwn(eventi[0], '_sequenza'), true, 'gli eventi originali restano intatti');
  assert.equal(eventiFinoAlGiro(eventi, 'r9'), null);
  assert.equal(eventiFinoAlGiro(null, 'r2'), null);
});

test('RAMI-UI-05 Riprova o Modifica: stessa domanda (spazi a parte) ⇒ Riprova', () => {
  assert.equal(eUnRiprova('Aggiungi il tema scuro', '  Aggiungi il tema scuro\n'), true);
  assert.equal(eUnRiprova('Aggiungi il tema scuro', 'Aggiungi il tema scuro e ricordalo'), false);
  assert.equal(eUnRiprova(null, 'x'), false);
});

/* ------------------------------------------------------------------------------------------------------------------------------
 * 24/10/2026 sera — le cure della revisione a blocco 4 (REVISIONE-BLOCCO-4 §3), la parte pura.
 * ------------------------------------------------------------------------------------------------------------------------------ */
const rami4 = await import('../../src/components/rami.js');

test('REV4-R7-UI una sorgente assente dall\'elenco NON è una versione: niente freccia verso una sessione che non c\'è', () => {
  assert.deepEqual(rami4.versioniDelPunto([{ sessionId: 'B', forkDa: 'A', forkPrimaDelGiro: 'r2' }], 'A', 'r2'), [], 'un ramo solo, sorgente eliminata: nessuna freccia');
  const fratelli = [
    { sessionId: 'B', forkDa: 'A', forkPrimaDelGiro: 'r2', avviataAlle: '2026-10-24T10:00:02Z' },
    { sessionId: 'C', forkDa: 'A', forkPrimaDelGiro: 'r2', avviataAlle: '2026-10-24T10:00:01Z' },
  ];
  assert.deepEqual(rami4.versioniDelPunto(fratelli, 'A', 'r2'), ['C', 'B'], 'i fratelli restano versioni fra loro');
  assert.deepEqual(rami4.versioniDelPunto(righe, 'A', 'r2'), ['A', 'C', 'B'], 'con la sorgente in elenco, come prima');
});

test('REV4-CATENA la catena oltre il tetto dice di essere tagliata; un ciclo o una catena corta no', () => {
  const lunga = Array.from({ length: 20 }, (_, i) => ({ sessionId: `s${i}`, forkDa: `s${i + 1}`, forkPrimaDelGiro: 'r1' }));
  const tagliata = rami4.storiaDelRamo(lunga, 's0');
  assert.equal(tagliata.catena.length, 8);
  assert.equal(tagliata.troncata, true);
  assert.deepEqual(rami4.storiaDelRamo(righe, 'F'), { catena: rami4.catenaDellaStoria(righe, 'F'), troncata: false });
  const ciclo = [{ sessionId: 'X', forkDa: 'Y', forkPrimaDelGiro: 'r1' }, { sessionId: 'Y', forkDa: 'X', forkPrimaDelGiro: 'r1' }];
  assert.equal(rami4.storiaDelRamo(ciclo, 'X').troncata, false, 'un ciclo si ferma, ma non manca niente da mostrare');
  /* esattamente 8 anelli fino alla radice: tutto mostrato */
  const otto = Array.from({ length: 9 }, (_, i) => (i === 8 ? { sessionId: 's8' } : { sessionId: `s${i}`, forkDa: `s${i + 1}`, forkPrimaDelGiro: 'r1' }));
  assert.deepEqual([rami4.storiaDelRamo(otto, 's0').catena.length, rami4.storiaDelRamo(otto, 's0').troncata], [8, false]);
});

test('REV4-R1-UI la prima domanda propria di un ramo «da un punto» taglia dal punto del ramo; senza sorgente in elenco, dal ramo', () => {
  const elenco = [{ sessionId: 'A' }, { sessionId: 'B', forkDa: 'A', forkPrimaDelGiro: 'r1' }];
  const rigaB = elenco[1];
  assert.deepEqual(rami4.puntoDelTaglio({ giroDi: 'B', giro: 'b1', primaPropria: true, rigaCorrente: rigaB, righe: elenco }), { sorgente: 'A', giro: 'r1' });
  assert.deepEqual(rami4.puntoDelTaglio({ giroDi: 'B', giro: 'b2', primaPropria: false, rigaCorrente: rigaB, righe: elenco }), { sorgente: 'B', giro: 'b2' }, 'le domande dopo la prima restano del ramo');
  assert.deepEqual(rami4.puntoDelTaglio({ giroDi: 'B', giro: 'b1', primaPropria: true, rigaCorrente: rigaB, righe: [rigaB] }), { sorgente: 'B', giro: 'b1' }, 'sorgente eliminata: si ripiega sul ramo');
  assert.deepEqual(rami4.puntoDelTaglio({ giroDi: 'A', giro: 'r1', primaPropria: true, rigaCorrente: { sessionId: 'A' }, righe: elenco }), { sorgente: 'A', giro: 'r1' }, 'una sessione che non è un ramo: il suo giro');
});

test('REV4-R4-UI gli allegati non immagine di un messaggio: si staccano dal testo per il modello e si rimettono, uno tolto non riparte', () => {
  const lingue = { intestazioni: ['Attached files:', 'File allegati:'], prefissiFile: ['File: '] };
  const consegna = 'riassumi questo\n\nAttached files:\n- note.txt (C:\\p\\note.txt)\n- File: C:\\p\\b.md\n- pagina (https://x.y/z)\n\n--- note.txt (C:\\p\\note.txt) ---\nriga 1\n\n--- finta\n\n--- pagina (https://x.y/z) — truncated ---\ncorpo';
  const pezzi = rami4.pezziDegliAllegati(consegna, 'riassumi questo', lingue);
  assert.equal(pezzi.intestazione, 'Attached files:');
  assert.deepEqual(pezzi.file.map((f) => [f.nome, f.percorso, f.blocco !== null]), [['note.txt', 'C:\\p\\note.txt', true], ['b.md', 'C:\\p\\b.md', false], ['pagina', 'https://x.y/z', true]]);
  assert.equal(pezzi.file[0].blocco, '--- note.txt (C:\\p\\note.txt) ---\nriga 1\n\n--- finta', 'il contenuto del file resta intero, anche con un «---» dentro');
  /* tutti tenuti, testo nuovo: lo stesso testo per il modello con la frase cambiata */
  assert.equal(rami4.consegnaConAllegati('riassumi in tre righe', pezzi.intestazione, pezzi.file), consegna.replace('riassumi questo', 'riassumi in tre righe'));
  /* uno tolto: la sua riga e il suo contenuto non partono */
  const senzaNote = rami4.consegnaConAllegati('x', pezzi.intestazione, pezzi.file.filter((f) => f.nome !== 'note.txt'));
  assert.equal(senzaNote.includes('note.txt') || senzaNote.includes('riga 1'), false);
  assert.equal(senzaNote, 'x\n\nAttached files:\n- File: C:\\p\\b.md\n- pagina (https://x.y/z)\n\n--- pagina (https://x.y/z) — truncated ---\ncorpo');
  assert.equal(rami4.consegnaConAllegati('solo testo', pezzi.intestazione, []), 'solo testo', 'tolti tutti: solo la frase');
  /* al contrario: niente allegati, o una forma che non si riconosce ⇒ null (mai un taglio a caso) */
  assert.equal(rami4.pezziDegliAllegati('ciao', 'ciao', lingue), null);
  assert.equal(rami4.pezziDegliAllegati('riassumi\n\nAttached files:\n- a.txt (p)\nTESTO ESTRANEO', 'riassumi', lingue), null);
  assert.equal(rami4.pezziDegliAllegati('altro\n\nAttached files:\n- a.txt (p)', 'riassumi', lingue), null, 'la frase della bolla deve aprire il testo per il modello');
});
