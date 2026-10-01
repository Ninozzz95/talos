/*
 * G02 feature 1 (CLI lane f22f3f40f, M1-E): a host may run the model's shell commands through its own executor. The TALOS
 * CLI passes its broker (the verified sandbox, or the host declared as not isolated) as `eseguiComandoSandboxatoFn`; without
 * it the kernel keeps `eseguiComandoSandboxato`. The injected executor receives the same command, folder and options, runs
 * inside `captureProcessFn` when there is one, and its result reaches the model like the kernel's own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-broker-'));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  return {root, marker: join(root, 'ran-on-host.txt'), command: `"${process.execPath}" -e "require('fs').writeFileSync('ran-on-host.txt','x')"`};
}
function provider(command, seen) {
  let calls = 0;
  return async (_url, init) => {
    seen.push(JSON.parse(init.body));
    const message = calls++ === 0 ? {role: 'assistant', content: '', tool_calls: [{id: 'tool-g02', type: 'function', function: {name: 'shell', arguments: JSON.stringify({comando: command})}}]}
      : {role: 'assistant', content: 'Fatto.'};
    return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
  };
}
const base = f => ({cartella: f.root, task: {consegna: 'Esegui.'}, modello: 'fixture', chiave: 'fixture',
  messaggiIniziali: [{role: 'system', content: 'Esegui.'}, {role: 'user', content: 'Esegui.'}],
  ambienteComandiFn: () => ({dove: 'windows', revisione: 0}), livelloAccesso: 'completo', _giriMassimiInterno: 3});

for (const withCapture of [false, true]) test(`G02-1 BROKER${withCapture ? ' inside capture' : ''}: the model's shell runs through the injected executor, never on the host`, async t => {
  const f = fixture(t), seen = [], events = [], calls = [];
  let captured = 0;
  await talosLavora({...base(f), fetchDiRete: provider(f.command, seen), onGiro: e => events.push(e),
    eseguiComandoSandboxatoFn: async (comando, cartella, options) => {calls.push({comando, cartella, options}); return {codice: 0, testo: 'BROKERED-OUTPUT', enforcement: 'windows-sandbox'};},
    ...(withCapture ? {captureProcessFn: async ({toolCallId}, execute) => {captured++; assert.equal(toolCallId, 'tool-g02'); return execute({onBytes() {}});}} : {}),
  });
  assert.equal(calls.length, 1, 'the injected executor runs the command once');
  assert.match(calls[0].comando, /ran-on-host\.txt/u);
  assert.equal(resolve(calls[0].cartella), resolve(f.root));
  assert.equal(calls[0].options.dove, 'windows', 'the kernel options (environment, stop, output) pass through');
  assert.equal(typeof calls[0].options.onPezzo, 'function');
  assert.equal(existsSync(f.marker), false, 'nothing ran on the host');
  if (withCapture) assert.equal(captured, 1, 'the executor still runs inside the capture boundary');
  assert.equal(events.find(e => e.tipo === 'tool-esito')?.isError, false);
  assert.match(JSON.stringify(seen.at(-1).messages), /BROKERED-OUTPUT/u, 'its result reaches the model');
});

test('G02-1 an owner runtime without the injected executor refuses a caller that passes one', async () => {
  const kernel = await import('../src/kernel/talosHarness.mjs');
  const {createOwnerRuntimeAdapter} = await import('../src/runtime-owner-adapter.mjs');
  assert.equal(kernel.SUPPORTA_ESECUTORE_COMANDI_OSPITE, 1, 'the real kernel declares the injected executor');
  let ran = 0;
  const adapter = createOwnerRuntimeAdapter({modulePath: resolve('fixture-executor-runtime.mjs'), importFn: async () => ({talosLavora: () => {ran++;}})});
  await assert.rejects(() => adapter.talosLavora({eseguiComandoSandboxatoFn() {}}), (e) => e.code === 'COMMAND_EXECUTOR_CONTRACT_REQUIRED');
  assert.equal(ran, 0);
});
