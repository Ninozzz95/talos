/*
 * C24b (coda Codex, A-READ-SCAN-BOUND riprodotto il 07/10; owner 10/10/2026: «Tetto a 64 MiB»). Una riga enorme senza a capo
 * si scorreva TUTTA per dire quanti byte mancavano, anche mostrandone solo 2.000 caratteri: 96 MiB letti per una pagina. Il
 * tetto dei 64 MiB valeva solo per CONTARE le righe dopo una pagina piena (`prossima !== null`), mai per la riga aperta.
 * Ora una riga MOSTRATA, con la testa già raccolta, smette di essere scorsa a 64 MiB: «continues: at least N more bytes», col
 * byteOffset per proseguire dentro, e la testata non dice «EOF reached» (non lo sa).
 * Il file è VIRTUALE (`apriFn`), come la sonda di Codex: niente 96 MiB su disco.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiTestoLimitato, esitoDellaLettura, MAX_CARATTERI_RIGA_LEGGI } from '../src/kernel/talosHarness.mjs';

const MiB = 1024 * 1024;

/** Un file virtuale: `righe` = lunghezze in byte di righe di «a», separate da «\n» (l'ultima senza). */
function fileVirtuale(righe) {
  const confini = [];
  let fine = 0;
  for (const [k, n] of righe.entries()) { fine += n; confini.push(fine); if (k < righe.length - 1) fine += 1; }
  const size = fine;
  const stato = { letti: 0, chiusure: 0 };
  const byteA = (p) => (confini.includes(p) && p < size ? 0x0a : 0x61);
  const handle = {
    async stat() { return { size, mtimeMs: 0, isFile: () => true }; },
    async read(buffer, offset, length, position) {
      const n = Math.max(0, Math.min(length, size - position));
      for (let k = 0; k < n; k++) buffer[offset + k] = byteA(position + k);
      stato.letti += n;
      return { bytesRead: n, buffer };
    },
    async close() { stato.chiusure++; },
  };
  return { apriFn: async () => handle, stato, size };
}

test('C24b-01: una riga da 96 MiB senza a capo — la pagina mostra la testa e smette di scorrere a 64 MiB', async () => {
  const f = fileVirtuale([96 * MiB]);
  const letta = await leggiTestoLimitato('C:/virtuale', 'enorme.txt', { apriFn: f.apriFn });
  assert.ok(f.stato.letti <= 64 * MiB + 1 * MiB, `letti ${f.stato.letti} byte, non tutto il file (${f.size})`);
  assert.equal(f.stato.chiusure, 1, 'l’handle si chiude una volta');
  assert.match(letta.testo, new RegExp(`^a{${MAX_CARATTERI_RIGA_LEGGI}}\\[… line 1 continues: at least \\d+ more bytes`, 'u'));
  assert.match(letta.testo, new RegExp(`continue inside it with leggi byteOffset=${MAX_CARATTERI_RIGA_LEGGI}\\]$`, 'u'));
  const almeno = Number(/at least (\d+) more bytes/u.exec(letta.testo)[1]);
  assert.ok(almeno >= 64 * MiB - MAX_CARATTERI_RIGA_LEGGI - 1 * MiB && almeno < f.size, 'quanto ha scorso, non il totale');
  const esito = esitoDellaLettura(letta, 'enorme.txt');
  assert.doesNotMatch(esito, /EOF reached/u, 'non sa dove finisce la riga: non dice EOF');
  assert.match(esito, /stopped scanning line 1 after 64 MiB/u);
});

test('C24b-02, AL CONTRARIO: una riga lunga ma SOTTO il tetto (3 MiB) dice i byte esatti e EOF, come prima', async () => {
  const f = fileVirtuale([3 * MiB]);
  const letta = await leggiTestoLimitato('C:/virtuale', 'lunga.txt', { apriFn: f.apriFn });
  assert.equal(f.stato.letti, f.size, 'sotto il tetto si scorre tutta');
  assert.match(letta.testo, new RegExp(`continues: ${3 * MiB - MAX_CARATTERI_RIGA_LEGGI} more bytes;`, 'u'));
  assert.doesNotMatch(letta.testo, /at least/u);
  assert.match(esitoDellaLettura(letta, 'lunga.txt'), /EOF reached/u);
});

test('C24b-03: la riga enorme è la seconda — la prima arriva intera, la seconda con la sua testa e il tetto', async () => {
  const f = fileVirtuale([10, 96 * MiB]);
  const letta = await leggiTestoLimitato('C:/virtuale', 'due.txt', { apriFn: f.apriFn });
  assert.ok(f.stato.letti <= 64 * MiB + 1 * MiB);
  const [prima, seconda] = letta.testo.split('\n');
  assert.equal(prima, 'a'.repeat(10));
  assert.match(seconda, /line 2 continues: at least \d+ more bytes; continue inside it with leggi byteOffset=2011\]$/u);
});

test('C24b-04: una riga enorme DOPO la pagina piena — si scorreva fino in fondo per scoprire che non entrava; ora si ferma al tetto e la pagina dice dove proseguire', async () => {
  const f = fileVirtuale([10, 10, 96 * MiB]);
  const letta = await leggiTestoLimitato('C:/virtuale', 'tre.txt', { apriFn: f.apriFn, offset: 1, limit: 2 });
  assert.equal(letta.testo, `${'a'.repeat(10)}\n${'a'.repeat(10)}\n`);
  assert.equal(letta.nextOffset, 3, 'la terza riga resta per la pagina dopo');
  assert.ok(f.stato.letti <= 64 * MiB + 1 * MiB, 'prima: tutti i 96 MiB, perché `prossima` nasceva solo alla fine della riga');
});
