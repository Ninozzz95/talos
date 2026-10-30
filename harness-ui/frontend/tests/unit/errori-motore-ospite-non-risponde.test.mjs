/*
 * 26/10/2026 (D-0146-1 del Mobile): il socket del motore dell'app morto diceva «nessun modello aperto», falso col modello aperto. Il server
 *   ora ha un codice suo (`LOCAL_GUEST_UNREACHABLE`) e una frase che dice cosa fare (prima l'inglese, poi l'italiano). La carta del giro
 *   la dice nella lingua dell'interfaccia; e le storie salvate con la frase di PRIMA si leggono nella frase nuova.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { messaggioDelKernelNellaLingua } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const inInglese = (f) => { impostaLingua('en'); try { return f(); } finally { impostaLingua('it'); } };
const NUOVA_EN = 'The on-device engine in the app did not answer: send the message again, the app reopens it.';
const NUOVA_IT = 'Il motore sul dispositivo non ha risposto: rimanda il messaggio, l’app lo riapre.';

test('OSPITE-NON-RISPONDE-01 la frase nuova si legge nelle due lingue', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua(NUOVA_EN), NUOVA_IT);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua(NUOVA_IT)), NUOVA_EN);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua(NUOVA_EN)), NUOVA_EN);
});

test('OSPITE-NON-RISPONDE-02 le storie salvate con la frase di prima si leggono nella frase nuova', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua('The local engine in the app does not answer.'), NUOVA_IT);
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua('Il motore locale dell’app non risponde.')), NUOVA_EN);
});

test('OSPITE-NON-RISPONDE-03 al contrario: un pezzo della frase non diventa la sua voce', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua('The on-device engine in the app did not answer.'), null);
});
