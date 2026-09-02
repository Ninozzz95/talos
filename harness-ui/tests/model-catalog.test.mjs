import assert from 'node:assert/strict';
import test from 'node:test';

import { ModelCatalogError, createModelCatalog } from '../src/model-catalog.mjs';

const MODELLO_GREZZO_1 = {
  id: 'deepseek/deepseek-chat', name: 'DeepSeek: Chat', context_length: 64000,
  pricing: { prompt: '0.0000002', completion: '0.0000006' },
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  supported_parameters: ['tools'], description: 'Chat model', created: 1700000000,
};
const MODELLO_GREZZO_2 = {
  id: 'qwen/qwen3.8-flash', name: 'Qwen: Qwen3.8 Flash', context_length: 1000000,
  pricing: { prompt: '0.00000015', completion: '0.00000047' },
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  supported_parameters: ['reasoning'], description: 'Flash model', created: 1700000001,
};

function fetchFinto(corpo, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => corpo });
}

test('⭐ ottieni() normalizza id/provider/nome/contesto/prezzo, ordinati per provider poi nome', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [MODELLO_GREZZO_2, MODELLO_GREZZO_1] }) });
  const { modelli, daCache } = await catalogo.ottieni();
  assert.equal(daCache, false);
  assert.deepEqual(modelli, [
    { id: 'deepseek/deepseek-chat', provider: 'deepseek', alias: false, nome: 'DeepSeek: Chat', contextLength: 64000, prezzoPrompt: '0.0000002', prezzoCompletion: '0.0000006', inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'], reasoning: null, description: 'Chat model', createdAt: 1700000000 },
    { id: 'qwen/qwen3.8-flash', provider: 'qwen', alias: false, nome: 'Qwen: Qwen3.8 Flash', contextLength: 1000000, prezzoPrompt: '0.00000015', prezzoCompletion: '0.00000047', inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: ['reasoning'], reasoning: null, description: 'Flash model', createdAt: 1700000001 },
  ]);
});

test('⭐⭐ dentro il TTL, una seconda ottieni() torna dalla cache senza richiamare fetchFn', async () => {
  let chiamate = 0;
  const fetchFn = async () => { chiamate += 1; return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) }; };
  let ora = 1000;
  const catalogo = createModelCatalog({ fetchFn, clock: () => new Date(ora), ttlMs: 60_000 });

  await catalogo.ottieni();
  ora += 30_000; // dentro il TTL
  const seconda = await catalogo.ottieni();

  assert.equal(chiamate, 1);
  assert.equal(seconda.daCache, true);
});

test('⛔ e AL CONTRARIO: oltre il TTL, ottieni() richiama fetchFn davvero', async () => {
  let chiamate = 0;
  const fetchFn = async () => { chiamate += 1; return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) }; };
  let ora = 1000;
  const catalogo = createModelCatalog({ fetchFn, clock: () => new Date(ora), ttlMs: 60_000 });

  await catalogo.ottieni();
  ora += 70_000; // oltre il TTL
  const seconda = await catalogo.ottieni();

  assert.equal(chiamate, 2);
  assert.equal(seconda.daCache, false);
});

test('⭐ forzaAggiornamento:true richiama fetchFn anche dentro il TTL', async () => {
  let chiamate = 0;
  const fetchFn = async () => { chiamate += 1; return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) }; };
  const catalogo = createModelCatalog({ fetchFn, ttlMs: 60_000 });

  await catalogo.ottieni();
  await catalogo.ottieni({ forzaAggiornamento: true });

  assert.equal(chiamate, 2);
});

test('⛔ un errore di rete diventa ModelCatalogError CATALOG_UNREACHABLE, mai un catalogo vuoto silenzioso', async () => {
  const catalogo = createModelCatalog({ fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(catalogo.ottieni(), (error) => {
    assert.ok(error instanceof ModelCatalogError);
    assert.equal(error.code, 'CATALOG_UNREACHABLE');
    return true;
  });
});

test('⛔ status non-ok diventa ModelCatalogError CATALOG_UPSTREAM_ERROR', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({}, { ok: false, status: 503 }) });
  await assert.rejects(catalogo.ottieni(), (error) => {
    assert.ok(error instanceof ModelCatalogError);
    assert.equal(error.code, 'CATALOG_UPSTREAM_ERROR');
    return true;
  });
});

test('⛔ un formato inatteso (senza data[]) diventa ModelCatalogError, non un crash', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ ops: true }) });
  await assert.rejects(catalogo.ottieni(), ModelCatalogError);
});

test('⭐⭐ dopo un errore, il prossimo ottieni() riprova davvero — nessuna cache di errore', async () => {
  let chiamate = 0;
  const fetchFn = async () => {
    chiamate += 1;
    if (chiamate === 1) throw new Error('boom');
    return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) };
  };
  const catalogo = createModelCatalog({ fetchFn });

  await assert.rejects(catalogo.ottieni());
  const seconda = await catalogo.ottieni();
  assert.equal(chiamate, 2);
  assert.equal(seconda.modelli.length, 1);
});

/*
 * ⛔⛔⛔ 27/8 — trovato dalla pipeline QA visiva: senza togliere il
 * prefisso `~` PRIMA di calcolare il provider, "~anthropic/claude-
 * sonnet-latest" finiva in un gruppo "~anthropic" separato da
 * "anthropic" nel picker — stesso vendor, due righe nel raggruppamento.
 * `id` deve restare intatto (con la tilde): è quello che parte davvero
 * nella chiamata al modello.
 */
test('⭐⭐ un alias "~vendor/nome" ha provider "vendor" SENZA tilde (stesso gruppo dei modelli normali), alias:true, e id INTATTO', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [{ id: '~anthropic/claude-sonnet-latest', name: 'Claude Sonnet Latest' }] }) });
  const { modelli } = await catalogo.ottieni();
  assert.deepEqual(modelli[0], {
    id: '~anthropic/claude-sonnet-latest', provider: 'anthropic', alias: true,
    nome: 'Claude Sonnet Latest', contextLength: null, prezzoPrompt: null, prezzoCompletion: null,
    inputModalities: [], outputModalities: [], supportedParameters: [], reasoning: null, description: '', createdAt: null,
  });
});

test('e AL CONTRARIO: un id normale (senza tilde) ha alias:false', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [MODELLO_GREZZO_1] }) });
  const { modelli } = await catalogo.ottieni();
  assert.equal(modelli[0].alias, false);
});

test('un id senza slash prende provider "altro", mai un crash su split', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [{ id: 'modello-senza-provider', name: 'X' }] }) });
  const { modelli } = await catalogo.ottieni();
  assert.equal(modelli[0].provider, 'altro');
});

test('MODEL-REASONING-CATALOG-04 — preserva solo le capacità reasoning necessarie a validare il picker e il wire', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [{
    id: 'google/gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    reasoning: {
      supported_efforts: ['high', 'medium', 'low', 'minimal', 7],
      default_effort: 'medium',
      default_enabled: true,
      mandatory: true,
      campo_non_fidato: '<script>',
    },
  }] }) });
  const { modelli } = await catalogo.ottieni();
  assert.deepEqual(modelli[0].reasoning, {
    supportedEfforts: ['high', 'medium', 'low', 'minimal'],
    defaultEffort: 'medium',
    defaultEnabled: true,
    mandatory: true,
  });
});

test('MODEL-REASONING-CATALOG-04 contrario — capacità assenti restano null, mai default inventati', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({ data: [MODELLO_GREZZO_1] }) });
  const { modelli } = await catalogo.ottieni();
  assert.equal(modelli[0].reasoning, null);
});
