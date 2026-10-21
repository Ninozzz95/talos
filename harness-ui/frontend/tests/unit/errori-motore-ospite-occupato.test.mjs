/*
 * 21/10/2026 sera, dal vivo sul Pad: `LOCAL_ENGINE_BUSY` diceva «busy answering in the chat» anche quando a tenere il motore
 *   dell'app era un RIASSUNTO del contesto. La frase ora è neutra (prima l'inglese, poi l'italiano). La carta del giro la dice nella
 *   lingua dell'interfaccia; e le storie salvate con la frase di PRIMA si riconoscono ancora (le leggono nella frase nuova).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { messaggioDelKernelNellaLingua } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const inInglese = (f) => { impostaLingua('en'); try { return f(); } finally { impostaLingua('it'); } };
const NUOVA_EN = 'The on-device model is busy with another job (a chat reply or a context summary); try again when it has finished.';
const NUOVA_IT = 'Il modello sul dispositivo è occupato con un altro lavoro (una risposta nella chat o un riassunto del contesto); riprova quando ha finito.';

test('OSPITE-OCCUPATO-01 la frase neutra del motore occupato si legge nelle due lingue', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua(NUOVA_EN), NUOVA_IT);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua(NUOVA_IT)), NUOVA_EN);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua(NUOVA_EN)), NUOVA_EN);
});

test('OSPITE-OCCUPATO-02 le storie salvate con la frase di prima si riconoscono ancora, e si leggono nella frase neutra', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua('The local model is busy answering in the chat: one reply at a time. Try again when it has finished.'), NUOVA_IT);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua('Il modello locale sta rispondendo nella chat: una risposta alla volta. Riprova quando ha finito.')), NUOVA_EN);
});

test('OSPITE-OCCUPATO-03 al contrario: un pezzo della frase o una frase vicina non diventa la voce del motore occupato', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua('The on-device model is busy with another job.'), null);
  assert.equal(messaggioDelKernelNellaLingua(`${NUOVA_EN} And more.`), null);
});
