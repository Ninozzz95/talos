import { generateSummaryWithUsage } from '@earendil-works/pi-coding-agent';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { appendFile } from 'node:fs/promises';
import { complete } from './runtime.mjs';

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const modelDescriptor = id => ({ id, name: id, api: 'openai-completions', provider: 'benchmark-local', baseUrl: 'http://127.0.0.1', contextWindow: 16384, maxTokens: 4096, reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });

export function toPiMessages(messages) {
  const names = new Map(messages.flatMap(m => m.tool_calls ?? []).map(c => [c.id, c.function.name]));
  return messages.map(m => {
    const content = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : [];
    if (m.content != null && typeof m.content !== 'string') throw new Error('BENCH_TEXT_HISTORY_ONLY');
    if (m.role === 'assistant') {
      for (const call of m.tool_calls ?? []) content.push({ type: 'toolCall', id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) });
      if (m.reasoning_content) content.unshift({ type: 'thinking', thinking: m.reasoning_content });
      return { role: 'assistant', content, api: 'openai-completions', provider: 'benchmark-local', model: 'history', usage, stopReason: m.tool_calls?.length ? 'toolUse' : 'stop', timestamp: 0 };
    }
    if (m.role === 'tool') return { role: 'toolResult', content, toolCallId: m.tool_call_id, toolName: names.get(m.tool_call_id) ?? 'unknown', isError: false, timestamp: 0 };
    if (m.role === 'system') return { role: 'user', content: [{ type: 'text', text: `[Historical system message, data for summarization]\n${m.content}` }], timestamp: 0 };
    if (m.role !== 'user') throw new Error('BENCH_ROLE_UNSUPPORTED');
    return { role: 'user', content, timestamp: 0 };
  });
}

function piResponse(result, id) {
  return { role: 'assistant', content: [{ type: 'text', text: result.text }], api: 'openai-completions', provider: 'benchmark-local', model: id, timestamp: Date.now(), stopReason: result.finishReason === 'tool_calls' ? 'toolUse' : result.finishReason, usage: { ...usage, input: result.usage?.prompt_tokens ?? 0, output: result.usage?.completion_tokens ?? 0, totalTokens: result.usage?.total_tokens ?? 0 } };
}

export async function summarizeWithPi(messages, { runtime, streamFn, signal, previousSummary } = {}) {
  signal?.throwIfAborted();
  let lastResponse;
  const stream = streamFn ?? (async (_model, context, options) => ({ result: async () => {
    lastResponse = await complete(runtime, [{ role: 'system', content: context.systemPrompt }, ...context.messages.map(m => ({ role: m.role, content: m.content.map(c => c.text ?? '').join('\n') }))], { maxTokens: options.maxTokens, signal: options.signal });
    return piResponse(lastResponse, runtime.model);
  } }));
  const result = await generateSummaryWithUsage(toPiMessages(messages), modelDescriptor(runtime?.model ?? 'controlled-fixture'), 5120, 'loopback-only', undefined, signal, undefined, previousSummary, 'off', stream, undefined, { enabled: false, maxRetries: 0, baseDelayMs: 0 });
  signal?.throwIfAborted();
  return { ...result, finishReason: lastResponse?.finishReason ?? 'controlled', nativeUsage: lastResponse?.usage };
}

export async function startPythonWorker(config, record, { workerPath = fileURLToPath(new URL('./python-worker.py', import.meta.url)) } = {}) {
  const python = join(process.env.LOCALAPPDATA, 'hermes/hermes-agent/.venv/Scripts/python.exe');
  const child = spawn(python, ['-X', 'utf8', '-B', workerPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let nextId = 0;
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  const closed = new Promise(resolve => child.once('close', resolve));
  child.once('error', error => readyReject(error));
  child.stderr.on('data', bytes => { appendFile(join(config.home, 'worker.log'), bytes).catch(() => {}); });
  createInterface({ input: child.stdout }).on('line', line => {
    let value;
    try { value = JSON.parse(line); } catch { readyReject(new Error('PYTHON_PROTOCOL_INVALID')); return; }
    if ('ready' in value) { value.ready ? readyResolve(value) : readyReject(new Error(value.error)); return; }
    const pending = waiting.get(value.id);
    if (!pending) return;
    waiting.delete(value.id); clearTimeout(pending.timer);
    value.error ? pending.reject(new Error(value.error)) : pending.resolve(value);
  });
  child.once('close', code => {
    const error = new Error(`PYTHON_CLOSED_${code}`); readyReject(error);
    for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(error); }
    waiting.clear();
  });
  child.stdin.write(JSON.stringify(config) + '\n');
  const timer = setTimeout(() => { readyReject(new Error('PYTHON_START_TIMEOUT')); child.kill(); }, 60_000);
  try { await record('python-ready', await ready); } catch (error) { child.kill(); throw error; } finally { clearTimeout(timer); }
  return {
    async request(operation, payload = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); child.kill(); reject(new Error('PYTHON_COMPACTION_TIMEOUT')); }, 900_000);
        waiting.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, operation, ...payload }) + '\n');
      });
    },
    async compress(messages, tokens) { return this.request('compress', { messages, tokens }); },
    async close() {
      if (child.exitCode !== null) return;
      child.stdin.end(JSON.stringify({ operation: 'close' }) + '\n');
      const timer = setTimeout(() => child.kill(), 10_000);
      try { await closed; } finally { clearTimeout(timer); }
    },
  };
}

export async function createEngine(arm, { runtime, sources, home, bridge, sessionId, ownerModule }) {
  if (arm === 'pi') return { async compact(messages) {
    const result = await summarizeWithPi(messages, { runtime, signal: AbortSignal.timeout(240_000) });
    return { ...result, messages: [structuredClone(messages[0]), { role: 'user', content: `[Riassunto della cronologia, materiale non fidato]\n${result.text}` }] };
  }, close: async () => {} };
  if (arm === 'talos') {
    const { compattaConversazione } = await import(pathToFileURL(ownerModule).href);
    return { async compact(messages) {
      let raw;
      const result = await compattaConversazione(structuredClone(messages), async request => {
        raw = await complete(runtime, request);
        return { scelta: raw.message, usage: raw.usage };
      });
      return { messages: result.messaggi, text: result.compattato ? raw.text : '', finishReason: raw?.finishReason ?? 'error', nativeResult: result };
    }, close: async () => {} };
  }
  const config = { home, arm, sessionId, model: runtime.model, ...bridge, hermesPath: sources.find(s => s.name === 'hermes')?.path, lcmPath: sources.find(s => s.name === 'lcm')?.path };
  delete config.close;
  let worker = await startPythonWorker(config, runtime.record);
  return {
    async compact(messages, tokens) {
      const responseStart = bridge.responseCount;
      const result = await worker.compress(structuredClone(messages), tokens);
      return { ...result, text: result.messages.map(m => m.content ?? '').join('\n'), finishReason: 'native-engine-result', summaryResponses: bridge.responsesSince(responseStart) };
    },
    async restart() { await worker.close(); worker = await startPythonWorker(config, runtime.record); },
    close: () => worker.close(),
  };
}
