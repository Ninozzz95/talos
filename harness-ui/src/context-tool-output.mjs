import { createHash } from 'node:crypto';
import { dirname, isAbsolute } from 'node:path';

// Qualified explicit filters from RTK 0.44.2 (700bdde); never use autodetection.
const FILTERS = new Set(['cargo-test', 'pytest', 'go-test', 'go-build', 'tsc', 'vitest', 'grep', 'rg', 'find', 'fd', 'git-log', 'git-diff', 'git-status', 'log', 'mypy', 'ruff-check', 'ruff-format', 'prettier', 'phpunit', 'pest', 'paratest', 'php-test', 'ecs', 'phpstan', 'pint']);
const MAX_BYTES = 10 * 1024 * 1024;
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const checkSignal = signal => { if (signal?.aborted) fail('Tool output compression cancelled', 'CTX_CANCELLED'); };
const validId = value => typeof value === 'string' && value.trim() !== '' && value.length <= 256;

export function createToolOutputCompressor({ binaryPath, processPolicy, store, timeoutMs = 10000 } = {}) {
  if (typeof binaryPath !== 'string' || !isAbsolute(binaryPath) || !processPolicy || typeof processPolicy.spawn !== 'function'
    || !store || typeof store.readOriginals !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) fail('Compressor dependencies are invalid', 'CTX_OUTPUT_CONFIG');

  async function filterStdin(text, filter, signal) {
    return new Promise((resolve, reject) => {
      let child; let timer; let done = false; let length = 0; let errorLength = 0; const output = [];
      const stop = () => { try { child?.kill('SIGTERM'); } catch { /* process may already be gone */ } };
      const finish = (value, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(value);
      };
      const fallback = () => { finish(null); stop(); };
      const onAbort = () => { finish(null, Object.assign(new Error('Tool output compression cancelled'), { code: 'CTX_CANCELLED' })); stop(); };
      try {
        // Authority remains in the caller-owned policy. `command` is never an argument.
        child = processPolicy.spawn(binaryPath, ['pipe', '--filter', filter], { cwd: dirname(binaryPath), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        if (!child?.stdin || typeof child.once !== 'function') return fallback();
        child.on('error', fallback);
        child.stdin.on('error', fallback);
        child.stdout?.on('data', chunk => {
          if (done) return;
          const bytes = Buffer.from(chunk); length += bytes.length;
          if (length > MAX_BYTES) return fallback();
          output.push(bytes);
        });
        child.stderr?.on('data', chunk => { errorLength += Buffer.byteLength(chunk); if (errorLength > 65536) fallback(); });
        child.once('close', code => {
          if (code !== 0) return finish(null);
          try { finish(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(output))); } catch { finish(null); }
        });
        timer = setTimeout(fallback, timeoutMs);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) return onAbort();
        child.stdin.end(Buffer.from(text, 'utf8'));
      } catch { fallback(); }
    });
  }

  async function compressCapturedToolOutput({ sessionId, recordId, text, filter, command, exitCode, signal } = {}) {
    checkSignal(signal);
    if (!validId(sessionId) || !validId(recordId) || typeof text !== 'string' || !text.isWellFormed()
      || (command !== undefined && typeof command !== 'string') || (exitCode !== undefined && exitCode !== null && !Number.isInteger(exitCode))) fail('Captured output is invalid', 'CTX_OUTPUT_INVALID');
    const rows = await store.readOriginals({ sessionId, ids: [recordId], limit: 1 });
    const record = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!record || record.id !== recordId || record.sessionId !== sessionId || record.message?.role !== 'tool'
      || record.message.content !== text || typeof record.sha256 !== 'string'
      || createHash('sha256').update(JSON.stringify(record.message)).digest('hex') !== record.sha256) fail('Exact tool output must be archived before compression', 'CTX_ORIGINAL_MISMATCH');
    checkSignal(signal);
    const result = { text, originalRef: { sessionId, recordId, sha256: record.sha256 }, compressed: false, originalChars: text.length, outputChars: text.length, command, exitCode };
    if (!FILTERS.has(filter) || Buffer.byteLength(text, 'utf8') > MAX_BYTES || text.length === 0) return result;
    const output = await filterStdin(text, filter, signal);
    checkSignal(signal);
    if (typeof output !== 'string' || output.trim() === '' || output.length >= text.length) return result;
    return { ...result, text: output, compressed: true, filter, outputChars: output.length };
  }

  return Object.freeze({ compressCapturedToolOutput });
}
