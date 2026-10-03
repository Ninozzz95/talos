/*
 * Revisione K3 (03/10/2026): i messaggi d'errore del kernel e dell'adattatore sono INGLESI da K3. La carta d'errore del giro li
 *   dice nella lingua dell'interfaccia (`messaggioDelKernelNellaLingua`, voci `errori.kernel.*`): l'italiano è la frase di PRIMA,
 *   identica. Si riconoscono nelle due forme, perché le storie salvate sono italiane. AL CONTRARIO: un messaggio ignoto resta
 *   com'è (`null`), mai una chiave grezza.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { messaggioDelKernelNellaLingua, spiegaErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const inInglese = (f) => { impostaLingua('en'); try { return f(); } finally { impostaLingua('it'); } };

test('ERRORI-KERNEL-LINGUA: un messaggio inglese di K3 si legge in italiano, e il vecchio italiano in inglese', () => {
  assert.equal(messaggioDelKernelNellaLingua('The provider could not be reached.'), 'Non è stato possibile raggiungere il fornitore.');
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua('Non è stato possibile raggiungere il fornitore.')), 'The provider could not be reached.');
  assert.equal(messaggioDelKernelNellaLingua('OpenRouter sent no activity for 90 seconds.'), 'OpenRouter non ha inviato attività per 90 secondi.');
  assert.equal(messaggioDelKernelNellaLingua('The provider is not responding (status unknown). upstream down'), 'Il fornitore non risponde (stato sconosciuto). upstream down');
  assert.equal(messaggioDelKernelNellaLingua('The conversation (12000 tokens) does not fit in the local model’s window (8192 tokens).'),
    'La conversazione (12000 token) non entra nella finestra del modello locale (8192 token).');
  assert.equal(inInglese(() => messaggioDelKernelNellaLingua('La conversazione non entra nella finestra del modello locale.')),
    'The conversation does not fit in the local model’s window.');
});

test('ERRORI-KERNEL-LINGUA AL CONTRARIO: un messaggio ignoto resta com’è, e la carta lo dice', () => {
  assert.equal(messaggioDelKernelNellaLingua('Something nobody wrote.'), null);
  assert.equal(messaggioDelKernelNellaLingua('The provider could not be reached. And more.'), null, 'la frase intera, non un pezzo');
  const ignoto = spiegaErrore('Something nobody wrote.', 'WHATEVER');
  assert.match(ignoto.perche, /non è ancora tradotta/u);
  const noto = spiegaErrore('The provider could not be reached.', 'PROVIDER_NETWORK_ERROR');
  assert.equal(noto.perche, 'Non è stato possibile raggiungere il fornitore.');
  assert.equal(noto.tecnico, 'The provider could not be reached.', 'il dettaglio tecnico resta il testo del server');
  const contesto = spiegaErrore('The conversation (12000 tokens) does not fit in the local model’s window (8192 tokens).', 'CTX_LOCAL_WINDOW');
  assert.match(contesto.perche, /^La conversazione \(12000 token\) non entra/u);
});
