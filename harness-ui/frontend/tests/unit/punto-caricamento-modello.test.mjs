/* 01/11/2026 (contratto di Desktop, Frontend e Mobile): lo Stop durante l'apertura del motore locale ha la sua frase nella carta. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { puntoNellaLingua } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

test('the stop during loading says the loading, in both languages; «answering» stays as it was', () => {
  impostaLingua?.('it');
  assert.equal(puntoNellaLingua('while the model was still loading, at round 2'), 'mentre il modello si stava ancora aprendo, al giro 2');
  assert.equal(puntoNellaLingua('while the model was answering, at round 2'), 'mentre il modello stava rispondendo, al giro 2');
  impostaLingua?.('en');
  assert.equal(puntoNellaLingua('while the model was still loading, at round 3'), 'while the model was still loading, at round 3');
  impostaLingua?.('it');
});

/* D8 (forma b, 03/11/2026, chiave scelta dal Frontend): lo Stop fra «motore aperto» e la prima parola ha la sua frase. */
test('D8: the stop while the model reads the conversation is said in both languages, not left in English', () => {
  impostaLingua?.('it');
  assert.equal(puntoNellaLingua('while the model was reading the conversation, at round 2'), 'mentre il modello stava leggendo la conversazione, al giro 2');
  // revisione D8 del Desktop (F5): un giro a due cifre, o `(\d)` al posto di `(\d+)` passerebbe
  assert.equal(puntoNellaLingua('while the model was reading the conversation, at round 12'), 'mentre il modello stava leggendo la conversazione, al giro 12');
  impostaLingua?.('en');
  assert.equal(puntoNellaLingua('while the model was reading the conversation, at round 4'), 'while the model was reading the conversation, at round 4');
  impostaLingua?.('it');
});
