import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompactionWindowSource } from '../src/compaction-window-source.mjs';

const body = (lengths, id = 'z-ai/glm-5.3-flash') => ({
  data: { id, endpoints: lengths.map((context_length) => ({ model_id: id, context_length })) },
});
const ok = (value) => ({ ok: true, json: async () => value });

test('CTX-WINDOW-ROUTE-MIN — ogni endpoint eleggibile limita la finestra, indipendentemente dall ordine', async () => {
  let now = 100;
  let calls = 0;
  const source = createCompactionWindowSource({
    now: () => now,
    ttlMs: 1_000,
    fetchFn: async (url) => {
      calls++;
      assert.equal(url, 'https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints');
      return ok(body(calls === 1 ? [1_000_000, 262_144] : [262_144, 1_000_000]));
    },
  });
  assert.equal(source.get('z-ai/glm-5.3-flash'), null, 'la prima lettura non blocca RunStarted');
  assert.equal(await source.refresh('z-ai/glm-5.3-flash'), 262_144);
  assert.equal(source.get('z-ai/glm-5.3-flash'), 262_144);
  now += 1_001;
  assert.equal(source.get('z-ai/glm-5.3-flash'), null, 'dato scaduto non è una certificazione');
  assert.equal(await source.refresh('z-ai/glm-5.3-flash'), 262_144);
  assert.equal(source.get('z-ai/glm-5.3-flash'), 262_144);
});

test('CTX-WINDOW-ROUTE-INVALID — errore, lista incompleta e modello discordante non alzano il tetto', async () => {
  for (const result of [
    { ok: false, status: 503 },
    ok(body([])),
    ok(body([1_000_000, null])),
    ok(body([1_000_000], 'other/model')),
    ok({ data: { id: 'z-ai/glm-5.3-flash', endpoints: [{ model_id: 'other/model', context_length: 1_000_000 }] } }),
  ]) {
    const source = createCompactionWindowSource({ fetchFn: async () => result });
    assert.equal(await source.refresh('z-ai/glm-5.3-flash'), null);
    assert.equal(source.get('z-ai/glm-5.3-flash'), null);
  }
});

test('CTX-WINDOW-ROUTE-ID — ID locali o URL malformati non causano fetch', async () => {
  const source = createCompactionWindowSource({ fetchFn: async () => { throw new Error('fetch non attesa'); } });
  for (const id of ['lmstudio:qwen', 'openrouter/auto', '../secret', '', null]) assert.equal(await source.refresh(id), null);
});

/*
 * CTX-WINDOW-CONTA (giudice v1573, punto 1, 11/11/2026): PRIVACY.md dice quante volte TALOS chiede gli endpoint del modello OpenRouter
 *   durante una chat OpenRouter; qui si contano. Riuscita: al più una lettura ogni 10 minuti per modello. Fallita: una al minuto
 *   (`retryMs`), finché openrouter.ai non risponde; mai più di una in volo. La frase della pagina è inchiodata da C11.
 */
test('CTX-WINDOW-CONTA — una chat che chiede la finestra ogni 10 s: riuscita 3 letture in 30 minuti, fallita 10 in 10 minuti', async () => {
  const id = 'z-ai/glm-5.3-flash';
  const giri = async (src, passi, ogniMs, orologio) => {
    for (let i = 0; i < passi; i += 1) {
      orologio.ora = i * ogniMs;
      src.get(id); src.get(id);
      for (let k = 0; k < 5; k += 1) await new Promise((r) => setImmediate(r));
    }
  };
  const su = { ora: 0 };
  let letture = 0;
  const riuscita = createCompactionWindowSource({ now: () => su.ora, fetchFn: async () => { letture += 1; return ok(body([131072])); } });
  await giri(riuscita, 180, 10_000, su);
  assert.equal(letture, 3, 'riuscita: una lettura ogni 10 minuti (0, 10, 20)');
  const giu = { ora: 0 };
  let tentativi = 0;
  const fallita = createCompactionWindowSource({ now: () => giu.ora, fetchFn: async () => { tentativi += 1; throw new Error('rifiutata'); } });
  await giri(fallita, 60, 10_000, giu);
  assert.equal(tentativi, 10, 'fallita: un tentativo al minuto in 10 minuti, non uno per richiesta');
});
