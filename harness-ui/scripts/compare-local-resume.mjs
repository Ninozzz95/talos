import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { compareRequestBodies, compareRenderedPrompts } from '../src/local-resume-prefix.mjs';

const LIMIT = 4 * 1024 * 1024;
const sha = text => createHash('sha256').update(text).digest('hex');
export function loopbackBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('explicit-loopback-root-required');
  return url.origin;
}
async function readBoundedJson(response) {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
  const reader = response.body.getReader();
  let bytes = 0; const buffer = Buffer.allocUnsafe(LIMIT);
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > LIMIT) throw new Error('render-response-too-large');
      buffer.set(value, bytes - value.byteLength);
    }
    return JSON.parse(buffer.subarray(0, bytes).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Explicit post-capture reconstruction on a user-selected local server. No generation or slot mutation. */
export async function reconstructPair(beforeRaw, afterRaw, { baseUrl, apiKey, addSpecial, fetchFn = fetch } = {}) {
  const base = loopbackBase(baseUrl);
  if (typeof addSpecial !== 'boolean') throw new Error('explicit-add-special-required');
  const bodies = [JSON.parse(beforeRaw), JSON.parse(afterRaw)];
  if (typeof bodies[0]?.model !== 'string' || bodies[0].model !== bodies[1]?.model) throw new Error('same-model-required');
  // Media preprocessing is not reconstructed by this text-only diagnostic.
  for (const body of bodies) {
    if (!Array.isArray(body.messages) || body.messages.some(m => Array.isArray(m?.content) && m.content.some(p => p?.type !== 'text'))) throw new Error('text-only-reconstruction-required');
  }
  const request = async (path, body) => {
    const response = await fetchFn(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    return readBoundedJson(response);
  };
  const beforeProps = await request('/props'), models = await request('/v1/models');
  if (!Array.isArray(models?.data) || models.data.length !== 1 || models.data[0]?.id !== bodies[0].model) throw new Error('loaded-model-alias-mismatch');
  const rendered = [];
  for (const raw of [beforeRaw, afterRaw]) {
    // The complete captured body carries tools and template kwargs, not messages alone.
    const applied = await request('/apply-template', raw);
    if (typeof applied?.prompt !== 'string') throw new Error('missing-rendered-prompt');
    const tokenized = await request('/tokenize', { content: applied.prompt, add_special: addSpecial, parse_special: true });
    rendered.push({ prompt: applied.prompt, tokens: tokenized.tokens });
  }
  const afterProps = await request('/props'), afterModels = await request('/v1/models');
  if (JSON.stringify(beforeProps) !== JSON.stringify(afterProps) || JSON.stringify(models) !== JSON.stringify(afterModels)) throw new Error('server-profile-changed');
  return {
    ...compareRenderedPrompts(rendered[0], rendered[1]),
    reconstruction: {
      templateSha256: typeof beforeProps.chat_template === 'string' ? sha(beforeProps.chat_template) : null,
      buildInfoSha256: typeof beforeProps.build_info === 'string' ? sha(beforeProps.build_info) : null,
      addSpecial, parseSpecial: true, capturedRuntimeIdentityVerified: false,
      limitation: 'Re-rendered now, not captured historical tokens. Implicit template date/time, model-file replacement, flags and tokenizer settings must be reconciled with the captured runtime before drawing causal conclusions.',
    },
  };
}
async function readRaw(path) {
  if ((await stat(path)).size > LIMIT) throw new Error('request-too-large');
  return readFile(path, 'utf8');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [before, after, output, baseUrl, addSpecial] = process.argv.slice(2);
  if (!before || !after || !output || (baseUrl && !['true', 'false'].includes(addSpecial))) {
    console.error('Usage: node scripts/compare-local-resume.mjs BEFORE.request.json AFTER.request.json OUTPUT.json [http://127.0.0.1:PORT true|false]'); process.exitCode = 2;
  } else {
    try {
      const a = await readRaw(before), b = await readRaw(after);
      const result = compareRequestBodies(a, b);
      if (baseUrl) Object.assign(result, await reconstructPair(a, b, { baseUrl, apiKey: process.env.TALOS_DIAG_LLAMA_KEY, addSpecial: addSpecial === 'true' }));
      await writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      console.log('Prefix comparison written; no prompt text or token IDs exported.');
    } catch { console.error('Comparison failed: inspect input/schema, local model identity, endpoint and output permissions. No source text is printed.'); process.exitCode = 1; }
  }
}
