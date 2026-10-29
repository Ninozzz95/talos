/*
 * 27/10/2026 (G-R6, revisione del blocco 10): il router del motore locale non risponde e non si è potuto fermare. Prima la frase
 *   arrivava come `RUNTIME_PROCESS_FAILED` e la chat mostrava la carta «Questa forma di errore non è ancora tradotta» con «Riprova il
 *   giro» (`G-frase-j-r2.mjs` del revisore): il rimedio sbagliato. Ora ha un codice suo (`RUNTIME_ROUTER_NOT_STOPPED`) e una carta che
 *   dice che cosa fare: liberare la memoria della scheda grafica (chiudere TALOS, o «llama-server»/l'altro programma), poi riprovare.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spiegaErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const NUOVA = 'The local engine router does not answer and could not be stopped, so mod-a was not loaded a second time beside it: it may still hold the model in the graphics card memory. Close TALOS, or end «llama-server» (or another program using the graphics card) in Task Manager, then try again.';
const DI_PRIMA = 'The local engine router does not answer and could not be stopped, so mod-a was not loaded a second time beside it. Close TALOS to free the memory, then try again.';

test('ROUTER-NON-FERMATO-01 il codice suo: la carta dice che cosa fare, non «riprova il giro», nelle due lingue', () => {
  try {
    for (const [lingua, attese] of [['it', { cosa: /bloccato/u, rimedio: /Libera la memoria della scheda grafica/u, altro: /llama-server.*Gestione attività/u }],
      ['en', { cosa: /stuck/u, rimedio: /Free the graphics card memory/u, altro: /llama-server.*Task Manager/u }]]) {
      impostaLingua(lingua);
      const s = spiegaErrore(NUOVA, 'RUNTIME_ROUTER_NOT_STOPPED');
      assert.equal(s.id, 'router-non-fermato', lingua);
      assert.equal(s.riconosciuto, true);
      assert.match(s.cosa, attese.cosa);
      assert.match(s.perche, /mod-a/u, 'il modello nominato');
      assert.match(s.rimedi[0], attese.rimedio);
      assert.match(s.rimedi[1], attese.altro);
      assert.equal(s.rimedi.some((r) => /Riprova il giro|Retry the turn/iu.test(r)), false, 'riprovare il giro aspetta lo stesso router');
      assert.equal(s.tecnico, NUOVA, 'la frase del server resta nel testo tecnico');
    }
  } finally { impostaLingua('it'); }
});

test('ROUTER-NON-FERMATO-02 le storie salvate con il codice e la frase di prima si leggono nella carta nuova', () => {
  impostaLingua('it');
  const s = spiegaErrore(DI_PRIMA, 'RUNTIME_PROCESS_FAILED');
  assert.equal(s.id, 'router-non-fermato');
  assert.match(s.perche, /mod-a/u);
});

test('ROUTER-NON-FERMATO-03 al contrario: un altro guasto del motore non diventa questa carta', () => {
  impostaLingua('it');
  assert.notEqual(spiegaErrore('llama-server si è chiuso dopo 3 s senza mai diventare pronto: unknown model architecture', 'RUNTIME_PROCESS_FAILED').id, 'router-non-fermato');
  assert.notEqual(spiegaErrore('The model (16.7 GB) does not fit in the graphics card memory (AMD Radeon RX 9070 XT: 15.9 GB, 15.1 GB free).', 'RUNTIME_OUT_OF_MEMORY').id, 'router-non-fermato');
});
