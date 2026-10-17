import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compareRequestBodies } from '../src/local-resume-prefix.mjs';
import { createResumeRecorder } from '../src/local-resume-diagnostics.mjs';

const raw = n => JSON.stringify({ model: 'model', messages: [{ role: 'system', content: 'PRIVATE prompt' }, { role: 'user', content: `turn ${n}` }], tools: [{ type: 'function', function: { name: 'PRIVATE_tool', parameters: { type: 'object' } } }], chat_template_kwargs: { enable_thinking: true }, stream: true });
function fakeServer(change = null) {
  const calls = []; let props = 0;
  const fetchFn = async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    let body;
    if (path === '/props') body = { chat_template: props++ && change === 'props' ? 'changed' : 'template', build_info: 'b10517-deadbeef' };
    else if (path === '/v1/models') body = { data: [{ id: change === 'model' ? 'other' : 'model' }] };
    else if (path === '/apply-template') body = { prompt: JSON.parse(options.body).messages.map(m => m.content).join('\n') };
    else if (path === '/tokenize') body = { tokens: [...JSON.parse(options.body).content].map(c => c.codePointAt(0)) };
    else throw new Error('generation or unknown endpoint must not be called');
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchFn };
}










test('real loopback HTTP response crosses wrapped transport byte-for-byte and disconnects on cancel', { timeout: 10_000 }, async t => {
  const records = []; let disconnected; const closed = new Promise(r => { disconnected = r; });
  const payload = 'data: {"choices":[{"delta":{"content":"à"}}]}\n\n';
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(payload); res.on('close', disconnected); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const recorder = createResumeRecorder({ sink: { record: r => records.push(r) } });
  const wrapped = recorder.wrapSupervisor({ status: () => ({ state: 'ready', modelId: 'model' }), request: (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options) });
  const response = await wrapped.request('/v1/chat/completions', { method: 'POST', body: raw(1) });
  const reader = response.body.getReader(); const first = await reader.read(); assert.equal(Buffer.from(first.value).toString(), payload);
  await reader.cancel(); await closed;
  const end = records.find(r => r.type === 'request-end'); assert.equal(end.observation.outcome, 'cancelled'); assert.equal(end.observation.server['timings.cache_n'], null);
});
