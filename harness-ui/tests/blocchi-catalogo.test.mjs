import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CATALOGO, CODICI_DEL_ROTTO, LINGUA_DEL_RECINTO, TIPI, TIPI_INTERATTIVI, VERSIONE_DEL_CATALOGO, ripiegoTestuale } from '../src/blocchi/catalogo.mjs';
import { leggi } from '../src/blocchi/lettore.mjs';
import { TETTO_TOKEN_DEL_PROMPT, promptDelCatalogo, stimaToken } from '../src/blocchi/prompt-del-catalogo.mjs';

const fixture = (nome) => readFileSync(new URL(`./fixtures/blocchi/${nome}.txt`, import.meta.url), 'utf8');
const blocco = (nome) => {
  const r = leggi(fixture(nome));
  assert.equal(r.stato, 'completo', JSON.stringify(r.motivo));
  return r.blocco;
};

test('catalogo v2: 11 tipi (i 7 del v1 nello stesso ordine, poi i 4 di FE-082), versione 2, campi comuni su ogni tipo', () => {
  assert.equal(VERSIONE_DEL_CATALOGO, 2);
  assert.deepEqual(TIPI, ['tabella', 'grafico', 'scelte', 'modulo', 'chiave-valore', 'passi', 'avviso', 'cursore', 'metriche', 'confronto', 'diagramma']);
  assert.deepEqual(TIPI_INTERATTIVI, ['scelte', 'modulo', 'cursore']);
  assert.equal(LINGUA_DEL_RECINTO, 'talos-blocco');
  for (const tipo of TIPI) {
    const voce = CATALOGO[tipo];
    const nomi = voce.argomenti.map((a) => a.nome);
    assert.equal(nomi[0], 'id', tipo);
    assert.equal(nomi[1], 'titolo', tipo);
    assert.equal(nomi.at(-1), 'fonte', tipo);
    assert.equal(voce.argomenti[0].obbligatorio, true);
    assert.equal(voce.argomenti[1].obbligatorio, false);
    assert.equal(voce.argomenti.at(-1).obbligatorio, false);
    assert.match(voce.componente, /^[A-Z][A-Za-z]*$/);
  }
  assert.ok(Object.isFrozen(CATALOGO));
  assert.ok(Object.isFrozen(CATALOGO.tabella.argomenti));
  for (const c of CODICI_DEL_ROTTO) assert.match(c, /^[a-z][A-Za-z]*$/, 'codici senza trattino');
});

test('limiti del catalogo come nella forma approvata', () => {
  const L = (tipo) => CATALOGO[tipo].limiti;
  assert.deepEqual(L('tabella'), { colonne: 12, righe: 500, cella: 200 });
  assert.deepEqual(L('grafico'), { serie: 6, punti: 60, fette: 8 });
  assert.deepEqual(L('scelte'), { opzioni: 6, testo: 80 });
  assert.deepEqual(L('modulo'), { campi: 8 });
  assert.deepEqual(L('chiave-valore'), { righe: 20 });
  assert.deepEqual(L('passi'), { voci: 30 });
  assert.deepEqual(L('avviso'), { testo: 400 });
  assert.deepEqual(L('cursore'), { colonne: 6, righe: 12, formula: 200, passi: 1000 });
  assert.deepEqual(L('metriche'), { voci: 6, minimo: 2 });
  assert.deepEqual(L('confronto'), { colonne: 4, minimo: 2, voci: 8 });
  assert.deepEqual(L('diagramma'), { nodi: 12, frecce: 16 });
});

test('limiti al bordo: il massimo passa, uno in più è rotto', () => {
  const colonne = (n) => `[${Array.from({ length: n }, (_, i) => `{id: "c${i}", titolo: "C", tipo: "numero"}`).join(', ')}]`;
  assert.equal(leggi(`root = Tabella("t", null, ${colonne(12)}, [])`).stato, 'completo');
  assert.equal(leggi(`root = Tabella("t", null, ${colonne(13)}, [])`).motivo.codice, 'oltreIlLimite');
  const righe = (n) => `[${Array.from({ length: n }, () => '[1]').join(', ')}]`;
  assert.equal(leggi(`root = Tabella("t", null, ${colonne(1)}, ${righe(500)})`).stato, 'completo');
  assert.equal(leggi(`root = Tabella("t", null, ${colonne(1)}, ${righe(501)})`).motivo.codice, 'oltreIlLimite');
  const punti = (n) => `[${Array.from({ length: n }, (_, i) => `{x: ${i}, y: 1}`).join(', ')}]`;
  const serie = (n, p) => `[${Array.from({ length: n }, (_, i) => `{nome: "s${i}", punti: ${punti(p)}}`).join(', ')}]`;
  assert.equal(leggi(`root = Grafico("g", null, "barre", "d", ${serie(6, 60)})`).stato, 'completo');
  assert.equal(leggi(`root = Grafico("g", null, "barre", "d", ${serie(7, 1)})`).motivo.codice, 'oltreIlLimite');
  assert.equal(leggi(`root = Grafico("g", null, "barre", "d", ${serie(1, 61)})`).motivo.codice, 'oltreIlLimite');
  assert.equal(leggi(`root = Grafico("g", null, "torta", "d", ${serie(1, 8)})`).stato, 'completo');
  assert.equal(leggi(`root = Grafico("g", null, "torta", "d", ${serie(2, 2)})`).motivo.codice, 'oltreIlLimite');
  const opzioni = (n) => `[${Array.from({ length: n }, (_, i) => `{testo: "o${i}"}`).join(', ')}]`;
  assert.equal(leggi(`root = Scelte("s", null, null, ${opzioni(6)})`).stato, 'completo');
  assert.equal(leggi(`root = Scelte("s", null, null, ${opzioni(0)})`).motivo.codice, 'oltreIlLimite');
  const campi = (n) => `[${Array.from({ length: n }, (_, i) => `{id: "c${i}", etichetta: "E", tipo: "testo"}`).join(', ')}]`;
  assert.equal(leggi(`root = Modulo("m", null, ${campi(8)}, "Invia")`).stato, 'completo');
  assert.equal(leggi(`root = Modulo("m", null, ${campi(9)}, "Invia")`).motivo.codice, 'oltreIlLimite');
  const kv = (n) => `[${Array.from({ length: n }, (_, i) => `{chiave: "k${i}", valore: ${i}}`).join(', ')}]`;
  assert.equal(leggi(`root = ChiaveValore("c", null, ${kv(20)})`).stato, 'completo');
  assert.equal(leggi(`root = ChiaveValore("c", null, ${kv(21)})`).motivo.codice, 'oltreIlLimite');
  const voci = (n) => `[${Array.from({ length: n }, (_, i) => `{titolo: "v${i}"}`).join(', ')}]`;
  assert.equal(leggi(`root = Passi("p", null, ${voci(30)})`).stato, 'completo');
  assert.equal(leggi(`root = Passi("p", null, ${voci(31)})`).motivo.codice, 'oltreIlLimite');
});

test('tetti di lunghezza: le stringhe lunghe si accorciano con «…», non rompono', () => {
  const lungo = 'a'.repeat(1000);
  const r = leggi(`root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], [["${lungo}"]])`);
  assert.equal(r.blocco.righe[0][0].length, 200);
  assert.ok(r.blocco.righe[0][0].endsWith('…'));
  const s = leggi(`root = Scelte("s", null, null, [{testo: "${lungo}"}])`);
  assert.equal([...s.blocco.opzioni[0].testo].length, 80);
  const v = leggi(`root = Avviso("v", null, "info", "${lungo}")`);
  assert.equal([...v.blocco.testo].length, 400);
});

test('modulo: opzioni obbligatorie per scelta e più-scelte, id dei campi unici', () => {
  assert.equal(leggi('root = Modulo("m", null, [{id: "a", etichetta: "A", tipo: "scelta"}], "Invia")').motivo.codice, 'campoMancante');
  assert.equal(leggi('root = Modulo("m", null, [{id: "a", etichetta: "A", tipo: "piu-scelte", opzioni: [{testo: "x"}]}], "Invia")').stato, 'completo');
  assert.equal(leggi('root = Modulo("m", null, [{id: "a", etichetta: "A", tipo: "testo"}, {id: "a", etichetta: "B", tipo: "numero"}], "Invia")').motivo.codice, 'valoreNonValido');
});

test('valori: numeri finiti, booleani al posto giusto, testi non vuoti', () => {
  assert.equal(leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1, y: "dieci"}]}])').motivo.codice, 'valoreNonValido');
  assert.equal(leggi('root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "testo"}], [], "sì")').motivo.codice, 'valoreNonValido');
  assert.equal(leggi('root = Tabella("t", null, [{id: "a", titolo: "A", tipo: "colore"}], [])').motivo.codice, 'valoreNonValido');
  assert.equal(leggi('root = Avviso("v", null, "info", "   ")').motivo.codice, 'valoreNonValido');
  assert.equal(leggi('root = Grafico("g", null, "barre", "d", [{nome: "s", punti: [{x: 1, y: 1e400}]}])').motivo.codice, 'valoreNonValido');
  assert.equal(leggi('root = Avviso(null, null, "info", "x")').motivo.codice, 'campoMancante');
});

// ---- Ripiego testuale ----

test('ripiego testuale: un testo semplice per ogni tipo, in inglese di serie e in italiano', () => {
  assert.equal(ripiegoTestuale(blocco('01-tabella')), [
    'Vendite per mese',
    '',
    '| Mese | Euro |',
    '| --- | --- |',
    '| Gennaio | 1200 |',
    '| Febbraio | 980.5 |',
    '| Marzo |  |',
  ].join('\n'));
  assert.equal(ripiegoTestuale(blocco('02-grafico')), [
    'Prezzo medio',
    '',
    'Il prezzo sale da 10 a 14 euro fra gennaio e marzo. (€)',
    '',
    '| x | Prezzo |',
    '| --- | --- |',
    '| gen | 10 |',
    '| feb | 12 |',
    '| mar | 14 |',
  ].join('\n'));
  assert.equal(ripiegoTestuale(blocco('03-scelte')), 'Come vuoi procedere?\n\n- Continua\n- Fermati qui');
  assert.equal(ripiegoTestuale(blocco('04-modulo')), [
    'Dettagli del viaggio',
    '',
    '- Dove vuoi andare?',
    '- Quante notti?',
    '- Mezzo (Treno / Aereo)',
  ].join('\n'));
  assert.equal(ripiegoTestuale(blocco('05-chiave-valore')), 'Server\n\n- CPU: 42% (ok)\n- Disco: 91 (warning)\n- Acceso da: 3 giorni');
  assert.equal(ripiegoTestuale(blocco('05-chiave-valore'), { lingua: 'it' }), 'Server\n\n- CPU: 42% (ok)\n- Disco: 91 (attenzione)\n- Acceso da: 3 giorni');
  assert.equal(ripiegoTestuale(blocco('06-passi')), 'Migrazione\n\n1. Copia dei dati (done, lunedì)\n2. Verifica (now)\n3. Spegnimento del vecchio (to do)');
  assert.equal(ripiegoTestuale(blocco('06-passi'), { lingua: 'it' }), 'Migrazione\n\n1. Copia dei dati (fatto, lunedì)\n2. Verifica (ora)\n3. Spegnimento del vecchio (da fare)');
  assert.equal(ripiegoTestuale(blocco('07-avviso')), 'Warning: Il disco è quasi pieno:\nrestano 2 GB.');
  assert.equal(ripiegoTestuale(blocco('07-avviso'), { lingua: 'it' }), 'Attenzione: Il disco è quasi pieno:\nrestano 2 GB.');
});

test('ripiego: le barre nelle celle non rompono la tabella Markdown, la fonte si dice', () => {
  const r = leggi('root = Tabella("t", null, [{id: "a", titolo: "A|B", tipo: "testo"}], [["x|y"]], null, null, {tipo: "pagina", nome: "esempio.it", quando: "oggi"})');
  assert.equal(ripiegoTestuale(r.blocco), '| A\\|B |\n| --- |\n| x\\|y |\n\nSource: esempio.it (oggi)');
  assert.equal(ripiegoTestuale(r.blocco, { lingua: 'it' }).endsWith('Fonte: esempio.it (oggi)'), true);
});

test('ripiego: mai lancia, blocco sconosciuto o vuoto dà stringa vuota', () => {
  for (const v of [undefined, null, {}, { tipo: 'boh' }, 3]) assert.equal(ripiegoTestuale(v), '');
});

// ---- Prompt del catalogo ----

test('prompt: due chiamate danno lo stesso testo byte per byte, l\'ordine dei tipi non conta', () => {
  const a = promptDelCatalogo();
  const b = promptDelCatalogo();
  assert.equal(a, b);
  assert.deepEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  assert.equal(promptDelCatalogo({ tipi: ['avviso', 'tabella'] }), promptDelCatalogo({ tipi: ['tabella', 'avviso'] }));
  assert.equal(promptDelCatalogo({ tipi: ['tabella', 'tabella', 'boh'] }), promptDelCatalogo({ tipi: ['tabella'] }));
});

test('UIG-9.4 prompt: ≤ 1000 token pieno, senza clic e minimo (stima dichiarata: caratteri / 3,5), il nucleo minimo più corto', () => {
  assert.equal(TETTO_TOKEN_DEL_PROMPT, 1000);
  const senzaClic = promptDelCatalogo({ clic: false });
  assert.ok(stimaToken(senzaClic) <= TETTO_TOKEN_DEL_PROMPT, `senza clic ${stimaToken(senzaClic)}`);
  assert.ok(stimaToken(promptDelCatalogo({ minimo: true })) <= TETTO_TOKEN_DEL_PROMPT);
  assert.equal(stimaToken('x'.repeat(35)), 10);
  const pieno = promptDelCatalogo();
  const minimo = promptDelCatalogo({ minimo: true });
  console.log(`# prompt pieno ${pieno.length} caratteri ≈ ${stimaToken(pieno)} token; minimo ${minimo.length} ≈ ${stimaToken(minimo)} token`);
  assert.ok(stimaToken(pieno) <= TETTO_TOKEN_DEL_PROMPT, String(stimaToken(pieno)));
  assert.ok(minimo.length < pieno.length * 0.75);
  for (const tipo of TIPI) assert.ok(pieno.includes(`${CATALOGO[tipo].componente}(`), tipo);
});

test('prompt: solo i tipi della superficie', () => {
  const p = promptDelCatalogo({ tipi: ['tabella'] });
  assert.ok(p.includes('Tabella('));
  for (const tipo of TIPI.filter((t) => t !== 'tabella')) assert.equal(p.includes(`${CATALOGO[tipo].componente}(`), false, tipo);
  assert.equal(promptDelCatalogo({ tipi: [] }), '');
});

test('prompt: una superficie senza clic non promette clic, il modulo sparisce, le scelte si rispondono scrivendo', () => {
  const p = promptDelCatalogo({ tipi: ['tabella', 'scelte', 'modulo', 'avviso'], clic: false });
  assert.equal(/click|tap|button|press|clic|tocc|pulsant/i.test(p), false, p);
  assert.equal(p.includes('Modulo('), false);
  assert.equal(promptDelCatalogo({ clic: false }).includes('Cursore('), false, 'il cursore si trascina: niente senza clic');
  assert.ok(promptDelCatalogo({ clic: false }).includes('Diagramma('));
  assert.ok(p.includes('Scelte('));
  assert.match(p, /answers by writing/);
  assert.equal(p.includes('picks one'), false);
  assert.match(promptDelCatalogo({ tipi: ['scelte'] }), /picks one/);
  const conClic = promptDelCatalogo({ tipi: ['scelte', 'modulo'] });
  assert.ok(conClic.includes('Modulo('));
});

test('prompt: gli esempi del prompt sono blocchi validi per il lettore', () => {
  for (const opzioni of [{}, { minimo: true }, { clic: false }, { tipi: ['avviso'] }]) {
    const p = promptDelCatalogo(opzioni);
    const recinti = [...p.matchAll(/```talos-blocco\n([\s\S]*?)```/g)].map((m) => m[1]);
    assert.ok(recinti.length >= 1, JSON.stringify(opzioni));
    for (const corpo of recinti) {
      const r = leggi(corpo);
      assert.equal(r.stato, 'completo', `${JSON.stringify(opzioni)}: ${corpo}`);
      if (opzioni.tipi) assert.ok(opzioni.tipi.includes(r.blocco.tipo), 'l\'esempio usa solo i tipi della superficie');
    }
  }
});

test('prompt: dice il divieto dei dati esterni quando ci sono tipi interattivi', () => {
  assert.match(promptDelCatalogo(), /web page, file or tool/i);
  assert.equal(/web page, file or tool/i.test(promptDelCatalogo({ tipi: ['tabella'] })), false);
});

// ---- UIG-9.2 (ledger UI generativa 05/11, G-C): caratterizzazione del catalogo v1, scritta e verde PRIMA del catalogo v2 ----
// La fotografia `fixtures/blocchi/v1-caratterizzazione.json` è stata presa dal codice del catalogo v1 (base 55f3cda1b) con lo
// script del rapporto: per ogni fixture v1 il risultato del lettore (senza `versione`, che passa a 2) e il ripiego testuale in
// inglese e in italiano; per ogni tipo v1 componente, limiti e argomenti. Un blocco v1 si deve leggere ESATTAMENTE come allora.
test('UIG-9.2 i blocchi v1 si leggono esattamente come nel catalogo v1 (lettore, ripiego, schemi)', () => {
  const foto = JSON.parse(readFileSync(new URL('./fixtures/blocchi/v1-caratterizzazione.json', import.meta.url), 'utf8'));
  const nomi = Object.keys(foto.fixture);
  assert.equal(nomi.length, 30, 'le 30 fixture del catalogo v1');
  for (const nome of nomi) {
    const { versione, ...oggi } = leggi(readFileSync(new URL(`./fixtures/blocchi/${nome}`, import.meta.url), 'utf8'));
    assert.equal(typeof versione, 'number', nome);
    const ripiego = oggi.stato === 'completo' ? { en: ripiegoTestuale(oggi.blocco), it: ripiegoTestuale(oggi.blocco, { lingua: 'it' }) } : null;
    assert.deepEqual(JSON.parse(JSON.stringify({ ...oggi, ripiego })), foto.fixture[nome], nome);
  }
  for (const [tipo, schema] of Object.entries(foto.schemi)) {
    const v = CATALOGO[tipo];
    assert.deepEqual(JSON.parse(JSON.stringify({ componente: v.componente, limiti: v.limiti, argomenti: v.argomenti })), schema, tipo);
  }
});

// ---- UIG-9.1 (ledger G-C): i limiti dei tipi v2, ai due bordi — il bordo giusto si legge, quello fuori rompe col suo codice ----
test('UIG-9.1 limiti v2: metriche 2-6, confronto 2-4, diagramma ≤12 nodi e ≤16 frecce, cursore min<max, passo>0, una formula', () => {
  const met = (n) => `root = Metriche("m", null, [${Array.from({ length: n }, (_, i) => `{nome: "v${i}", valore: ${i}}`).join(', ')}])`;
  const con = (n) => `root = Confronto("f", null, [${Array.from({ length: n }, (_, i) => `{nome: "c${i}", pro: ["p"]}`).join(', ')}])`;
  const nodi = (n) => Array.from({ length: n }, (_, i) => `{id: "n${i}", testo: "N${i}"}`).join(', ');
  const dia = (n, f) => `root = Diagramma("d", null, [${nodi(n)}], [${Array.from({ length: f }, (_, i) => `{da: "n${i % n}", a: "n${(i + 1) % n}"}`).join(', ')}])`;
  const cur = (c, formula = '"a * x"', righe = '[[1]]', colonne = '[{id: "a", titolo: "A"}]') => `root = Cursore("c", null, {${c}}, ${colonne}, ${righe}, ${formula})`;
  const ok = (t) => assert.equal(leggi(t).stato, 'completo', t);
  const rotto = (t, codice, campo) => {
    const r = leggi(t);
    assert.equal(r.stato, 'rotto', t);
    assert.equal(r.motivo.codice, codice, t);
    if (campo) assert.match(r.motivo.campo, campo, t);
  };
  ok(met(2)); ok(met(6)); rotto(met(1), 'oltreIlLimite', /voci/); rotto(met(7), 'oltreIlLimite', /voci/);
  ok(con(2)); ok(con(4)); rotto(con(1), 'oltreIlLimite', /colonne/); rotto(con(5), 'oltreIlLimite', /colonne/);
  ok(dia(12, 16)); rotto(dia(13, 0), 'oltreIlLimite', /nodi/); rotto(dia(12, 17), 'oltreIlLimite', /frecce/);
  rotto('root = Diagramma("d", null, [{id: "a", testo: "A"}], [{da: "z", a: "a"}])', 'valoreNonValido', /frecce\[0\]\.da/);
  rotto('root = Diagramma("d", null, [{id: "a", testo: "A"}, {id: "a", testo: "B"}], [])', 'valoreNonValido');
  ok(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1, valore: 10'));
  rotto(cur('id: "x", etichetta: "X", min: 5, max: 5, passo: 1'), 'valoreNonValido', /cursore\.max/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 0'), 'valoreNonValido', /cursore\.passo/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: -1'), 'valoreNonValido', /cursore\.passo/);
  ok(cur('id: "x", etichetta: "X", min: 0, max: 1000, passo: 1'));
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 1001, passo: 1'), 'oltreIlLimite', /cursore\.passo/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1, valore: 11'), 'valoreNonValido', /cursore\.valore/);
  rotto(cur('id: "a", etichetta: "X", min: 0, max: 10, passo: 1'), 'valoreNonValido', /cursore\.id/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1', '"b * x"'), 'valoreNonValido', /formula/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1', '"alert(1)"'), 'valoreNonValido', /formula/);
  // oltre i 200 caratteri il testo del modello si accorcia con «…», che la formula non ammette: una formula lunga non diventa MAI
  // una formula più corta e valida (`a * 1000…` non si legge come `a * 100`)
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1', `"${'1+'.repeat(100)}1"`), 'valoreNonValido', /formula/);
  rotto(cur('id: "x", etichetta: "X", min: 0, max: 10, passo: 1', `"a * ${'1'.repeat(200)}"`), 'valoreNonValido', /formula/);
});
