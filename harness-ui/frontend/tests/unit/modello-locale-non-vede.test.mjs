/* 01/11/2026, vista locale: la frase di `ModelloLocaleNonVedeError` (runtime-owner-adapter.mjs) si legge nella lingua dell'interfaccia. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { messaggioDelKernelNellaLingua } from '../../src/components/errori.js';
import { impostaLingua, t } from '../../src/components/lingua.js';

const INGLESE = 'This local model cannot see images: it was opened without the part that reads them. Send the message without the image, or use a model that sees images.';

test('MLNV-1 the English sentence of the server reads in Italian, and back; an unknown sentence stays null', () => {
  impostaLingua('it');
  assert.equal(messaggioDelKernelNellaLingua(INGLESE), t('errori.kernel.modelloLocaleNonVede'));
  assert.match(messaggioDelKernelNellaLingua(INGLESE), /^Questo modello locale non vede le immagini/u);
  impostaLingua('en');
  try {
    assert.equal(messaggioDelKernelNellaLingua(t('errori.kernel.modelloLocaleNonVede')), INGLESE);
  } finally { impostaLingua('it'); }
  assert.equal(messaggioDelKernelNellaLingua('This local model cannot see images.'), null);
});
