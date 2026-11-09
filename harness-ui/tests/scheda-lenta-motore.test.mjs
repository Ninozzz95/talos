/* The slow card, the engine half: the timing line llama-server prints after every answer (`server-context.cpp:765`), read from its log. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { bozzeDellaRisposta, createLlamaServerSupervisor, passiAlSecondo, tempiDellaRisposta } from '../src/llama-server-supervisor.mjs';

const RIGA = '       eval time =    9523.17 ms /   400 tokens (   23.81 ms per token,    42.00 tokens per second)';
const PROMPT = 'prompt eval time =     812.40 ms /  1500 tokens (    0.54 ms per token,  1846.38 tokens per second)';

test('SLM-1 the generation line is read; the prompt line never (Performance: generation only)', () => {
  assert.deepEqual(tempiDellaRisposta(RIGA), { generati: 400, tokenPerSecondo: 42, ms: 9523.17 });
  assert.equal(tempiDellaRisposta(PROMPT), null);
  assert.equal(tempiDellaRisposta('      total time =   10335.57 ms /  1900 tokens'), null);
  assert.equal(tempiDellaRisposta(null), null);
  assert.deepEqual(tempiDellaRisposta(`slot print_timing: id  0 | task 7 | ${RIGA.trim()}`), { generati: 400, tokenPerSecondo: 42, ms: 9523.17 }, 'with a prefix too');
});

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
  c.kill = () => { c.emit('close', 0); return true; };
  return c;
}

for (const flusso of ['stderr', 'stdout']) {
  test(`SLM-2 through the real supervisor, the line on ${flusso} even when it arrives in two pieces: one call with model, window and card`, async () => {
    const c = figlio();
    const viste = [];
    const s = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\llama-server.exe', spawnImpl: () => c, fetchImpl: async () => ({ status: 200, ok: true }),
      portAllocator: async () => 18090, pollIntervalMs: 1, onTempiRisposta: (t) => viste.push(t) });
    await s.start({ modelId: 'qwen', modelPath: 'C:\\models\\qwen.gguf' });
    c[flusso].emit('data', Buffer.from(`${PROMPT}\n${RIGA.slice(0, 30)}`));
    c[flusso].emit('data', Buffer.from(`${RIGA.slice(30)}\n`));
    await new Promise((r) => setTimeout(r, 350)); // no draft line: the timing goes after 300 ms
    assert.equal(viste.length, 1);
    assert.deepEqual({ ...viste[0], finestra: undefined }, { generati: 400, tokenPerSecondo: 42, passi: false, modelId: 'qwen', finestra: undefined, scheda: null });
  });
}

test('SLM-4 the real registry writes the durable row `talos.scheda-lenta` into the conversation; a missing one says false', async (t) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { setTimeout: ms } = await import('node:timers/promises');
  const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-scheda-'));
  const fine = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'local:a', chiave: 'k', cartellaEsisteFn: () => true,
    avviaSessioneFn(input) { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise((r) => fine.push(r)); },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }) });
  t.after(async () => { for (const r of fine) r({}); await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }); } catch { /* goes anyway */ } rimuoviCartellaDiProva(cartellaStore); });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', modello: 'local:a' });
  await ms(5);
  assert.deepEqual(registry.giriSulModelloLocale('a'), [sessionId], 'the conversation that gets the row');
  assert.equal(await registry.rigaSchedaLenta(sessionId, { dalle: 'x', migliore: 42, adesso: 31, unita: 'token/s' }), true);
  assert.equal(await registry.rigaSchedaLenta('nessuna', { dalle: 'x' }), false);
  const visti = [];
  const smetti = registry.iscriviti(sessionId, (e) => visti.push(e));
  smetti?.();
  const riga = visti.map((v) => v?.evento ?? v?.event ?? v).find((e) => e?.name === 'talos.scheda-lenta');
  assert.ok(riga, 'the replay of the conversation carries the row');
  assert.equal(riga.value.adesso, 31);
  assert.equal(typeof riga.value.at, 'string');
});

test('SLM-5 sixth review B3: with a draft line the speed is steps per second, the same on new text and on copied text', async () => {
  assert.deepEqual(bozzeDellaRisposta('slot print_timing: id 0 | task 3 | draft acceptance = 0.62000 (  248 accepted /   400 generated), mean len =  2.60'), { accettate: 248 });
  assert.equal(bozzeDellaRisposta(RIGA), null);
  /* the same card: 100 steps a second. New text: 120 tokens, 20 accepted, 1 s. Copied text: 350 tokens, 250 accepted, 1 s */
  assert.equal(passiAlSecondo({ generati: 120, tokenPerSecondo: 120, ms: 1000 }, { accettate: 20 }), 100);
  assert.equal(passiAlSecondo({ generati: 350, tokenPerSecondo: 350, ms: 1000 }, { accettate: 250 }), 100);
  assert.equal(passiAlSecondo({ generati: 50, tokenPerSecondo: 50, ms: 1000 }, null), 50, 'no draft: tokens per second');
  const c = figlio();
  const viste = [];
  const s = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\llama-server.exe', spawnImpl: () => c, fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18092, pollIntervalMs: 1, onTempiRisposta: (t) => viste.push(t) });
  await s.start({ modelId: 'qwen', modelPath: 'C:\\models\\qwen.gguf' });
  c.stderr.emit('data', Buffer.from('       eval time =    1000.00 ms /   350 tokens (    2.86 ms per token,   350.00 tokens per second)\n      total time =    1100.00 ms /   400 tokens\nslot print_timing: draft acceptance = 0.71429 (  250 accepted /   350 generated), mean len =  3.50\n'));
  assert.equal(viste.length, 1, 'given at once on the draft line, not after the timer');
  assert.equal(viste[0].tokenPerSecondo, 100);
  assert.equal(viste[0].passi, true);
});

test('SLM-3 a listener that throws never touches the engine; without a listener nothing is parsed', async () => {
  const c = figlio();
  const s = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\llama-server.exe', spawnImpl: () => c, fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18091, pollIntervalMs: 1, onTempiRisposta: () => { throw new Error('rotto'); } });
  await s.start({ modelId: 'qwen', modelPath: 'C:\\models\\qwen.gguf' });
  assert.doesNotThrow(() => c.stderr.emit('data', Buffer.from(`${RIGA}\n`)));
  assert.equal(s.status().state, 'ready');
});
