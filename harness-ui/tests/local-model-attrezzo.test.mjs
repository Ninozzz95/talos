/* 01/11/2026, `local_model` (forma `FORMA-MODELLI-DALLA-CHAT-2026-11-01.md`): l'ospite del PC e il nucleo. Nessun motore vero.
   Senza «switch» (Desktop e Mobile, fase 8): il modello della conversazione lo cambia solo `app_settings`. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { creaLocalModel, creaOspiteFornitori } from '../src/fornitori-per-il-modello.mjs';
import { ATTREZZI_ESTESI_OPENAI, ATTREZZI_FORNITORI, SENZA_CARTA_IN_ACCESSO_PIENO } from '../src/kernel/talosHarness.mjs';
import { ATTREZZI_DIFFERIBILI } from '../src/kernel/ponte-attrezzi.mjs';

function finti({ aperto = { id: 'q4', nome: 'Qwen3.8-27B' }, inUso = [] } = {}) {
  const fatti = [];
  return {
    fatti,
    m: {
      elenca: async () => [{ id: 'q4', nome: 'Qwen3.8-27B', bytes: 16.5e9, entra: true }, { id: 'g4', nome: 'Gemma 4', bytes: 16.9e9, entra: true }, { id: 'big', nome: 'Grande', bytes: 60e9, entra: false }],
      aperto: () => aperto,
      inUso: () => inUso,
      apri: async (id) => { fatti.push(['apri', id]); return { ok: true }; },
      chiudi: async () => { fatti.push(['chiudi']); return { ok: true }; },
      memoriaAperta: () => ({ bytes: 17e9, stima: false }),
    },
  };
}

test('LM-1 status is free: ids, sizes, the fit verdict (Mobile 3) and the open one', async () => {
  const { m } = finti();
  const lm = creaLocalModel(m);
  assert.deepEqual(await lm({ action: 'status' }, 'anteprima'), { ok: true, carta: false });
  const r = await lm({ action: 'status' }, 'esegui');
  assert.match(r.testo, /Open now: Qwen3\.8-27B/u);
  assert.match(r.testo, /id "big": Grande, 60\.0 GB, does not fit in memory/u);
});

test('LM-2 open and free show a card with the Frontend data and «dove: pc» (Mobile 4); after the yes they act', async () => {
  const { m, fatti } = finti();
  const lm = creaLocalModel(m);
  assert.deepEqual(await lm({ action: 'open', model: 'g4' }, 'anteprima'), { ok: true, carta: true, azione: { azione: 'open', modello: 'Gemma 4', peso: 16.9e9, aperto: 'Qwen3.8-27B', dove: 'pc' } });
  assert.deepEqual(await lm({ action: 'free' }, 'anteprima'), { ok: true, carta: true, azione: { azione: 'free', modello: 'Qwen3.8-27B', memoria: 17e9, stima: false, dove: 'pc' } });
  await lm({ action: 'open', model: 'g4' }, 'esegui');
  await lm({ action: 'free' }, 'esegui');
  assert.deepEqual(fatti, [['apri', 'g4'], ['chiudi']]);
});

test('LM-3 the other way: an id not from status (Mobile 1), a model that does not fit, free with a turn on it, nobody in front, switch is gone', async () => {
  const { m, fatti } = finti();
  const lm = creaLocalModel(m);
  for (const model of ['Qwen3.8-27B', 'C:\\models\\q.gguf', '', undefined]) {
    const r = await lm({ action: 'open', model }, 'anteprima');
    assert.equal(r.ok, false, String(model));
    assert.match(r.messaggio, /not an id returned by local_model status/u);
  }
  assert.match((await lm({ action: 'open', model: 'big' }, 'anteprima')).messaggio, /does not fit/u);
  const inUso = creaLocalModel(finti({ inUso: ['altra'] }).m);
  const r = await inUso({ action: 'free' }, 'anteprima');
  assert.equal(r.ok, false);
  assert.match(r.messaggio, /still answering in another conversation/u);
  assert.match((await lm({ action: 'open', model: 'g4' }, 'anteprima', { perchéNo: 'an automation run' })).messaggio, /nobody could approve it/u);
  assert.match((await creaLocalModel(null)({ action: 'status' }, 'esegui')).messaggio, /not available on this computer/u);
  assert.match((await lm({ action: 'boh' }, 'anteprima')).messaggio, /needs action/u);
  for (const fase of ['anteprima', 'esegui']) {
    const s = await lm({ action: 'switch', model: 'g4' }, fase);
    assert.equal(s.ok, false, fase);
    assert.match(s.messaggio, /use app_settings/u);
  }
  assert.deepEqual(fatti, [], 'a switch request opens nothing');
});

test('LM-4 nothing to do is no card: the open one again, nothing open to free', async () => {
  assert.deepEqual(await creaLocalModel(finti().m)({ action: 'open', model: 'q4' }, 'anteprima'), { ok: true, carta: false });
  assert.deepEqual(await creaLocalModel(finti({ aperto: null }).m)({ action: 'free' }, 'anteprima'), { ok: true, carta: false });
});

test('LM-5 the kernel lists: on the hosts channel, without a card in Full access (owner law of 12/10, Desktop), behind the bridge (Desktop); no switch in the schema', () => {
  assert.equal(ATTREZZI_FORNITORI.has('local_model'), true);
  assert.equal(SENZA_CARTA_IN_ACCESSO_PIENO.has('local_model'), true);
  assert.equal(ATTREZZI_DIFFERIBILI.has('local_model'), true);
  const def = ATTREZZI_ESTESI_OPENAI.find((s) => s.function.name === 'local_model').function;
  assert.deepEqual(def.parameters.properties.action.enum, ['status', 'open', 'free']);
  assert.match(def.description, /app_settings/u);
});

test('LM-6 the PC host runs local_model; without modelliLocali the tool says it is not there', async () => {
  const { m, fatti } = finti();
  const ospite = creaOspiteFornitori({ providerStore: { getRuntime: () => ({}) }, modelliLocali: m })({});
  await ospite('local_model', { action: 'open', model: 'g4' }, { fase: 'esegui' });
  assert.deepEqual(fatti, [['apri', 'g4']]);
  const senza = creaOspiteFornitori({ providerStore: { getRuntime: () => ({}) } })({});
  assert.match((await senza('local_model', { action: 'status' }, { fase: 'esegui' })).messaggio, /not available/u);
  const automazione = creaOspiteFornitori({ providerStore: { getRuntime: () => ({}) }, modelliLocali: m })({ automazioneDelGiro: 'a1' });
  assert.equal((await automazione('local_model', { action: 'status' }, { fase: 'esegui' })).ok, true, 'reading stays free in an automation run');
  assert.equal((await automazione('local_model', { action: 'free' }, { fase: 'anteprima' })).ok, false);
});
