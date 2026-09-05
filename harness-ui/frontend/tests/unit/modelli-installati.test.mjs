import test from 'node:test';
import assert from 'node:assert/strict';
import { gb, contestoK, verdettoEntra, datiModelloInstallato, filtraInstallati } from '../../src/components/modelli-installati.js';
import { MODELLI_INSTALLATI, RUNTIME_INSTALLATI, FIT_INSTALLATI } from '../../lab/fixtures/modelli-installati.js';

// 06/09 B6.8 — le parole e le cifre del mockup escono dai dati del monolite.

test('INST-NUMERI: GB con la virgola e contesto in k', () => {
  assert.equal(gb(5.2 * 1024 ** 3), '5,2 GB');
  assert.equal(gb(19.8 * 1024 ** 3), '19,8 GB');
  assert.equal(gb(-1), '—');
  assert.equal(contestoK(32768), '32k token');
  assert.equal(contestoK(131072), '128k token');
  assert.equal(contestoK(0), null);
});

test('INST-VERDETTO: entra · entra stretto · non entra con quanto manca · non verificato', () => {
  const r = RUNTIME_INSTALLATI;
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('qwen8'), r).etichetta, 'Entra');
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('qwen8'), r).dettaglio, '~8,1 GB di memoria con contesto 8k token');
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('gemma'), r).etichetta, 'Entra stretto');
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('gemma'), r).dettaglio, '~17,8 GB richiesti su 18,6 GB allocabili');
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('qwen32'), r).etichetta, 'Non entra');
  assert.equal(verdettoEntra(FIT_INSTALLATI.get('qwen32'), r).dettaglio, '~23,9 GB richiesti: mancano ~5,3 GB');
  assert.equal(verdettoEntra(null, r), null);
  assert.equal(verdettoEntra({ inCorso: true }, r).etichetta, 'Verifica in corso…');
  assert.equal(verdettoEntra({ errore: 'server spento' }, r).dettaglio, 'server spento');
  assert.equal(verdettoEntra({ esito: { state: 'unknown' } }, r).etichetta, 'Non verificato');
});

test('INST-DATI: la riga dice stato, disco, contesto; il dettaglio formato, origine, licenza', () => {
  const d = datiModelloInstallato(MODELLI_INSTALLATI[0], { runtime: RUNTIME_INSTALLATI, fit: FIT_INSTALLATI.get('qwen8') });
  assert.equal(d.stato, 'caricato');
  assert.equal(d.sotto, '5,2 GB sul disco · contesto massimo 32k token');
  assert.equal(d.formato, 'GGUF · Q4_K_M');
  assert.equal(d.origine, 'Hugging Face');
  const l = datiModelloInstallato({ id: 'x', repo: 'local-upload', bytes: 1024 ** 3, path: 'x/m.gguf', state: 'incomplete' }, {});
  assert.equal(l.stato, 'incompleto');
  assert.equal(l.origine, 'Importato dal computer');
  assert.equal(l.formato, 'GGUF');
  assert.equal(l.licenza, 'Licenza non dichiarata');
});

test('INST-FILTRO: ricerca e stato (verso contrario: query senza esito → vuoto)', () => {
  const r = RUNTIME_INSTALLATI;
  assert.equal(filtraInstallati(MODELLI_INSTALLATI, { runtime: r }).length, 3);
  assert.deepEqual(filtraInstallati(MODELLI_INSTALLATI, { stato: 'caricato', runtime: r }).map((m) => m.id), ['qwen8']);
  assert.deepEqual(filtraInstallati(MODELLI_INSTALLATI, { stato: 'disco', runtime: r }).map((m) => m.id), ['gemma', 'qwen32']);
  assert.deepEqual(filtraInstallati(MODELLI_INSTALLATI, { query: 'gemma', runtime: r }).map((m) => m.id), ['gemma']);
  assert.equal(filtraInstallati(MODELLI_INSTALLATI, { query: 'llama 70b', runtime: r }).length, 0);
});
