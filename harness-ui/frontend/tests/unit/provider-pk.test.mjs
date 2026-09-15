// P-K — i campi pubblici producono l'indirizzo ufficiale salvabile dalla rotta esistente.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as card from '../../src/components/provider-card.js';

test('PK-UI-01 — regione, progetto e versione aggiornano il collegamento; input errati respinti', () => {
  assert.equal(typeof card.componiIndirizzoCloud, 'function');
  assert.equal(card.componiIndirizzoCloud('bedrock', { regione: 'eu-west-1' }), 'https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1');
  assert.equal(card.componiIndirizzoCloud('vertex', { regione: 'europe-west1', progetto: 'progetto-pk' }), 'https://europe-west1-aiplatform.googleapis.com/v1/projects/progetto-pk/locations/europe-west1/endpoints/openapi');
  assert.equal(card.componiIndirizzoCloud('vertex', { regione: 'global', progetto: 'progetto-pk' }), 'https://aiplatform.googleapis.com/v1/projects/progetto-pk/locations/global/endpoints/openapi');
  assert.equal(card.componiIndirizzoCloud('azure', { endpoint: 'https://mia-risorsa.openai.azure.com/openai/v1', versioneApi: '2024-10-21' }), 'https://mia-risorsa.openai.azure.com/openai?api-version=2024-10-21');
  assert.equal(card.componiIndirizzoCloud('azure', { endpoint: 'https://mia-risorsa.services.ai.azure.com/openai?api-version=2024-10-21', versioneApi: 'v1' }), 'https://mia-risorsa.services.ai.azure.com/openai/v1');
  for (const dati of [{ regione: 'x/y', progetto: 'progetto-pk' }, { regione: 'europe-west1', progetto: '../x' }, { regione: '', progetto: '' }]) assert.throws(() => card.componiIndirizzoCloud('vertex', dati));
  assert.throws(() => card.componiIndirizzoCloud('azure', { endpoint: 'https://esempio.test', versioneApi: 'inventata' }));
  assert.throws(() => card.componiIndirizzoCloud('azure', { endpoint: 'https://utente:segreto@esempio.test', versioneApi: 'v1' }));
});
