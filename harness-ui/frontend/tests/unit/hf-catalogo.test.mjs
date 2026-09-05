import test from 'node:test';
import assert from 'node:assert/strict';
import { conteggio, gruppiVarianti, quantDaNome, descriviStima, datiRepoHf } from '../../src/components/hf-catalogo.js';
import { RISULTATI_HF, DETTAGLIO_HF, STIMA_HF } from '../../lab/fixtures/hf-catalogo.js';

// 06/09 B6.9 — le parole del mockup escono dai dati del monolite; i set multi-file stanno insieme.

test('HF-VARIANTI: i file -0000N-of-0000M stanno in un gruppo, un set incompleto lo dice, README non è una variante', () => {
  const g = gruppiVarianti(DETTAGLIO_HF.files);
  assert.deepEqual(g.map((x) => x.quant), ['Q4_K_M', 'Q8_0', 'F16']);
  const multi = gruppiVarianti([{ path: 'm-Q4-00001-of-00003.gguf', sizeBytes: 10, sha256: 'a' }, { path: 'm-Q4-00002-of-00003.gguf', sizeBytes: 10, sha256: 'a' }]);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].incompleto, true);
  assert.equal(multi[0].attesi, 3);
  assert.equal(quantDaNome('Qwen3-8B-IQ4_XS.gguf'), 'IQ4_XS');
});

test('HF-STIMA: entra · al limite · oltre la memoria · non misurato', () => {
  assert.equal(descriviStima(STIMA_HF.get('Qwen3-8B-Q4_K_M.gguf')).testo, '~8,1 GB di memoria · entra');
  assert.equal(descriviStima(STIMA_HF.get('Qwen3-8B-F16.gguf')).testo, '~19,3 GB · oltre la memoria allocabile');
  assert.equal(descriviStima({ state: 'tight', memory: { requiredBytes: 17.8 * 1024 ** 3 } }).testo, '~17,8 GB di memoria · al limite');
  assert.equal(descriviStima({ state: 'blocked', reason: 'storage' }, 5.2 * 1024 ** 3).testo, "5,2 GB · non c'è spazio sul disco");
  assert.equal(descriviStima(null, 5.2 * 1024 ** 3).testo, '5,2 GB da scaricare · non ancora misurato');
  assert.equal(descriviStima({ inCorso: true }).testo, 'Misuro su questo PC…');
});

test('HF-RIGA: autore del modello contro conversione della community; accesso richiesto', () => {
  const q = datiRepoHf(RISULTATI_HF[0]);
  assert.equal(q.titolo, 'Qwen / Qwen3-8B-GGUF');
  assert.equal(q.sub1, 'Conversazione e codice · 3 file compatibili');
  assert.equal(q.sub2, 'Licenza Apache 2.0');
  assert.deepEqual(q.badge, { testo: 'Autore del modello', tono: 'info' });
  const g = datiRepoHf(RISULTATI_HF[1]);
  assert.equal(g.sub1, 'Conversione della community · 2 file');
  assert.equal(g.sub2, 'Verifica le condizioni prima del download');
  assert.deepEqual(g.badge, { testo: 'Accesso richiesto', tono: 'warning' });
  const b = datiRepoHf({ repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', gated: false });
  assert.equal(b.sub1, 'Conversione della community');
  assert.equal(b.badge, null);
  assert.equal(conteggio(412_000), '412 k');
  assert.equal(conteggio(-1), null);
});
