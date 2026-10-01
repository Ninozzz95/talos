import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {eseguiComando, eseguiComandoSandboxato} from '../src/kernel/talosHarness.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const helperUrl = new URL('../src/kernel/process-output-capture.mjs', import.meta.url);
const helper = await import(helperUrl.href).catch(e => {if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === helperUrl.href) return {}; throw e;});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t, size = 300_000, keepAlive = false) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-capture-'));
  t.after(() => {const child = relative(resolve(tmpdir()), resolve(root)); assert.ok(child && !child.startsWith('..') && !isAbsolute(child)); rimuoviCartellaDiProva(root);});
  const out = Buffer.from('START-OUTPUT13\n' + 'x'.repeat(size) + '\nEND-OUTPUT13\n'), err = Buffer.from([0, 0xff, 0xe2, 0x82, 0xac, 10]);
  writeFileSync(join(root, 'producer.cjs'), `const {once}=require('node:events');(async()=>{const out=Buffer.from('START-OUTPUT13\\n'+'x'.repeat(${size})+'\\nEND-OUTPUT13\\n');for(let i=0;i<out.length;i+=16384)if(!process.stdout.write(out.subarray(i,i+16384)))await once(process.stdout,'drain');process.stderr.write(Buffer.from([0,255,226,130,172,10]));${keepAlive ? 'setInterval(()=>{},1000);' : ''}})();`);
  return {root, out, err, command: `"${process.execPath}" producer.cjs`};
}
async function run(f, kind, options = {}) {
  return kind === 'direct'
    ? eseguiComando(process.execPath, ['producer.cjs'], {cwd: f.root, timeoutMs: 10_000, ...options})
    : eseguiComandoSandboxato(f.command, f.root, {dove: 'windows', ...options});
}
for (const kind of ['direct', 'windows']) test(`OUTPUT13-RUNNER-${kind}: raw output reaches the sink before truncation and the real tail remains visible`, async t => {
  const f = fixture(t), chunks = {stdout: [], stderr: []}; let active = 0, peak = 0;
  const result = await run(f, kind, {onBytes: async ({stream, bytes}) => {
    assert.ok(bytes.length > 0 && bytes.length <= 65_536); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); chunks[stream].push(Buffer.from(bytes)); active--;
  }});
  const actualOut = Buffer.concat(chunks.stdout);
  assert.equal(actualOut.length, f.out.length, 'all stdout bytes must reach the raw sink');
  assert.equal(hash(actualOut), hash(f.out));
  assert.deepEqual(Buffer.concat(chunks.stderr), f.err); assert.equal(peak, 1); assert.equal(active, 0);
  assert.equal(result.codice, 0); assert.equal(result.outputCapture.state, 'delivered');
  assert.equal(result.outputCapture.observedBytes, f.out.length + f.err.length);
  assert.equal(result.outputCapture.deliveredBytes, f.out.length + f.err.length);
  assert.match(kind === 'direct' ? result.fuori : result.testo, /END-OUTPUT13/);
  assert.ok(result.fuori.length < 161_000, 'capture mode must not buffer the entire result in the view');
});
for (const kind of ['direct', 'windows']) test(`OUTPUT13-FAILURE-${kind}: a failed sink is reported, drained and never retried`, async t => {
  const f = fixture(t); let calls = 0;
  const result = await run(f, kind, {onBytes: async () => {calls++; throw Object.assign(Error('private path must not leak'), {code: 'OUTPUT_DISK_FULL'});}});
  assert.equal(calls, 1); assert.equal(result.codice, 0, 'process status and retention failure are separate');
  assert.equal(result.outputCapture.state, 'failed'); assert.equal(result.outputCapture.errorCode, 'OUTPUT_DISK_FULL');
  assert.equal(result.outputCapture.deliveredBytes, 0); assert.equal(result.outputCapture.observedBytes, f.out.length + f.err.length);
  assert.doesNotMatch(JSON.stringify(result.outputCapture), /private path/);
  if (kind === 'windows') assert.match(result.testo, /already ran.*do not rerun/i);
});
test('OUTPUT13-DURABLE: a real Windows runner retains more than one MiB in the real SQLite store and reads it after reopen', async t => {
  const f = fixture(t, 1_200_000), databasePath = join(f.root, 'output.sqlite');
  let store = await createProcessOutputStore({databasePath, maxOutputBytes: 2_000_000});
  const id = {sessionId: 's13', runId: 'r13', toolCallId: 't13', outputId: randomUUID()};
  try {
    await store.begin(id); let sequence = 0;
    const result = await run(f, 'windows', {onBytes: ({stream, bytes}) => store.append({...id, sequence: sequence++, stream, bytes})});
    assert.equal(result.outputCapture.state, 'delivered');
    const manifest = await store.finish({...id, sequence, termination: 'exited', exitCode: result.codice});
    assert.equal(manifest.state, 'complete'); assert.equal(manifest.stdout.sha256, hash(f.out)); assert.equal(manifest.stderr.sha256, hash(f.err));
    await store.close(); store = await createProcessOutputStore({databasePath, maxOutputBytes: 2_000_000});
    const digest = createHash('sha256'); let offset = 0;
    do {const page = await store.readPage({...id, stream: 'stdout', offset}); digest.update(page.bytes); offset = page.nextOffset;} while (offset !== null);
    assert.equal(digest.digest('hex'), hash(f.out));
  } finally {await store.close();}
});
test('OUTPUT13-CWD-FOOTER: raw capture identifies the wrapper footer while the normal text view excludes it', async t => {
  const f = fixture(t, 100), chunks = [];
  const result = await run(f, 'windows', {tracciaCartella: true, onBytes: ({stream, bytes}) => {if (stream === 'stdout') chunks.push(Buffer.from(bytes));}});
  assert.equal(result.codice, 0); assert.equal(result.cartellaFinale, f.root);
  assert.equal(result.outputCapture.controlFooter.type, 'cwd-marker-v1');
  assert.match(Buffer.concat(chunks).toString(), new RegExp(result.outputCapture.controlFooter.marker));
  assert.ok(!result.testo.includes(result.outputCapture.controlFooter.marker));
});
test('OUTPUT13-WSL: selected real Bash output is captured before its four-thousand-character view', {skip: process.platform !== 'win32'}, async t => {
  const f = fixture(t, 1), digest = createHash('sha256'); let bytes = 0;
  const result = await eseguiComandoSandboxato('seq 1 300000', f.root, {dove: 'wsl2', onBytes: ({stream, bytes: chunk}) => {if (stream === 'stdout') {digest.update(chunk); bytes += chunk.length;}}});
  const expected = Buffer.from(Array.from({length: 300_000}, (_, i) => `${i + 1}\n`).join(''));
  assert.equal(result.codice, 0); assert.equal(result.enforcement, 'wsl2'); assert.equal(bytes, expected.length); assert.equal(digest.digest('hex'), hash(expected));
  assert.match(result.testo, /300000/); assert.ok(result.testo.length < 5000);
});
test('OUTPUT13-STOP: stopping a process preserves captured bytes and the cancelled process status', async t => {
  const f = fixture(t, 100, true), controller = new AbortController(); let received = 0;
  const result = await run(f, 'direct', {segnaleStop: controller.signal, onBytes: ({bytes}) => {received += bytes.length; controller.abort();}});
  assert.equal(result.fermatoSuRichiesta, true); assert.equal(result.codice, 130); assert.equal(result.outputCapture.state, 'delivered'); assert.ok(received > 0);
});
test('OUTPUT13-TIMEOUT: process timeout is distinct from capture failure', async t => {
  const f = fixture(t, 100, true);
  const result = await run(f, 'direct', {timeoutMs: 200, onBytes() {}});
  assert.equal(result.fermatoDalTempo, true); assert.equal(result.fermatoSuRichiesta, undefined); assert.equal(result.outputCapture.state, 'delivered');
});
test('OUTPUT13-SPAWN-ERROR: a missing executable settles capture without a dangling promise', async t => {
  const f = fixture(t, 0);
  const result = await eseguiComando(join(f.root, 'missing-executable'), [], {onBytes: () => assert.fail('no process output expected')});
  assert.equal(result.codice, -1); assert.equal(result.outputCapture.observedBytes, 0);
});
test('OUTPUT13-INVALID: invalid capture callback is refused before the command can write', async t => {
  const f = fixture(t, 0);
  await assert.rejects(eseguiComandoSandboxato('echo no', f.root, {dove: 'windows', onBytes: 1}), TypeError);
  assert.throws(() => eseguiComando(process.execPath, ['-e', 'process.exit(0)'], {onBytes: 1}), TypeError);
});
test('OUTPUT13-BACKPRESSURE: slow sink pauses the source and final settlement waits for its ACK', async () => {
  assert.equal(typeof helper.captureProcessOutput, 'function');
  const stdout = new PassThrough({highWaterMark: 65_536}), stderr = new PassThrough({highWaterMark: 65_536});
  let release; const gate = new Promise(resolve => {release = resolve;}); let calls = 0, finished = false;
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes: async () => {calls++; await gate;}});
  stdout.end(Buffer.alloc(65_536, 120)); stderr.end();
  capture.settled.then(() => {finished = true;});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(stdout.isPaused(), true); assert.equal(finished, false);
  release(); const result = await capture.settled;
  assert.equal(result.metadata.deliveredBytes, 65_536); assert.equal(finished, true);
});
test('OUTPUT13-UTF8: both captured previews use independent incremental decoders and preserve complete characters', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough(), texts = [];
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes() {}, onText: (stream, text) => texts.push({stream, text})});
  for (const b of Buffer.from('€🙂')) stdout.write(Buffer.from([b]));
  for (const b of Buffer.from('漢')) stderr.write(Buffer.from([b]));
  stdout.end(); stderr.end(); const result = await capture.settled;
  assert.equal(result.stdout.text, '€🙂'); assert.equal(result.stderr.text, '漢'); assert.ok(texts.every(p => p.text.isWellFormed()));
});
test('OUTPUT13-EMPTY: empty streams settle as delivered without inventing sink writes or output', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough();
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes: () => assert.fail('empty write')});
  stdout.end(); stderr.end(); const result = await capture.settled;
  assert.equal(result.stdout.text, ''); assert.equal(result.metadata.observedBytes, 0); assert.equal(result.metadata.state, 'delivered');
});
test('OUTPUT13-PREMATURE-CLOSE: a broken pipe is a failed capture even if some bytes were delivered', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough();
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes() {}});
  stdout.write('prefix'); stdout.destroy(); stderr.end();
  const result = await capture.settled; assert.equal(result.metadata.state, 'failed');
});
test('OUTPUT13-OVERSIZED-CHUNK: a single large input is split into bounded sink writes without changing its bytes', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough(), raw = Buffer.alloc(150_000, 171), chunks = [];
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes: ({bytes}) => {
    assert.ok(bytes.length <= 65_536); chunks.push(Buffer.from(bytes));
  }});
  stdout.end(raw); stderr.end(); const result = await capture.settled;
  assert.equal(result.metadata.state, 'delivered'); assert.equal(hash(Buffer.concat(chunks)), hash(raw));
});
test('OUTPUT13-PREVIEW-UNICODE: bounded views and final previews retain complete characters and the observed count', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough();
  const original = 'x🙂' + 'a'.repeat(100) + '🙂y';
  const capture = helper.captureProcessOutput({stdout, stderr}, {onBytes() {}, maxCodeUnits: 8});
  stdout.write(original.slice(0, 60)); stdout.end(original.slice(60)); stderr.end();
  const result = await capture.settled;
  assert.ok(result.stdout.text.isWellFormed()); assert.ok(result.stdout.text.startsWith('x'));
  assert.ok(result.stdout.text.endsWith('🙂y')); assert.ok(result.stdout.omittedCodeUnits >= original.length - 8);
  assert.equal(result.stdout.codeUnits, original.length);
  const text = 'x'.repeat(999) + '🙂' + 'a'.repeat(5000) + '🙂y';
  const formatted = helper.formatCapturedOutput(text, {state: 'delivered', combinedCodeUnits: 900_123});
  assert.ok(formatted.isWellFormed()); assert.match(formatted, /900123 UTF-16 code units observed/);
  assert.ok(formatted.endsWith('🙂y')); assert.ok(formatted.length < 4500);
});
test('OUTPUT13-OBSERVER: a broken text observer cannot interrupt raw capture', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough(), chunks = [];
  const capture = helper.captureProcessOutput({stdout, stderr}, {
    onBytes: ({bytes}) => chunks.push(Buffer.from(bytes)), onText() {throw Error('observer unavailable');},
  });
  stdout.end('real output'); stderr.end(); const result = await capture.settled;
  assert.equal(result.metadata.state, 'delivered'); assert.equal(Buffer.concat(chunks).toString(), 'real output');
});
