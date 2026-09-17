import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { ambienteSenzaVariabiliDelServer } from './ambiente-solo-server.mjs';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Executes trusted runtime capability/fit probes without blocking the backend.
 * No shell; the executable and arguments come from the supervisor, not a model.
 * A failed, truncated or timed-out probe is unknown (null), never capability proof.
 * Cancellation rejects only after the direct child closes. This is not a general
 * process-tree sandbox: server/tool process teardown remains a separate concern.
 */
export function createLlamaBinaryProbe({
  spawnImpl = spawn,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
  onObservation = null,
  monotonicNow = () => performance.now(),
} = {}) {
  if (typeof spawnImpl !== 'function' || typeof monotonicNow !== 'function'
      || (onObservation !== null && typeof onObservation !== 'function')
      || !Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0) {
    throw new TypeError('Invalid binary probe configuration');
  }

  return async function probe(executable, args, timeoutMs = DEFAULT_TIMEOUT_MS, { signal } = {}) {
    if (typeof executable !== 'string' || !executable.trim() || executable.includes('\0')
        || !Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      throw new TypeError('Invalid binary probe request');
    }
    signal?.throwIfAborted();
    const started = monotonicNow();
    const kind = args.includes('--help') ? 'help' : args.includes('-m') ? 'fit' : 'other';

    return new Promise((resolve, reject) => {
      let child;
      let timer;
      let settled = false;
      let outcome = 'completed';
      let outputBytes = 0;
      const stdout = [];
      const stderr = [];

      const observe = (code) => {
        if (!onObservation) return;
        // Do not include executable paths, arguments, environment or probe output.
        const measurement = Object.freeze({
          kind, outcome, durationMs: Math.max(0, monotonicNow() - started),
          outputBytes, exitCode: Number.isInteger(code) ? code : null,
        });
        try { Promise.resolve(onObservation(measurement)).catch(() => {}); } catch { /* observer isolation */ }
      };
      const finish = (code = null, exitSignal = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        child?.removeListener('error', failed);
        if (outcome === 'completed' && (code !== 0 || exitSignal)) outcome = 'failed';
        observe(code);
        if (outcome === 'cancelled') {
          reject(signal.reason ?? new DOMException('Probe cancelled', 'AbortError'));
        } else if (outcome !== 'completed') {
          resolve(null);
        } else {
          resolve(`${Buffer.concat(stdout).toString('utf8')}\n${Buffer.concat(stderr).toString('utf8')}`);
        }
      };
      const terminate = () => {
        try { child?.kill('SIGKILL'); } catch { /* close/error is authoritative */ }
        // Descendants retaining inherited pipe handles cannot keep capture open.
        child?.stdout?.destroy?.();
        child?.stderr?.destroy?.();
      };
      const abort = () => {
        if (settled) return;
        outcome = 'cancelled';
        terminate();
      };
      const failed = () => {
        if (outcome === 'completed') outcome = 'failed';
      };
      const capture = (chunks, chunk) => {
        if (settled || outcome !== 'completed') return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        outputBytes += bytes.length;
        if (outputBytes > outputLimitBytes) {
          outcome = 'output_limit';
          stdout.length = 0;
          stderr.length = 0;
          terminate();
          return;
        }
        chunks.push(bytes);
      };
      try {
        /* 17/09/2026, applicando la PR #30: la sonda ereditava l'ambiente INTERO del server (token della API locale,
           chiavi delle ricevute, chiave della ricerca) — uno dei punti di `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`.
           Il filtro è SOTTRATTIVO e condiviso con terminale e browser pilotato: toglie i soli nomi che TALOS ha messo,
           e lascia al motore PATH, CUDA_*, GGML_*, VK_*. Mai una shell. */
        child = spawnImpl(executable, args, {
          env: ambienteSenzaVariabiliDelServer(),
          shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (!child || typeof child.once !== 'function') throw new TypeError('Invalid probe process');
      } catch {
        outcome = 'failed';
        finish();
        return;
      }
      child.on('error', failed);
      child.once('close', finish);
      child.stdout?.on('data', chunk => capture(stdout, chunk));
      child.stderr?.on('data', chunk => capture(stderr, chunk));
      timer = setTimeout(() => {
        if (settled || outcome === 'cancelled') return;
        outcome = 'timed_out';
        terminate();
      }, timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  };
}
