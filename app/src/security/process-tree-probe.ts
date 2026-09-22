import {execFile as nodeExecFile,spawn as nodeSpawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

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
  cleanup: {descendantKilled: boolean; executorKilled: boolean; directoryRemoved: boolean};
};

export type ProcessTreeProbeResult = {verified: boolean; reason?: string; evidence: ProcessTreeEvidence};

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
};

const SCHEMA = 'talos.cli.process-tree-evidence.v1';
const SCOPE = 'createprocess-descendant';
const HEARTBEAT = 'heartbeat.json';
const BEAT_INTERVAL_MS = 75;
const SELF_DESTRUCT_MS = 60_000;

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
import path from 'node:path';
const directory = process.argv[2];
const descendant = spawn(process.execPath, [path.join(directory, 'descendant.mjs'), directory], {cwd: directory, stdio: 'ignore', windowsHide: true, detached: true});
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

const delay = (ms: number) => new Promise<void>(resolve => {setTimeout(resolve, ms);});

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
  const runExecFile = deps.execFile ?? (async (file, args) => {
    const {stdout} = await promisify(nodeExecFile)(file, [...args], {windowsHide: true, maxBuffer: 32 * 1024 * 1024});
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
      await delay(30);
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
    while (Date.now() < deadline) {
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
      await delay(40);
    }
    return null;
  }

  async function waitGone(pid: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && signalZero(pid) === 'alive') await delay(50);
  }

  return async (): Promise<ProcessTreeProbeResult> => {
    const observedAtMs = now();
    const startedAt = Date.now();
    const signals: ProcessTreeEvidence['signals'] = {heartbeat: 'unknown', signalZero: 'unknown', enumeration: 'unknown'};
    const cleanup = {descendantKilled: false, executorKilled: false, directoryRemoved: false};
    let reason: string | undefined;

    if (platform !== 'win32') {
      return {
        verified: false,
        reason: 'PROCESS_TREE_PROBE_REQUIRES_WINDOWS',
        evidence: {schema: SCHEMA, scope: SCOPE, signals, executorPid: null, descendantPid: null, observedAtMs, durationMs: Date.now() - startedAt, cleanup}
      };
    }

    const directory = await mkdtemp(path.join(tempRoot, 'talos-process-tree-'));
    let handle: SandboxedSpawnHandle | undefined;
    let executorPid: number | null = null;
    let descendantPid: number | null = null;

    try {
      await writeFile(path.join(directory, 'executor.mjs'), EXECUTOR_SOURCE, 'utf8');
      await writeFile(path.join(directory, 'descendant.mjs'), DESCENDANT_SOURCE, 'utf8');
      handle = await spawnSandboxed({executable: nodeExecutable, args: [path.join(directory, 'executor.mjs'), directory], cwd: directory, probeDirectory: directory});
      executorPid = handle.pid ?? null;

      const waited = await waitForDescendant(directory, handle.exited);
      if (waited === null) {
        reason = 'PROCESS_TREE_PROBE_DESCENDANT_NEVER_APPEARED';
      } else if ('executorExited' in waited) {
        reason = `PROCESS_TREE_PROBE_EXECUTOR_EXITED: ${describeExitStatus(waited.executorExited)}`;
      } else {
        const appeared = waited.appeared;
        descendantPid = appeared.pid;
        await handle.kill();
        await Promise.race([handle.exited, delay(executorExitTimeoutMs)]);
        await delay(settleMs);
        const before = await readBeatSettled(directory);
        await delay(heartbeatWindowMs);
        const after = await readBeatSettled(directory);
        signals.heartbeat = before && after ? (after.seq > before.seq ? 'alive' : 'gone') : 'unknown';
        signals.signalZero = signalZero(descendantPid);
        signals.enumeration = await enumerate(descendantPid);
        const observed = [signals.heartbeat, signals.signalZero, signals.enumeration];
        if (observed.includes('unknown')) reason = 'PROCESS_TREE_PROBE_SIGNALS_INDETERMINATE';
        else if (observed.every(value => value === 'gone')) reason = undefined;
        else if (observed.every(value => value === 'alive')) reason = 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED';
        else reason = 'PROCESS_TREE_PROBE_SIGNALS_DISAGREE';
      }
    } finally {
      if (descendantPid !== null && signalZero(descendantPid) === 'alive') {
        try {killPid(descendantPid); cleanup.descendantKilled = true;} catch {}
        await waitGone(descendantPid, 5_000);
      }
      if (handle) {
        const executorWasAlive = executorPid !== null && signalZero(executorPid) === 'alive';
        try {await handle.kill();} catch {}
        if (executorWasAlive) {
          cleanup.executorKilled = true;
          await waitGone(executorPid!, 5_000);
        }
      }
      try {
        await rm(directory, {recursive: true, force: true, maxRetries: 20, retryDelay: 100});
        cleanup.directoryRemoved = true;
      } catch {}
    }

    return {
      verified: reason === undefined,
      ...(reason === undefined ? {} : {reason}),
      evidence: {schema: SCHEMA, scope: SCOPE, signals, executorPid, descendantPid, observedAtMs, durationMs: Date.now() - startedAt, cleanup}
    };
  };
}
