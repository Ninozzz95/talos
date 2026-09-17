/** Simulated model over real loopback HTTP; real TALOS kernel, files and tool processes. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { createLlamaServerSupervisor } from '../../src/llama-server-supervisor.mjs';
import { createLocalKernelRunner } from '../../src/local-kernel-session.mjs';
import { createOwnerRuntimeAdapter } from '../../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../../src/agent-service.mjs';
import { createSessionRegistry } from '../../src/session-registry.mjs';
import { registraRiga } from '../../src/session-store.mjs';

export const MODEL_ID = 'fixture-model';
export const FIXED_SOURCE = 'export const sum = (a, b) => a + b;\n';
export const CAPS = { chat_template: 'fixture-native', chat_template_caps: { supports_tools: true, supports_tool_calls: true, supports_system_role: true } };
export const packet = (delta, finish_reason = null) => ({ choices: [{ index: 0, delta, finish_reason }] });
export const textFrames = text => [packet({ content: text }), packet({}, 'stop'), '[DONE]'];
export function toolFrames(name, args, id = 'fixture-call', fragmentChars = 7) {
  const json = typeof args === 'string' ? args : JSON.stringify(args);
  const frames = [packet({ tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: '' } }] })];
  for (let i = 0; i < json.length; i += fragmentChars) frames.push(packet({ tool_calls: [{ index: 0, function: { arguments: json.slice(i, i + fragmentChars) } }] }));
  return [...frames, packet({}, 'tool_calls'), '[DONE]'];
}
export function editScenario(body) {
  const results = body.messages.filter(m => m.role === 'tool');
  if (results.length === 0) return toolFrames('leggi', { percorso: 'sum.mjs' }, 'read-1');
  if (results.length === 1) {
    assert.match(results[0].content, /a - b/u);
    return toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }, 'write-1');
  }
  if (results.length === 2) return toolFrames('prova', {}, 'test-1');
  assert.match(results[2].content, /(?:pass|✔|ok 1)/u);
  return textFrames('Correzione verificata dal test del progetto.');
}

export async function createKernelFixture({ scenario = editScenario, props = CAPS, enabled = true, legacy = false, rawResponse = null, lineEnding = '\n', production = null } = {}) {
  const impl = production ?? { createLlamaServerSupervisor, createOwnerRuntimeAdapter, avviaSessione, createSessionRegistry, registraRiga };
  const kernelPath = production?.kernelPath ?? fileURLToPath(new URL('../../src/kernel/talosHarness.desktop-hotfix.mjs', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'talos-local-kernel-'));
  const root = join(temporary, 'workspace');
  await mkdir(root);
  await writeFile(join(root, 'sum.mjs'), 'export const sum = (a, b) => a - b;\n');
  await writeFile(join(root, 'sum.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\ntest('sum is correct', () => assert.equal(sum(2, 3), 5));\n");
  // node:test exports NODE_TEST_CONTEXT to children. A real verification subprocess
  // must not interpret it as a recursive test-runner request and silently skip tests.
  await writeFile(join(root, 'verify-runner.mjs'), `import { spawnSync } from 'node:child_process';
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, ['--test', 'sum.test.mjs'], { env, encoding: 'utf8' });
process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
if (r.error) throw r.error; process.exitCode = r.status ?? 1;
`);
  await writeFile(join(root, 'model.gguf'), 'not a model; inference is simulated');
  const requests = [], errors = [], events = [], observations = [];
  let auth = null;
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${auth}`) { res.writeHead(401); res.end('bad auth'); return; }
      if (req.url === '/health') { res.writeHead(200); res.end('{}'); return; }
      if (req.url === '/props') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(props)); return; }
      assert.equal(req.url, '/v1/chat/completions');
      let data = '';
      for await (const chunk of req) data += chunk;
      const body = JSON.parse(data);
      requests.push(body);
      observations.push({ type: 'request', at: performance.now(), number: requests.length });
      assert.equal(body.model, MODEL_ID);
      if (rawResponse) { await rawResponse({ req, res, body }); return; }
      const frames = scenario(body, requests.length);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const frame of frames) res.write(`data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}${lineEnding}${lineEnding}`);
      res.end();
    } catch (error) {
      errors.push(error);
      if (!res.headersSent) res.writeHead(500);
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const children = [];
  const supervisor = impl.createLlamaServerSupervisor({
    binaryPath: process.execPath, portAllocator: async () => port,
    sondaBinario: () => null,
    spawnImpl: (_file, args) => {
      auth = args[args.indexOf('--api-key') + 1];
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { child.emit('close', 0); return true; };
      children.push(child); return child;
    },
  });
  await supervisor.start({ modelId: MODEL_ID, modelPath: join(root, 'model.gguf') });
  const owner = impl.createOwnerRuntimeAdapter({
    modulePath: kernelPath,
    destinazioneModelloDeps: {
      leggiChiave: () => null, leggiRuntime: () => ({}),
      localePronto: () => supervisor.status().state === 'ready',
      chiamaLocale: (path, init) => supervisor.request(path, init),
    },
  });
  const diskWrites = new Set();
  const drainWrites = async () => {
    await new Promise(resolve => setImmediate(resolve));
    while (diskWrites.size) await Promise.all([...diskWrites]);
  };
  const results = [];
  const runSession = async input => {
    const result = await impl.avviaSessione({ ...input, talosLavoraFn: request => owner.talosLavora(request) });
    results.push(result); return result;
  };
  const local = createLocalKernelRunner({ getSupervisor: () => supervisor, runSession });
  const registry = impl.createSessionRegistry({
    modello: 'never-contact-cloud', chiave: legacy ? 'fixture-only-never-sent' : undefined,
    guardaWorkspaceFn: () => () => {},
    cartellaStore: join(temporary, 'session-store'),
    registraRigaFn: input => {
      const promise = impl.registraRiga(input);
      diskWrites.add(promise);
      void promise.finally(() => diskWrites.delete(promise)).catch(() => {});
      return promise;
    },
    preparaEsecuzioneFn: taskId => ({ cartella: root, comandoProva: `"${process.execPath}" verify-runner.mjs`, task: { id: taskId, consegna: 'Leggi sum.mjs, correggi sum, esegui prova e riporta l’esito.' } }),
    localRuntimes: { 'llama.cpp': { async *generateStream() { yield { type: 'text', value: 'legacy route' }; yield { type: 'done' }; } } },
    avviaSessioneFn: runSession,
    avviaSessioneLocaleFn: enabled ? local : null,
  });
  let currentId;
  return {
    root, registry, supervisor, children, requests, results, errors, events, observations,
    start({ approve = true, onEvent = null, ...options } = {}) {
      const result = registry.avvia('fixture-task', legacy
        ? { modelloScelto: `local:${MODEL_ID}`, permessiScelto: 'On request', ...options }
        : { provider: 'local', runtimeId: 'llama.cpp', modelId: MODEL_ID, permessiScelto: 'On request', ...options });
      assert.ok(result.sessionId, JSON.stringify(result));
      currentId = result.sessionId;
      registry.iscriviti(currentId, event => {
        events.push(event);
        observations.push({ type: event.type, at: performance.now(), toolCallId: event.toolCallId });
        onEvent?.(event, currentId);
        if (event.type === 'ApprovalRequested' && approve !== null) queueMicrotask(() => registry.rispondiApprovazione(currentId, event.requestId, approve));
      });
      return currentId;
    },
    async finished(timeout = 10000) {
      const deadline = performance.now() + timeout;
      while (!registry.elenca().find(x => x.sessionId === currentId)?.conclusa && performance.now() < deadline) await delay(5);
      assert.ok(registry.elenca().find(x => x.sessionId === currentId)?.conclusa, 'session did not terminate');
      await drainWrites();
      assert.deepEqual(errors, []);
      return registry.esporta(currentId);
    },
    source: () => readFile(join(root, 'sum.mjs'), 'utf8'),
    async close() {
      if (currentId) registry.ferma(currentId);
      await supervisor.stop(); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await drainWrites();
      await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}
