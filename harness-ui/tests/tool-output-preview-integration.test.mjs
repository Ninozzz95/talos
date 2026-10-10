import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {eseguiComandoDiretto} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const original = 'x'.repeat(39_999) + '🙂' + 'TAIL';
const expected = 'x'.repeat(39_999);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-preview-'));
  t.after(() => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rimuoviCartellaDiProva(root);
  });
  return root;
}
test('OUTPUT11-USER-UNICODE: the real user command service never emits half an emoji at its live limit', async t => {
  const events = [];
  await eseguiComandoDiretto({cartella: fixture(t), comando: 'fixture', onEvento: e => events.push(e),
    eseguiComandoSandboxatoFn: async (_comando, _cartella, {onPezzo}) => {
      onPezzo({flusso: 'fuori', testo: original});
      onPezzo({flusso: 'errori', testo: 'later'});
      return {codice: 0, testo: 'final independent result', enforcement: 'none'};
    },
  });
  const deltas = events.filter(e => e.type === 'ToolCallOutput');
  assert.ok(deltas.every(e => e.delta.isWellFormed()), 'live delta must be valid Unicode');
  assert.equal(deltas.map(e => e.delta).join(''), expected);
  assert.match(events.find(e => e.type === 'ToolCallResult').content, /final independent result/);
});
test('OUTPUT11-KERNEL-UNICODE: the real shell tool bounds its live deltas without splitting Unicode', async t => {
  const root = fixture(t), events = [], requests = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
  const mocked = t.mock.method(childProcess, 'spawn', () => {
    queueMicrotask(() => {child.stdout.emit('data', Buffer.from(original)); child.stdout.emit('end'); child.stderr.emit('end'); child.emit('close', 0);});
    return child;
  });
  syncBuiltinESMExports();
  try {
    await talosLavora({cartella: root, task: {consegna: 'Esegui la verifica richiesta.'}, modello: 'fixture/preview', chiave: 'fixture',
      messaggiIniziali: [{role: 'system', content: 'Verifica.'}, {role: 'user', content: 'Esegui la verifica richiesta.'}],
      livelloAccesso: 'scrittura-progetto', _giriMassimiInterno: 3, ambienteComandiFn: () => ({dove: 'windows', revisione: 0}),
      fetchDiRete: async (_url, init) => {
        requests.push(JSON.parse(init.body));
        const message = requests.length === 1
          ? {role: 'assistant', content: '', tool_calls: [{id: 'preview-tool-11', type: 'function', function: {name: 'shell', arguments: JSON.stringify({comando: 'echo fixture'})}}]}
          : {role: 'assistant', content: 'Verificato.'};
        return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
      }, onGiro: e => events.push(e),
    });
  } finally {mocked.mock.restore(); syncBuiltinESMExports();}
  const deltas = events.filter(e => e.tipo === 'tool-uscita');
  assert.ok(deltas.length > 0, 'the actual shell path must have run');
  assert.ok(deltas.every(e => e.delta.isWellFormed()), 'kernel must not reintroduce malformed Unicode');
  assert.equal(deltas.map(e => e.delta).join(''), expected);
  assert.ok(deltas.every(e => e.toolCallId === 'preview-tool-11'));
  assert.equal(events.find(e => e.tipo === 'tool-esito').isError, false);
  assert.ok(requests[1].messages.some(m => m.role === 'tool' && String(m.content).includes('TAIL')), 'the final tool result remains independent of the live prefix');
});
test('OUTPUT11-REAL-PROCESS: Node output through the real runner and service stays well formed', async t => {
  const root = fixture(t), events = [];
  writeFileSync(join(root, 'preview-producer.cjs'), `process.stdout.write(${JSON.stringify(original)});`);
  const result = await eseguiComandoDiretto({cartella: root, comando: `"${process.execPath}" preview-producer.cjs`, dove: 'windows', onEvento: e => events.push(e)});
  assert.equal(result.codice, 0);
  const deltas = events.filter(e => e.type === 'ToolCallOutput');
  assert.ok(deltas.every(e => e.delta.isWellFormed()));
  assert.equal(deltas.map(e => e.delta).join(''), expected);
  assert.match(events.find(e => e.type === 'ToolCallResult').content, /TAIL/);
});
