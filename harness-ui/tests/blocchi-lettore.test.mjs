import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { TIPI } from '../src/blocchi/catalogo.mjs';
import { crea, leggi } from '../src/blocchi/lettore.mjs';

const CARTELLA = new URL('./fixtures/blocchi/', import.meta.url);
const FIXTURE = readdirSync(CARTELLA).filter((n) => n.endsWith('.txt')).sort().map((n) => ({
  nome: n.slice(0, -4),
  testo: readFileSync(new URL(n, CARTELLA), 'utf8'),
  atteso: JSON.parse(readFileSync(new URL(`${n.slice(0, -4)}.json`, CARTELLA), 'utf8')),
}));

// Generatore deterministico: pezzi «casuali» ripetibili.
function generatore(seme) {
  let s = seme >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aPezzi(testo, misura) {
  const l = crea();
  for (let i = 0; i < testo.length; i += misura) l.aggiungi(testo.slice(i, i + misura));
  return l.fine();
}

function aPezziCasuali(testo, seme) {
  const caso = generatore(seme);
  const l = crea();
  let i = 0;
  while (i < testo.length) {
    const n = 1 + Math.floor(caso() * 17);
    l.aggiungi(testo.slice(i, i + n));
    i += n;
  }
  return l.fine();
}

test('le fixture coprono tutti gli 11 tipi del catalogo v2 e i casi rotti', () => {
  const tipiVisti = new Set(FIXTURE.filter((f) => f.atteso.stato === 'completo').map((f) => f.atteso.blocco.tipo));
  assert.deepEqual([...tipiVisti].sort(), [...TIPI].sort());
  assert.equal(FIXTURE.filter((f) => f.atteso.stato === 'rotto').length >= 15, true);
});

for (const f of FIXTURE) {
  test(`fixture ${f.nome}: albero atteso`, () => {
    const r = leggi(f.testo);
    assert.equal(r.versione, 2);
    assert.equal(r.stato, f.atteso.stato, JSON.stringify(r));
    if (f.atteso.stato === 'completo') assert.deepEqual(r.blocco, f.atteso.blocco);
    else {
      assert.equal(r.motivo.codice, f.atteso.codice, JSON.stringify(r.motivo));
      assert.equal(r.blocco, undefined);
    }
  });

  test(`fixture ${f.nome}: a pezzi = intero (1 carattere, 2, 7, casuali)`, () => {
    const intero = leggi(f.testo);
    assert.deepEqual(aPezzi(f.testo, 1), intero);
    assert.deepEqual(aPezzi(f.testo, 2), intero);
    assert.deepEqual(aPezzi(f.testo, 7), intero);
    for (const seme of [1, 2, 3, 42, 2026]) assert.deepEqual(aPezziCasuali(f.testo, seme), intero);
  });
}

test('il testo del modello passa nell\'albero: nessun ESC né invisibili, $& intatto', () => {
  const r = leggi('root = Avviso("a", "t\u202Eitolo", "info", "\u001b]52;c;eA==\u0007x $& \u200By\u{E0041}")');
  assert.equal(r.stato, 'completo');
  const tutto = JSON.stringify(r.blocco);
  assert.equal(/[\u001b\u0007\u202E\u200B]|\u{E0041}/u.test(JSON.parse(JSON.stringify(r.blocco)).testo + r.blocco.titolo), false, tutto);
  assert.equal(r.blocco.testo, ']52;c;eA==x $& y');
});

test('in arrivo: stato, tipo e conteggio delle righe', () => {
  const l = crea();
  let s = l.aggiungi('root = Tab');
  assert.equal(s.stato, 'in-arrivo');
  assert.equal(s.righe, 0);
  s = l.aggiungi('ella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], [\n["uno"],\n');
  assert.equal(s.stato, 'in-arrivo');
  assert.equal(s.tipo, 'tabella');
  assert.equal(s.righe, 2);
  assert.equal(s.versione, 2);
  s = l.aggiungi('["due"]\n])');
  assert.equal(s.righe, 3);
  const finale = l.fine();
  assert.equal(finale.stato, 'completo');
  assert.equal(finale.righe, 3);
  assert.deepEqual(finale.blocco.righe, [['uno'], ['due']]);
});

test('istantanea in arrivo: le righe già chiuse, validate, senza buchi', () => {
  const l = crea();
  l.aggiungi('root = Tabella("t", "Ti", [{id: "a", titolo: "A", tipo: "testo"}], [\n["uno"],\n["du');
  const vista = l.istantanea();
  assert.equal(vista.stato, 'in-arrivo');
  assert.equal(vista.parziale.tipo, 'tabella');
  assert.equal(vista.parziale.titolo, 'Ti');
  assert.deepEqual(vista.parziale.righe[0], ['uno']);
  // la riga aperta può comparire coi pezzi già arrivati, mai un segnaposto
  assert.equal(vista.parziale.righe.length <= 2, true);
  // l'istantanea non cambia la lettura
  l.aggiungi('e"]\n])');
  assert.deepEqual(l.fine(), leggi('root = Tabella("t", "Ti", [{id: "a", titolo: "A", tipo: "testo"}], [\n["uno"],\n["due"]\n])'));
});

test('rotto presto: un tipo sconosciuto è rotto appena arriva il nome, prima della fine', () => {
  const l = crea();
  const s = l.aggiungi('root = Carosello(');
  assert.equal(s.stato, 'rotto');
  assert.equal(s.motivo.codice, 'tipoSconosciuto');
  assert.equal(l.aggiungi('"x")').stato, 'rotto');
  assert.equal(l.fine().motivo.codice, 'tipoSconosciuto');
});

test('ogni tipo: un argomento in più oltre la fonte è fuori schema', () => {
  const minimi = {
    tabella: 'Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], [], null, null, null',
    grafico: 'Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1, y: 2}]}], null, null',
    scelte: 'Scelte("s", null, null, [{testo: "a"}], null',
    modulo: 'Modulo("m", null, [{id: "a", etichetta: "A", tipo: "testo"}], "Invia", null',
    'chiave-valore': 'ChiaveValore("c", null, [{chiave: "a", valore: 1}], null',
    passi: 'Passi("p", null, [{titolo: "a"}], null',
    avviso: 'Avviso("v", null, "info", "x", null',
    cursore: 'Cursore("c", null, {id: "x", etichetta: "X", min: 0, max: 1, passo: 1}, [{id: "a", titolo: "A"}], [[1]], "a*x", null, null',
    metriche: 'Metriche("m", null, [{nome: "a", valore: 1}, {nome: "b", valore: 2}], null',
    confronto: 'Confronto("f", null, [{nome: "a", pro: []}, {nome: "b", pro: []}], null',
    diagramma: 'Diagramma("d", null, [{id: "a", testo: "A"}], [], null',
  };
  assert.deepEqual(Object.keys(minimi).sort(), [...TIPI].sort());
  for (const [tipo, inizio] of Object.entries(minimi)) {
    const buono = leggi(`root = ${inizio})`);
    assert.equal(buono.stato, 'completo', `${tipo}: ${JSON.stringify(buono.motivo)}`);
    assert.equal(buono.blocco.tipo, tipo);
    const rotto = leggi(`root = ${inizio}, "in più")`);
    assert.equal(rotto.stato, 'rotto', tipo);
    assert.equal(rotto.motivo.codice, 'campoFuoriSchema', tipo);
  }
});

test('ogni oggetto del catalogo: una chiave in più è fuori schema', () => {
  const casi = [
    'root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo", x: 1}], [])',
    'root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1, y: 2}], x: 1}])',
    'root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1, y: 2, z: 3}]}])',
    'root = Scelte("s", null, null, [{testo: "a", valore: "b"}])',
    'root = Modulo("m", null, [{id: "a", etichetta: "A", tipo: "testo", obbligatorio: true}], "Invia")',
    'root = Modulo("m", null, [{id: "a", etichetta: "A", tipo: "scelta", opzioni: [{testo: "x", y: 1}]}], "Invia")',
    'root = ChiaveValore("c", null, [{chiave: "a", valore: 1, colore: "rosso"}])',
    'root = Passi("p", null, [{titolo: "a", durata: 3}])',
    'root = Avviso("v", null, "info", "x", {tipo: "file", nome: "a.txt", quando: "ora", url: "http://x"})',
  ];
  for (const testo of casi) {
    const r = leggi(testo);
    assert.equal(r.stato, 'rotto', testo);
    assert.equal(r.motivo.codice, 'campoFuoriSchema', testo);
    assert.equal(typeof r.motivo.campo, 'string');
  }
});

test('fonte esterna data dall\'ospite: scelte e modulo rotti, gli altri tipi la portano', () => {
  const fonte = { tipo: 'attrezzo', nome: 'web_fetch', quando: '2026-11-02T10:00:00Z' };
  const scelte = crea({ fonte });
  scelte.aggiungi('root = Scelte("s", null, null, [{testo: "a"}])');
  const r = scelte.fine();
  assert.equal(r.stato, 'rotto');
  assert.equal(r.motivo.codice, 'interazioneDaFonteEsterna');
  const tab = crea({ fonte });
  tab.aggiungi('root = Avviso("v", null, "info", "x", {tipo: "file", nome: "finto", quando: "ieri"})');
  const ok = tab.fine();
  assert.equal(ok.stato, 'completo');
  assert.deepEqual(ok.blocco.fonte, fonte, 'la fonte dell\'ospite vince su quella scritta dal modello');
  const rotta = crea({ fonte: { tipo: 'altro' } });
  rotta.aggiungi('root = Avviso("v", null, "info", "x")');
  assert.equal(rotta.fine().motivo.codice, 'fonteNonValida');
});

test('mai lancia: pezzi strani, dopo la fine, chiamate ripetute', () => {
  const l = crea();
  for (const p of [undefined, null, 3, {}, Symbol('x')]) {
    assert.doesNotThrow(() => l.aggiungi(p));
  }
  assert.equal(l.fine().stato, 'rotto');
  const m = crea();
  m.aggiungi('root = Avviso("v", null, "info", "x")');
  const a = m.fine();
  assert.deepEqual(m.fine(), a);
  assert.deepEqual(m.aggiungi('altro = 3'), a);
  assert.doesNotThrow(() => leggi(undefined));
  assert.equal(leggi('').motivo.codice, 'nessunaRadice');
});

test('annidamento profondo e riferimenti a catena: rotto, mai uno stack esaurito', () => {
  const profondo = `root = Avviso("v", null, "info", ${'['.repeat(100_000)}`;
  const r = leggi(profondo);
  assert.equal(r.stato, 'rotto');
  assert.equal(r.motivo.codice, 'troppoAnnidato');
  let catena = 'root = Avviso("v", null, "info", r0)\n';
  for (let i = 0; i < 3000; i += 1) catena += `r${i} = r${i + 1}\n`;
  catena += 'r3000 = "fine"\n';
  const c = leggi(catena);
  assert.equal(c.stato, 'rotto');
  assert.equal(c.motivo.codice, 'troppoAnnidato');
});

test('riferimenti ripetuti (a = [b, b, b…]): l\'albero resta nei tetti dello schema, in tempo breve', () => {
  // Lo schema ha profondità e liste a tetto: l'amplificazione massima è 500 righe × 12 celle, mai esponenziale.
  const colonne = Array.from({ length: 12 }, (_, i) => `{id: "c${i}", titolo: "C", tipo: "testo"}`).join(', ');
  const fai = (n) => `root = Tabella("t", null, [${colonne}], righe)\nrighe = [${Array.from({ length: n }, () => 'r').join(', ')}]\nr = [${Array.from({ length: 12 }, () => 'c').join(', ')}]\nc = "${'x'.repeat(200)}"\n`;
  const t0 = performance.now();
  const r = leggi(fai(500));
  assert.equal(r.stato, 'completo', JSON.stringify(r.motivo));
  assert.equal(r.blocco.righe.length, 500);
  assert.equal(leggi(fai(501)).motivo.codice, 'oltreIlLimite');
  assert.ok(performance.now() - t0 < 1000);
  // a = [a]: circolare anche dentro una lista
  assert.equal(leggi('root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], a)\na = [a]').motivo.codice, 'riferimentoCircolare');
});

test('tetti del testo: oltre 2 milioni di caratteri o 5.000 istruzioni è rotto per grandezza', () => {
  const l = crea();
  l.aggiungi('root = Avviso("v", null, "info", "');
  let s;
  for (let i = 0; i < 3; i += 1) s = l.aggiungi('x'.repeat(700_000));
  assert.equal(s.stato, 'rotto');
  assert.equal(s.motivo.codice, 'troppoGrande');
  let molte = 'root = Avviso("v", null, "info", "x")\n';
  for (let i = 0; i < 5000; i += 1) molte += `a${i} = 1\n`;
  assert.equal(leggi(molte).motivo.codice, 'troppoGrande');
  let tante = 'root = Avviso("v", null, "info", "x")\n';
  for (let i = 0; i < 4998; i += 1) tante += `a${i} = 1\n`;
  assert.equal(leggi(tante).stato, 'completo');
});

test('le righe si contano anche dentro le stringhe e dopo una fuga', () => {
  assert.equal(leggi('root = Avviso("v", null, "info", "uno\ndue\\\ntre")').righe, 2);
  assert.equal(leggi('root = Avviso("v", null, "info", "x") // nota\n').righe, 1);
});

test('numeri: segno, decimali, esponente; «1.» e «1e» sono rotti', () => {
  const r = leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: -1, y: 2.5}, {x: 3, y: 1e3}, {x: 4, y: -2.5E-1}]}])');
  assert.deepEqual(r.blocco.serie[0].punti, [{ x: -1, y: 2.5 }, { x: 3, y: 1000 }, { x: 4, y: -0.25 }]);
  assert.equal(leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1., y: 2}]}])').motivo.codice, 'espressioneNonAmmessa');
  assert.equal(leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1e, y: 2}]}])').motivo.codice, 'sintassi');
  assert.equal(leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: - 1, y: 2}]}])').motivo.codice, 'espressioneNonAmmessa');
  assert.equal(leggi('root = Avviso("v", null, "info", "a" + "b")').motivo.codice, 'espressioneNonAmmessa');
  assert.equal(leggi('root = Avviso("v", null, "info", "a") / 2').motivo.codice, 'espressioneNonAmmessa');
});

test('istantanea: un riferimento non ancora arrivato si salta, mai un buco', () => {
  const l = crea();
  l.aggiungi('root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], [r1, r2])\nr1 = ["uno"]\n');
  const vista = l.istantanea();
  assert.deepEqual(vista.parziale.righe, [['uno']]);
  l.aggiungi('r2 = ["due"]\n');
  assert.deepEqual(l.istantanea().parziale.righe, [['uno'], ['due']]);
  assert.deepEqual(l.fine().blocco.righe, [['uno'], ['due']]);
});

test('troncato fuori da una stringa, o con una stringa aperta in un\'istruzione dopo: bloccoIncompleto', () => {
  assert.equal(leggi('root = Avviso("a", null, "info", "x"').motivo.codice, 'bloccoIncompleto');
  assert.equal(leggi('root = Avviso("a", null, "info", "x")\nb = "aperta').motivo.codice, 'bloccoIncompleto');
  assert.equal(leggi('root =').motivo.codice, 'bloccoIncompleto');
  // una stringa aperta dopo un'istruzione già chiusa: a metà, mai un blocco «completo»
  assert.equal(leggi('root = Avviso("a", null, "info", "x") "coda').motivo.codice, 'bloccoIncompleto');
  assert.equal(leggi('root = Avviso("a", null, "info", "x") "coda"').motivo.codice, 'sintassi');
});

test('un tipo dentro un altro dove va un oggetto: valore non valido, mai letto come oggetto', () => {
  assert.equal(leggi('root = Scelte("s", null, null, [Avviso("a", null, "info", "x")])').motivo.codice, 'valoreNonValido');
});

test('chiavi pericolose negli oggetti non toccano i prototipi', () => {
  const r = leggi('root = ChiaveValore("c", null, [{chiave: "a", valore: 1, __proto__: {x: 1}}])');
  assert.equal(r.stato, 'rotto');
  assert.equal(r.motivo.codice, 'campoFuoriSchema');
  assert.equal({}.x, undefined);
});

// ---- Linearità (condizione 1 di Performance, condizione 2 della CLI) ----

function tabellaDiCaratteri(caratteri, larghezzaCella) {
  const colonne = Array.from({ length: 10 }, (_, i) => `{id: "c${i}", titolo: "C${i}", tipo: "testo"}`).join(', ');
  let testo = `root = Tabella("lunga", "Lunga", [${colonne}], [\n`;
  const cella = `"${'x'.repeat(larghezzaCella)}"`;
  const riga = `[${Array.from({ length: 10 }, () => cella).join(', ')}],\n`;
  let righe = 0;
  while (testo.length + riga.length + 3 < caratteri && righe < 500) {
    testo += riga;
    righe += 1;
  }
  return `${testo}])\n`;
}

function tempoAPezziDaUno(testo) {
  const l = crea();
  const t0 = performance.now();
  for (let i = 0; i < testo.length; i += 1) l.aggiungi(testo[i]);
  const r = l.fine();
  return { ms: performance.now() - t0, r };
}

test('linearità: 20.000 caratteri a pezzi da 1 in meno di 50 ms, stesso albero dell\'intero', () => {
  const testo = tabellaDiCaratteri(20_000, 3);
  assert.ok(testo.length >= 19_000 && testo.length <= 20_000, String(testo.length));
  for (let i = 0; i < 3; i += 1) tempoAPezziDaUno(testo); // riscaldamento
  const misure = [];
  let ultimo;
  for (let i = 0; i < 7; i += 1) {
    const m = tempoAPezziDaUno(testo);
    misure.push(m.ms);
    ultimo = m.r;
  }
  misure.sort((a, b) => a - b);
  const mediana = misure[3];
  console.log(`# 20.000 caratteri a pezzi da 1: mediana ${mediana.toFixed(2)} ms, minimo ${misure[0].toFixed(2)} ms`);
  assert.equal(ultimo.stato, 'completo');
  assert.deepEqual(ultimo, leggi(testo));
  assert.ok(mediana < 50, `mediana ${mediana} ms`);
});

test('linearità: costo per pezzo costante, primo e ultimo decimo entro 2×', () => {
  // Una sola istruzione lunga: un lettore che rilegge la coda pendente a ogni pezzo qui diventa quadratico.
  const testo = tabellaDiCaratteri(20_000, 3);
  const decimo = Math.floor(testo.length / 10);
  const primi = [];
  const ultimi = [];
  for (let giro = 0; giro < 15; giro += 1) {
    const l = crea();
    let t0 = performance.now();
    for (let i = 0; i < decimo; i += 1) l.aggiungi(testo[i]);
    primi.push(performance.now() - t0);
    for (let i = decimo; i < testo.length - decimo; i += 1) l.aggiungi(testo[i]);
    t0 = performance.now();
    for (let i = testo.length - decimo; i < testo.length; i += 1) l.aggiungi(testo[i]);
    ultimi.push(performance.now() - t0);
    l.fine();
  }
  const minimo = (xs) => Math.min(...xs);
  const rapporto = minimo(ultimi) / minimo(primi);
  console.log(`# primo decimo ${minimo(primi).toFixed(3)} ms, ultimo decimo ${minimo(ultimi).toFixed(3)} ms, rapporto ${rapporto.toFixed(2)}`);
  assert.ok(rapporto <= 2, `rapporto ${rapporto}`);
});

test('linearità: 1 MB a pezzi da 1 byte nello stesso ordine di tempo del blocco intero', () => {
  const testo = tabellaDiCaratteri(1_000_000, 190);
  assert.ok(testo.length > 900_000, String(testo.length));
  leggi(testo);
  tempoAPezziDaUno(testo);
  const interi = [];
  const aPezziUno = [];
  let r1;
  let r2;
  for (let i = 0; i < 3; i += 1) {
    let t0 = performance.now();
    r1 = leggi(testo);
    interi.push(performance.now() - t0);
    const m = tempoAPezziDaUno(testo);
    aPezziUno.push(m.ms);
    r2 = m.r;
  }
  const intero = Math.min(...interi);
  const pezzi = Math.min(...aPezziUno);
  console.log(`# 1 MB: intero ${intero.toFixed(1)} ms, a pezzi da 1 byte ${pezzi.toFixed(1)} ms, rapporto ${(pezzi / intero).toFixed(2)}`);
  assert.equal(r1.stato, 'completo', JSON.stringify(r1.motivo));
  assert.deepEqual(r2, r1);
  assert.ok(pezzi / intero < 10, `rapporto ${pezzi / intero}`);
  assert.ok(pezzi < 2000, `${pezzi} ms`);
});
