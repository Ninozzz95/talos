import test from 'node:test';
import assert from 'node:assert/strict';
import { spiegaErrore, erroreInUnaRiga } from '../../src/components/errori.js';

// 06/09 — i due errori che l'owner ha visto a schermo con un modello locale, e il verso contrario.

test('ERRORI-CONTESTO: il JSON crudo diventa una frase, coi numeri veri dentro', () => {
  const grezzo = 'HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":17993,"n_ctx":16384}}';
  const s = spiegaErrore(grezzo, 'internal-error');
  assert.equal(s.id, 'contesto-pieno');
  assert.equal(s.riconosciuto, true);
  assert.match(s.cosa, /non entra nella finestra/);
  assert.match(s.perche, /17\.993/); // i numeri dell'errore si usano, non si buttano
  assert.match(s.perche, /16\.384/);
  assert.ok(s.rimedi.length >= 3);
  assert.match(s.rimedi[0], /Compatta/); // prima si compatta: il contesto non azzerato dà lo stesso 400 anche su prompt corti
  assert.equal(s.tecnico, grezzo); // il testo del server non sparisce mai
});

test('ERRORI-CONTESTO senza numeri: la frase regge lo stesso', () => {
  const s = spiegaErrore('context length exceeded', 'internal-error');
  assert.equal(s.id, 'contesto-pieno');
  assert.doesNotMatch(s.perche, /Servivano/);
});

test('ERRORI-VUOTO: «flusso SSE senza contenuto» diventa cosa, perché e tre cose da fare', () => {
  const s = spiegaErrore('flusso SSE senza contenuto ne tool_calls', 'internal-error');
  assert.equal(s.id, 'risposta-vuota');
  assert.match(s.cosa, /senza dire niente/);
  assert.match(s.perche, /modelli locali/);
  assert.ok(s.rimedi.some((r) => /Riprova/i.test(r)));
});

test('ERRORI-ALTRI: giri, canale di approvazione, rete e quota', () => {
  assert.equal(spiegaErrore('24 su 24 usati senza chiudere il task', 'giri-esauriti').id, 'giri-esauriti');
  assert.equal(spiegaErrore('la sessione non ha un canale di approvazione attivo').id, 'senza-canale-approvazione');
  assert.equal(spiegaErrore('fetch failed: ECONNREFUSED 127.0.0.1:8080').id, 'rete');
  assert.equal(spiegaErrore('HTTP 429 rate limit exceeded').id, 'quota');
});

test('ERRORI-SCONOSCIUTO: non si inventa una causa, si dice che non si sa e si mostra il testo', () => {
  const s = spiegaErrore('qualcosa di mai visto', 'internal-error');
  assert.equal(s.id, 'sconosciuto');
  assert.equal(s.riconosciuto, false);
  assert.match(s.perche, /non è ancora tradotta/);
  assert.equal(s.tecnico, 'qualcosa di mai visto');
  // AL CONTRARIO: anche senza messaggio non si rompe e non si finge di sapere
  const vuoto = spiegaErrore('', '');
  assert.equal(vuoto.id, 'sconosciuto');
  assert.equal(vuoto.tecnico, '');
});

test('ERRORI-UNA-RIGA: per i posti stretti resta solo il «cosa»', () => {
  assert.match(erroreInUnaRiga('flusso SSE senza contenuto ne tool_calls', 'internal-error'), /senza dire niente/);
});
