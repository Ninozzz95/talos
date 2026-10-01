/*
 * ⭐ LEGGI IBRIDA (30/09/2026) — decisione owner D1 «Tutte e due», con i numeri dello stesso giorno:
 *   righe come unità normale (base 1, 2000 per pagina), tetto 100 KB per pagina, riga «troppo lunga» oltre 2000 caratteri,
 *   e dentro una riga troppo lunga si prosegue con `byteOffset` (in byte, riusando il decodificatore rigoroso di READ22).
 *   In hex `offset`/`limit` restano byte. Testo pulito: l'intervallo di righe sta nell'intestazione, mai sulle righe.
 * Come fanno gli altri (letti nel codice il 30/09): Claude Code `offset`=riga/`limit`=righe (sdk-tools.d.ts:856-868);
 *   Hermes righe base 1, 2000, 100.000 caratteri, «remainder is not retrievable» (tools/file_tools.py:111); Pi righe base 1,
 *   2000 righe o 50 KB, riga enorme rimandata a `sed` (agent/src/harness/tools/read.ts:124-126). Nessuno recupera per intero
 *   una riga enorme con l'attrezzo di lettura: TALOS sì. Ledger: Downloads/handoff-talos-2026-09-27/LEDGER-LEGGI-IBRIDA-2026-09-30.md.
 */
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI, esitoDellaLettura, leggiTestoLimitato} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, contenuto) {
  const root = mkdtempSync(join(tmpdir(), 'talos-leggi-righe-'));
  t.after(() => rimuoviCartellaDiProva(root));
  writeFileSync(join(root, 'file.txt'), contenuto);
  return root;
}
const leggi = async (root, argomenti = {}) => esitoDellaLettura(await leggiTestoLimitato(root, 'file.txt', argomenti), 'file.txt');
// intestazione = prima riga fra parentesi quadre; corpo = il resto
const parti = (esito) => { const m = /^(\[TALOS [^\n]*\])\n([\s\S]*)$/u.exec(esito); return m ? {testa: m[1], corpo: m[2]} : {testa: null, corpo: esito}; };
const righe = (n, f = (i) => `riga ${i}`) => Array.from({length: n}, (_, i) => f(i + 1)).join('\n') + '\n';

test('LINES-DEFAULT-2000: senza argomenti si leggono le prime 2000 righe e si dice come continuare', async t => {
  const root = fixture(t, righe(5000));
  const {testa, corpo} = parti(await leggi(root));
  assert.match(testa ?? '', /lines 1-2000 of 5000/u);
  assert.match(testa, /leggi offset=2001/u);
  const r = corpo.replace(/\n$/u, '').split('\n');
  assert.equal(r.length, 2000); assert.equal(r[0], 'riga 1'); assert.equal(r.at(-1), 'riga 2000');
  assert.doesNotMatch(corpo, /^\s*\d+\s*[→|]/mu, 'testo pulito: nessun numero davanti alle righe');
});

test('LINES-OFFSET-LIMIT: offset è la prima riga (base 1), limit il numero di righe', async t => {
  const root = fixture(t, righe(5000));
  const {testa, corpo} = parti(await leggi(root, {offset: 10, limit: 5}));
  assert.match(testa ?? '', /lines 10-14 of 5000/u);
  assert.deepEqual(corpo.replace(/\n$/u, '').split('\n'), ['riga 10', 'riga 11', 'riga 12', 'riga 13', 'riga 14']);
  assert.match(testa, /leggi offset=15/u);
  const zero = parti(await leggi(root, {offset: 0, limit: 1}));
  assert.equal(zero.corpo.replace(/\n$/u, ''), 'riga 1', 'offset 0 si legge come l\'inizio del file');
});

test('LINES-CAP-100KB: una pagina non supera 100 KB e dice dove riprendere', async t => {
  const root = fixture(t, righe(300, (i) => `${String(i).padStart(4, '0')}${'x'.repeat(996)}`));
  const {testa, corpo} = parti(await leggi(root));
  assert.ok(Buffer.byteLength(corpo) <= 100 * 1024, `pagina di ${Buffer.byteLength(corpo)} byte`);
  const m = /lines 1-(\d+) of 300/u.exec(testa ?? '');
  assert.ok(m, testa); const ultima = Number(m[1]);
  assert.ok(ultima > 50 && ultima < 300);
  assert.match(testa, new RegExp(`leggi offset=${ultima + 1}\\b`, 'u'));
});

test('LONG-LINE: una riga enorme si mostra per 2000 caratteri e si legge TUTTA seguendo byteOffset', async t => {
  const enorme = 'a€🦋z'.repeat(75_000); // 300.000 caratteri UTF-16, caratteri da 1, 3 e 4 byte
  const root = fixture(t, `prima\n${enorme}\nultima\n`);
  const {corpo} = parti(await leggi(root));
  const [prima, seconda, terza] = corpo.split('\n');
  assert.equal(prima, 'prima');
  const marcatore = /^(.*)\[… line 2 continues: (\d+) more bytes; continue inside it with leggi byteOffset=(\d+)\]$/u.exec(seconda);
  assert.ok(marcatore, `marcatore assente: ${seconda.slice(-120)}`);
  const mostrato = marcatore[1];
  assert.ok(mostrato.length <= 2000 && mostrato.length >= 1998, `mostrati ${mostrato.length} caratteri`);
  assert.equal(terza, 'ultima', 'le righe dopo la riga accorciata restano nella pagina');
  let ricostruita = mostrato, byteOffset = Number(marcatore[3]), giri = 0, fine = null;
  while (byteOffset !== null) {
    const pagina = parti(await leggi(root, {byteOffset}));
    assert.match(pagina.testa ?? '', /inside line 2 of "file\.txt"/u);
    assert.doesNotMatch(pagina.corpo, /\n/u, 'una pagina dentro la riga non sconfina nella riga dopo');
    assert.doesNotMatch(pagina.corpo, /�/u);
    ricostruita += pagina.corpo;
    const avanti = /continue inside it with leggi byteOffset=(\d+)/u.exec(pagina.testa);
    fine = /line ends here; next line: leggi offset=3/u.test(pagina.testa);
    byteOffset = avanti ? Number(avanti[1]) : null;
    assert.ok(++giri < 100, 'numero di pagine limitato');
  }
  assert.equal(fine, true, 'l\'ultima pagina rimanda alla riga successiva');
  assert.equal(ricostruita, enorme, 'la riga intera si ricostruisce byte per byte');
});

/* Revisione avversaria (Claude, 30/09 sera): in una riga lunga con byte NON validi il testo mostrato ha «�» (3 byte)
   al posto di un byte solo; il byteOffset va contato sui byte ORIGINALI, o il seguito salta dei byte. */
test('LONG-LINE-INVALID-BYTES: il byteOffset di una riga lunga con byte non validi punta al byte giusto', async t => {
  const root = fixture(t, Buffer.concat([Buffer.alloc(1000, 0xff), Buffer.alloc(3000, 0x61), Buffer.from('\nfine\n')]));
  const {corpo} = parti(await leggi(root));
  const m = /^(.*)\[… line 1 continues: (\d+) more bytes; continue inside it with leggi byteOffset=(\d+)\]$/u.exec(corpo.split('\n')[0]);
  assert.ok(m, corpo.slice(0, 200));
  assert.equal(m[1], '�'.repeat(1000) + 'a'.repeat(1000));
  assert.equal(Number(m[3]), 2000, 'mille byte non validi più mille «a» sono 2000 byte originali');
  assert.equal(Number(m[2]), 2000, 'restano esattamente 2000 byte della riga');
  const seguito = parti(await leggi(root, {byteOffset: Number(m[3])}));
  assert.equal(seguito.corpo, 'a'.repeat(2000), 'il seguito riparte esattamente dove la pagina si era fermata');
});

test('SMALL-FILE-UNCHANGED: un file piccolo letto per intero torna identico, senza intestazione', async t => {
  const root = fixture(t, 'uno\ndue\n');
  assert.equal(await leggi(root), 'uno\ndue\n');
});

test('HEX-BYTES-UNCHANGED: con format:"hex" offset e limit restano byte', async t => {
  const root = fixture(t, 'abcdef');
  const esito = await leggi(root, {format: 'hex', offset: 1, limit: 4});
  assert.match(esito, /\n62636465$/u);
  assert.match(esito, /byte range \[1, 5\)/u);
});

test('INVALID: combinazioni senza senso rifiutate PRIMA di aprire il file', async t => {
  const root = fixture(t, 'a\n');
  let aperture = 0;
  const apriFn = async () => { aperture++; throw new Error('non doveva aprire'); };
  for (const argomenti of [{byteOffset: 0, offset: 2}, {byteOffset: 0, format: 'hex'}, {limit: 0}, {byteOffset: -1}, {offset: 1.5}]) {
    await assert.rejects(leggiTestoLimitato(root, 'file.txt', {...argomenti, apriFn}), (e) => /^READ_INVALID_/u.test(e.code), JSON.stringify(argomenti));
  }
  assert.equal(aperture, 0);
});

test('BINARY-SAMPLE-ON-SEEK: un NUL nel campione iniziale resta binario anche saltando a una riga o a un byte', async t => {
  const root = fixture(t, Buffer.concat([Buffer.from([0]), Buffer.from('a\n'.repeat(20))]));
  assert.match(await leggi(root, {offset: 5}), /is a binary file/u);
  assert.match(await leggi(root, {byteOffset: 3}), /is a binary file/u);
});

test('STOP: lo Stop ferma la lettura a righe', async t => {
  const root = fixture(t, righe(50_000));
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(leggiTestoLimitato(root, 'file.txt', {segnale: ctrl.signal}), (e) => e.name === 'AbortError');
});

test('KERNEL-SCHEMA: il modello riceve righe, byteOffset e hex a byte', () => {
  // `leggi` è un attrezzo di BASE; la lista estesa lo ripete solo se lo contiene
  const conLeggi = [ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI].filter((attrezzi) => attrezzi.some((a) => (a.function ?? a).name === 'leggi'));
  assert.ok(conLeggi.includes(ATTREZZI_OPENAI), 'leggi deve stare negli attrezzi di base');
  for (const attrezzi of conLeggi) {
    const f = attrezzi.map((a) => a.function ?? a).find((a) => a.name === 'leggi');
    const p = (f.parameters ?? f.input_schema).properties;
    assert.deepEqual(Object.keys(p).sort(), ['byteOffset', 'format', 'limit', 'offset', 'percorso']);
    assert.match(f.description, /LINES/u);
    assert.match(f.description, /byteOffset/u);
    assert.match(f.description, /100 KB/u);
    assert.match(p.byteOffset.description, /inside a line/u);
  }
});
