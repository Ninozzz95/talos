/* 01/11/2026, «Memoria delle conversazioni»: il supervisore dà a llama-server la cartella delle foto (`--slot-save-path`). */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
  c.kill = () => { c.emit('close', 0); return true; };
  return c;
}
async function apri(opzioni) {
  const argomenti = [];
  const s = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\llama-server.exe', spawnImpl: (_b, a) => { argomenti.push(a); return figlio(); },
    fetchImpl: async () => ({ status: 200, ok: true }), portAllocator: async () => 18091, pollIntervalMs: 1, registro: () => {}, ...opzioni });
  await s.start({ modelId: 'qwen', modelPath: 'C:\\models\\qwen.gguf' });
  return { s, a: argomenti.at(-1) };
}

test('FMA-1 the folder is created before the start and passed as --slot-save-path; status says snapshots are on and which process it is', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-foto-avvio-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const cartella = join(base, 'foto');
  const { s, a } = await apri({ cartellaFoto: cartella });
  assert.ok(existsSync(cartella), 'llama.cpp throws on a path that is not a folder: it exists before the spawn');
  assert.equal(a[a.indexOf('--slot-save-path') + 1], cartella);
  assert.equal(s.status().fotoAttive, true);
  assert.equal(s.status().processo, 1);
});

test('FMA-2 the other way: without the option the start is as always; a folder that cannot be created switches snapshots off, not the start', async (t) => {
  const senza = await apri({});
  assert.equal(senza.a.includes('--slot-save-path'), false);
  assert.equal(senza.s.status().fotoAttive, false);
  const base = mkdtempSync(join(tmpdir(), 'talos-foto-avvio-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const file = join(base, 'un-file');
  writeFileSync(file, 'x');
  const rotta = await apri({ cartellaFoto: join(file, 'foto') });
  assert.equal(rotta.a.includes('--slot-save-path'), false);
  assert.equal(rotta.s.status().state, 'ready');
  assert.equal(rotta.s.status().fotoAttive, false);
});

test('FMA-3 the slot fingerprint: the same opening gives the same one; another binary gives another; never the port or the key', async () => {
  const uno = (await apri({})).s.status().firmaScheda;
  const due = (await apri({ portAllocator: async () => 18093 })).s.status().firmaScheda;
  assert.match(uno, /^[0-9a-f]{64}$/u);
  assert.equal(uno, due, 'another port and another key: same slot layout');
  const altro = (await apri({ binaryPath: 'C:/talos/b11960/llama-server.exe' })).s.status().firmaScheda;
  assert.notEqual(altro, uno);
});
