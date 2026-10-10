import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ALIAS_PERCORSO, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';

const windows = {skip: process.platform !== 'win32'};
const marker = 'NAMESPACE35_SHADOW_ORIGINAL';
async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'talos-namespace35-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  const path = join(root, 'shadow.txt');
  await fs.writeFile(path, marker);
  const ambiguous = path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/');
  assert.equal(resolve(root, ambiguous), path, 'Node Windows resolves POSIX-looking input to this real Windows shadow');
  return {root, path, ambiguous};
}

async function run(t, calls, {stream = false} = {}) {
  const f = await fixture(t), events = [], requests = [], hooks = [];
  let approvals = 0, turn = 0;
  const toolCalls = calls(f).map((c, i) => ({id: `ns-${i}`, type: 'function', function: {
    name: c.name, arguments: JSON.stringify(c.args),
  }}));
  const original = {}, io = [];
  // Instrument the real Node boundary, including speculative reads. Only owned fixture paths count.
  for (const name of ['open', 'readFile', 'readdir', 'writeFile']) {
    original[name] = fs[name];
    fs[name] = async (...args) => {
      if (typeof args[0] === 'string') {
        const target = resolve(args[0]);
        if (target === f.root || target.startsWith(f.root + '\\')) io.push({name, path: target});
      }
      return original[name](...args);
    };
  }
  syncBuiltinESMExports();
  try {
    await talosLavora({
      cartella: f.root, task: {consegna: 'Check the requested file operation.'}, modello: 'fixture', chiave: 'fixture',
      livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => { approvals++; return true; },
      hookFn: async e => { hooks.push(e); }, onGiro: e => events.push(e),
      ...(stream ? {onDelta: () => {}} : {}),
      fetchDiRete: async (_url, input) => {
        requests.push(JSON.parse(input.body));
        const first = turn++ === 0;
        if (!stream) return {ok: true, status: 200, json: async () => ({choices: [{message: first
          ? {role: 'assistant', content: null, tool_calls: toolCalls}
          : {role: 'assistant', content: 'Done.'}}], usage: {prompt_tokens: 10, completion_tokens: 5}})};
        const packets = first ? toolCalls.map((c, index) => ({choices: [{delta: {tool_calls: [{...c, index}]}}]}))
          : [{choices: [{delta: {content: 'Done.'}, finish_reason: 'stop'}]}];
        return new Response(new ReadableStream({async start(controller) {
          for (const packet of packets) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(packet)}\n\n`));
            await new Promise(resolve => setImmediate(resolve));
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close();
        }}), {headers: {'content-type': 'text/event-stream'}});
      },
    });
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    for (const name of Object.keys(original)) fs[name] = original[name];
    syncBuiltinESMExports();
  }
  return {...f, events, requests, hooks, approvals, io, toolCalls};
}

function refused(r, id = 'ns-0') {
  const result = r.events.filter(e => e.tipo === 'tool-esito' && e.toolCallId === id);
  assert.equal(result.length, 1);
  assert.equal(result[0].isError, true);
  assert.match(result[0].content, /^REFUSED\. FILE_NAMESPACE_MISMATCH:/);
  assert.match(result[0].content, /Windows.*WSL/s);
  assert.doesNotMatch(result[0].content, /NAMESPACE35_SHADOW_ORIGINAL/);
  const response = r.requests[1].messages.filter(m => m.tool_call_id === id);
  assert.equal(response.length, 1);
  assert.equal(response[0].content, result[0].content);
  assert.ok(!r.events.some(e => e.tipo === 'ricevuta' && e.ricevuta?.status === 'succeeded'));
}

const scenarios = [
  ['SHADOW-READ', 'leggi', {}], ['STREAM', 'leggi', {}, true], ['ELENCA', 'elenca', {}],
  ['WRITE', 'scrivi', {contenuto: 'CHANGED', modalita: 'nuovo'}],
  ['APPEND', 'scrivi', {contenuto: 'CHANGED', modalita: 'accoda'}],
  ['EDIT', 'file_edit', {old_string: marker, new_string: 'CHANGED'}],
];
for (const [id, name, extra, stream = false] of scenarios) {
  test(`NAMESPACE35-${id} — ambiguous path never reaches file I/O or pre-hook`, windows, async t => {
    const r = await run(t, f => [{name, args: {...extra, percorso: name === 'elenca'
      ? f.ambiguous.slice(0, f.ambiguous.lastIndexOf('/')) : f.ambiguous}}], {stream});
    assert.deepEqual(r.io, [], 'even a prefetched read must not open the Windows shadow');
    assert.equal(r.hooks.filter(e => e.tipo === 'pre_tool_call').length, 0);
    assert.equal(r.approvals, 0);
    refused(r);
    assert.equal(await fs.readFile(r.path, 'utf8'), marker);
    assert.equal(r.hooks.filter(e => e.tipo === 'post_tool_call').length, 1, 'post-hook is still a refusal notification');
  });
}

for (const alias of ALIAS_PERCORSO) {
  test(`NAMESPACE35-ALIAS-${alias} — canonical and accepted aliases cannot bypass refusal`, windows, async t => {
    const r = await run(t, f => [{name: 'leggi', args: {[alias]: f.ambiguous}}]);
    assert.deepEqual(r.io, []); refused(r);
  });
}

for (const type of ['RELATIVE', 'DRIVE']) {
  test(`NAMESPACE35-${type} — explicit Windows identity retains exact file bytes`, windows, async t => {
    const r = await run(t, f => [{name: 'leggi', args: {percorso: type === 'RELATIVE' ? 'shadow.txt' : f.path}}]);
    const result = r.events.find(e => e.tipo === 'tool-esito' && e.toolCallId === 'ns-0');
    assert.equal(result.isError, false); assert.match(result.content, /NAMESPACE35_SHADOW_ORIGINAL/);
    assert.ok(r.io.some(x => x.name === 'open'));
  });
}

test('NAMESPACE35-BATCH — ambiguous prefix read cannot speculate while valid sibling still runs', windows, async t => {
  const r = await run(t, f => [{name: 'leggi', args: {path: f.ambiguous}}, {name: 'leggi', args: {percorso: 'shadow.txt'}}]);
  refused(r);
  /* C25 (10/10/2026): a full read now also opens the file once more for its sha256 fingerprint. The two paths resolve to the SAME
     file, so the guarantee is measured by difference: the batch opens exactly as often as the valid read ALONE — any speculative
     open of the ambiguous path would add one. */
  const solo = await run(t, () => [{name: 'leggi', args: {percorso: 'shadow.txt'}}]);
  const apertureDellaSola = solo.io.filter(e => e.name === 'open').length;
  assert.ok(apertureDellaSola >= 1, 'premise: the valid read alone opens the file');
  assert.equal(r.io.filter(e => e.name === 'open').length, apertureDellaSola, 'only the explicit relative read opens the file');
  const valid = r.events.find(e => e.tipo === 'tool-esito' && e.toolCallId === 'ns-1');
  assert.equal(valid.isError, false); assert.match(valid.content, /NAMESPACE35_SHADOW_ORIGINAL/);
});

test('NAMESPACE35-CLASSIFIER — host grammar, not inferred guest or model-selected namespace', async () => {
  const {motivoNamespacePercorso} = await import('../src/kernel/file-namespace-contract.mjs');
  for (const path of ['/tmp/file', '/', '/mnt/c/project', '/tmp/a\nb']) {
    assert.match(motivoNamespacePercorso(path, {platform: 'win32'}), /^FILE_NAMESPACE_MISMATCH:/);
    for (const platform of ['linux', 'darwin']) assert.equal(motivoNamespacePercorso(path, {platform}), null);
  }
  for (const path of ['src/file', './file', '../file', 'C:/tmp/file', 'C:\\tmp\\file', '\\tmp\\file',
    '\\\\wsl.localhost\\Ubuntu\\tmp\\file', '//server/share/file', '/\\server/share/file', '', null, 1]) {
    assert.equal(motivoNamespacePercorso(path, {platform: 'win32'}), null);
  }
});
