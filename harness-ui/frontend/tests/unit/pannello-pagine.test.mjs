/*
 * PANNELLO DI DESTRA v2 (owner 29/10/2026: «Approvato, mi raccomando prevedi tutti gli Edge cases») — la parte PURA di pagine e
 * pieghe (`components/pannello/pagine.js`) e la tastiera fra le pagine (`vaiOltreLaPagina`, `comune.js`). Sono le verifiche del kit
 * (`kit-v2/prove/verifica-kit.mjs`, PROVE.md U-17…U-20, U-22) portate nell'app. Ogni prova dice che cosa la fa diventare rossa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dividiLoSpazio, intervallo, paginaCheContiene, leggiPieghe, salvaPieghe, CHIAVE_PIEGHE, livelloContiSchede, LIVELLI_CONTI } from '../../src/components/pannello/pagine.js';
import { vaiOltreLaPagina, normalizza, nomeECartella, kilo } from '../../src/components/pannello/comune.js';
import { TESTI } from '../../src/i18n/testi/index.js';

test('PANNELLO-U17 — lo spazio si divide fra le sezioni aperte: almeno una riga ciascuna, la corta intera senza barra, due lunghe a metà', () => {
  const m = dividiLoSpazio({ spazio: 400, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 50, altezzaRiga: 40 }, { chiave: 'b', totale: 2, altezzaRiga: 40 }, { chiave: 'c', totale: 0, altezzaRiga: 40 }] });
  assert.equal(m.get('b'), 2, 'la corta si mostra intera e non paga la barra (rossa se si toglie la restituzione della barra, M-18)');
  assert.equal(m.get('c'), 0, 'una sezione vuota non prende righe');
  assert.equal(m.get('a'), 7, '400 − 80 (b) − 30 (barra di a) = 290 ⇒ 7 righe da 40');
  const stretta = dividiLoSpazio({ spazio: 10, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 5, altezzaRiga: 40 }, { chiave: 'b', totale: 5, altezzaRiga: 40 }] });
  assert.deepEqual([stretta.get('a'), stretta.get('b')], [1, 1], 'mai zero righe a una sezione aperta');
  assert.equal(dividiLoSpazio({ spazio: 1000, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 5, altezzaRiga: 40 }] }).get('a'), 5, 'se c’è spazio, tutte');
  const giusta = dividiLoSpazio({ spazio: 200, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 30, altezzaRiga: 36 }, { chiave: 'b', totale: 30, altezzaRiga: 36 }] });
  assert.ok(Math.abs(giusta.get('a') - giusta.get('b')) <= 1, 'due sezioni lunghe: metà e metà (una lunga non mangia l’altra)');
});

test('PANNELLO-U17b — casi limite dello spazio: spazio negativo, una voce sola, nessuna sezione', () => {
  assert.equal(dividiLoSpazio({ spazio: -500, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 3, altezzaRiga: 40 }] }).get('a'), 1, 'anche senza spazio una riga resta (la fisarmonica decide, non il conto)');
  assert.equal(dividiLoSpazio({ spazio: 400, altezzaPager: 30, sezioni: [{ chiave: 'a', totale: 1, altezzaRiga: 40 }] }).get('a'), 1, 'una voce sola');
  assert.equal(dividiLoSpazio({ spazio: 400, altezzaPager: 30, sezioni: [] }).size, 0, 'nessuna sezione');
});

test('PANNELLO-U18 — la finestra di una pagina e la pagina che contiene una voce trovata (oltre la prima pagina)', () => {
  assert.deepEqual(intervallo(2, 8, 30), { pagina: 2, ultima: 3, inizio: 16, fine: 24, da: 17, a: 24, totale: 30 });
  assert.equal(intervallo(9, 8, 30).pagina, 3, 'una pagina che non c’è più torna all’ultima valida (dati che si accorciano mentre la persona è a pagina 4)');
  assert.deepEqual(intervallo(0, 8, 0), { pagina: 0, ultima: 0, inizio: 0, fine: 0, da: 0, a: 0, totale: 0 });
  assert.equal(intervallo(-3, 8, 30).pagina, 0, 'una pagina negativa è la prima');
  assert.equal(intervallo(1, 0, 3).inizio, 1, 'una dimensione zero vale una riga (mai una divisione per zero)');
  const chiavi = Array.from({ length: 30 }, (_, i) => `f${i}`);
  assert.equal(paginaCheContiene(chiavi, 'f19', 8), 2, 'la voce 20 sta a pagina 3');
  assert.equal(paginaCheContiene(chiavi, 'manca', 8), null);
});

test('PANNELLO-U19 — la tastiera passa alla pagina dopo e torna a quella prima; dentro la pagina non ridisegna', () => {
  let ridisegni = 0;
  const ui = { liste: new Map([['albero', { chiavi: ['a', 'b', 'c', 'd', 'e'], dimensione: 2, pagina: 0, totale: 5, ultima: 2 }]]), ridisegna: () => { ridisegni += 1; } };
  assert.equal(vaiOltreLaPagina(ui, 'a', 1), false, 'dentro la pagina la muove la tastiera normale (M-20)');
  assert.equal(ridisegni, 0);
  assert.equal(vaiOltreLaPagina(ui, 'b', 1), true, 'Giù sull’ultima della pagina');
  assert.equal(ui.fuoco, 'c');
  assert.equal(ui.seguiFuoco, true);
  assert.equal(ridisegni, 1);
  ui.liste.get('albero').pagina = 1;
  assert.equal(vaiOltreLaPagina(ui, 'c', -1), true, 'Su sulla prima della pagina');
  assert.equal(ui.fuoco, 'b');
  assert.equal(vaiOltreLaPagina(ui, 'e', 1), false, 'oltre l’ultima non si va');
  assert.equal(vaiOltreLaPagina(ui, 'sconosciuta', 1), false, 'una riga che non è in un elenco paginato non fa niente');
});

test('PANNELLO-U20 — le pieghe si ricordano per scheda; uno storage che lancia, pieno o illeggibile non rompe niente', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(salvaPieghe(storage, 'railProcessi', { chiuse: new Set(['finiti']), aperte: new Set(['piega-giri']) }), true);
  salvaPieghe(storage, 'git', { chiuse: new Set(['nuovi']), aperte: new Set() });
  const letto = leggiPieghe(storage, 'railProcessi');
  assert.deepEqual([...letto.chiuse], ['finiti']);
  assert.deepEqual([...letto.aperte], ['piega-giri']);
  assert.deepEqual([...leggiPieghe(storage, 'git').chiuse], ['nuovi'], 'le schede non si pestano');
  const rotto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.deepEqual([...leggiPieghe(rotto, 'x').chiuse], [], 'uno storage che lancia vale «mai scelto» (M-21)');
  assert.equal(salvaPieghe(rotto, 'x', { chiuse: new Set(['a']), aperte: new Set() }), false, 'uno storage pieno: la piega resta per questa volta, niente eccezione');
  mem.set(CHIAVE_PIEGHE, '{non json');
  assert.deepEqual([...leggiPieghe(storage, 'git').chiuse], [], 'illeggibile = mai scelto');
  assert.equal(salvaPieghe(storage, 'git', { chiuse: new Set(['x']), aperte: new Set() }), true, 'su un valore illeggibile si riparte da vuoto');
  mem.set(CHIAVE_PIEGHE, '[1,2]');
  assert.deepEqual([...leggiPieghe(storage, 'git').chiuse], [], 'un valore della forma sbagliata vale «mai scelto»');
  assert.deepEqual([...leggiPieghe(null, 'git').chiuse], [], 'senza storage (finestra privata) niente eccezione');
});

test('PANNELLO-U22 — la fila delle schede: cedono i NUMERI aggiunti, mai i nomi', () => {
  assert.equal(livelloContiSchede(() => false), 0, 'se sta, numeri pieni');
  assert.equal(livelloContiSchede((l) => l < 1), 1, 'poi senza cifre');
  assert.equal(livelloContiSchede((l) => l < 2), 2, 'poi senza conti');
  assert.equal(livelloContiSchede(() => true), 2, 'se nemmeno così sta, la fila scorre come oggi');
  assert.deepEqual([...LIVELLI_CONTI], ['', 'senza-numeri', 'senza-conti']);
});

test('PANNELLO-COMUNE — la ricerca ignora maiuscole e accenti; percorsi con spazi ed emoji restano interi; niente numeri inventati', () => {
  assert.equal(normalizza('Perché'), 'perche');
  assert.ok(normalizza('Relazione Finale 📊.MD').includes('relazione finale 📊.md'));
  assert.deepEqual(nomeECartella('src/sotto cartella/file con spazi.md'), { nome: 'file con spazi.md', cartella: 'src/sotto cartella/' });
  assert.deepEqual(nomeECartella('README.md'), { nome: 'README.md', cartella: '' });
  assert.equal(kilo(999), '999');
  assert.equal(kilo(-1), '—', 'un numero negativo non diventa una misura');
  assert.equal(kilo(Number.NaN), '—');
});

test('PANNELLO-U11 — l’area «pannello» è registrata, in inglese e in italiano, senza «telefono» e senza «run» in italiano', () => {
  const chiavi = Object.keys(TESTI.en).filter((k) => k.startsWith('pannello.'));
  assert.ok(chiavi.length > 200, `l’area pannello è registrata (${chiavi.length} chiavi)`);
  for (const k of chiavi) {
    assert.ok(TESTI.it[k], `${k}: manca l’italiano`);
    assert.ok(!/telefon|phone/iu.test(TESTI.en[k] + TESTI.it[k]), `${k}: «dispositivi», mai «telefoni» (owner 22/10)`);
    assert.ok(!/\brun\b/iu.test(TESTI.it[k]), `${k}: in italiano niente «run» (owner 13/10)`);
  }
});
