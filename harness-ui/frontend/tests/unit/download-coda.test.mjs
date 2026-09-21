import test from 'node:test';
import assert from 'node:assert/strict';
import { datiDownload, contaStati, motivoUmano, mbs, rimanente, stimaFraLetture } from '../../src/components/download-coda.js';
import { DOWNLOAD, STIME_DOWNLOAD } from '../../lab/fixtures/download-coda.js';

// 06/09 B6.10 — le tre forme della riga (in corso · fallito · completato) dai dati del server.

test('DL-RIGA: in corso dice percento, ricevuti di totali, velocità e rimanente', () => {
  const d = datiDownload(DOWNLOAD[0], { stima: STIME_DOWNLOAD.get('qwen-q8') });
  assert.equal(d.nomeFile, 'Qwen3-8B-Q8_0.gguf');
  assert.equal(d.sotto, 'Qwen / Qwen3-8B-GGUF · Hugging Face');
  assert.equal(d.percento, 64);
  assert.equal(d.ricevuti, '5,4 GB');
  assert.equal(d.totale, '8,5 GB');
  assert.equal(d.velocita, '24 MB/s');
  assert.equal(d.resto, '2 min');
  assert.equal(d.etichettaStato, 'In corso');
});

test('DL-FALLITO: motivo umano, ricevuti, dettagli; senza stima niente numeri inventati', () => {
  const d = datiDownload(DOWNLOAD[1]);
  assert.equal(d.etichettaStato, 'Fallito');
  assert.equal(d.sotto, 'Community / Gemma-3-12B-GGUF · 8,1 GB');
  assert.equal(d.errore.titolo, 'La connessione si è interrotta');
  assert.equal(d.errore.testo, 'Ricevuti 1,2 GB. Il modello non è ancora disponibile. Puoi riprovare dal punto salvato.');
  assert.equal(d.velocita, null);
  assert.equal(d.resto, null);
  assert.equal(motivoUmano('HASH_MISMATCH'), "L'impronta del file non corrisponde");
  assert.equal(motivoUmano('qualcosa di strano'), 'qualcosa di strano');
});

test('DL-COMPLETATO e conteggi', () => {
  const d = datiDownload(DOWNLOAD[2]);
  assert.equal(d.etichettaStato, 'Completato');
  assert.match(d.sotto, /^5,2 GB · completato alle \d\d:\d\d · verifica del file riuscita$/);
  assert.deepEqual(contaStati(DOWNLOAD), { inCorso: 1, falliti: 1, completati: 1, inPausa: 0 });
  assert.deepEqual(contaStati([]), { inCorso: 0, falliti: 0, completati: 0, inPausa: 0 });
});

test('DL-STIMA: velocità e rimanente solo fra due letture in corso; unità umane', () => {
  const prima = { bytes: 1_000_000, totalBytes: 100_000_000, state: 'running', quando: '2026-09-06T00:00:00.000Z' };
  const dopo = { bytes: 26_000_000, totalBytes: 100_000_000, state: 'running', quando: '2026-09-06T00:00:01.000Z' };
  const s = stimaFraLetture(prima, dopo);
  assert.equal(Math.round(s.bytesAlSecondo), 25_000_000);
  assert.equal(Math.round(s.secondiRimanenti), 3);
  assert.equal(stimaFraLetture(prima, { ...dopo, state: 'paused' }), null);
  assert.equal(stimaFraLetture(null, dopo), null);
  assert.equal(mbs(24 * 1024 * 1024), '24 MB/s');
  assert.equal(mbs(0), null);
  assert.equal(rimanente(30), 'meno di 1 min');
  assert.equal(rimanente(3900), '1 h 5 min');
});
