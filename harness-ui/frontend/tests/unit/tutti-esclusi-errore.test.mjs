/*
 * Decisione 14, nota 2 della review del bugfixer (08/10/2026 notte): con TUTTI i fornitori di un modello nell'elenco degli esclusi,
 * OpenRouter non manda la richiesta a nessuno (404, `failed_routing_step: "Filter by Ignored Providers"`, misurato con la chiave
 * vera). Il server lo dice col codice `OPENROUTER_ALL_PROVIDERS_EXCLUDED`; la carta della chat dice cosa è successo, che la chiave
 * è a posto, e DOVE si cambia — non «Limite del servizio», che sarebbe falso (il limite l'ha messo la persona).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

test('TUTTI-ESCLUSI-01: il codice vince sul testo grezzo; la carta porta il percorso delle impostazioni, in italiano e in inglese', () => {
  try {
    for (const [lingua, percorso, chiave] of [['it', /Impostazioni → Laboratorio modelli → Provider → OpenRouter → Configura/u, /chiave è a posto/u],
      ['en', /Settings → Model laboratory → Provider → OpenRouter → Configure/u, /key is fine/u]]) {
      impostaLingua(lingua);
      for (const testo of ['', 'The provider did not accept the request.', 'HTTP 404']) {
        const s = spiegaErrore(testo, 'OPENROUTER_ALL_PROVIDERS_EXCLUDED');
        assert.equal(s.id, 'tutti-esclusi'); assert.equal(s.riconosciuto, true);
        assert.match(s.rimedi[0], percorso, `${lingua}: ${s.rimedi[0]}`);
        assert.match(s.perche, chiave);
        assert.match(s.tecnico, /OPENROUTER_ALL_PROVIDERS_EXCLUDED/u, 'il codice resta nel dettaglio tecnico');
        assert.notEqual(vestizioneErrore(s).badge, vestizioneErrore(spiegaErrore('', 'PROVIDER_KEY_SPEND_LIMIT')).badge, 'non è «Limite del servizio»');
      }
    }
  } finally { impostaLingua('it'); }
});

test('TUTTI-ESCLUSI-02: AL CONTRARIO — lo stesso testo senza il codice non diventa questa carta', () => {
  assert.notEqual(spiegaErrore('All providers have been ignored.', 'PROVIDER_REQUEST_ERROR').id, 'tutti-esclusi');
  assert.notEqual(spiegaErrore('Every provider of this model is in your excluded list on OpenRouter.', '').id, 'tutti-esclusi');
});
