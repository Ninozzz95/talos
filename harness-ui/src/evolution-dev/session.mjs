// Internal session state machine. Only the public adapter chooses launch options.
import { randomBytes } from 'node:crypto';
import { Kind, Status, encodeDevFrame, createDevDecoder } from './codec.mjs';
export class EvolutionDevError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'EvolutionDevError'; this.code = code;
    this.details = Object.freeze(details);
  }
}
const fail = code => { throw new EvolutionDevError(code); };
// The injected launcher is an internal test seam, never part of factory config,
// a runtime tool or any serialized request. Production passes node:child_process.
export function runDevSession({ launch, workerDigest, signal, onReady,
  totalMs = 30_000, cancelGraceMs = 12_000, killWaitMs = 3_000 }) {
  if (signal?.aborted) return Promise.reject(new EvolutionDevError('CANCELLED_BEFORE_LAUNCH'));
  const invocationId = randomBytes(16);
  return new Promise((resolve, reject) => {
    let child, ready = false, result, pendingError, cancelSent = false, closed = false;
    let settled = false, forced = false, outputInvalid = false, stderrBytes = 0, fallbackTimer, exitTimer, totalTimer;
    const base = kind => ({ version: 1, invocationId, kind });
    function receipt() {
      return { invocationId: invocationId.toString('hex'),
        workerTerminated: result?.workerTerminated ?? false,
        cleanupComplete: result?.cleanupComplete ?? false,
        brokerBytesReleased: result?.bytesReleased ?? null,
        supervisorClosed: closed, cancellationRequested: cancelSent, productReady: false };
    }
    function settle(error, value) {
      if (settled) return; settled = true;
      clearTimeout(totalTimer); clearTimeout(fallbackTimer); clearTimeout(exitTimer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(new EvolutionDevError(error, receipt())); else resolve(Object.freeze(value));
    }
    function forceStop() {
      if (closed || settled || forced) return; forced = true;
      try { child.kill(); } catch { /* still wait for an observed close */ }
      exitTimer = setTimeout(() => {
        // Never turn a kill request into claimed process/fixture cleanup.
        child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        child.unref?.(); settle('SUPERVISOR_TERMINATION_UNCONFIRMED');
      }, killWaitMs);
    }
    function requestCancel(code) {
      if (code && !pendingError) pendingError = code;
      if (closed || settled) return;
      if (!cancelSent && child?.stdin?.writable) {
        cancelSent = true;
        child.stdin.write(encodeDevFrame(base(Kind.CANCEL)), error => {
          if (error && !pendingError) pendingError = 'CONTROL_CHANNEL_FAILED';
        });
      }
      fallbackTimer ??= setTimeout(forceStop, cancelGraceMs);
    }
    function abort() { if (!result) requestCancel(); }
    function protocolError() { outputInvalid = true; requestCancel('INVALID_SUPERVISOR_RESPONSE'); }
    function validateCommon(frame) {
      if (!frame.invocationId.equals(invocationId)) fail('INVOCATION_MISMATCH');
    }
    const decoder = createDevDecoder(frame => {
      validateCommon(frame);
      if (result) fail('OUTPUT_AFTER_RESULT');
      if (frame.kind === Kind.READY) {
        if (ready || frame.status || frame.value || frame.bytesReleased || frame.workerTerminated
          || frame.cleanupComplete || frame.workerExitCode
          || !frame.workerDigest.equals(workerDigest)) fail('INVALID_READY');
        ready = true;
        try {
          const callback = onReady?.(Object.freeze({ phase: 'worker-connected', invocationId: invocationId.toString('hex') }));
          if (callback && typeof callback.then === 'function') {
            void Promise.resolve(callback).catch(() => {});
            requestCancel('ASYNC_READY_CALLBACK_UNSUPPORTED');
          }
        }
        catch { requestCancel('READY_CALLBACK_FAILED'); }
        if (!cancelSent && !pendingError) child.stdin.write(encodeDevFrame(base(Kind.CONTINUE)), error => {
          if (error) requestCancel('CONTROL_CHANNEL_FAILED');
        });
      } else if (frame.kind === Kind.FINISHED) {
        if (frame.workerDigest.length || frame.bytesReleased > 49 || ![1, 2, 3].includes(frame.status)) fail('INVALID_FINISHED');
        if (frame.status === Status.SUCCEEDED && (!ready || frame.value !== 4275 || frame.bytesReleased !== 49
          || !frame.workerTerminated || !frame.cleanupComplete || frame.workerExitCode !== 0)) fail('INVALID_SUCCESS');
        if (frame.status !== Status.SUCCEEDED && frame.value !== 0) fail('INVALID_FAILURE');
        if (frame.status === Status.CANCELLED && (!cancelSent || !ready)) fail('UNEXPECTED_CANCELLATION');
        result = frame;
        // No resolve on data or exit: stdout/stderr must close as well.
        child.stdin.end();
      } else fail('UNEXPECTED_OUTPUT_KIND');
    });
    try { child = launch(); }
    catch { settle('SUPERVISOR_SPAWN_FAILED'); return; }
    totalTimer = setTimeout(() => { pendingError ??= 'ADAPTER_DEADLINE'; forceStop(); }, totalMs);
    child.on('error', () => {
      pendingError ??= 'SUPERVISOR_PROCESS_ERROR';
      if (!child.pid) { closed = true; settle(pendingError); }
      else requestCancel(pendingError);
    });
    child.stdin.on('error', () => { if (!result) requestCancel('CONTROL_CHANNEL_FAILED'); });
    child.stdout.on('error', protocolError);
    child.stderr.on('error', () => requestCancel('DIAGNOSTIC_CHANNEL_FAILED'));
    child.stdout.on('data', chunk => {
      if (outputInvalid || settled) return;
      try { decoder.push(chunk); } catch { protocolError(); }
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      // Drain but never forward native diagnostic text to the caller/model.
      if (stderrBytes > 8192) requestCancel('DIAGNOSTIC_LIMIT');
    });
    child.once('close', (code, terminationSignal) => {
      closed = true;
      try { decoder.finish(); } catch { pendingError ??= 'TRUNCATED_SUPERVISOR_RESPONSE'; }
      if (pendingError) { settle(pendingError); return; }
      if (terminationSignal || code !== 0) { settle('SUPERVISOR_ABNORMAL_EXIT'); return; }
      if (!result) { settle('MISSING_SUPERVISOR_RESULT'); return; }
      if (!result.workerTerminated || !result.cleanupComplete) { settle('NATIVE_CLEANUP_UNCONFIRMED'); return; }
      if (result.status === Status.CANCELLED) { settle('CANCELLED'); return; }
      if (result.status !== Status.SUCCEEDED) { settle('NATIVE_INVOCATION_FAILED'); return; }
      settle(null, { ...receipt(), actualWasmResult: result.value, workerExitCode: result.workerExitCode });
    });
    child.stdin.write(encodeDevFrame(base(Kind.RUN)), error => {
      if (error) requestCancel('CONTROL_CHANNEL_FAILED');
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
