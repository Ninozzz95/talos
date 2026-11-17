import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelCatalog } from '../src/model-catalog.mjs';
import { createHttpApp } from '../src/http-app.mjs';

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

test('PF-OR-01 — rete assente senza copia: riserva con motivo, senza dettagli riservati', async () => {
  const catalogo = createModelCatalog({ fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
  const r = await catalogo.ottieni();
  assert.equal(r.fonte, 'riserva');
  assert.equal(r.motivo, 'catalog unreachable: fallback list of 2026-09-12');
  assert.ok(r.modelli.length > 0);
  assert.deepEqual(r.modelliDiRiserva, r.modelli);
  assert.equal(r.daCache, false);
  assert.equal(r.aggiornatoAlle, null);
  assert.ok(r.modelli.every(m => !m.id.startsWith('openrouter:') && m.capacita.toolCall));
  assert.doesNotMatch(JSON.stringify(r), /ECONNREFUSED/);
});

test('PF-OR-02 — HTTP non-ok senza copia restituisce riserva', async () => {
  const catalogo = createModelCatalog({ fetchFn: fetchFinto({}, { ok: false, status: 503 }) });
  assert.equal((await catalogo.ottieni()).fonte, 'riserva');
});

test('PF-OR-03 — JSON e formato inattesi restituiscono riserva, mai un crash', async () => {
  for (const fetchFn of [fetchFinto({ ops: true }), async () => new Response('{rotto')]) {
    assert.equal((await createModelCatalog({ fetchFn }).ottieni()).fonte, 'riserva');
  }
});

/*
 * ⛔ IL TETTO AI TENTATIVI (ripasso del revisore unico, 11/11/2026 22:01, punto 3 ROSSO; giudice v1559). Prima di questa cura un errore
 *   non lasciava traccia: «la prossima ottieni() riprova davvero» voleva dire un tentativo verso openrouter.ai per OGNI schermata che
 *   chiedeva l'elenco (20 in 10 minuti, misurati col server vero). Ora un fallimento conta come una lettura: UNA ripetizione dopo
 *   30 s, poi niente prima di 10 minuti; un successo azzera la serie. Le richieste insieme condividono la lettura in volo.
 *   Come `compaction-window-source.mjs:49` (attesa dopo un fallimento) e `model-catalog-models-dev.mjs:16` (`RINVIO_MS`).
 */
test('⭐⭐ dopo un errore NON si riprova subito: la ripetizione arriva dopo 30 s, e allora riesce', async () => {
  let chiamate = 0;
  let ora = 1_000_000;
  const fetchFn = async () => {
    chiamate += 1;
    if (chiamate === 1) throw new Error('boom');
    return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) };
  };
  const catalogo = createModelCatalog({ fetchFn, clock: () => new Date(ora) });

  assert.equal((await catalogo.ottieni()).fonte, 'riserva');
  ora += 29_000;
  assert.equal((await catalogo.ottieni()).fonte, 'riserva', 'prima dei 30 s: la riserva, senza rete');
  assert.equal(chiamate, 1);
  ora += 1_000;
  const seconda = await catalogo.ottieni();
  assert.equal(chiamate, 2, 'a 30 s la ripetizione parte');
  assert.equal(seconda.modelli.length, 1);
  assert.notEqual(seconda.fonte, 'riserva');
  assert.equal(seconda.modelliDiRiserva, undefined);
});

test('MC-TETTO-01: la rete rifiuta sempre, una richiesta ogni 30 s — 2 tentativi in 10 minuti (0 s e 30 s), poi uno ogni 10 minuti; anche «aggiorna»', async () => {
  let chiamate = [];
  let ora = 5_000_000;
  const inizio = ora;
  const catalogo = createModelCatalog({ clock: () => new Date(ora), fetchFn: async () => { chiamate.push(ora - inizio); throw new Error('rifiutata'); } });
  for (let i = 0; i < 20; i += 1) {
    const r = await catalogo.ottieni({ forzaAggiornamento: i % 3 === 2 });
    assert.equal(r.fonte, 'riserva');
    ora += 30_000;
  }
  assert.deepEqual(chiamate, [0, 30_000], '10 minuti: il primo tentativo e una sola ripetizione');
  for (let i = 0; i < 40; i += 1) { await catalogo.ottieni(); ora += 30_000; }
  assert.deepEqual(chiamate, [0, 30_000, 630_000, 1_230_000], '30 minuti: poi al più uno ogni 10 minuti, senza altre ripetizioni a 30 s');
});

test('MC-TETTO-02: le richieste che arrivano insieme condividono la stessa lettura in volo (riuscita o fallita)', async () => {
  let chiamate = 0;
  let libera;
  const cancello = new Promise((r) => { libera = r; }); // uno solo per tutte: senza la lettura condivisa nessuna resta appesa
  const catalogo = createModelCatalog({ fetchFn: async () => {
    chiamate += 1;
    await cancello;
    return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) };
  } });
  const cinque = Array.from({ length: 5 }, () => catalogo.ottieni({ forzaAggiornamento: true }));
  await new Promise((r) => setTimeout(r, 10));
  libera();
  const esiti = await Promise.all(cinque);
  assert.equal(chiamate, 1, 'cinque schermate, una lettura');
  assert.ok(esiti.every((e) => e.modelli.length === 1));
  let fallite = 0;
  const giu = createModelCatalog({ fetchFn: async () => { fallite += 1; await new Promise((r) => setTimeout(r, 5)); throw new Error('giu'); } });
  const insieme = await Promise.all(Array.from({ length: 5 }, () => giu.ottieni()));
  assert.equal(fallite, 1, 'anche fallita: un tentativo solo');
  assert.ok(insieme.every((e) => e.fonte === 'riserva'));
});

test('MC-TETTO-03: un successo azzera la serie — dopo un nuovo guasto la ripetizione a 30 s torna a valere; con la copia vera si serve quella', async () => {
  let ora = 9_000_000;
  let su = true;
  let chiamate = 0;
  const catalogo = createModelCatalog({ ttlMs: 60_000, clock: () => new Date(ora), fetchFn: async () => {
    chiamate += 1;
    if (!su) throw new Error('giu');
    return { ok: true, status: 200, json: async () => ({ data: [MODELLO_GREZZO_1] }) };
  } });
  await catalogo.ottieni(); su = false;
  ora += 61_000; assert.equal((await catalogo.ottieni()).fallbackRete, true); // 2: guasto, si serve la copia
  ora += 10_000; assert.equal((await catalogo.ottieni()).fallbackRete, true); // niente rete prima dei 30 s
  assert.equal(chiamate, 2);
  ora += 20_000; su = true;
  assert.equal((await catalogo.ottieni()).daCache, false, 'ripetizione a 30 s riuscita'); // 3
  su = false; ora += 61_000; await catalogo.ottieni(); // 4: nuovo guasto
  ora += 30_000; await catalogo.ottieni(); // 5: la ripetizione vale di nuovo
  ora += 30_000; await catalogo.ottieni(); // niente: ora si aspetta 10 minuti
  assert.equal(chiamate, 5);
});

test('PF-OR-04 — rete assente con copia: conserva i modelli veri e misura la loro età', async () => {
  let ora = 1000, disponibile = true;
  const catalogo = createModelCatalog({ ttlMs: 1, clock: () => new Date(ora), fetchFn: async () => {
    if (!disponibile) throw new Error('rete con dettagli riservati');
    return Response.json({ data: [MODELLO_GREZZO_1] });
  } });
  await catalogo.ottieni(); disponibile = false; ora += 5000;
  const copia = await catalogo.ottieni();
  assert.equal(copia.daCache, true);
  assert.equal(copia.fonte, 'openrouter');
  assert.equal(copia.fallbackRete, true);
  assert.equal(copia.etaCacheMs, 5000);
  assert.equal(copia.modelli[0].id, MODELLO_GREZZO_1.id);
  assert.equal(copia.modelliDiRiserva, undefined);
  assert.doesNotMatch(JSON.stringify(copia), /dettagli riservati/);
  disponibile = true;
  ora += 30_000; // dopo un fallimento la ripetizione arriva a 30 s (tetto ai tentativi, 11/11/2026)
  const vivo = await catalogo.ottieni();
  assert.equal(vivo.daCache, false);
  assert.notEqual(vivo.fallbackRete, true);
});

test('PF-OR-05 — rotta HTTP reale in memoria: riserva e recupero senza aprire porte', async () => {
  let disponibile = false;
  let ora = 2_000_000;
  const modelCatalog = createModelCatalog({ clock: () => new Date(ora), fetchFn: async () => {
    if (!disponibile) throw new Error('rete');
    return Response.json({ data: [MODELLO_GREZZO_1] });
  } });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, catalogoModelliFn: modelCatalog.ottieni });
  const richiesta = () => new Promise(resolve => {
    let status;
    app({ method: 'GET', url: '/api/v1/models', headers: {} }, {
      writeHead(codice) { status = codice; }, end(corpo) { resolve({ status, corpo: JSON.parse(corpo.toString()) }); },
    });
  });
  const giu = await richiesta();
  assert.equal(giu.status, 200);
  assert.equal(giu.corpo.data.fonte, 'riserva');
  disponibile = true;
  ora += 30_000; // la ripetizione dopo un fallimento arriva a 30 s (tetto ai tentativi, 11/11/2026)
  const su = await richiesta();
  assert.equal(su.status, 200);
  assert.notEqual(su.corpo.data.fonte, 'riserva');
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
