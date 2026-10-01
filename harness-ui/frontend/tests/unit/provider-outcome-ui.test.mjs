import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spiegaErrore, vestizioneErrore, tonoDelTick } from '../../src/components/errori.js';

test('RETRY05-UNKNOWN: codice strutturato prevale sul testo, recupero e costo sono espliciti', () => {
  for (const message of ['', 'fetch failed', 'Il fornitore non risponde.', 'La risposta del fornitore si è interrotta.', 'empty stream']) {
    const s = spiegaErrore(message, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(s.id, 'esito-fornitore-incerto', message);
    assert.equal(s.riconosciuto, true);
    assert.match(s.perche, /non.*reinviat/iu);
    assert.match(s.rimedi.join(' '), /continua/iu);
    assert.match(s.rimedi.join(' '), /costo/iu);
    assert.doesNotMatch(`${s.cosa} ${s.perche}`, /non è arrivata|nessun consumo|chiave.*valida|colpa/iu);
    assert.match(s.tecnico, /PROVIDER_OUTCOME_UNKNOWN/u);
    assert.equal(vestizioneErrore(s).badge, 'Risposta interrotta');
    assert.equal(tonoDelTick(vestizioneErrore(s)), 'warning');
  }
});

test('RETRY05-NETWORK: i messaggi generici del transcript non provano invio mancato', () => {
  for (const message of ['Il fornitore non risponde.', 'Connessione con il fornitore interrotta.', 'fetch failed: ECONNREFUSED']) {
    const s = spiegaErrore(message, 'PROVIDER_REQUEST_ERROR');
    assert.equal(s.id, 'rete');
    assert.doesNotMatch(`${s.cosa} ${s.perche} ${s.rimedi.join(' ')}`, /non è arrivata|nessun consumo|chiave.*(?:scaduta|non valida)/iu);
    assert.match(s.perche, /non.*(?:conferma|stabili)/iu);
  }
});

test('RETRY05-COMPAT: non reinterpretare Stop, chiave assente o codice nel testo grezzo', () => {
  assert.equal(spiegaErrore('interrotto su richiesta.', 'fermato').id, 'fermato-da-te');
  assert.equal(spiegaErrore('Manca la chiave per OpenRouter.', 'PROVIDER_KEY_MISSING').id, 'chiave-fornitore-mancante');
  assert.equal(spiegaErrore('PROVIDER_OUTCOME_UNKNOWN', 'altro').id, 'sconosciuto');
});
