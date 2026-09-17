// Explicit native-Windows CI entry, not in the ordinary tests/*.test.mjs glob.
// Missing binaries or the wrong platform FAIL rather than skipping execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createEvolutionDevAdapter } from '../../../src/evolution-dev-adapter.mjs';
import { Kind, Status, encodeDevFrame, createDevDecoder } from '../../../src/evolution-dev/codec.mjs';
const crate = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64');
const directory = path.join(crate, 'target/dev-adapter/debug');
const supervisorPath = path.join(directory, 'talos-supervisor-prototype.exe');
const worker = path.join(directory, 'talos-extension-worker.exe');
const hash = async p => createHash('sha256').update(await fs.readFile(p)).digest('hex');
const supervisorSha256 = await hash(supervisorPath), workerSha256 = await hash(worker);
const config = { enabled: true, supervisorPath, supervisorSha256, workerSha256 };
const code = expected => error => error.code === expected;
const events = [];

test('real Node -> Supervisor -> AppContainer -> Wasm computes the authorized snapshot', { timeout: 45_000 }, async () => {
  const a = createEvolutionDevAdapter(config);
  const out = await a.invoke();
  assert.equal(out.actualWasmResult, 4275); assert.equal(out.brokerBytesReleased, 49);
  assert.equal(out.workerTerminated, true); assert.equal(out.cleanupComplete, true);
  assert.equal(out.supervisorClosed, true); assert.equal(out.productReady, false);
  events.push({ test: 'real-computation', ...out }); a.dispose();
});
test('real adapter cancels after authenticated worker connection before data admission', { timeout: 45_000 }, async () => {
  const a = createEvolutionDevAdapter(config), c = new AbortController(); let connected = false;
  await assert.rejects(a.invoke({ signal: c.signal, onReady(state) {
    assert.equal(state.phase, 'worker-connected'); connected = true; c.abort();
  } }), error => {
    assert.equal(error.code, 'CANCELLED'); assert.equal(error.details.workerTerminated, true);
    assert.equal(error.details.cleanupComplete, true); assert.equal(error.details.brokerBytesReleased, 0);
    assert.equal(error.details.supervisorClosed, true); events.push({ test: 'real-cancellation', code: error.code, ...error.details }); return true;
  });
  assert.equal(connected, true);
  const fresh = await a.invoke(); assert.equal(fresh.actualWasmResult, 4275); a.dispose();
});
test('disposal propagates cancellation and prevents reuse', { timeout: 45_000 }, async () => {
  const a = createEvolutionDevAdapter(config);
  await assert.rejects(a.invoke({ onReady: () => a.dispose() }), e => {
    assert.equal(e.code, 'CANCELLED'); assert.equal(e.details.cleanupComplete, true); return true;
  });
  await assert.rejects(a.invoke(), code('ADAPTER_DISPOSED'));
});
test('only one invocation per adapter may be in flight', { timeout: 45_000 }, async () => {
  const a = createEvolutionDevAdapter(config); const first = a.invoke();
  await assert.rejects(a.invoke(), code('ADAPTER_BUSY')); await first; a.dispose();
});
test('wrong reviewed hash fails before launch', async () => {
  const a = createEvolutionDevAdapter({ ...config, supervisorSha256: '00'.repeat(32) });
  await assert.rejects(a.invoke(), code('BINARY_HASH_MISMATCH'));
  const b = createEvolutionDevAdapter({ ...config, workerSha256: '00'.repeat(32) });
  await assert.rejects(b.invoke(), code('BINARY_HASH_MISMATCH')); a.dispose(); b.dispose();
});
test('default binary does not expose development controller entry', { timeout: 10_000 }, async () => {
  const executable = path.join(crate, 'target/debug/talos-supervisor-prototype.exe');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--dev-stdio', workerSha256], { shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('default CLI did not reject')); }, 5000);
    child.once('error', reject); child.once('close', exit => { clearTimeout(timer); try { assert.notEqual(exit, 0); resolve(); } catch (e) { reject(e); } });
  });
});
test('controller EOF at READY cancels the real worker, never reports success', { timeout: 45_000 }, async () => {
  await new Promise((resolve, reject) => {
    const child = spawn(supervisorPath, ['--dev-stdio', workerSha256], { shell: false, windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: process.env.LOCALAPPDATA, TEMP: process.env.TEMP, TMP: process.env.TMP },
      stdio: ['pipe', 'pipe', 'pipe'] });
    let final; const id = Buffer.alloc(16, 6);
    const timer = setTimeout(() => { child.kill(); reject(new Error('EOF cleanup timed out')); }, 30_000);
    const decoder = createDevDecoder(frame => {
      assert.deepEqual(frame.invocationId, id);
      if (frame.kind === Kind.READY) child.stdin.end();
      else { assert.equal(frame.kind, Kind.FINISHED); final = frame; }
    });
    child.stdout.on('data', data => { try { decoder.push(data); } catch (e) { child.kill(); reject(e); } });
    child.stderr.resume(); child.stdin.on('error', () => {}); child.once('error', reject);
    child.once('close', exit => {
      clearTimeout(timer);
      try { decoder.finish(); assert.equal(exit, 0); assert.equal(final.status, Status.FAILED);
        assert.equal(final.workerTerminated, true); assert.equal(final.cleanupComplete, true);
        assert.equal(final.bytesReleased, 0); events.push({ test: 'controller-eof', status: final.status, cleanupComplete: true }); resolve(); }
      catch (e) { reject(e); }
    });
    child.stdin.write(encodeDevFrame({ version: 1, invocationId: id, kind: Kind.RUN }));
  });
});
test.after(async () => {
  await fs.mkdir(path.join(crate, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(crate, 'evidence/dev-adapter-receipts.json'), JSON.stringify({
    schema: 'talos.development-adapter.observations.v1', supervisorSha256, workerSha256,
    node: process.version, platform: process.platform, architecture: process.arch, events,
    fullContainmentVerified: false, installedAppVerified: false, productReady: false,
  }, null, 2));
});
