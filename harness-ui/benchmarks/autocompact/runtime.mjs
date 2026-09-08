import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLlamaServerSupervisor } from '../../src/llama-server-supervisor.mjs';
import { fixtureTools } from './cases.mjs';

export function createRecorder(root) {
  let pending = Promise.resolve();
  let seq = 0;
  return async (kind, value) => {
    const event = { seq: ++seq, at: new Date().toISOString(), kind, ...value };
    pending = pending.then(() => appendFile(join(root, 'requests.jsonl'), JSON.stringify(event) + '\n'));
    await pending;
    return event;
  };
}

export async function recordedRequest(supervisor, record, model, path, body, signal) {
  if (!['/v1/chat/completions', '/v1/chat/completions/input_tokens', '/apply-template', '/tokenize', '/props', '/metrics'].includes(path)) throw new Error('ENDPOINT_NOT_ALLOWED');
  const started = performance.now();
  await record('request', { model, path, body: body ?? null });
  let response, text;
  try {
    response = await supervisor.request(path, body === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    text = await response.text();
  } catch (error) { await record('transport-error', { model, path, elapsedMs: performance.now() - started, error: error.message }); throw error; }
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  await record('response', { model, path, status: response.status, elapsedMs: performance.now() - started, payload, processMemory: process.memoryUsage() });
  if (!response.ok) { const error = new Error(`HTTP_${response.status}: ${text}`); error.status = response.status; error.payload = payload; throw error; }
  return payload;
}

export async function startRuntime({ repo, root, manifest, record }) {
  // Refuse to compete with an owner's loaded runtime. The owner can unload it
  // through the app; this benchmark never kills or reconfigures that process.
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process -Filter "Name = \'llama-server.exe\'" | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'], { windowsHide: true });
  if (stdout.trim()) throw new Error(`EXTERNAL_RUNTIME_ACTIVE: ${stdout.trim()}`);
  const binaryPath = join(repo, 'harness-ui/.local-runtime/b10517-vulkan/llama-server.exe');
  const supervisor = createLlamaServerSupervisor({ binaryPath, gpuLayers: 99, healthTimeoutMs: 180_000 });
  const modelPath = resolve(repo, 'harness-ui/.local-models', manifest.path, manifest.files[0].path);
  supervisor.subscribeLogs(({ stream, text }) => { appendFile(join(root, 'runtime.log'), `${stream}: ${text}`).catch(() => {}); });
  const status = await supervisor.start({ modelId: manifest.id, modelPath, contextLength: 16384 });
  const runtime = {
    model: manifest.id, supervisor, status, record,
    async request(path, body, signal) {
      return recordedRequest(supervisor, record, manifest.id, path, body, signal);
    },
    async stop() { await supervisor.stop(); },
  };
  try {
  const props = await runtime.request('/props', undefined, AbortSignal.timeout(30_000));
  if (props.default_generation_settings?.n_ctx !== 16384) {
    await runtime.stop();
    throw new Error('CONTEXT_MISMATCH');
  }
  await record('runtime', { model: manifest.id, modelPath, status, props, manifest, context: 16384, gpuLayers: 99 });
  return runtime;
  } catch (error) { await runtime.stop(); throw error; }
}

export async function countRequest(runtime, body) {
  try {
    const result = await runtime.request('/v1/chat/completions/input_tokens', { ...body, stream: false }, AbortSignal.timeout(30_000));
    if (!Number.isInteger(result.input_tokens) || result.input_tokens < 0) throw new Error('INVALID_INPUT_TOKENS');
    return { tokens: result.input_tokens, method: 'runtime-input-tokens', exact: true };
  } catch (error) {
    // A missing endpoint is an observed capability gap, never labelled exact.
    if (![404, 405, 501].includes(error.status)) throw error;
    return { tokens: Math.ceil(JSON.stringify(body).length / 4), method: 'json-chars/4', exact: false, reason: error.message };
  }
}

export async function complete(runtime, messages, { tools, maxTokens = 4096, signal } = {}) {
  const body = { model: runtime.model, messages, stream: false, temperature: 0, seed: 193, max_tokens: maxTokens, ...(tools ? { tools } : {}) };
  const counted = await countRequest(runtime, body);
  const result = await runtime.request('/v1/chat/completions', body, signal ?? AbortSignal.timeout(240_000));
  const choice = result.choices?.[0];
  if (!choice?.message) throw new Error('COMPLETION_MESSAGE_MISSING');
  return { text: choice.message.content ?? '', message: choice.message, finishReason: choice.finish_reason, usage: result.usage, counted, timings: result.timings };
}

export async function runReadOnlyTurn(runtime, messages, fixtureDir, signal) {
  const fixture = fixtureTools(fixtureDir);
  const history = structuredClone(messages);
  const executed = [];
  for (let step = 0; step < 4; step++) {
    signal?.throwIfAborted();
    const result = await complete(runtime, history, { tools: [fixture.schema] });
    signal?.throwIfAborted();
    history.push(result.message);
    const calls = result.message.tool_calls ?? [];
    if (!calls.length) return { ...result, executed, history };
    if (calls.length > 3) throw new Error('BENCH_TOOL_BATCH_LIMIT');
    for (const call of calls) {
      if (call.type !== 'function' || call.function?.name !== 'leggi') throw new Error('BENCH_TOOL_NOT_ALLOWED');
      const args = JSON.parse(call.function.arguments);
      const content = await fixture.read(args);
      executed.push({ id: call.id, name: call.function.name, args, content });
      await runtime.record('tool', executed.at(-1));
      history.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }
  throw new Error('BENCH_TOOL_LOOP_LIMIT');
}

// The Python upstream receives only this single-purpose loopback bridge. Its
// own socket policy also rejects any external destination. No owner API key.
export async function createLoopbackBridge(runtime) {
  const token = randomUUID();
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(); return; }
      if (req.url === '/v1/models' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: runtime.model, object: 'model' }] })); return; }
      if (req.url !== '/v1/chat/completions' || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 4_000_000) throw new Error('BENCH_REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const upstreamBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await runtime.record('upstream-request', { model: runtime.model, body: upstreamBody });
      const body = { ...upstreamBody, temperature: 0, seed: 193, max_tokens: 4096, stream: false };
      delete body.max_completion_tokens;
      if (body.model !== runtime.model) throw new Error('BENCH_MODEL_MISMATCH');
      if (upstreamBody.stream) throw new Error('BENCH_STREAM_NOT_SUPPORTED');
      const counted = await countRequest(runtime, body);
      await runtime.record('budget', { model: runtime.model, counted, context: 16384, responseReserve: body.max_tokens ?? body.max_completion_tokens ?? null, reserveExplicit: body.max_tokens != null || body.max_completion_tokens != null });
      const result = await runtime.request('/v1/chat/completions', body, AbortSignal.timeout(240_000));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(error.status ?? 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(error.payload ?? { error: { message: error.message } }));
    }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, token, close: () => new Promise(resolveClose => server.close(resolveClose)) };
}
