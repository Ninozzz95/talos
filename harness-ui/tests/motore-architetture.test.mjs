/*
 * 27/09/2026 — il motore installato conosce l'architettura del modello? (`src/motore-architetture.mjs`, `leggiArchitetturaGguf` in
 * `src/gguf-header.mjs`, e il supervisore che lo usa prima di avviare e come rete di sicurezza dopo). Sessione dell'owner
 * ec3bc6c0: Spark-X2.5-4B, architettura `spark2_5`, motore b10517 — «unknown model architecture: 'spark2_5'» misurato a mano.
 * File VERI in una cartella di prova: una libreria del motore finta coi nomi delle architetture come nella tabella di llama.cpp,
 * e un GGUF v3 sintetico con la sola chiave che serve.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { leggiArchitetturaGguf } from '../src/gguf-header.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { RIGA_ARCHITETTURA_SCONOSCIUTA, buildDelMotore, motoreConosceArchitettura, testoArchitetturaSconosciuta } from '../src/motore-architetture.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/** Un GGUF v3 con UNA chiave: general.architecture (stringa, tipo 8), come la spec (ggml `docs/gguf.md`). */
function ggufCon(architettura) {
  const chiave = Buffer.from('general.architecture', 'utf8');
  const valore = Buffer.from(architettura, 'utf8');
  const b = Buffer.alloc(4 + 4 + 8 + 8 + 8 + chiave.length + 4 + 8 + valore.length);
  let o = 0;
  b.write('GGUF', o, 'ascii'); o += 4;
  b.writeUInt32LE(3, o); o += 4;
  b.writeBigUInt64LE(0n, o); o += 8; // tensori
  b.writeBigUInt64LE(1n, o); o += 8; // chiavi
  b.writeBigUInt64LE(BigInt(chiave.length), o); o += 8; chiave.copy(b, o); o += chiave.length;
  b.writeUInt32LE(8, o); o += 4;
  b.writeBigUInt64LE(BigInt(valore.length), o); o += 8; valore.copy(b, o);
  return b;
}

/** Una cartella «b10517-vulkan» con la libreria del motore: i nomi come stanno davvero (code fuse: `bert` solo dentro `nomic-bert`). */
function motoreFinto(t, nomi = ['llama', 'qwen35', 'qwen35moe', 'nomic-bert', 'gemma4']) {
  const base = cartellaDiProva('talos-motore-arch-');
  t.after(() => rimuoviCartellaDiProva(base));
  const cartella = join(base, 'b10517-vulkan');
  mkdirSync(cartella);
  writeFileSync(join(cartella, 'llama.dll'), Buffer.concat([Buffer.from('MZ\0\0intestazione\0', 'latin1'), ...nomi.map((n) => Buffer.from(`${n}\0`, 'latin1')), Buffer.from('coda', 'latin1')]));
  writeFileSync(join(cartella, 'llama-server.exe'), 'finto');
  return { base, binario: join(cartella, 'llama-server.exe') };
}

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); child.emit('close', 0, signal); return true; };
  return child;
}

test('ARCH-01 — la libreria del motore dice sì, no, o «non lo so»; una coda fusa dal compilatore non è un «no»', (t) => {
  const { base, binario } = motoreFinto(t);
  assert.equal(motoreConosceArchitettura(binario, 'qwen35'), true);
  assert.equal(motoreConosceArchitettura(binario, 'bert'), true, '`bert` vive solo come coda di `nomic-bert` (misurato su llama.dll b10517): non è un «no»');
  assert.equal(motoreConosceArchitettura(binario, 'spark2_5'), false);
  assert.equal(motoreConosceArchitettura(binario, ''), null, 'nessuna architettura: non lo so');
  assert.equal(motoreConosceArchitettura(join(base, 'altrove', 'llama-server.exe'), 'spark2_5'), null, 'nessuna libreria: non lo so, e non si ferma niente');
  assert.equal(buildDelMotore(binario), 'b10517');
  assert.equal(buildDelMotore('C:/talos/bin/llama-server.exe'), null);
  assert.match(testoArchitetturaSconosciuta('spark2_5', 'b10517'), /«spark2_5».*llama\.cpp b10517.*riprovare non cambia niente/u);
  assert.equal(RIGA_ARCHITETTURA_SCONOSCIUTA.exec("0.00.258.513 E llama_model_load: error loading model: unknown model architecture: 'spark2_5'")?.[1], 'spark2_5', 'la riga VERA di llama.cpp b10517 (27/09)');
});

test('ARCH-02 — dal GGUF si legge l architettura senza leggere il resto; un file che non è un GGUF dice null', async (t) => {
  const base = cartellaDiProva('talos-gguf-arch-');
  t.after(() => rimuoviCartellaDiProva(base));
  writeFileSync(join(base, 'spark.gguf'), ggufCon('spark2_5'));
  writeFileSync(join(base, 'testo.gguf'), 'non sono un gguf');
  assert.equal(await leggiArchitetturaGguf(join(base, 'spark.gguf')), 'spark2_5');
  assert.equal(await leggiArchitetturaGguf(join(base, 'testo.gguf')), null);
  assert.equal(await leggiArchitetturaGguf(join(base, 'manca.gguf')), null);
});

test('ARCH-03 — un modello che il motore non sa leggere si ferma PRIMA di avviare, con la carta che dice quale architettura e quale motore', async (t) => {
  const { base, binario } = motoreFinto(t);
  const modello = join(base, 'spark.gguf');
  writeFileSync(modello, ggufCon('spark2_5'));
  let avvii = 0;
  const supervisor = createLlamaServerSupervisor({ binaryPath: binario, spawnImpl: () => { avvii += 1; return childProcess(); }, fetchImpl: async () => ({ ok: false, status: 503 }), portAllocator: async () => 18190, pollIntervalMs: 1, sondaBinario: () => null });
  await assert.rejects(supervisor.start({ modelPath: modello }), (error) => {
    assert.equal(error.code, 'RUNTIME_ARCH_UNSUPPORTED');
    assert.equal(error.architettura, 'spark2_5');
    assert.match(error.message, /«spark2_5».*llama\.cpp b10517/u);
    return true;
  });
  assert.equal(avvii, 0, 'il motore non parte nemmeno');
  assert.notEqual(supervisor.status().state, 'loading');
});

test('ARCH-04 — AL CONTRARIO: un architettura che il motore conosce parte come sempre', async (t) => {
  const { base, binario } = motoreFinto(t);
  const modello = join(base, 'qwen.gguf');
  writeFileSync(modello, ggufCon('qwen35'));
  const child = childProcess();
  let avvii = 0;
  const supervisor = createLlamaServerSupervisor({ binaryPath: binario, spawnImpl: () => { avvii += 1; return child; }, fetchImpl: async () => ({ ok: true, status: 200 }), portAllocator: async () => 18191, pollIntervalMs: 1, sondaBinario: () => null });
  const stato = await supervisor.start({ modelPath: modello });
  assert.equal(avvii, 1);
  assert.equal(stato.state, 'ready');
  await supervisor.stop();
});

test('ARCH-05 — la rete di sicurezza: se il motore parte e poi scrive «unknown model architecture», la carta è la stessa, non «si è chiuso dopo 0 s»', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({ binaryPath: 'C:\\talos\\b10517\\llama-server.exe', spawnImpl: () => child, fetchImpl: async () => ({ ok: false, status: 503 }), portAllocator: async () => 18192, pollIntervalMs: 1, healthTimeoutMs: 3_600_000, sondaBinario: () => null });
  const avvio = supervisor.start({ modelPath: 'C:\\models\\strano.gguf' });
  setTimeout(() => {
    // le righe VERE del 27/09, nell'ordine: quella col perché NON è fra le ultime quattro
    for (const riga of [
      "0.00.320.756 E llama_model_load: error loading model: unknown model architecture: 'spark2_5'",
      '0.00.320.787 E llama_model_load_from_file_impl: failed to load model',
      "0.00.320.905 E cmn  common_init_: failed to load model 'C:\\models\\strano.gguf'",
      "0.00.320.909 E srv    load_model: failed to load model, 'C:\\models\\strano.gguf'",
      '0.00.320.921 I srv    operator(): operator(): cleaning up before exit...',
      '0.00.321.699 E srv  llama_server: exiting due to model loading error',
    ]) child.stderr.emit('data', Buffer.from(`${riga}\n`));
    child.emit('close', 1, null);
  }, 20);
  await assert.rejects(avvio, (error) => {
    assert.equal(error.code, 'RUNTIME_ARCH_UNSUPPORTED');
    assert.equal(error.architettura, 'spark2_5');
    assert.match(error.message, /llama\.cpp b10517/u);
    assert.doesNotMatch(error.message, /si è chiuso/u);
    return true;
  });
});
