import {execFile as nodeExecFile,spawn as nodeSpawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import type {SandboxBoundaryEvidence} from './sandbox-boundary-probe.ts';

/**
 * TALOS-owned Windows process-tree kill-on-close probe.
 *
 * Scope is deliberately narrow and recorded in the evidence as `createprocess-descendant`.
 * Microsoft documents that `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is a flag the job creator may or
 * may not set, that a child created with `CreateProcess` is associated with the creating job by
 * default, that a process created through `Win32_Process.Create` is NOT associated with the job,
 * and that `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` detaches children entirely. The probe therefore
 * measures ordinary `CreateProcess` descendants and claims nothing wider.
 * https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
 *
 * Three independent survival signals are collected and unanimity is required. Any `unknown`, or
 * any disagreement, is a failure: unknown is not pass, and a disagreement is never a majority
 * vote, which is how a recycled process identifier is handled conservatively.
 */

export type ProcessTreeSignal = 'alive' | 'gone' | 'unknown';

export type ProcessTreeEvidence = {
  schema: 'talos.cli.process-tree-evidence.v1';
  scope: 'createprocess-descendant';
  signals: {heartbeat: ProcessTreeSignal; signalZero: ProcessTreeSignal; enumeration: ProcessTreeSignal};
  executorPid: number | null;
  descendantPid: number | null;
  observedAtMs: number;
  durationMs: number;
  /**
   * `leftover`: pids this check read from its own folder that were still running and could NOT be proven to be its
   * processes, so they were not ended (R3: never a kill on trust). Present only when non-empty; such a check is never
   * verified and never cached.
   */
  cleanup: {descendantKilled: boolean; executorKilled: boolean; directoryRemoved: boolean; leftover?: number[]};
};

/* F-021: `boundary` is what the sandbox boundary probe measured (sandbox-boundary-probe.ts); a record without it predates the probe. */
export type ProcessTreeProbeResult = {verified: boolean; reason?: string; evidence: ProcessTreeEvidence & {workloads?: SandboxWorkloadEvidence; boundary?: SandboxBoundaryEvidence}};

/**
 * R0 lane S (gate E3): what each real workload did inside the container. `ok`, `not-installed`, `unsupported: …` or
 * `failed: …`. Recorded with the process-tree evidence so a person can see WHY a host is or is not verified.
 */
export type SandboxWorkloadEvidence = {cmd: string; node: string; powershell: string; pwsh: string; gitBash: string};

export type SandboxedSpawnRequest = {executable: string; args: string[]; cwd: string; probeDirectory: string};
/** What a spawner knows about how the executor ended. A spawner that cannot say resolves `exited` with nothing. */
export type SandboxedSpawnExit = {exitCode: number | null; signal?: string | null};
export type SandboxedSpawnHandle = {pid: number | undefined; kill(): void | Promise<void>; exited: Promise<void | SandboxedSpawnExit>};
export type SandboxedSpawn = (request: SandboxedSpawnRequest) => SandboxedSpawnHandle | Promise<SandboxedSpawnHandle>;

export type ProcessTreeProbeDeps = {
  platform?: NodeJS.Platform;
  spawn?: SandboxedSpawn;
  tempRoot?: string;
  systemRoot?: string;
  nodeExecutable?: string;
  execFile?: (file: string, args: readonly string[]) => Promise<{stdout: string}>;
  enumerate?: (pid: number) => Promise<ProcessTreeSignal>;
  signalZero?: (pid: number) => ProcessTreeSignal;
  killPid?: (pid: number) => void;
  now?: () => number;
  descendantTimeoutMs?: number;
  executorExitTimeoutMs?: number;
  settleMs?: number;
  heartbeatWindowMs?: number;
  /**
   * Reads the descendant's heartbeat. The default reads the file the descendant writes. Injectable only so
   * that the ordering around an observed executor exit can be tested deterministically (review mutation M9).
   */
  readHeartbeat?: (directory: string) => Promise<{pid: number; seq: number} | null>;
  /** Aborts the check (TALOS is quitting): every process it started is ended and it rejects with an AbortError, no verdict. */
  signal?: AbortSignal;
};

const SCHEMA = 'talos.cli.process-tree-evidence.v1';
const SCOPE = 'createprocess-descendant';
const HEARTBEAT = 'heartbeat.json';
const BEAT_INTERVAL_MS = 75;
const SELF_DESTRUCT_MS = 60_000;
/*
 * R3 (owner, 2026-09-24): the check is interruptible. The executor reports its own pid and the pid of the descendant it
 * spawned into the check's private folder the moment it has them. The report plays no part in the measurement.
 * ⛔ A reported pid is only a CANDIDATE: it is ended only with a proof, at kill time, that it is still this check's
 *   process (`endProven` below) — Windows reuses pids, and a pid read from a file proves nothing by itself.
 */
const EXECUTOR_REPORT = 'executor.json';
export function isolationCheckAborted(): Error {return Object.assign(new Error('PROCESS_TREE_PROBE_ABORTED'), {name: 'AbortError', code: 'ABORT_ERR'});}

/**
 * Spawned by the probe; it creates one ordinary `CreateProcess` descendant and then waits.
 *
 * `detached: true` is load-bearing and measured, not decorative. libuv assigns every
 * NON-detached Windows child to its own global job object carrying
 * `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, so when the executor dies Node itself tears the
 * descendant down. Measured on Windows 11 Pro 10.0.26200 with Node 24.18.0: a plain descendant
 * dies with its parent, a detached one survives. Without this flag the probe would be measuring
 * Node's job object and would answer "kill-on-close works" on a host with no sandbox at all.
 *
 * libuv deliberately does NOT set `CREATE_BREAKAWAY_FROM_JOB` for detached children (it only adds
 * `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`), so the descendant stays job-associated by
 * default the way any `CreateProcess` child is. That is exactly the `createprocess-descendant`
 * scope this probe claims: Node's own job is removed from the measurement, the sandbox's is not.
 */
const EXECUTOR_SOURCE = `import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const directory = process.argv[2];
const report = descendantPid => {try {writeFileSync(path.join(directory, '${EXECUTOR_REPORT}'), JSON.stringify({executorPid: process.pid, descendantPid}));} catch {}};
report(null);
const descendant = spawn(process.execPath, [path.join(directory, 'descendant.mjs'), directory], {cwd: directory, stdio: 'ignore', windowsHide: true, detached: true});
report(descendant.pid ?? null);
descendant.unref();
setTimeout(() => process.exit(0), ${SELF_DESTRUCT_MS});
`;

/**
 * The descendant is identified by a heartbeat only it can produce, inside a directory the probe
 * created for this run alone. A bare process identifier would be recyclable; a moving counter
 * written by this process is not.
 */
const DESCENDANT_SOURCE = `import {renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
const directory = process.argv[2];
const target = path.join(directory, '${HEARTBEAT}');
const temporary = path.join(directory, 'heartbeat.' + process.pid + '.tmp');
let seq = 0;
const beat = () => {
  seq += 1;
  try {
    writeFileSync(temporary, JSON.stringify({pid: process.pid, seq, atMs: Date.now()}));
    renameSync(temporary, target);
  } catch {}
};
beat();
setInterval(beat, ${BEAT_INTERVAL_MS});
setTimeout(() => process.exit(0), ${SELF_DESTRUCT_MS}).unref();
`;

/* R3 proof (see `endProven`): how often the heartbeat is read while proving, and for how long (over five beats). */
const PROOF_POLL_MS = 20;
const PROOF_WINDOW_MS = 400;
const leftoverNote = (pids: number[]) => `PROCESS_TREE_PROBE_LEFT_RUNNING: pid ${pids.join(', ')} still running and not proven to be this check's own, so not ended`;

/* An abort ends a wait at once and clears its timer, so nothing a stopped check scheduled keeps the process alive. */
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  if (signal?.aborted) {resolve(); return;}
  const done = () => {clearTimeout(timer); signal?.removeEventListener('abort', done); resolve();};
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', done, {once: true});
});

function defaultSignalZero(pid: number): ProcessTreeSignal {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'gone' : 'unknown';
  }
}

function defaultKill(pid: number): void {
  process.kill(pid, 'SIGKILL');
}

const defaultSpawn: SandboxedSpawn = request => {
  const child = nodeSpawn(request.executable, request.args, {cwd: request.cwd, stdio: 'ignore', windowsHide: true, shell: false});
  let done: (exit: SandboxedSpawnExit | void) => void = () => {};
  const exited = new Promise<SandboxedSpawnExit | void>(resolve => {done = resolve;});
  child.once('exit', (code, signal) => done({exitCode: code, signal}));
  child.once('error', () => done());
  return {pid: child.pid, kill: () => {try {child.kill('SIGKILL');} catch {}}, exited};
};

/**
 * NTSTATUS values a sandboxed executor has been seen to die with, named so a person can read the
 * reason. Measured on this host: `node.exe` under the production probe policy exits 3221225794
 * (0xC0000142) within 73-139 ms, before its first line of JavaScript.
 */
const KNOWN_STATUS: Record<number, string> = {
  0xC0000005: 'STATUS_ACCESS_VIOLATION',
  0xC0000135: 'STATUS_DLL_NOT_FOUND',
  0xC0000142: 'STATUS_DLL_INIT_FAILED',
  0xC000013A: 'STATUS_CONTROL_C_EXIT',
};

/** `3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)`; small codes stay decimal because they are ordinary exit codes. */
export function describeExitStatus(exit: SandboxedSpawnExit | void): string {
  if (!exit || (exit.exitCode === null && !exit.signal)) return 'exit status not reported by the sandbox spawner';
  if (exit.exitCode === null) return `terminated by signal ${exit.signal}`;
  const status = exit.exitCode >>> 0;
  if (status < 0xC0000000) return `exit status ${exit.exitCode}`;
  const hex = `0x${status.toString(16).toUpperCase().padStart(8, '0')}`;
  const name = KNOWN_STATUS[status];
  return `exit status ${status} (${name ? `${hex} ${name}` : hex})`;
}

/**
 * `wmic` has been removed from supported Windows 11 builds, so enumeration uses the real
 * `tasklist.exe` executable by absolute path with no `/FI` filter: a project incident recorded
 * `tasklist /FI` returning zero rows while four processes were alive. Filtering happens here, in
 * JavaScript, and an empty or unparsable table reads as `unknown` rather than as `gone`.
 */
function parseTasklistPids(stdout: string): Set<number> | null {
  const pids = new Set<number>();
  for (const line of stdout.split(/\r?\n/u)) {
    if (line.trim() === '') continue;
    const fields = line.match(/"[^"]*"/gu);
    if (!fields || fields.length < 2) continue;
    const value = Number.parseInt(fields[1]!.slice(1, -1), 10);
    if (Number.isInteger(value)) pids.add(value);
  }
  return pids.size > 0 ? pids : null;
}

export function createHostProcessTreeProbe(deps: ProcessTreeProbeDeps = {}): () => Promise<ProcessTreeProbeResult> {
  const platform = deps.platform ?? process.platform;
  const now = deps.now ?? (() => Date.now());
  const tempRoot = deps.tempRoot ?? tmpdir();
  const systemRoot = deps.systemRoot ?? process.env.SystemRoot ?? 'C:\\Windows';
  const nodeExecutable = deps.nodeExecutable ?? process.execPath;
  const signal = deps.signal;
  const runExecFile = deps.execFile ?? (async (file, args) => {
    const {stdout} = await promisify(nodeExecFile)(file, [...args], {windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...(signal ? {signal} : {})});
    return {stdout: String(stdout)};
  });
  const spawnSandboxed = deps.spawn ?? defaultSpawn;
  const signalZero = deps.signalZero ?? defaultSignalZero;
  const killPid = deps.killPid ?? defaultKill;
  const enumerate = deps.enumerate ?? (async (pid: number): Promise<ProcessTreeSignal> => {
    let stdout: string;
    try {
      ({stdout} = await runExecFile(path.join(systemRoot, 'System32', 'tasklist.exe'), ['/FO', 'CSV', '/NH']));
    } catch {
      return 'unknown';
    }
    const pids = parseTasklistPids(stdout);
    if (pids === null) return 'unknown';
    return pids.has(pid) ? 'alive' : 'gone';
  });
  const descendantTimeoutMs = deps.descendantTimeoutMs ?? 15_000;
  const executorExitTimeoutMs = deps.executorExitTimeoutMs ?? 5_000;
  const settleMs = deps.settleMs ?? 600;
  const heartbeatWindowMs = deps.heartbeatWindowMs ?? 500;

  async function readBeat(directory: string): Promise<{pid: number; seq: number} | null> {
    if (deps.readHeartbeat) return deps.readHeartbeat(directory);
    try {
      const value = JSON.parse(await readFile(path.join(directory, HEARTBEAT), 'utf8')) as {pid?: unknown; seq?: unknown};
      return typeof value.pid === 'number' && typeof value.seq === 'number' ? {pid: value.pid, seq: value.seq} : null;
    } catch {
      return null;
    }
  }

  /** A rename can be observed mid-flight; a handful of retries removes that race, nothing else. */
  async function readBeatSettled(directory: string): Promise<{pid: number; seq: number} | null> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const beat = await readBeat(directory);
      if (beat) return beat;
      await delay(30, signal);
    }
    return null;
  }

  /**
   * Waits for the descendant's heartbeat, and stops as soon as the executor that should create it
   * is gone.
   *
   * ⛔ Measured on this host: the sandboxed executor died in 73-139 ms and this loop then waited the
   *   full descendant timeout (15 s) for a heartbeat that nothing alive could write. A dead executor
   *   is still a NEGATIVE — it proves nothing about kill-on-close — but the answer is due when it
   *   dies, and it carries how it died.
   * ⛔ The heartbeat is read BEFORE the exit is honoured, on every turn: a descendant that beat in
   *   the same tick the executor ended is not thrown away. A slow descendant under a LIVE executor
   *   is waited for exactly as before.
   */
  async function waitForDescendant(directory: string, exited: Promise<void | SandboxedSpawnExit>): Promise<{appeared: {pid: number; seq: number}} | {executorExited: void | SandboxedSpawnExit} | null> {
    let ended: {status: void | SandboxedSpawnExit} | null = null;
    void exited.then(status => {ended = {status};}, () => {ended = {status: undefined};});
    const deadline = Date.now() + descendantTimeoutMs;
    while (Date.now() < deadline && !signal?.aborted) {
      const beat = await readBeat(directory);
      if (beat && beat.seq >= 2) return {appeared: beat};
      const executorEnd = ended as {status: void | SandboxedSpawnExit} | null;
      if (executorEnd) {
        /*
         * ⛔ Round 4 (review mutation M18): the exit can land while the read above is in flight, and
         *   the descendant's beat can land in the same instant. One more read, after the exit is
         *   known, so a beat written before the exit was observed is never thrown away.
         */
        const last = await readBeat(directory);
        if (last && last.seq >= 2) return {appeared: last};
        return {executorExited: executorEnd.status};
      }
      await delay(40, signal);
    }
    return null;
  }

  async function waitGone(pid: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && signalZero(pid) === 'alive') await delay(50);
  }

  /** The pids the executor and the descendant wrote into this check's folder. Candidates only — see `endProven`. */
  function reportedPids(directory: string): number[] {
    const pids: number[] = [];
    const read = (file: string) => {try {return JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as Record<string, unknown>;} catch {return null;}};
    const report = read(EXECUTOR_REPORT);const beat = read(HEARTBEAT);
    for (const value of [report?.descendantPid, beat?.pid, report?.executorPid]) if (typeof value === 'number' && Number.isInteger(value) && value > 0 && !pids.includes(value)) pids.push(value);
    return pids;
  }

  /** The latest beat in the folder, read synchronously so that a kill follows the read in the same tick. */
  function beatNow(directory: string): {pid: number; seq: number} | null {
    try {
      const value = JSON.parse(readFileSync(path.join(directory, HEARTBEAT), 'utf8')) as {pid?: unknown; seq?: unknown};
      return typeof value.pid === 'number' && typeof value.seq === 'number' ? {pid: value.pid, seq: value.seq} : null;
    } catch {
      return null;
    }
  }

  /*
   * ⛔⛔ R3 (coordinator review; owner standing rule): a pid is ended ONLY with a proof, AT KILL TIME, that it is a process
   * THIS check started. Windows reuses pids quickly: a pid read from executor.json or heartbeat.json, or seen alive a
   * moment ago, can belong seconds later to an unrelated process of the person, and TerminateProcess would end it.
   *  · The proof is the heartbeat (proof (a)). The descendant rewrites heartbeat.json in this check's private folder,
   *    with its own pid, every 75 ms. A beat that MOVED since the previous read (20 ms earlier) was written by that pid
   *    within those 20 ms: it is this check's descendant now, and the kill follows that read in the same tick. A beat
   *    that does not move proves nothing (a writer that is gone, a pid that is someone else's now).
   *    Why not (b) creation time or (c) command line: Node cannot read either on Windows without a CIM query, measured
   *    here at 947-1003 ms per query (3 runs, powershell Get-CimInstance Win32_Process) — half the 2 s abort budget,
   *    and one more process to manage. The heartbeat costs at most one beat interval.
   *  · A pid seen `gone` (ESRCH) after it was reported is this check's process, ended for good: never a candidate again.
   *  · The executor is ended through the handle TALOS holds, never by pid.
   *  · No proof → no kill: the pid comes back as a leftover and the caller STATES it (never verified, never cached).
   */
  function noteGone(directory: string, gone: Set<number>): void {
    for (const pid of reportedPids(directory)) if (!gone.has(pid) && signalZero(pid) === 'gone') gone.add(pid);
  }
  async function endProven(directory: string, candidates: number[], gone: Set<number>, windowMs: number): Promise<{ended: number[]; leftover: number[]}> {
    const ended: number[] = [];
    let waiting = candidates.filter(pid => !gone.has(pid));
    let previous = beatNow(directory);
    const deadline = Date.now() + windowMs;
    for (;;) {
      waiting = waiting.filter(pid => {if (signalZero(pid) !== 'gone') return true; gone.add(pid); return false;});
      if (waiting.length === 0) break;
      const beat = beatNow(directory);
      if (beat && previous && beat.pid === previous.pid && beat.seq > previous.seq && waiting.includes(beat.pid)) {
        /* The proof: this pid wrote a new beat in this check's folder since the previous read. End it now, in this tick. */
        let killed = false;
        try {killPid(beat.pid); killed = true;} catch {}
        if (killed) {ended.push(beat.pid); waiting = waiting.filter(pid => pid !== beat.pid); continue;}
      }
      if (beat) previous = beat;
      if (Date.now() >= deadline) break;
      await delay(PROOF_POLL_MS);
    }
    return {ended, leftover: waiting};
  }

  return async (): Promise<ProcessTreeProbeResult> => {
    const observedAtMs = now();
    const startedAt = Date.now();
    const signals: ProcessTreeEvidence['signals'] = {heartbeat: 'unknown', signalZero: 'unknown', enumeration: 'unknown'};
    const cleanup: ProcessTreeEvidence['cleanup'] = {descendantKilled: false, executorKilled: false, directoryRemoved: false};
    let reason: string | undefined;

    if (platform !== 'win32') {
      return {
        verified: false,
        reason: 'PROCESS_TREE_PROBE_REQUIRES_WINDOWS',
        evidence: {schema: SCHEMA, scope: SCOPE, signals, executorPid: null, descendantPid: null, observedAtMs, durationMs: Date.now() - startedAt, cleanup}
      };
    }

    if (signal?.aborted) throw isolationCheckAborted();
    const directory = await mkdtemp(path.join(tempRoot, 'talos-process-tree-'));
    let handle: SandboxedSpawnHandle | undefined;
    let executorPid: number | null = null;
    let descendantPid: number | null = null;
    /* Pids of this check's processes seen gone after they were reported: ended for good, never a candidate again. */
    const gone = new Set<number>();
    /*
     * On abort the executor is ended at once through its handle. What it spawned is ended in the cleanup below, and only
     * with a proof (`endProven`) — never a pid on trust.
     */
    const stopAll = () => {try {void handle?.kill();} catch {}};
    signal?.addEventListener('abort', stopAll, {once: true});
    const checkAbort = () => {if (signal?.aborted) throw isolationCheckAborted();};

    let failure: {error: unknown} | undefined;
    try {
      await writeFile(path.join(directory, 'executor.mjs'), EXECUTOR_SOURCE, 'utf8');
      await writeFile(path.join(directory, 'descendant.mjs'), DESCENDANT_SOURCE, 'utf8');
      checkAbort();
      handle = await spawnSandboxed({executable: nodeExecutable, args: [path.join(directory, 'executor.mjs'), directory], cwd: directory, probeDirectory: directory});
      executorPid = handle.pid ?? null;
      if (signal?.aborted) stopAll();
      checkAbort();

      const waited = await waitForDescendant(directory, handle.exited);
      checkAbort();
      if (waited === null) {
        reason = 'PROCESS_TREE_PROBE_DESCENDANT_NEVER_APPEARED';
      } else if ('executorExited' in waited) {
        reason = `PROCESS_TREE_PROBE_EXECUTOR_EXITED: ${describeExitStatus(waited.executorExited)}`;
      } else {
        const appeared = waited.appeared;
        descendantPid = appeared.pid;
        await handle.kill();
        await Promise.race([handle.exited, delay(executorExitTimeoutMs, signal)]);
        noteGone(directory, gone);
        await delay(settleMs, signal);
        checkAbort();
        const before = await readBeatSettled(directory);
        await delay(heartbeatWindowMs, signal);
        const after = await readBeatSettled(directory);
        checkAbort();
        signals.heartbeat = before && after ? (after.seq > before.seq ? 'alive' : 'gone') : 'unknown';
        signals.signalZero = signalZero(descendantPid);
        if (signals.signalZero === 'gone') gone.add(descendantPid);
        signals.enumeration = await enumerate(descendantPid);
        checkAbort();
        const observed = [signals.heartbeat, signals.signalZero, signals.enumeration];
        if (observed.includes('unknown')) reason = 'PROCESS_TREE_PROBE_SIGNALS_INDETERMINATE';
        else if (observed.every(value => value === 'gone')) reason = undefined;
        else if (observed.every(value => value === 'alive')) reason = 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED';
        else reason = 'PROCESS_TREE_PROBE_SIGNALS_DISAGREE';
      }
    } catch (error) {
      failure = {error};
    }

    /* Cleanup, always. */
    signal?.removeEventListener('abort', stopAll);
    const aborted = signal?.aborted === true;
    /* An aborted check confirms each step for at most half a second: TALOS is quitting and must not wait. */
    const confirmMs = aborted ? 500 : 5_000;
    /* 1. The executor, through the handle TALOS holds — never by pid. With kill-on-close its descendant goes with it. */
    if (handle) {
      const executorWasAlive = executorPid !== null && signalZero(executorPid) === 'alive';
      try {await handle.kill();} catch {}
      if (executorWasAlive) {
        cleanup.executorKilled = true;
        await waitGone(executorPid!, confirmMs);
      }
    }
    /*
     * 2. Everything else this check may have started (the descendant it measured, the pids reported in its folder), by pid
     *    and ONLY with the proof. The executor's own pid is the handle's business, never a candidate.
     */
    const candidates = [...new Set([...(descendantPid !== null ? [descendantPid] : []), ...reportedPids(directory)])].filter(pid => pid !== executorPid);
    const proven = await endProven(directory, candidates, gone, PROOF_WINDOW_MS);
    for (const pid of proven.ended) await waitGone(pid, confirmMs);
    if (proven.ended.length > 0) cleanup.descendantKilled = true;
    if (proven.leftover.length > 0) cleanup.leftover = proven.leftover;
    try {
      /* Bounded on abort: a folder a leftover still holds must not keep TALOS from quitting (linear backoff). */
      await rm(directory, {recursive: true, force: true, maxRetries: aborted ? 2 : 20, retryDelay: 100});
      cleanup.directoryRemoved = true;
    } catch {}

    /* ⛔ No proof, no kill — and never silently: the leftover is stated in the error or in the reason. */
    if (failure) {
      if (proven.leftover.length > 0 && failure.error instanceof Error) {
        try {Object.assign(failure.error, {leftover: [...proven.leftover]}); failure.error.message = `${failure.error.message}; ${leftoverNote(proven.leftover)}`;} catch {}
      }
      throw failure.error;
    }
    if (proven.leftover.length > 0) reason = reason === undefined ? leftoverNote(proven.leftover) : `${reason}; ${leftoverNote(proven.leftover)}`;

    return {
      verified: reason === undefined,
      ...(reason === undefined ? {} : {reason}),
      evidence: {schema: SCHEMA, scope: SCOPE, signals, executorPid, descendantPid, observedAtMs, durationMs: Date.now() - startedAt, cleanup}
    };
  };
}

/*
 * ⭐⭐⭐ R0 lane S — THE PROBE RUNS THE REAL WORKLOADS, NOT ONLY ITS OWN node.exe (gate E3).
 *
 * Measured 2026-09-23: under the old policy cmd.exe ran while node.exe and powershell.exe died with 0xC0000142, so a
 * cmd-only check would have said "verified" for a container where `npm test` cannot start. Codex's MXC notes say the
 * same: "Test the normal powershell.exe and pwsh.exe command paths, not only cmd.exe" (codex-rs/mxc-sandbox README,
 * 2026-09-22). Each workload writes a marker into its granted folder, so "ran" means it executed, not only exited 0.
 *  · cmd, node and Windows PowerShell are REQUIRED: every brokered command is `cmd /d /s /c`, npm is node, and
 *    PowerShell ships with every Windows 11. One of them failing leaves the host unverified.
 *  · pwsh is optional software: when installed it is run and recorded, but a pwsh failure does not unverify the
 *    container (the command using it fails visibly inside it; dropping the whole sandbox for it would move every
 *    other command to the host).
 *  · git-bash is recorded as UNSUPPORTED and never launched: MSYS2/Cygwin runtimes abort at initialisation under
 *    processcontainer (microsoft/mxc#1061, open; the same case GitHub Copilot CLI hit, changelog 1.0.85).
 */
export type SandboxWorkloadProbeDeps = {
  platform?: NodeJS.Platform;
  spawn: SandboxedSpawn;
  tempRoot?: string;
  systemRoot?: string;
  comSpec?: string;
  nodeExecutable?: string;
  /** `null` = not installed. Default: the first `pwsh.exe` on the host PATH. */
  pwshExecutable?: string | null;
  timeoutMs?: number;
  /** Aborts the workloads (TALOS is quitting): the running one is killed, the rest never start, no result. */
  signal?: AbortSignal;
};
export type SandboxWorkloadProbeResult = {ok: boolean; reason?: string; workloads: SandboxWorkloadEvidence};

const WORKLOAD_MARKER = 'TALOS_WORKLOAD_OK';
const GIT_BASH_UNSUPPORTED = 'unsupported: MSYS2 runtimes cannot initialise under processcontainer (microsoft/mxc#1061)';

function findOnPath(file: string): string | null {
  for (const entry of String(process.env.PATH ?? '').split(';')) {
    if (!entry || !path.isAbsolute(entry)) continue;
    const candidate = path.join(entry, file);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function createSandboxWorkloadProbe(deps: SandboxWorkloadProbeDeps): () => Promise<SandboxWorkloadProbeResult> {
  const platform = deps.platform ?? process.platform;
  const tempRoot = deps.tempRoot ?? tmpdir();
  const systemRoot = deps.systemRoot ?? process.env.SystemRoot ?? 'C:\\Windows';
  const comSpec = deps.comSpec ?? process.env.ComSpec ?? path.join(systemRoot, 'System32', 'cmd.exe');
  const nodeExecutable = deps.nodeExecutable ?? process.execPath;
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const signal = deps.signal;
  return async () => {
    if (signal?.aborted) throw isolationCheckAborted();
    const workloads: SandboxWorkloadEvidence = {cmd: 'not run', node: 'not run', powershell: 'not run', pwsh: 'not run', gitBash: GIT_BASH_UNSUPPORTED};
    if (platform !== 'win32') return {ok: false, reason: 'PROCESS_TREE_PROBE_REQUIRES_WINDOWS', workloads};
    const pwsh = deps.pwshExecutable === undefined ? findOnPath('pwsh.exe') : deps.pwshExecutable;
    const powershellArgs = (marker: string) => ['-NoProfile', '-NonInteractive', '-Command', `Set-Content -LiteralPath ${marker} -Value ${WORKLOAD_MARKER}`];
    const plan: Array<[keyof SandboxWorkloadEvidence, string | null, string[]]> = [
      ['cmd', comSpec, ['/d', '/c', `echo ${WORKLOAD_MARKER}>cmd.ok`]],
      ['node', nodeExecutable, ['-e', `require('fs').writeFileSync('node.ok','${WORKLOAD_MARKER}')`]],
      ['powershell', path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), powershellArgs('powershell.ok')],
      ['pwsh', pwsh, powershellArgs('pwsh.ok')],
    ];
    const directory = await mkdtemp(path.join(tempRoot, 'talos-workloads-'));
    try {
      for (const [name, executable, args] of plan) {
        if (signal?.aborted) break;
        if (!executable) {workloads[name] = 'not-installed'; continue;}
        let handle: SandboxedSpawnHandle;
        try {handle = await deps.spawn({executable, args, cwd: directory, probeDirectory: directory});}
        catch (error) {workloads[name] = `failed: spawn ${error instanceof Error ? error.message : String(error)}`.slice(0, 300); continue;}
        let timer: ReturnType<typeof setTimeout> | undefined;let onAbort: (() => void) | undefined;
        const stopped = new Promise<'aborted'>(resolve => {onAbort = () => resolve('aborted'); if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, {once: true});});
        const exit = await Promise.race([handle.exited, stopped, new Promise<'timeout'>(resolve => {timer = setTimeout(() => resolve('timeout'), timeoutMs);})]).finally(() => {if (timer) clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort);});
        if (exit === 'aborted') {try {await handle.kill();} catch {} await Promise.race([handle.exited, delay(1_000)]); break;}
        if (exit === 'timeout') {try {await handle.kill();} catch {} workloads[name] = `failed: no exit within ${Math.round(timeoutMs / 1000)}s`; continue;}
        let written = '';
        try {written = (await readFile(path.join(directory, `${name}.ok`), 'utf8')).trim();} catch {}
        const exitCode = exit ? exit.exitCode : undefined;
        workloads[name] = exitCode === 0 && written === WORKLOAD_MARKER ? 'ok' : `failed: ${describeExitStatus(exit)}${written === WORKLOAD_MARKER ? '' : ', no marker written'}`;
      }
    } finally {
      try {await rm(directory, {recursive: true, force: true, maxRetries: 20, retryDelay: 100});} catch {}
    }
    if (signal?.aborted) throw isolationCheckAborted();
    const broken = (['cmd', 'node', 'powershell'] as const).filter(name => workloads[name] !== 'ok');
    return broken.length === 0 ? {ok: true, workloads} : {ok: false, reason: `PROCESS_TREE_PROBE_WORKLOAD_FAILED: ${broken.map(name => `${name} ${workloads[name]}`).join('; ')}`, workloads};
  };
}
