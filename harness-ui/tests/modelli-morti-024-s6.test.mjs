/*
 * S6 della 0.2.4 (decisione 2026-11-18-0858, registro 158): i modelli morti.
 *   1. Il riassunto su un modello che il fornitore non ha più: l'SDK lancia `APICallError` con `statusCode` 404 (rapporto del lettore
 *      `ausiliario-404`, C3: «esce l'errore grezzo dell'SDK, statusCode 404, senza code»). La catena leggeva solo httpStatus/stato/status:
 *      il 404 restava «non so leggerlo» e la riserva scelta dalla persona non partiva.
 *   2. Giro 2 (revisore 18/11/2026, ROSSO): il catalogo vivo NON nasconde ciò che models.dev marca `status: "deprecated"`, perché models.dev
 *      lo mette anche su modelli che il fornitore serve ancora (claude-sonnet-4-5-20250929, «still functional», ritiro 30/11/2026).
 * L'errore NON è inventato: lo costruisce l'SDK vero (`@ai-sdk/openai` + `ai`, fissati nel lock) da una risposta 404 del fetch finto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { classificaErroreDelRiassunto, catenaDelRiassunto, anelloDaUsare } from '../src/kernel/catena-del-riassunto.mjs';
import { createModelsDevCatalog } from '../src/model-catalog-models-dev.mjs';
import { avvisoDelModello } from '../frontend/src/components/avviso-modello.js';
import { statoAvvioSessione } from '../frontend/src/components/avvio-sessione.js';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* Il corpo del 404 di OpenAI per un modello che non c'è più (forma pubblica dell'errore `model_not_found`). */
const CORPO_404 = { error: { message: 'The model `gpt-5-nano` does not exist or you do not have access to it.', type: 'invalid_request_error', param: null, code: 'model_not_found' } };

async function erroreVeroDellSdk(stato = 404, corpo = CORPO_404) {
  const client = createOpenAI({ apiKey: 'test-only-key', fetch: async () => Response.json(corpo, { status: stato }) });
  try {
    await generateText({ model: client.responses('gpt-5-nano'), prompt: 'Riassumi.', maxRetries: 0 });
  } catch (errore) { return errore; }
  throw new Error('premessa: l\'SDK doveva lanciare');
}

test('S6-01 rosso prima: il 404 dell\'SDK (statusCode) è «non trovato», non un errore illeggibile', async () => {
  const errore = await erroreVeroDellSdk();
  assert.equal(errore.statusCode, 404, 'premessa: l\'SDK mette lo stato in statusCode');
  assert.equal(errore.status, undefined, 'premessa: e NON in status');
  assert.deepEqual(classificaErroreDelRiassunto(errore), { stato: 'inutilizzabile', motivo: 'non-trovato' });
});

test('S6-02 la catena salta il modello morto e passa alla riserva della persona, senza fermarsi', async () => {
  const errore = await erroreVeroDellSdk();
  const giudizio = classificaErroreDelRiassunto(errore);
  const catena = catenaDelRiassunto({ scelto: 'openai:gpt-5-nano', riserva: { provider: 'openai', model: 'gpt-6-luna' },
    statoDi: (id) => (id === 'openai:gpt-5-nano' ? giudizio : null) });
  assert.equal(catena[0].stato, 'inutilizzabile');
  assert.equal(anelloDaUsare(catena).modello, 'openai:gpt-6-luna');
});

test('S6-03 al contrario: un 429 dell\'SDK resta un limite passeggero, un 500 un sovraccarico; status e httpStatus si leggono ancora', async () => {
  const limite = await erroreVeroDellSdk(429, { error: { message: 'Rate limit reached.', type: 'requests', code: 'rate_limit_exceeded' } });
  assert.equal(classificaErroreDelRiassunto(limite).stato, 'bloccato');
  assert.equal(classificaErroreDelRiassunto(limite).motivo, 'limite');
  const guasto = await erroreVeroDellSdk(500, { error: { message: 'Server error.', type: 'server_error' } });
  assert.deepEqual(classificaErroreDelRiassunto(guasto), { stato: 'bloccato', motivo: 'limite', finoAlle: null });
  assert.deepEqual(classificaErroreDelRiassunto({ status: 404 }), { stato: 'inutilizzabile', motivo: 'non-trovato' });
  assert.deepEqual(classificaErroreDelRiassunto({ httpStatus: 403 }), { stato: 'inutilizzabile', motivo: 'accesso-negato' });
  for (const v of ['404', 404.5, 99, 600, null]) assert.equal(classificaErroreDelRiassunto({ statusCode: v }), null, String(v));
});

/* Forma del catalogo models.dev (come tests/model-catalog-models-dev.test.mjs): `status` è il campo pubblico di models.dev. Nel suo
   api.json del 18/11/2026 è «deprecated» anche claude-sonnet-4-5-20250929, che Anthropic serve ancora fino al 30/11/2026
   (platform.claude.com/docs/en/about-claude/model-deprecations, letta dal revisore il 18/11: «still functional»). */
const modello = (id, extra = {}) => ({ id, name: id, tool_call: true, cost: { input: 3, output: 15 }, limit: { context: 200000, output: 64000 }, ...extra });
const CATALOGO = { anthropic: { id: 'anthropic', name: 'Anthropic', models: Object.fromEntries([
  modello('claude-sonnet-5'), modello('claude-sonnet-4-5-20250929', { status: 'deprecated' }), modello('claude-haiku-5-5', { status: 'beta' }),
].map((m) => [m.id, m])) } };

test('S6-04 giro 2: un modello «deprecated» su models.dev resta nel selettore con la sua finestra, e la sessione parte senza avviso «tolto»', async (t) => {
  const cartellaStore = await mkdtemp(join(tmpdir(), 'talos-s6-catalogo-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(cartellaStore));
  const catalogo = createModelsDevCatalog({ cartellaStore, clock: () => new Date('2026-11-18T21:00:00Z'), fetchFn: async () => Response.json(CATALOGO) });
  const dati = await catalogo.ottieni('anthropic');
  assert.deepEqual(dati.modelli.map((m) => m.modelId).sort(), ['claude-haiku-5-5', 'claude-sonnet-4-5-20250929', 'claude-sonnet-5']);
  const vecchio = dati.modelli.find((m) => m.modelId === 'claude-sonnet-4-5-20250929');
  assert.equal(vecchio.contextLength, 200000, 'la finestra viene dal catalogo, non dal ripiego prudente');
  const avviso = avvisoDelModello({ valore: 'anthropic:claude-sonnet-4-5-20250929', nome: 'Claude Sonnet 4.5', fornitori: [{ id: 'anthropic', keyConfigured: true }],
    cataloghiDiretti: { anthropic: dati } });
  assert.notEqual(avviso?.chiave, 'tolto');
  assert.notEqual(avviso?.blocca, true);
  assert.equal(statoAvvioSessione({ cartella: { path: 'C:/p/AVM', projectId: '0' }, permesso: 'Workspace write', avvisoModello: avviso }).puoAvviare, true);
  /* al contrario: un modello che il catalogo vero non ha più è «tolto» e blocca (la regola dell'avviso resta quella di prima) */
  const tolto = avvisoDelModello({ valore: 'anthropic:claude-inesistente', nome: 'X', fornitori: [{ id: 'anthropic', keyConfigured: true }], cataloghiDiretti: { anthropic: dati } });
  assert.equal(tolto?.chiave, 'tolto');
  assert.equal(statoAvvioSessione({ cartella: { path: 'C:/p/AVM', projectId: '0' }, permesso: 'Workspace write', avvisoModello: tolto }).puoAvviare, false);
});
