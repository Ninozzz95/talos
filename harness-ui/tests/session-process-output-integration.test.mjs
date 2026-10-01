import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {eseguiComandoDiretto, avviaSessione} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {createOwnerRuntimeAdapter} from '../src/runtime-owner-adapter.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {runWithProcessOutput} from '../src/process-output-session.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-session-'));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  const output = 'START14\n' + 'x'.repeat(270_000) + '\nEND14\n';
  const script = join(root, 'producer.cjs');
  writeFileSync(script, `process.stdout.write(${JSON.stringify(output)});process.stderr.write('warning14');`);
  return {root, output, command: `"${process.execPath}" "${script}"`};
}
function provider(command, tool = 'shell') {
  let calls = 0;
  return async () => {
    const message = calls++ === 0 ? {role: 'assistant', content: '', tool_calls: [{id: 'tool14', type: 'function', function: {name: tool, arguments: JSON.stringify(tool === 'shell' ? {comando: command} : {})}}]}
      : {role: 'assistant', content: 'Comando verificato.'};
    return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
  };
}
test('OUTPUT14-DIRECT: the real direct command supplies its IDs and raw bytes to the session capture factory', async t => {
  const f = fixture(t), events = []; let captureCount = 0, ids, bytes = 0;
  const result = await eseguiComandoDiretto({cartella: f.root, comando: f.command, dove: 'windows', onEvento: e => events.push(e),
    processOutputFn: async (identity, execute) => {captureCount++; ids = identity; return execute({onBytes: ({bytes: b}) => {bytes += b.length;}});},
  });
  assert.equal(captureCount, 1, 'the direct command must enter the durable capture boundary');
  assert.equal(ids.runId, events.find(e => e.type === 'ComandoUtenteIniziato').comandoId);
  assert.equal(ids.toolCallId, events.find(e => e.type === 'ToolCallStart').toolCallId);
  assert.ok(bytes > Buffer.byteLength(f.output)); assert.equal(result.codice, 0);
});
for (const tool of ['shell', 'prova']) test(`OUTPUT14-KERNEL-${tool}: an approved real process uses capture exactly once`, async t => {
  const f = fixture(t); let captured = 0, bytes = 0;
  const events = [];
  await talosLavora({cartella: f.root, task: {consegna: 'Esegui la verifica.'}, modello: 'fixture', chiave: 'fixture', comandoProva: f.command,
    messaggiIniziali: [{role: 'system', content: 'Verifica.'}, {role: 'user', content: 'Esegui.'}],
    ambienteComandiFn: () => ({dove: 'windows', revisione: 0}), livelloAccesso: 'completo', _giriMassimiInterno: 3,
    fetchDiRete: provider(f.command, tool), onGiro: e => events.push(e),
    captureProcessFn: async ({toolCallId}, execute) => {captured++; assert.equal(toolCallId, 'tool14'); return execute({onBytes: ({bytes: b}) => {bytes += b.length;}});},
  });
  assert.equal(captured, 1, 'approved kernel command must use capture'); assert.ok(bytes >= Buffer.byteLength(f.output));
  assert.equal(events.find(e => e.tipo === 'tool-esito').isError, false);
});
test('OUTPUT14-ADAPTER: an older owner runtime cannot silently ignore capture', async () => {
  let ran = 0;
  const adapter = createOwnerRuntimeAdapter({modulePath: resolve('fixture-output-runtime.mjs'), importFn: async () => ({talosLavora: () => {ran++;}})});
  await assert.rejects(() => adapter.talosLavora({captureProcessFn() {}}), e => e.code === 'PROCESS_OUTPUT_CONTRACT_REQUIRED');
  assert.equal(ran, 0);
});
test('OUTPUT14-ADAPTER-DIRECT: old direct runner is refused before a command with capture starts', async () => {
  let ran = 0;
  const adapter = createOwnerRuntimeAdapter({modulePath: resolve('fixture-output-runtime.mjs'), importFn: async () => ({eseguiComandoSandboxato: () => {ran++;}})});
  await assert.rejects(() => adapter.eseguiComandoSandboxato('echo unsafe', '.', {onBytes() {}}), e => e.code === 'PROCESS_OUTPUT_CONTRACT_REQUIRED');
  assert.equal(ran, 0);
});
test('OUTPUT14-ENVIRONMENT-FENCE: a change while output admission waits cannot execute a command in the old environment', async t => {
  const f = fixture(t), events = []; let revision = 0, bytes = 0;
  await talosLavora({cartella: f.root, task: {consegna: 'Verifica.'}, modello: 'fixture', chiave: 'fixture',
    messaggiIniziali: [{role: 'system', content: 'Verifica.'}, {role: 'user', content: 'Esegui.'}],
    ambienteComandiFn: () => ({dove: 'windows', revisione: revision}), livelloAccesso: 'completo', _giriMassimiInterno: 3,
    fetchDiRete: provider(f.command), onGiro: e => events.push(e),
    captureProcessFn: async (_id, execute) => {revision++; return execute({onBytes: ({bytes: b}) => {bytes += b.length;}});},
  });
  assert.equal(bytes, 0); assert.equal(events.find(e => e.tipo === 'tool-esito').isError, true);
  assert.match(events.find(e => e.tipo === 'tool-esito').content, /COMMAND_ENVIRONMENT_CHANGED/);
});
test('OUTPUT14-REGISTRY: real registry, service, kernel and process persist exact output identities across restart', async t => {
  const f = fixture(t), cartellaStore = join(f.root, 'sessions'), databasePath = join(f.root, 'profile', 'output.sqlite');
  let store = await createProcessOutputStore({databasePath, maxOutputBytes: 1_000_000}), registry;
  const options = {
    cartellaStore, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, processOutputStoreFn: () => store,
    preparaEsecuzioneFn: id => ({cartella: f.root, task: {id, consegna: 'Esegui la verifica richiesta.'}, comandoProva: f.command}),
    avviaSessioneFn: input => avviaSessione({...input, cartella: f.root, livelloAccesso: 'completo',
      contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: kernelInput => talosLavora({...kernelInput, fetchDiRete: provider(f.command), onDelta: undefined, _giriMassimiInterno: 3,
        ambienteComandiFn: () => ({dove: 'windows', revisione: 0})}),
    }),
  };
  try {
    registry = createSessionRegistry(options);
    const {sessionId} = registry.avvia('fixture14'); assert.ok(sessionId);
    await registry.attendiAssestamento(sessionId);
    const journal = join(cartellaStore, `${sessionId}.jsonl`);
    const rows = () => readFileSync(journal, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const receipts = rows().filter(r => r.type === 'CUSTOM' && r.name === 'talos.process-output');
    assert.equal(receipts.length, 2, 'registry must persist both output receipts');
    assert.equal(receipts[1].value.sessionId, sessionId);
    assert.equal(receipts[1].value.runId, rows().find(r => r.type === 'RunStarted').runId);
    assert.equal(receipts[1].value.toolCallId, 'tool14');
    assert.equal(receipts[1].value.stdout.sha256, hash(Buffer.from(f.output)));
    assert.ok(!readFileSync(journal, 'utf8').includes(f.output), 'raw output must not inflate the session journal');
    await registry.doveGiranoIComandi(sessionId, 'windows');
    assert.equal(registry.shell(sessionId, f.command).ok, true);
    await t.waitFor(() => assert.ok(readFileSync(journal, 'utf8').includes('ComandoUtenteFinito')));
    await registry.chiudi();
    const direct = rows().filter(r => r.type === 'CUSTOM' && r.name === 'talos.process-output').at(-1).value;
    assert.equal(direct.state, 'complete');
    assert.ok(direct.controlFooter, JSON.stringify(rows().filter(r => r.type === 'ComandoUtenteFinito' || r.name === 'talos.process-output')));
    assert.equal(direct.controlFooter.type, 'cwd-marker-v1');
    await store.close(); store = await createProcessOutputStore({databasePath, maxOutputBytes: 1_000_000});
    registry = createSessionRegistry(options); await registry.ripristina();
    assert.ok(JSON.stringify(registry.esporta(sessionId)).includes(receipts[1].value.outputId));
    const id = {sessionId, outputId: receipts[1].value.outputId};
    assert.equal((await store.inspect(id)).stdout.sha256, hash(Buffer.from(f.output)));
    const digest = createHash('sha256'); let offset = 0;
    do {const page = await store.readPage({...id, stream: 'stdout', offset}); digest.update(page.bytes); offset = page.nextOffset;} while (offset !== null);
    assert.equal(digest.digest('hex'), hash(Buffer.from(f.output)));
    await assert.rejects(store.inspect({...id, sessionId: 'other'}), e => e.code === 'OUTPUT_NOT_FOUND');
  } finally {await registry?.chiudi(); await store.close();}
});
test('OUTPUT14-POLICY: a forbidden shell never admits a capture or executes', async t => {
  const f = fixture(t); let captured = 0;
  const events = [];
  await talosLavora({cartella: f.root, task: {consegna: 'Leggi.'}, modello: 'fixture', chiave: 'fixture',
    messaggiIniziali: [{role: 'system', content: 'Leggi.'}, {role: 'user', content: 'Leggi.'}],
    livelloAccesso: 'lettura', _giriMassimiInterno: 3, fetchDiRete: provider(f.command), onGiro: e => events.push(e),
    captureProcessFn: () => {captured++; throw Error('must not run');},
  });
  assert.equal(captured, 0); assert.equal(events.find(e => e.tipo === 'tool-esito').isError, true);
});
test('OUTPUT14-KERNEL-RETENTION-ERROR: real command success remains exit zero but its tool result reports retention failure', async t => {
  const f = fixture(t), store = await createProcessOutputStore({databasePath: join(f.root, 'out.sqlite'), maxOutputBytes: 1_000_000});
  const events = []; let captures = 0;
  try {
    await talosLavora({cartella: f.root, task: {consegna: 'Esegui.'}, modello: 'fixture', chiave: 'fixture',
      messaggiIniziali: [{role: 'system', content: 'Verifica.'}, {role: 'user', content: 'Esegui.'}],
      ambienteComandiFn: () => ({dove: 'windows', revisione: 0}), livelloAccesso: 'completo', _giriMassimiInterno: 3,
      fetchDiRete: provider(f.command), onGiro: e => events.push(e),
      captureProcessFn: (id, execute) => {captures++; return runWithProcessOutput({
        store: {...store, finish: async () => {throw Object.assign(Error('private path'), {code: 'OUTPUT_STORE_IO'});}},
        sessionId: 's14', runId: 'r14', ...id, emit() {},
      }, execute);},
    });
    const result = events.find(e => e.tipo === 'tool-esito');
    assert.equal(captures, 1); assert.equal(result.isError, true); assert.equal(result.exitCode, 0);
    assert.match(result.content, /already ran.*do not rerun/i); assert.doesNotMatch(result.content, /private path/);
  } finally {await store.close();}
});
