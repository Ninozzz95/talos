/* Adversarial review of block 1 of the local engine (01/11/2026). Every test here states what the code SHOULD do: red = defect. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { creaAperturaCondivisa, fotoDelCaricamento, nomeDaMostrare } from '../src/apertura-condivisa.mjs';
import { creaFinestraCheCresce } from '../src/finestra-che-cresce.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { loadConfig } from '../src/config.mjs';
import { ambienteSenzaVariabiliDelServer } from '../src/ambiente-solo-server.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const giro = () => new Promise((r) => setImmediate(r));
const ms = (n) => new Promise((r) => setTimeout(r, n));
const MODELLO = 'C:\\models\\a.gguf';

/** A fake llama-server: `kill` only records; the process goes away when the test says so, as a real one holding the card does. */
function motori() {
  const figli = [];
  const spawnImpl = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.uccisioni = [];
    c.kill = (s) => { c.uccisioni.push(s); return true; };
    c.esci = () => c.emit('close', 0, 'SIGTERM');
    figli.push(c);
    return c;
  };
  return { figli, spawnImpl };
}
function supervisore(spawnImpl) {
  return createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', spawnImpl, portAllocator: async () => 18080, pollIntervalMs: 1, attesaChiusuraMs: 2_000,
    fetchImpl: async () => new Response('', { status: 503 }), sondaBinario: async () => '' });
}
async function finche(c, tetto = 2_000) { const fine = Date.now() + tetto; while (Date.now() < fine) { if (await c()) return true; await ms(2); } return false; }

test('REV-1 standalone: after a cancelled opening the next one does not start beside the engine still going away', async () => {
  const { figli, spawnImpl } = motori();
  const s = supervisore(spawnImpl);
  const condivisa = creaAperturaCondivisa({ apri: (modelId, o) => s.start({ modelId, modelPath: MODELLO, contextLength: 8192, signal: o.signal }) });
  const stop = new AbortController();
  const uno = condivisa.apri('a', { signal: stop.signal });
  assert.ok(await finche(() => figli.length === 1), 'the engine spawned');
  stop.abort(new Error('stopped by the person'));
  await assert.rejects(uno, /stopped/u);
  const due = condivisa.apri('a'); // a second conversation, or the same one sending again
  due.catch(() => {});
  await ms(50);
  try {
    assert.equal(figli[0].uccisioni.length, 1, 'the old engine was told to go');
    assert.equal(figli.length, 1, 'a second engine must not start while the first one still holds the memory (apertura-condivisa.mjs: «the new one starts when it has gone»)');
  } finally {
    figli[0].esci(); await s.stop().catch(() => {}); for (const f of figli) f.esci();
  }
});

test('REV-1b same, without the shared opening: start → abort → start', async () => {
  const { figli, spawnImpl } = motori();
  const s = supervisore(spawnImpl);
  const stop = new AbortController();
  const uno = s.start({ modelId: 'a', modelPath: MODELLO, contextLength: 8192, signal: stop.signal });
  assert.ok(await finche(() => figli.length === 1));
  stop.abort();
  await assert.rejects(uno, { code: 'RUNTIME_START_CANCELLED' });
  const due = s.start({ modelId: 'a', modelPath: MODELLO, contextLength: 8192 });
  due.catch(() => {});
  await ms(50);
  try { assert.equal(figli.length, 1); } finally { figli[0].esci(); await s.stop().catch(() => {}); for (const f of figli) f.esci(); }
});

function aperture() {
  const chiamate = [];
  const apri = (modelId, { signal }) => new Promise((risolvi, rifiuta) => { const v = { modelId, signal, risolvi, rifiuta }; chiamate.push(v); });
  return { apri, chiamate };
}

test('REV-2 a Stop while waiting for a cancelled opening to go away answers at once', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const a = new AbortController();
  const uno = condivisa.apri('m', { signal: a.signal });
  await giro();
  a.abort(new Error('first'));
  await assert.rejects(uno, /first/u);
  const b = new AbortController();
  const due = condivisa.apri('m', { signal: b.signal });
  await giro();
  b.abort(new Error('second'));
  const esito = await Promise.race([due.then(() => 'risolta', (e) => `rifiutata:${e.message}`), ms(100).then(() => 'ancora appesa')]);
  chiamate[0].rifiuta(new Error('cancelled')); // cleanup
  await due.catch(() => {});
  assert.equal(esito, 'rifiutata:second');
});

/* the remembered window: `conLaPreferita`, real */
function finestra(t, supervisor, motore) {
  const cartella = mkdtempSync(join(tmpdir(), 'rev-finestra-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'finestre-preferite.json'), JSON.stringify({ b: 64_000, a: 32_000 }));
  const f = creaFinestraCheCresce({ supervisor, motore, modello: async () => null, leggiIntestazione: async () => ({}), misuraMacchina: async () => ({}), cartella });
  return { f, cartella, preferite: () => JSON.parse(readFileSync(join(cartella, 'finestre-preferite.json'), 'utf8')) };
}

test('REV-3a a load refused because the engine is busy is not a window that «does not start»: it stays remembered', async (t) => {
  const { f, preferite } = finestra(t, { status: () => ({}) }, {});
  const rifiuto = Object.assign(new Error('runtime is already active'), { code: 'RUNTIME_ALREADY_RUNNING' });
  let esito; let lanciato = null;
  try { esito = await f.conLaPreferita('b', async () => { throw rifiuto; }); } catch (e) { lanciato = e; }
  assert.equal(preferite().b, 64_000, `the window of b survives (${JSON.stringify(esito)})`);
  assert.equal(lanciato?.code, 'RUNTIME_ALREADY_RUNNING', 'the refusal goes back to the caller');
});

/** `localRuntimes['llama.cpp'].load`, lines 623-648 of server.mjs, copied as they are (they live inside `startServer`). */
function caricatore({ llama, finestraCheCresce }) {
  return async (modelId, opzioni = {}) => {
    const modelPath = `C:\\models\\${modelId}.gguf`;
    let contextLength = Number.isInteger(opzioni.contextLength) && opzioni.contextLength > 0 ? opzioni.contextLength : null;
    if (contextLength === null && finestraCheCresce) {
      const conRicordata = await finestraCheCresce.conLaPreferita(modelId, (preferita) => llama.load({ modelId, modelPath, contextLength: preferita, signal: opzioni.signal }));
      if (conRicordata.avviato) return conRicordata.esito;
      if (conRicordata.dimenticata) { try { await llama.unload(); } catch { /* già spento */ } }
    }
    return llama.load({ modelId, modelPath, contextLength: contextLength ?? 8_192, signal: opzioni.signal });
  };
}

test('REV-3b another model during an opening is refused and leaves the opening alone (FORMA: «resta rifiutata come oggi»)', async (t) => {
  const { figli, spawnImpl } = motori();
  const s = supervisore(spawnImpl);
  const llama = { load: (o) => s.start(o), unload: () => s.stop() };
  const { f, preferite } = finestra(t, s, llama);
  const load = caricatore({ llama, finestraCheCresce: f });
  const condivisa = creaAperturaCondivisa({ apri: (modelId, o) => load(modelId, o) });
  const stopA = new AbortController();
  const a = condivisa.apri('a', { signal: stopA.signal });
  a.catch(() => {});
  assert.ok(await finche(() => figli.length === 1 && s.status().state === 'loading'));
  const b = condivisa.apri('b', {});
  b.catch(() => {});
  let esitoB; try { esitoB = await Promise.race([b.then(() => 'aperto'), ms(200).then(() => 'in corso')]); } catch (e) { esitoB = e.code; }
  const uccisi = figli[0].uccisioni.length;
  const salvate = preferite();
  try {
    assert.deepEqual({ uccisi, finestraB: salvate.b, esitoB }, { uccisi: 0, finestraB: 64_000, esitoB: 'RUNTIME_ALREADY_RUNNING' });
  } finally { for (const c of figli) c.esci(); await s.stop().catch(() => {}); for (const c of figli) c.esci(); }
});

test('REV-3c a chat turn during a load started by the Model Lab (POST /api/v1/runtime/load) waits for it, it gets no error', async () => {
  const { figli, spawnImpl } = motori();
  const s = supervisore(spawnImpl);
  const llama = { load: (o) => s.start(o), unload: () => s.stop() };
  const load = caricatore({ llama, finestraCheCresce: null });
  const condivisa = creaAperturaCondivisa({ apri: (modelId, o) => load(modelId, o) });
  const dalLaboratorio = condivisa.apri('a', { opzioni: { contextLength: 8192 } }); // the route enters the same opening (`runtime.apri` in server.mjs)
  dalLaboratorio.catch(() => {});
  assert.ok(await finche(() => figli.length === 1 && s.status().state === 'loading'));
  let esito; try { esito = await Promise.race([condivisa.apri('a', {}).then(() => 'pronto'), ms(100).then(() => 'aspetta')]); } catch (e) { esito = e.code; }
  try { assert.equal(esito, 'aspetta'); } finally { for (const c of figli) c.esci(); await s.stop().catch(() => {}); for (const c of figli) c.esci(); }
});

test('M3 the Model Lab that opens first keeps its window', async () => {
  const chiamate = [];
  const condivisa = creaAperturaCondivisa({ apri: async (modelId, o) => { chiamate.push(o); return modelId; } });
  await condivisa.apri('a', { opzioni: { contextLength: 4096 } });
  assert.equal(chiamate[0].contextLength, 4096);
});

test('REV-3d the Model Lab with its own window does not join an opening in course: it would lose its choice, and the engine says no as always', async () => {
  const chiamate = [];
  const condivisa = creaAperturaCondivisa({ apri: async (modelId, o) => { chiamate.push(o); if (chiamate.length > 1) throw Object.assign(new Error('busy'), { code: 'RUNTIME_ALREADY_RUNNING' }); await ms(30); return modelId; } });
  const prima = condivisa.apri('a', {});
  await giro();
  await assert.rejects(condivisa.apri('a', { opzioni: { contextLength: 4096 } }), (e) => e.code === 'RUNTIME_ALREADY_RUNNING');
  assert.equal(chiamate[1].contextLength, 4096);
  await prima;
});

test('REV-4 a local model asked while ANOTHER one is ready opens it: this is the «cambio di modello» of the owner', async () => {
  const chiamate = [];
  let aperto = 'a';
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: (m) => m === aperto,
    chiamaLocale: async () => { chiamate.push('chiamaLocale'); return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'x' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); },
    avviaLocale: async (m) => { chiamate.push(`avvia:${m}`); aperto = m; return { state: 'ready', modelId: m }; } };
  const f = creaFetchMultiProvider(fetch, { dipendenze });
  await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {}, body: JSON.stringify({ model: 'local:b', stream: false, messages: [{ role: 'user', content: 'x' }] }) }).catch((e) => chiamate.push(e.message));
  assert.deepEqual(chiamate, ['avvia:b', 'chiamaLocale']);
});

test('M7 a load the state does not name yet keeps what the router says', () => {
  const foto = fotoDelCaricamento({ state: 'loading', router: { caricamento: { modelId: 'a', fase: 'text_model', percentuale: 10 } } });
  assert.deepEqual([foto.modelId, foto.fase, foto.percentuale], ['a', 'text_model', 10]);
});

test('REV-5 the percent of another model is not shown for this one', () => {
  const foto = fotoDelCaricamento({ state: 'loading', modelId: 'b', startedAt: 'x', router: { caricamento: { modelId: 'a', fase: 'text_model', percentuale: 90 } } });
  assert.equal(foto.percentuale, null);
});

test('REV-6 the desktop mark inherited by a person who sets the path by hand does not hide «set by hand»', () => {
  /* the mark does not reach a terminal inside TALOS, so `TALOS_LLAMA_SERVER_PATH=... node server.mjs` from there is by hand */
  const figlio = ambienteSenzaVariabiliDelServer({ TALOS_LLAMA_SERVER_DAL_PACCHETTO: '1', PATH: 'x' });
  assert.equal(figlio.TALOS_LLAMA_SERVER_DAL_PACCHETTO, undefined);
  const c = loadConfig({ ...figlio, TALOS_LLAMA_SERVER_PATH: 'C:\\prove\\llama-server.exe', TALOS_HARNESS_UI_PORT: '4182' });
  assert.equal(c.llamaServerManuale, true);
});

test('REV-7 a relative path never comes out whole: only its last part, which is the name (Mobile)', () => {
  assert.equal(nomeDaMostrare('models\\gemma-GGUF'), 'gemma');
});

test('M2 what a file loaded by hand has for a repository is not a name', () => {
  assert.equal(nomeDaMostrare('local-upload'), null);
});

test('REV-10 a Stop while a widening goes on ends the wait at once; the widening goes on', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'rev-finestra-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const f = creaFinestraCheCresce({ supervisor: { status: () => ({ state: 'ready', modelId: 'm', windowTokens: 8_192 }) }, motore: {}, modello: () => new Promise(() => {}), leggiIntestazione: async () => ({}), misuraMacchina: async () => ({}), cartella });
  f.allarga({ modelId: 'm', servono: 64_000, forza: true });
  await finche(() => f.inCorso());
  const stop = new AbortController();
  const attesa = f.attendi({ signal: stop.signal });
  stop.abort(new Error('stopped'));
  await assert.rejects(attesa, /stopped/u);
  assert.equal(f.inCorso(), true);
});
