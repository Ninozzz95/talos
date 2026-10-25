/*
 * Revisione di 91730a625 (F1 della CLI, 16/10/2026): l'adattatore dei fornitori ora dice «contesto pieno» con una frase NUOVA,
 * `The request is larger than the model context window (context_length_exceeded).`. Prima usciva «The provider did not accept the
 * request.», che la carta d'errore conosce nelle due lingue (`errori.kernel.richiestaNonAccettata`, id `fornitore-rifiuto`). La frase
 * nuova non è in `MESSAGGI_DEL_KERNEL`: con l'interfaccia in italiano la carta diventa «sconosciuto» («questa forma di errore non è
 * ancora tradotta») col testo inglese grezzo — e succede proprio quando il ritentativo non è bastato.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { messaggioDelKernelNellaLingua, spiegaErrore } from '../../src/components/errori.js';

const FRASE = 'The request is larger than the model context window (context_length_exceeded).';

test('CP-FRASE-REV-01 — la frase nuova del contesto pieno ha la sua carta nelle due lingue, non «sconosciuto»', () => {
  impostaLingua('it');
  try {
    const s = spiegaErrore(FRASE, 'PROVIDER_REQUEST_ERROR');
    assert.notEqual(s.id, 'sconosciuto', `con l'interfaccia in italiano la carta è «${s.id}»: ${s.perche}`);
    assert.ok(messaggioDelKernelNellaLingua(FRASE), 'la frase del kernel non ha la sua voce nel dizionario: resta in inglese');
  } finally { impostaLingua('en'); }
});

test('CP-FRASE-REV-02 — R10-2: la stessa frase coi numeri del fornitore in coda ha la stessa carta, con o senza l\'uscita; AL CONTRARIO una coda diversa no', () => {
  impostaLingua('it');
  try {
    for (const frase of ['The request is larger than the model context window (context_length_exceeded): 9433 input tokens requested, 8192 maximum.',
      'The request is larger than the model context window (context_length_exceeded): 135349 input tokens requested, 131072 maximum, 64000 output tokens.']) {
      assert.equal(spiegaErrore(frase, 'PROVIDER_REQUEST_ERROR').id, spiegaErrore(FRASE, 'PROVIDER_REQUEST_ERROR').id, frase);
      assert.ok(messaggioDelKernelNellaLingua(frase), `resta in inglese: ${frase}`);
    }
    assert.equal(messaggioDelKernelNellaLingua('The request is larger than the model context window (context_length_exceeded): the provider said more.'), null);
  } finally { impostaLingua('en'); }
});

test('CP-FRASE-REV-01-CONTROLLO — AL CONTRARIO: la frase di prima era tradotta', () => {
  impostaLingua('it');
  try { assert.equal(spiegaErrore('The provider did not accept the request.', 'PROVIDER_REQUEST_ERROR').id, 'fornitore-rifiuto'); }
  finally { impostaLingua('en'); }
});
