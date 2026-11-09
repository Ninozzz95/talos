/*
 * 01/11/2026, vista locale, la via principale (forma, punto 5; Performance; Mobile, condizione 2): il motore dice all'avvio se vede
 * (`/props` → `modalities.vision`, misurato su b11960), il supervisore lo tiene, e per il modello APERTO il server lo usa come catalogo:
 * con «non vede» un'immagine mandata ora si ferma prima della rete e le vecchie diventano la riga al loro posto.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { capacitaDelLocaleAperto } from '../src/proiettore-visione.mjs';

test('VDM-1 the open local model: what the engine said decides; another model, an engine not ready or silent stay unknown', () => {
  const pronto = { state: 'ready', modelId: 'q4', vede: false };
  assert.deepEqual(capacitaDelLocaleAperto('local:q4', pronto), { inputModalities: ['text'] });
  assert.deepEqual(capacitaDelLocaleAperto('local:q4', { ...pronto, vede: true }), { inputModalities: ['text', 'image'] });
  assert.equal(capacitaDelLocaleAperto('local:g4', pronto), null, 'another model: the engine says nothing about it');
  assert.equal(capacitaDelLocaleAperto('local:q4', { ...pronto, state: 'loading' }), null);
  assert.equal(capacitaDelLocaleAperto('local:q4', { state: 'ready', modelId: 'q4' }), null, 'not said is unknown, never "no"');
  assert.equal(capacitaDelLocaleAperto('openrouter/x', pronto), null);
  assert.equal(capacitaDelLocaleAperto('local:q4', null), null);
});

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
  c.kill = () => { c.emit('close', 0); return true; };
  return c;
}
async function apriCon(props) {
  const s = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\llama-server.exe', spawnImpl: () => figlio(), portAllocator: async () => 18092, pollIntervalMs: 1, registro: () => {},
    fetchImpl: async (url) => (String(url).endsWith('/props') ? { ok: true, status: 200, json: async () => props } : { ok: true, status: 200 }) });
  await s.start({ modelId: 'q4', modelPath: 'C:\\models\\q4.gguf' });
  return s.status();
}

test('VDM-2 the supervisor keeps modalities.vision from the same /props read as the window; a missing field is not "false"', async () => {
  assert.equal((await apriCon({ modalities: { vision: false }, default_generation_settings: { n_ctx: 8192 } })).vede, false);
  const vede = await apriCon({ modalities: { vision: true, video: true }, default_generation_settings: { n_ctx: 8192 } });
  assert.equal(vede.vede, true);
  assert.equal(vede.windowTokens, 8192, 'the window is still read from the same answer');
  assert.equal('vede' in (await apriCon({ default_generation_settings: { n_ctx: 8192 } })), false);
  assert.equal('vede' in (await apriCon({ modalities: { vision: 'yes' } })), false);
});
