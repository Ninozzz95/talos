/*
 * K3 (03/10/2026) — il testo del KERNEL per il modello passa all'inglese, e chi lo legge accetta PER SEMPRE tutte e due le
 * forme: l'inglese di oggi e l'italiano delle sessioni salvate (le storie salvate sono italiane e restano tali).
 * Ogni segno si prova nei due versi: la frase inglese nuova E la frase italiana di prima danno la stessa carta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { ORIGINI, puntoNellaLingua, spiegaErrore } from '../../src/components/errori.js';

/** [id atteso, frase inglese del kernel, frase italiana di prima, codice]. */
const COPPIE = [
  ['risposta-interrotta', 'The provider response was cut off.', 'La risposta del fornitore si è interrotta.', 'PROVIDER_REQUEST_ERROR'],
  ['credenziale-rifiutata', 'Credential rejected by the provider.', 'Credenziale rifiutata dal fornitore.', 'PROVIDER_REQUEST_ERROR'],
  ['credenziale-rifiutata', 'Credential not accepted by the provider.', 'Credenziale non accettata dal fornitore.', ''],
  ['fornitore-rifiuto', 'The provider did not accept the request.', 'Il fornitore non ha accettato la richiesta.', 'PROVIDER_REQUEST_ERROR'],
  ['rete', 'Connection with the provider interrupted.', 'Connessione con il fornitore interrotta.', 'PROVIDER_REQUEST_ERROR'],
  ['rete', 'The provider is not responding.', 'Il fornitore non risponde.', 'PROVIDER_REQUEST_ERROR'],
  ['rete', 'The provider exceeded the maximum time.', 'Il fornitore ha superato il tempo massimo.', 'PROVIDER_REQUEST_ERROR'],
  ['quota', 'Too much traffic at the provider.', 'Troppo traffico presso il fornitore.', 'PROVIDER_REQUEST_ERROR'],
  ['quota', 'Credit not available at the provider.', 'Credito non disponibile presso il fornitore.', 'PROVIDER_REQUEST_ERROR'],
  ['risposta-vuota', 'SSE stream with neither content nor tool_calls', 'flusso SSE senza contenuto ne tool_calls', 'internal-error'],
  ['risposta-vuota', '⛔ generation stopped without an answer and without exhausting the turns.', '⛔ la generazione si e fermata senza risposta e senza esaurire i giri.', 'fermato'],
  ['risposta-vuota-dopo-tentativi', 'The model answered with neither text nor tools (4 times in a row; provider reason: MALFORMED_FUNCTION_CALL).', 'Il modello ha risposto senza testo né attrezzi (4 volte di fila; motivo del fornitore: MALFORMED_FUNCTION_CALL).', 'PROVIDER_EMPTY_RESPONSE'],
  ['senza-canale-approvazione', 'the tool "scrivi" requires approval (per-tool permission: ask), but this session has no active approval channel.', 'l\'attrezzo "scrivi" richiede approvazione (permesso per-attrezzo: chiedi), ma questa sessione non ha un canale di approvazione attivo.', ''],
  ['chiave-fornitore-mancante', 'The key for OpenRouter is missing.', 'Manca la chiave per OpenRouter.', 'PROVIDER_KEY_MISSING'],
  ['contesto-sintesi-invalida', 'The summary does not declare text and final state.', 'La sintesi non dichiara testo e stato finale.', 'CTX_SUMMARY_RESPONSE_INVALID'],
  ['contesto-sintesi-troncata', 'The model spent 2048 tokens on reasoning and left no room for the summary.', 'Il modello ha speso 2048 token nel ragionamento e non ha lasciato spazio alla sintesi.', 'CTX_TRUNCATED_SUMMARY'],
  ['contesto-pieno', 'The conversation (17230 tokens) does not fit in the local model’s window (16384 tokens).', 'La conversazione (17230 token) non entra nella finestra del modello locale (16384 token).', 'LOCAL_CONTEXT_EXCEEDED'],
  ['fermato-da-te', '⛔ stopped on request: while waiting for your approval for "scrivi".', '⛔ interrotto su richiesta: mentre aspettavo la tua approvazione per "scrivi".', 'fermato'],
  ['fermato-da-te', '⛔ stopped on request.', '⛔ interrotto su richiesta.', 'fermato'],
];

test('K3-LETTORI — ogni frase del kernel, in inglese e in italiano, dà la stessa carta (e non quella generica)', () => {
  for (const [id, inglese, italiano, codice] of COPPIE) {
    const nuova = spiegaErrore(inglese, codice);
    const vecchia = spiegaErrore(italiano, codice);
    assert.equal(nuova.id, id, `inglese «${inglese}» → ${nuova.id}`);
    assert.equal(vecchia.id, id, `italiano «${italiano}» → ${vecchia.id}`);
  }
});

test('K3-LETTORI — il nome del fornitore e il motivo si leggono dalla frase inglese come da quella italiana', () => {
  try {
    impostaLingua('it');
    assert.equal(spiegaErrore('The key for Z.AI (Anthropic port) is missing.', 'PROVIDER_KEY_MISSING').cosa, 'Manca la chiave per Z.AI (Anthropic port).');
    assert.equal(spiegaErrore('Manca la chiave per Z.AI.', 'PROVIDER_KEY_MISSING').cosa, 'Manca la chiave per Z.AI.');
    assert.equal(spiegaErrore('The key for Z.AI is missing.', 'PROVIDER_KEY_MISSING').cosa, 'Manca la chiave per Z.AI.');
    const ragionamento = spiegaErrore('The model spent 16384 tokens on reasoning and left no room for the summary.', 'CTX_TRUNCATED_SUMMARY');
    assert.match(ragionamento.perche, /ha speso 16\.384 token/u);
    const motivo = spiegaErrore('The model answered with neither text nor tools (once; provider reason: MALFORMED_FUNCTION_CALL).', 'PROVIDER_EMPTY_RESPONSE');
    assert.match(motivo.perche, /MALFORMED_FUNCTION_CALL/u, 'il motivo del fornitore arriva anche dalla forma inglese');
    const vuota = spiegaErrore('The model answered with neither text nor tools (once).', 'PROVIDER_EMPTY_RESPONSE');
    assert.doesNotMatch(vuota.perche, /MALFORMED/u, 'senza motivo nessun motivo inventato');
  } finally { impostaLingua('it'); }
});

test('K3-PUNTO — il punto di fermata scritto dal kernel in inglese si dice nella lingua della persona; una forma ignota passa com\'è', () => {
  const casi = [
    ['while waiting for your approval for "scrivi"', 'mentre aspettavo la tua approvazione per «scrivi»', 'while waiting for your approval for “scrivi”'],
    ['while "shell" was running', 'mentre «shell» era in corso', 'while “shell” was running'],
    ['before round 4', 'prima del giro 4', 'before round 4'],
    ['while the model was answering, at round 3', 'mentre il modello stava rispondendo, al giro 3', 'while the model was answering, at round 3'],
    ['while waiting to ask again after an empty answer, at round 2', 'mentre aspettavo di richiedere una risposta arrivata vuota, al giro 2', 'while waiting to ask again after an empty answer, at round 2'],
    ['during compaction, at round 7', 'durante la compattazione, al giro 7', 'during compaction, at round 7'],
    ['while working with the tools of round 5', 'mentre lavoravo con gli attrezzi del giro 5', 'while working with the tools of round 5'],
    ['while working with the tools of round 5; 2 not run (leggi, cerca)', 'mentre lavoravo con gli attrezzi del giro 5; 2 non eseguiti (leggi, cerca)', 'while working with the tools of round 5; 2 not run (leggi, cerca)'],
  ];
  try {
    for (const [grezzo, italiano, inglese] of casi) {
      impostaLingua('it');
      assert.equal(puntoNellaLingua(grezzo), italiano, grezzo);
      impostaLingua('en');
      assert.equal(puntoNellaLingua(grezzo), inglese, grezzo);
    }
    impostaLingua('it');
    /* AL CONTRARIO: l'italiano scritto da una sessione salvata passa com'è, e una forma mai vista non sparisce. */
    assert.equal(puntoNellaLingua('mentre aspettavo la tua approvazione per "scrivi"'), 'mentre aspettavo la tua approvazione per "scrivi"');
    assert.equal(puntoNellaLingua('a point nobody declared'), 'a point nobody declared');
  } finally { impostaLingua('it'); }
});

test('K3-PUNTO — la carta del fermo mostra il punto tradotto, dalla forma inglese e da quella italiana', () => {
  try {
    impostaLingua('it');
    const dalKernel = spiegaErrore('⛔ stopped on request: while waiting for your approval for "scrivi".', 'fermato');
    assert.equal(dalKernel.id, 'fermato-da-te');
    assert.match(dalKernel.perche, /\(mentre aspettavo la tua approvazione per «scrivi»\)/u);
    const salvata = spiegaErrore('⛔ interrotto su richiesta: mentre aspettavo la tua approvazione per "scrivi".', 'fermato');
    assert.match(salvata.perche, /\(mentre aspettavo la tua approvazione per "scrivi"\)/u);
    const reindirizzato = spiegaErrore('⛔ stopped on request: before round 2.', 'fermato', { origine: ORIGINI.REINDIRIZZAMENTO });
    assert.equal(reindirizzato.id, 'reindirizzato');
    assert.match(reindirizzato.perche, /\(prima del giro 2\)/u);
    impostaLingua('en');
    assert.match(spiegaErrore('⛔ stopped on request: during compaction, at round 7.', 'fermato').perche, /\(during compaction, at round 7\)/u);
  } finally { impostaLingua('it'); }
});
