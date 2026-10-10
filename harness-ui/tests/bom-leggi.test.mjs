/*
 * T-01 (audit ZIP 2026-09-28, piano 0.1.19 §1.1; owner 28/09): `leggi` restituiva lo U+FEFF del BOM
 * come primo carattere del testo, e il modello lo vedeva (e lo riportava) in ogni lettura di un file
 * UTF-8 con BOM. Il file sul disco NON si tocca: cambia solo il testo che esce dall'attrezzo.
 * Cura: `TextDecoder('utf-8', { ignoreBOM: false })` in `leggiTestoLimitato` — il default dello
 * standard (WHATWG Encoding / MDN `TextDecoder.ignoreBOM`, verificato il 28/09/2026): `false` TOGLIE
 * il BOM iniziale dall'output, `true` lo mantiene. Il decoder qui lavora a flusso dal byte 0, quindi
 * il BOM è sempre nel primo pezzo decodificato. ⛔ Le letture integrali di modifica, ricevute e
 * cancello semantico (`disco.leggi`) restano com'erano: il disco non cambia mai.
 */
import assert from 'node:assert/strict';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { leggiTestoLimitato, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BOM = '﻿';

function cartellaDiProva(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-bom-leggi-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

test('T-01-01 — un file UTF-8 con BOM: il testo restituito NON comincia con U+FEFF', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'bom.txt'), `${BOM}TOKEN_OK_V4`);
  const letta = await leggiTestoLimitato(cartella, 'bom.txt');
  assert.equal(letta.testo, 'TOKEN_OK_V4', 'il primo carattere è la T, non il BOM');
});

test('T-01-02 — il file sul disco resta byte per byte col suo BOM: la cura non tocca il disco', async (t) => {
  const cartella = cartellaDiProva(t);
  const originale = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('TOKEN_OK_V4', 'utf8')]);
  writeFileSync(join(cartella, 'bom.txt'), originale);
  await leggiTestoLimitato(cartella, 'bom.txt');
  assert.deepEqual(readFileSync(join(cartella, 'bom.txt')), originale, 'EF BB BF ancora in testa al file');
});

test('T-01-03 — dal kernel vero: l’esito dell’attrezzo `leggi` non porta il BOM al modello', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'nota.md'), `${BOM}riga letta`);
  const chiamate = [];
  const fetch = async (url, opzioni) => {
    chiamate.push({ url, corpo: JSON.parse(opzioni.body) });
    const indice = chiamate.length;
    const risposta = indice === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'nota.md' }) } }] }
      : { role: 'assistant', content: 'fatto', tool_calls: [] };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
  };
  await talosLavora({ cartella, task: { consegna: 'leggi nota.md' }, modello: 'x', chiave: 'y', fetchDiRete: fetch });
  const esito = togliConfiniDati(chiamate[1].corpo.messages.find((m) => m.role === 'tool').content);
  assert.equal(esito, 'riga letta', 'né in testa né altrove');
});

test('T-01-04 — al contrario: un file SENZA BOM arriva identico byte per byte', async (t) => {
  const cartella = cartellaDiProva(t);
  const testo = 'export const a = 1\n// è un commento con à e €\n';
  writeFileSync(join(cartella, 'no-bom.mjs'), testo);
  const letta = await leggiTestoLimitato(cartella, 'no-bom.mjs');
  assert.equal(letta.testo, testo);
});

test('T-01-05 — il BOM si toglie anche quando la lettura va a blocchi piccoli (il BOM attraversa due pezzi)', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'bom.txt'), `${BOM}TOKEN_OK_V4`);
  const aPezzi = await leggiTestoLimitato(cartella, 'bom.txt', { blocco: 2, campione: 2 });
  assert.equal(aPezzi.testo, 'TOKEN_OK_V4', 'un BOM spezzato fra due blocchi non sopravvive');
});

test('T-01-06 — un U+FEFF in mezzo al file NON è un BOM e resta dov’è', async (t) => {
  const cartella = cartellaDiProva(t);
  const testo = `prima${BOM}dopo`;
  writeFileSync(join(cartella, 'in-mezzo.txt'), testo);
  const letta = await leggiTestoLimitato(cartella, 'in-mezzo.txt');
  assert.equal(letta.testo, testo, 'lo stripping vale solo in testa');
});

/*
 * C24a (coda Codex, A-READ-INTERNAL-BOM riprodotto il 07/10; bugfixer 10/10/2026): ogni riga si decodificava con un
 * `TextDecoder` NUOVO e di serie (`ignoreBOM: false`), che toglie un U+FEFF all'inizio di OGNI decodifica: uno U+FEFF a
 * inizio riga, dopo un a capo, spariva. Solo una riga che comincia al byte 0 può portare il BOM del file (T-01); come
 * `leggiDentroRiga`, `ignoreBOM: inizio > 0`.
 */
test('C24a-01 — uno U+FEFF a inizio riga, dopo un a capo, NON è un BOM e resta', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'interno.txt'), `${BOM}first\n${BOM}second`);
  const letta = await leggiTestoLimitato(cartella, 'interno.txt');
  assert.equal(letta.testo, `first\n${BOM}second`, 'via il BOM del byte 0, resta quello della riga 2');
});

test('C24a-02 — due U+FEFF in testa: si toglie solo il primo, il secondo è testo', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'doppio.txt'), `${BOM}${BOM}x`);
  assert.equal((await leggiTestoLimitato(cartella, 'doppio.txt')).testo, `${BOM}x`);
  assert.equal((await leggiTestoLimitato(cartella, 'doppio.txt', { blocco: 2, campione: 2 })).testo, `${BOM}x`, 'anche a blocchi piccoli');
});

test('C24a-03 — una riga LUNGA che comincia con U+FEFF (mostrata in parte) lo tiene, e il rimando punta al byte giusto', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'lunga.txt'), `a\n${BOM}${'b'.repeat(3000)}`);
  const letta = await leggiTestoLimitato(cartella, 'lunga.txt');
  const riga2 = letta.testo.split('\n')[1];
  assert.ok(riga2.startsWith(`${BOM}b`), 'la testa mostrata comincia con lo U+FEFF');
  const offset = Number(/byteOffset=(\d+)/u.exec(riga2)?.[1]);
  assert.equal(offset, 2 + 3 + 1999, '«a\n» (2 byte) + U+FEFF (3) + i 1999 «b» che stanno con lui nei 2000 caratteri');
});
