/*
 * G02 feature 9 (CLI lane e1f7eb363): a host can put a barrier before every mutating action. The TALOS CLI passes
 * `primaDiMutazioneFn` to take its workspace checkpoint lazily: after the provider asked for the tool, after the permission
 * (and the person's approval), before the file or the command exists. A barrier that throws refuses the effect and its code
 * reaches the model; read-only actions and text-only turns never call it. The session identity the CLI keys the checkpoint
 * on travels from the registry (`checkpointSessionId`, `checkpointOperation` start | resume | fork) through avviaSessione.
 * An owner runtime that does not support the barrier refuses a caller that passes one, instead of dropping the guarantee.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import * as kernel from '../src/kernel/talosHarness.mjs';
const {talosLavora} = kernel;
import {avviaSessione} from '../src/agent-service.mjs';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {createOwnerRuntimeAdapter} from '../src/runtime-owner-adapter.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-barrier-'));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  return root;
}
function network(...replies) {
  const calls = [];
  return {calls, fetch: async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const message = replies[Math.min(calls.length - 1, replies.length - 1)];
    return Response.json({choices: [{message, finish_reason: message.tool_calls?.length ? 'tool_calls' : 'stop'}], usage: {prompt_tokens: 10, completion_tokens: 5}});
  }};
}
const DONE = {role: 'assistant', content: 'done'};
const call = (name, args) => ({role: 'assistant', content: '', tool_calls: [{id: `call_${name}`, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});
const base = (root, net, extra = {}) => ({cartella: root, task: {consegna: 'test'}, modello: 'x', chiave: 'y', fetchDiRete: net.fetch,
  messaggiIniziali: [{role: 'system', content: 'test'}, {role: 'user', content: 'test'}], livelloAccesso: 'scrittura-progetto', _giriMassimiInterno: 3, ...extra});

test('G02-9 a text-only turn never calls the barrier', async (t) => {
  const root = workspace(t), net = network(DONE), actions = [];
  await talosLavora(base(root, net, {primaDiMutazioneFn: async (a) => actions.push(a)}));
  assert.equal(net.calls.length, 1);
  assert.deepEqual(actions, []);
});

test('G02-9 the barrier runs after the provider asked for the write and before the file exists', async (t) => {
  const root = workspace(t), net = network(call('scrivi', {percorso: 'out.txt', contenuto: 'hello'}), DONE), seen = [];
  await talosLavora(base(root, net, {primaDiMutazioneFn: async (a) => seen.push({providerCalls: net.calls.length, tipo: a.tipo, exists: existsSync(join(root, 'out.txt'))})}));
  assert.deepEqual(seen, [{providerCalls: 1, tipo: 'scrivi', exists: false}]);
  assert.equal(readFileSync(join(root, 'out.txt'), 'utf8'), 'hello');
});

test('G02-9 a barrier that throws refuses the effect and its code reaches the model', async (t) => {
  const root = workspace(t), net = network(call('scrivi', {percorso: 'out.txt', contenuto: 'hello'}), DONE), events = [];
  let barriers = 0;
  await talosLavora(base(root, net, {onGiro: (e) => events.push(e),
    primaDiMutazioneFn: async () => {barriers++; throw Object.assign(new Error('workspace exceeds checkpoint budget'), {code: 'CHECKPOINT_SNAPSHOT_TOO_LARGE'});}}));
  assert.equal(barriers, 1);
  assert.equal(existsSync(join(root, 'out.txt')), false, 'nothing was written');
  assert.equal(net.calls.length, 2, 'the provider receives the refused tool result');
  const tool = net.calls[1].messages.find((m) => m.role === 'tool');
  assert.match(tool.content, /CHECKPOINT_SNAPSHOT_TOO_LARGE/u);
  assert.match(events.find((e) => e.tipo === 'tool-esito')?.content ?? '', /^REFUSED\. CHECKPOINT_SNAPSHOT_TOO_LARGE/u);
  const receipt = events.find((e) => e.tipo === 'ricevuta')?.ricevuta;
  assert.deepEqual([receipt?.consentito, receipt?.via], [false, 'pre-mutation-guard'], 'the receipt names who refused');
});

test('G02-9 the model shell passes the barrier before the executor; a read never does', async (t) => {
  const root = workspace(t);
  writeFileSync(join(root, 'in.txt'), 'data');
  const order = [];
  const net = network(call('leggi', {percorso: 'in.txt'}), call('shell', {comando: 'echo x'}), DONE);
  await talosLavora(base(root, net, {ambienteComandiFn: () => ({dove: 'windows', revisione: 0}),
    primaDiMutazioneFn: async (a) => order.push(`barrier:${a.tipo}`),
    eseguiComandoSandboxatoFn: async () => {order.push('executor'); return {codice: 0, testo: 'x', enforcement: 'none'};}}));
  assert.deepEqual(order, ['barrier:shell', 'executor']);
});

test('G02-9 reading a secret asks the person (F15) but is not a mutation: no barrier', async (t) => {
  const root = workspace(t);
  writeFileSync(join(root, '.env'), 'TOKEN=fixture');
  const asked = [], barriers = [];
  const net = network(call('leggi', {percorso: '.env'}), DONE);
  await talosLavora(base(root, net, {chiediApprovazioneFn: async (a) => {asked.push(a.tipo); return true;}, primaDiMutazioneFn: async (a) => barriers.push(a.tipo)}));
  assert.deepEqual(asked, ['leggi'], 'the secret read went through the permission gate');
  assert.deepEqual(barriers, [], 'a read is never a checkpoint boundary');
});

test('G02-9 avviaSessione hands the checkpoint identity to the kernel call', async () => {
  const inputs = [];
  await avviaSessione({cartella: tmpdir(), task: {consegna: 'x'}, modello: 'm', chiave: 'k', comandoProva: 'npm test', onEvento() {},
    checkpointSessionId: 'sess-1', checkpointOperation: 'resume',
    talosLavoraFn: async (input) => {inputs.push(input); return {detto: 'ok', comeFinita: 'concluso', messaggiFinali: []};}});
  assert.equal(inputs[0]?.checkpointSessionId, 'sess-1');
  assert.equal(inputs[0]?.checkpointOperation, 'resume');
});

test('G02-9 the registry keys start, resume and fork with the session id', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-g02-barrier-registry-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const runs = [];
  const registry = createSessionRegistry({cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({cartella: tmpdir(), comandoProva: 'npm test', task: {id: 'task', consegna: 'x'}}),
    avviaSessioneFn(input) {
      const index = runs.push(input) - 1;
      input.onEvento({type: 'RunStarted', threadId: `t${index}`, runId: `r${index}`});
      input.onEvento({type: 'RunFinished', threadId: `t${index}`, runId: `r${index}`});
      return Promise.resolve({ok: true, esito: {detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{role: 'user', content: 'x'}, {role: 'assistant', content: 'ok'}]}});
    }});
  const {sessionId} = registry.avvia('task');
  await registry.attendiAssestamento(sessionId);
  assert.deepEqual([runs[0].checkpointSessionId, runs[0].checkpointOperation], [sessionId, 'start']);
  registry.resume(sessionId, 'again');
  await registry.attendiAssestamento(sessionId);
  assert.deepEqual([runs[1].checkpointSessionId, runs[1].checkpointOperation], [sessionId, 'resume']);
  const fork = registry.forka(sessionId);
  const forkId = fork?.sessionId ?? fork;
  await registry.attendiAssestamento(forkId);
  const last = runs.at(-1);
  assert.equal(last.checkpointOperation, 'fork');
  assert.equal(last.checkpointSessionId, forkId);
  assert.notEqual(forkId, sessionId);
});

test('G02-9 an owner runtime without the barrier refuses a caller that passes one', async () => {
  assert.equal(kernel.SUPPORTA_BARRIERA_MUTAZIONI, 1, 'the real kernel declares the barrier');
  let ran = 0;
  const adapter = createOwnerRuntimeAdapter({modulePath: resolve('fixture-barrier-runtime.mjs'), importFn: async () => ({talosLavora: () => {ran++;}})});
  await assert.rejects(() => adapter.talosLavora({primaDiMutazioneFn() {}}), (e) => e.code === 'PRE_MUTATION_CONTRACT_REQUIRED');
  assert.equal(ran, 0);
});
