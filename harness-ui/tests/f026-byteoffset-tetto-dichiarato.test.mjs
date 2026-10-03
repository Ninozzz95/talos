/*
 * F-026 (audit dell'harness, ciclo 4, ZIP dell'owner del 02/10/2026): stesso file, due comportamenti. Una riga da 150.000 byte
 *   si mostrava onesta per 2.000 caratteri, poi `byteOffset=2000` restituiva 102.400 byte in una chiamata sola. Il tetto
 *   c'era (100 KB per pagina, decisione dell'owner del 30/09), ma il segno della riga lunga non lo diceva, e la pagina a byte
 *   non diceva quanto restava. Owner, 02/10/2026 sera, «Voglio il +1», poi «Sì, tutti e due»: si dichiara il tetto, si dice
 *   quanti byte restano in quella riga, e si può chiedere meno con `limit` (in byte) insieme a `byteOffset`.
 * Come fanno gli altri (letti nel codice): Hermes taglia la riga e «its remainder is not retrievable via offset»
 *   (tools/file_tools.py:111); Pi rimanda a `sed` (agent/src/harness/tools/read.ts:124-126); Claude Code tronca le righe oltre
 *   2.000 caratteri. Nessuno recupera il resto con l'attrezzo di lettura, né dice quanto ne resta.
 * Ledger: AVM-harness-desktop/.claude/LEDGER-ZIP-OWNER-2026-10-02.md, sezione «+1».
 */
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {ATTREZZI_OPENAI, esitoDellaLettura, leggiTestoLimitato, MAX_BYTE_LEGGI} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, contenuto) {
  const root = mkdtempSync(join(tmpdir(), 'talos-f026-'));
  t.after(() => rimuoviCartellaDiProva(root));
  writeFileSync(join(root, 'file.txt'), contenuto);
  return root;
}
const leggi = async (root, argomenti = {}) => esitoDellaLettura(await leggiTestoLimitato(root, 'file.txt', argomenti), 'file.txt');
const testa = (esito) => /^(\[TALOS [^\n]*\])\n/u.exec(esito)?.[1] ?? '';

test('F026-AUDIT: il caso del ciclo 4 — la pagina del testo dichiara quanto prende ogni seguito', async (t) => {
  const root = fixture(t, 'a'.repeat(150_000) + '\n');
  const esito = await leggi(root);
  assert.match(testa(esito), /1 over-long line\(s\) shown up to 2000 characters, each ending with the byteOffset to continue inside it \(up to 100 KB per call; add limit to take less\)/u);
  assert.ok(esito.endsWith('[… line 1 continues: 148000 more bytes; continue inside it with leggi byteOffset=2000]\n'), 'il segno della riga resta quello di prima');
});

test('F026-SEGUITO: la pagina a byte dice il tetto e quanti byte di QUELLA riga restano', async (t) => {
  const root = fixture(t, 'a'.repeat(150_000) + '\nseconda\n');
  const esito = await leggi(root, {byteOffset: 2000});
  const t1 = testa(esito);
  assert.match(t1, /^\[TALOS read bytes \[2000, 104400\) inside line 1 of "file\.txt"/u);
  assert.match(t1, /page capped at 100 KB, like every page \(add limit to take less\)/u);
  assert.match(t1, /the line continues: 45600 more bytes after this page; continue inside it with leggi byteOffset=104400/u);
});

test('F026-LIMIT: limit in byte insieme a byteOffset prende esattamente quello che si chiede', async (t) => {
  const root = fixture(t, 'a'.repeat(150_000) + '\n');
  const letta = await leggiTestoLimitato(root, 'file.txt', {byteOffset: 2000, limit: 500});
  assert.equal(letta.testo, 'a'.repeat(500));
  assert.equal(letta.endOffset, 2500);
  assert.equal(letta.nextByteOffset, 2500);
  const t1 = testa(esitoDellaLettura(letta, 'file.txt'));
  assert.match(t1, /limit=500 bytes/u);
  assert.match(t1, /the line continues: 147500 more bytes after this page; continue inside it with leggi byteOffset=2500/u);
  assert.doesNotMatch(t1, /page capped/u, 'si è preso meno del tetto per scelta, non per il tetto');
});

test('F026-LIMIT-UTF8: un limit che cade dentro un carattere si ferma al carattere intero, mai a metà e mai a vuoto', async (t) => {
  const root = fixture(t, 'é'.repeat(3000) + '\n'); // 2 byte ciascuno
  const letta = await leggiTestoLimitato(root, 'file.txt', {byteOffset: 4000, limit: 5});
  assert.equal(letta.testo, 'éé', '5 byte = due caratteri interi e mezzo: si tengono i due interi');
  assert.equal(letta.nextByteOffset, 4004);
});

test('F026-FINE-RIGA: dove la riga finisce dentro la pagina non si parla di tetto né di byte rimasti', async (t) => {
  const root = fixture(t, 'a'.repeat(3000) + '\nseconda\n');
  const t1 = testa(await leggi(root, {byteOffset: 2000}));
  assert.match(t1, /line ends here; next line: leggi offset=2/u);
  assert.doesNotMatch(t1, /page capped|more bytes after this page/u);
});

test('F026-SCANSIONE-FINITA: per contare il resto della riga ci si ferma all\'a capo, non si legge il resto del file', async (t) => {
  const root = fixture(t, 'A'.repeat(20_000) + '\n' + 'B'.repeat(500_000) + '\n');
  let letti = 0;
  const apriFn = async (percorso, modo) => {
    const handle = await open(percorso, modo);
    const read = handle.read.bind(handle);
    handle.read = async (...argomenti) => { const r = await read(...argomenti); letti += r.bytesRead; return r; };
    return handle;
  };
  const letta = await leggiTestoLimitato(root, 'file.txt', {byteOffset: 10_000, limit: 1000, apriFn});
  assert.equal(letta.restanoNellaRiga, 9000);
  assert.ok(letti < 20_000 + 64 * 1024 + 8000, `letti ${letti}: un blocco oltre l'a capo al massimo, mai i 500.000 byte dopo`);
});

test('F026-LIMIT-INVALIDO: fuori da 4..100 KB, o insieme a offset, si rifiuta prima di aprire il file', async () => {
  const apriFn = async () => { throw new Error('non doveva aprire'); };
  for (const args of [{byteOffset: 0, limit: 3}, {byteOffset: 0, limit: MAX_BYTE_LEGGI + 1}, {byteOffset: 0, limit: '5'}, {byteOffset: 0, limit: 5, offset: 1}]) {
    await assert.rejects(leggiTestoLimitato('x', 'x', {...args, apriFn}), (e) => e.code === 'READ_INVALID_RANGE', JSON.stringify(args));
  }
});

test('F026-SCHEMA: la descrizione dell\'attrezzo dice al modello che limit vale anche con byteOffset', () => {
  const leggiSchema = ATTREZZI_OPENAI.find((a) => a.function.name === 'leggi').function;
  assert.match(leggiSchema.parameters.properties.limit.description, /With byteOffset: bytes to read inside the line, 4\.\.102400/u);
  assert.match(leggiSchema.parameters.properties.byteOffset.description, /Not with offset or hex/u);
});
