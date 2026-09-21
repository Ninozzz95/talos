import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ETICHETTA_INTERRUTTORE_RAGIONAMENTO, argomentoDelRagionamento, argomentoPuoCambiare, etichettaRagionamento, formattaDurataRagionamento,
  permanenzaArgomentoMs,
} from '../../src/components/ragionamento.js';

/* ───────────── ⛔⛔ 13/09 notte — l'argomento non lampeggia (trovato col GIRO VERO, glm-5.3-flash) ───────────── */

test('ARGOMENTO-PERMANENZA — almeno 2 s, più il tempo di leggerlo, mai oltre 4 s', () => {
  assert.equal(permanenzaArgomentoMs(''), 2000, 'una riga vuota ha solo la soglia contro il lampeggio');
  /* 6 parole a 5,91 al secondo = 1.015 ms di lettura */
  assert.equal(permanenzaArgomentoMs('Devo capire dove stanno i test.'), 3015);
  const lunga = 'Now check four digit numbers one by one and verify that each sum of fourth powers matches exactly.';
  assert.equal(permanenzaArgomentoMs(lunga), 4000, 'su un ragionamento di minuti la riga deve continuare a muoversi');
  assert.ok(permanenzaArgomentoMs('uno due tre') < permanenzaArgomentoMs('uno due tre quattro cinque sei sette'), 'una frase più lunga resta di più');
});

test('ARGOMENTO-PERMANENZA — la sequenza VERA del giro: sette frasi in tre secondi ne mostrano una', () => {
  /*
   * ⭐ Le frasi e i tempi sono quelli del registro della prova (banco 5471, 13/09): una nuova ogni ~400 ms.
   *   Si simula il ricalcolo della riga ogni 300 ms e si contano le sostituzioni.
   */
  const frasi = ['407: 64 + 0 + 343 = 407.', 'Consider mod 9: 100a+10b+c ≡ a+b+c (mod 9).', 'Hmm, that gives a constraint but not super tight.',
    'We need a³+b³+c³ ≡ a+b+c (mod 9).', 'Alternative approach: solve per hundreds digit.', 'Let me find a smarter decomposition.', 'For a ∈ 1..9: a³ - 100a:'];
  let attuale = ''; let mostratoAlle = 0; let cambi = 0;
  for (let adesso = 0; adesso <= 3000; adesso += 300) {
    const candidato = frasi[Math.min(frasi.length - 1, Math.floor(adesso / 400))];
    if (candidato !== attuale && argomentoPuoCambiare({ attuale, mostratoAlle, adesso })) { attuale = candidato; mostratoAlle = adesso; cambi += 1; }
  }
  assert.equal(cambi, 1, `in tre secondi la riga è cambiata ${cambi} volte: lampeggia`);
});

test('ARGOMENTO-PERMANENZA AL CONTRARIO — una riga vuota si riempie subito, e un argomento scaduto lascia il posto', () => {
  assert.equal(argomentoPuoCambiare({ attuale: '', mostratoAlle: 0, adesso: 0 }), true, 'la prima frase non aspetta nessuno');
  assert.equal(argomentoPuoCambiare({ attuale: '   ', mostratoAlle: 100, adesso: 101 }), true);
  assert.equal(argomentoPuoCambiare({ attuale: 'Devo capire dove stanno i test.', mostratoAlle: 1000, adesso: 4014 }), false, 'un millisecondo prima della scadenza resta');
  assert.equal(argomentoPuoCambiare({ attuale: 'Devo capire dove stanno i test.', mostratoAlle: 1000, adesso: 4015 }), true, 'alla scadenza cambia: la riga non si ferma per sempre');
});

/* ───────────── L'argomento corrente (13/09 sera, «fare meglio di Hermes») ───────────── */

test('ARGOMENTO — un titolo in grassetto vince, e vale il PIÙ RECENTE', () => {
  const testo = '**Leggo la cartella**\nCi sono 40 file.\n\n**Scelgo i test della chat**\nComincio da';
  assert.equal(argomentoDelRagionamento(testo), 'Scelgo i test della chat');
});

test('ARGOMENTO — senza titoli: l’ultima frase COMPLETA, non il pezzo che sta arrivando', () => {
  /* ⭐ Un inizio vero preso dallo store (qwen3.8-flash), tagliato dove l'aveva tagliato il flusso. */
  const reale = 'Good results. Let me open the most promising pages for line 1 (facts and numbers):\n1. agentmarketcap.ai blog —';
  assert.equal(argomentoDelRagionamento(reale), 'Let me open the most promising pages for line 1 (facts and numbers):');
  assert.equal(argomentoDelRagionamento('Devo capire dove stanno i test. Poi apro il primo file e'), 'Devo capire dove stanno i test.');
});

test('ARGOMENTO — pulisce il markdown e sta su una riga', () => {
  assert.equal(argomentoDelRagionamento('- Apro `tests/chat.test.mjs` per primo.\n'), 'Apro tests/chat.test.mjs per primo.');
  const lunga = `${'Controllo ogni file della cartella dei test uno per uno '.repeat(3)}fino in fondo.\n`;
  const breve = argomentoDelRagionamento(lunga);
  assert.equal(breve.length, 90);
  assert.ok(breve.endsWith('…'));
});

test('ARGOMENTO — un grassetto dentro la riga è ENFASI, non un titolo (testo VERO del giro di verifica)', () => {
  /*
   * ⛔⛔ 13/09 notte, banco 5473, glm-5.3-flash, ragionamento `e47dcd5a`: la riga diceva «Sta ragionando… 407». Il modello
   *   usava il grassetto per etichettare i candidati. Estratto dallo store, com'era.
   */
  const reale = 'Known narcissistic numbers with 3 digits: 153, 370, 371, 407.\n\nLet me verify each:\n\n'
    + '**153**: 1³ + 5³ + 3³ = 1 + 125 + 27 = 153. ✓\n\n**370**: 3³ + 7³ + 0³ = 27 + 343 + 0 = 370. ✓\n\n'
    + '**371**: 3³ + 7³ + 1³ = 27 + 343 + 1 = 371. ✓\n\n**407**: 4³ + 0³ + 7³ = 64 + 0 + 343 = 407. ✓\n\n';
  assert.notEqual(argomentoDelRagionamento(reale), '407', 'un numero in grassetto non dice su cosa ragiona');
  assert.equal(argomentoDelRagionamento(reale), '407: 4³ + 0³ + 7³ = 64 + 0 + 343 = 407.');
  assert.equal(argomentoDelRagionamento('Uso **sempre** i test veri prima di scrivere. Poi apro il file'), 'Uso sempre i test veri prima di scrivere.');
});

test('ARGOMENTO AL CONTRARIO — il titolo di sezione vero vince ancora (il formato che Codex legge)', () => {
  /* `tui/src/chatwidget/tests/history_replay.rs:1141` nel clone di Codex: `"**Checking tests**\n\n<!-- -->"`. */
  assert.equal(argomentoDelRagionamento('**Checking tests**\n\nI will run the suite first. '), 'Checking tests');
  assert.equal(argomentoDelRagionamento('**Verifica dei candidati**\n\n**153**: 1 + 125 + 27 = 153. ✓\n\n'), 'Verifica dei candidati',
    'un titolo sulla sua riga resta il titolo anche se sotto arrivano grassetti di enfasi');
});

test('ARGOMENTO AL CONTRARIO — niente frasi a metà, niente frammenti, niente punti che non chiudono', () => {
  assert.equal(argomentoDelRagionamento(''), null);
  assert.equal(argomentoDelRagionamento('   '), null);
  assert.equal(argomentoDelRagionamento('Sto leggendo la cartella dei'), null, 'una frase senza fine non si mostra');
  assert.equal(argomentoDelRagionamento('Ok.\nBene. '), null, 'meno di tre parole non è un argomento');
  assert.equal(argomentoDelRagionamento('Aggiorno alla v0.1.33 e poi'), null, 'il punto di un numero di versione non chiude una frase');
  assert.equal(argomentoDelRagionamento('**Plann'), null, 'un grassetto non chiuso non è un titolo');
});

/*
 * ⛔ Le parole della riga del ragionamento compresso (decisione owner 13/09/2026, vedi il modulo).
 * Quante cose guarda: 4 etichette per stato, 6 durate, 5 ingressi senza durata, e il verso contrario
 * che conta di più — una rigiocata non deve mai dire «poco».
 */

test('RAGIONAMENTO-ETICHETTA — mentre scrive, finito con una durata, finito in fretta, finito senza durata', () => {
  assert.equal(etichettaRagionamento({ inCorso: true }), 'Sta ragionando…');
  assert.equal(etichettaRagionamento({ inCorso: false, secondi: 12.2 }), 'Ha ragionato per 12 s');
  assert.equal(etichettaRagionamento({ inCorso: false, secondi: 0.4 }), 'Ha ragionato poco', 'sotto il secondo non si scrive «0 s»');
  assert.equal(etichettaRagionamento({ inCorso: false }), 'Ha ragionato');
});

test('RAGIONAMENTO-DURATA — secondi, minuti, e il bordo dei 60', () => {
  assert.equal(formattaDurataRagionamento(1), '1 s');
  assert.equal(formattaDurataRagionamento(12.4), '12 s');
  assert.equal(formattaDurataRagionamento(59.4), '59 s');
  assert.equal(formattaDurataRagionamento(59.6), '1 min', 'l’arrotondamento non scrive «60 s»');
  assert.equal(formattaDurataRagionamento(65), '1 min 5 s');
  assert.equal(formattaDurataRagionamento(120), '2 min');
});

test('RAGIONAMENTO-ETICHETTA AL CONTRARIO — senza una durata vera non si inventa «poco»', () => {
  /*
   * ⛔ Il trabocchetto misurato: gli eventi non portano un orario, e in una rigiocata inizio e fine
   *   distano pochi millisecondi. Chi chiama passa `null`; qui si prova che nessuna forma di «non so»
   *   diventi una durata.
   */
  for (const secondi of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 'non-un-numero']) {
    assert.equal(etichettaRagionamento({ inCorso: false, secondi }), 'Ha ragionato', `${String(secondi)} è diventato una durata`);
  }
  assert.equal(etichettaRagionamento({ inCorso: true, secondi: 30 }), 'Sta ragionando…', 'mentre scrive la durata non conta');
  assert.doesNotMatch(etichettaRagionamento({ inCorso: false, secondi: 3 }), /Sta ragionando/, 'un ragionamento finito non dice mai che sta ragionando');
});

test('RAGIONAMENTO-INTERRUTTORE — il nome dice cosa fa, non «mostra/nascondi»', () => {
  assert.equal(ETICHETTA_INTERRUTTORE_RAGIONAMENTO, 'Apri il ragionamento mentre scrive');
  assert.doesNotMatch(ETICHETTA_INTERRUTTORE_RAGIONAMENTO, /mostra|nascond/i);
});
