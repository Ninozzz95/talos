import {createHash} from 'node:crypto';
import path from 'node:path';
import type {SandboxPolicy} from '@microsoft/mxc-sdk';
import {createExecutionBroker,type ExecutionBackend,type ExecutionBroker} from './execution-broker.ts';
import {MXC_CHILD_ENVIRONMENT_NAMES,MXC_UI_POLICY,createMxcExecutionBackend,loadMxcSdk,mxcChildEnvironment,windowsCommandLine,type MxcSdk} from './mxc-execution-backend.ts';
import {createProcessTreeEvidenceStore,type ProcessTreeEvidenceStore} from './process-tree-evidence-store.ts';
import {createWorkerSupportProbe} from './mxc-support-probe.ts';
import {createHostProcessTreeProbe,createSandboxWorkloadProbe,isolationCheckAborted,type ProcessTreeProbeResult,type SandboxWorkloadProbeResult,type SandboxedSpawn} from './process-tree-probe.ts';
import {createSandboxBoundaryProbe,type SandboxBoundaryEvidence} from './sandbox-boundary-probe.ts';

/*
 * ⭐⭐⭐ B1 slice 19 — THE PROBE'S ENVIRONMENT IS AN ALLOWLIST, BECAUSE IT GOES ON A COMMAND LINE.
 *
 * SDK 0.8.0 copies the environment it is given into the configuration it passes as `--config-base64` on
 * the `wxc-exec.exe` command line (`dist/sandbox.js`, `injectEnvIntoConfig`; `dist/helper.js`,
 * `resolveBinaryAndCommonArgs`), and a command line is what process auditing records.
 *  · Round 1 passed `process.env` filtered by the kernel's name-shape denylist. Adversarial review
 *    measured 24 of 29 realistic secret-bearing names with no credential shape (DATABASE_URL, SENTRY_DSN,
 *    GH_PAT, MYSQL_PWD, HTTPS_PROXY with credentials, GIT_CONFIG_PARAMETERS carrying an authorization
 *    header…) decoded out of that argument, and one 15,000-character variable was enough to approach
 *    ENAMETOOLONG. A denylist cannot know what a value holds.
 *  · The probe executor runs a fixed script that reads nothing from its environment (the folder arrives
 *    in argv, the binary is `process.execPath`: `process-tree-probe.ts`, EXECUTOR_SOURCE and
 *    DESCENDANT_SOURCE). It gets the system variables below and nothing else, as decided by the
 *    coordinator. ⛔ A name is added only when a measurement shows the executor needs it.
 *  · ⛔⛔ R0 lane S (2026-09-23): that list had no LOCALAPPDATA, and with it every sandboxed process died before
 *    its first instruction (`WIN32_ERROR(203)`, measured; microsoft/mxc#1130). The probe now gets EXACTLY the
 *    environment every brokered command gets — `MXC_CHILD_ENVIRONMENT_NAMES` in `mxc-execution-backend.ts`, where
 *    each name carries its measurement — so "verified" is a statement about the container commands really run in.
 */
export const PROBE_ENVIRONMENT_NAMES: readonly string[] = MXC_CHILD_ENVIRONMENT_NAMES;

/** Only the allowlisted names this host defines, PATH System32-first. On Windows `process.env` lookups ignore case. */
export function probeEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return mxcChildEnvironment(source);
}

type Options = {
  paths: {cacheRoot: string};
  platform?: NodeJS.Platform;
  sdk?: unknown;
  sdkLoader?: () => Promise<unknown>;
  store?: ProcessTreeEvidenceStore;
  probe?: () => Promise<ProcessTreeProbeResult>;
  /** The platform evidence from elsewhere (tests); wins over the worker. */
  supportProbe?: () => Promise<import('./mxc-execution-backend.ts').MxcPlatformEvidence>;
  /** Startup stall (08/10): where the host is measured. A path = that worker script; `false` = on this thread, the old way; absent = a worker thread when the real sdk is used on Windows. */
  supportWorkerFile?: string | false;
  /** Aborts this backend's check. Default: the process-wide one that `abortIsolationChecks` fires when TALOS quits. */
  signal?: AbortSignal;
};

/*
 * ⭐ R3 (owner, 2026-09-24): the sandbox check starts at startup and is INTERRUPTIBLE. Measured before: a check still running
 * when TALOS quit (the MXC workloads take seconds on a fresh profile, up to 30 s each) kept the process alive after its
 * exit, and the next Ctrl+C reached a process whose raw mode was off and killed it with code 1 (acceptance s09).
 *  · Every check runs under one process-wide AbortSignal and is tracked while it runs. Quitting calls
 *    `abortIsolationChecks()`: the probes end every process they started (process-tree-probe.ts, `stopAll`) and the
 *    call waits for them, bounded, so nothing a check started outlives TALOS.
 *  · An aborted check is NO verdict: the availability question answers "not available", nothing is written to the
 *    evidence store (a verdict landing after the abort is thrown away), and the next start checks again. The
 *    three-signal unanimity rule of the probe is untouched.
 */
let checks = new AbortController();
const runningChecks = new Set<Promise<unknown>>();
/*
 * ⛔ R3 (never a kill on trust): the pids a stopped check could not prove to be its own and therefore left running. The
 * probe states them on its error (`leftover`); quitting hands them to the caller, so they are never silently ignored.
 */
const leftBehind: number[] = [];
function noteLeftover(error: unknown): void {
  const pids = (error as {leftover?: unknown} | null)?.leftover;
  if (Array.isArray(pids)) for (const pid of pids) if (typeof pid === 'number' && !leftBehind.includes(pid)) leftBehind.push(pid);
}
export function isolationCheckSignal(): AbortSignal {return checks.signal;}
function track<T>(task: Promise<T>): Promise<T> {
  const settled: Promise<unknown> = task.then(() => undefined, error => {noteLeftover(error);}).finally(() => {runningChecks.delete(settled);});
  runningChecks.add(settled);
  return task;
}
/** Runs one check under the process-wide abort, tracked until it settles. */
export function runIsolationCheck<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = checks.signal;
  if (signal.aborted) return Promise.reject(isolationCheckAborted());
  return track(run(signal));
}
/**
 * TALOS is quitting: abort every running check and wait (at most `graceMs`) for them to end what they started. Answers
 * the pids a check could not prove to be its own and so left running (R3: never a kill on trust), for the caller to state.
 */
export async function abortIsolationChecks(graceMs = 2_000): Promise<number[]> {
  const previous = checks;checks = new AbortController();sharedBackends.clear();
  previous.abort();
  const pending = [...runningChecks];
  if (pending.length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled(pending), new Promise<void>(resolve => {timer = setTimeout(resolve, graceMs); timer.unref?.();})]);
    if (timer) clearTimeout(timer);
  }
  return leftBehind.splice(0);
}
/** A result the caller waits for, or an AbortError the moment the signal fires, whatever the task does after. */
function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(isolationCheckAborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(isolationCheckAborted());
    signal.addEventListener('abort', onAbort, {once: true});
    task.then(value => {signal.removeEventListener('abort', onAbort); resolve(value);}, error => {signal.removeEventListener('abort', onAbort); reject(error);});
  });
}

/**
 * Runs the probe's executor inside the same MXC containment the broker would use for a command,
 * so the measurement is of the sandbox and not of a bare `child_process` tree.
 *
 * The volume root is granted read-only on purpose. Upstream microsoft/mxc#1109 records that a
 * read-write grant on a user-profile directory is unusable on a BaseContainer host unless the
 * volume root is also in the read-only grants, and that adding `C:\\Users` or the profile
 * directory alone does not fix it. Without this the probe would answer "not verified" forever for
 * a reason that has nothing to do with process trees.
 */
export function mxcSandboxedSpawn(getSdk: () => Promise<MxcSdk>): SandboxedSpawn {
  return async request => {
    const sdk = await getSdk();
    const volumeRoot = path.parse(request.probeDirectory).root;
    const policy: SandboxPolicy = {
      version: '0.8.0-alpha',
      filesystem: {readwritePaths: [request.probeDirectory], readonlyPaths: [volumeRoot], clearPolicyOnExit: true},
      network: {egress: {default: 'deny'}, ingress: {default: 'deny', hostLoopback: 'deny'}},
      /* R0 lane S, owner decision 4: the same UI policy as a brokered command (node.exe dies 0xC0000142 without Win32k). */
      ui: {...MXC_UI_POLICY}
    };
    const identity = `TALOS_CLI_PROBE_${createHash('sha256').update(request.probeDirectory).digest('hex').slice(0, 24)}`;
    const config = sdk.createConfigFromPolicy(policy, 'process', identity);
    config.process = {...(config.process ?? {commandLine: ''}), commandLine: windowsCommandLine([request.executable, ...request.args]), cwd: request.cwd};
    /* ⛔ B1 slice 19: never `process.env`, and never a denylist of it — see PROBE_ENVIRONMENT_NAMES above. */
    const child = sdk.spawnSandboxFromConfig(config, {usePty: false, experimental: true}, request.cwd, probeEnvironment());
    /*
     * B1 slice 12, round 3: `exited` carries HOW the executor ended, so the probe's reason can say it.
     * Measured on this host with the real SDK and this policy: node.exe exits 3221225794 (0xC0000142,
     * STATUS_DLL_INIT_FAILED) within 73-139 ms, and before this the reason could only read «exit status
     * not reported by the sandbox spawner».
     * The promise settles once. `exit` is listened to first and Node emits it before `close`, so the
     * status comes from `exit`; a `close` that arrives without a prior `exit` still settles the wait,
     * with the status it carries or with nothing — never an invented one. A spawn `error` has no status.
     */
    let done: (exit: {exitCode: number | null; signal: string | null} | void) => void = () => {};
    const exited = new Promise<{exitCode: number | null; signal: string | null} | void>(resolve => {done = resolve;});
    child.once('exit', (code, signal) => done({exitCode: code, signal}));
    child.once('close', (code?: number | null, signal?: NodeJS.Signals | null) => done(code === undefined ? undefined : {exitCode: code, signal: signal ?? null}));
    child.once('error', () => done());
    return {pid: child.pid ?? undefined, kill: () => {try {child.kill();} catch {}}, exited};
  };
}

/**
 * The process-tree measurement first (its reason is the one a person has read until now), then the real workloads
 * (gate E3). Verified only when both are; the workload evidence rides on the process-tree evidence either way.
 */
export function withWorkloads(tree: () => Promise<ProcessTreeProbeResult>, workloads: () => Promise<SandboxWorkloadProbeResult>, boundary?: () => Promise<SandboxBoundaryEvidence>): () => Promise<ProcessTreeProbeResult> {
  return async () => {
    const measured = await tree();
    if (!measured.verified) return measured;
    const ran = await workloads();
    /* F-021: the boundary (token, a write outside, the network) is measured only on a host whose sandbox works at all */
    const evidence = {...measured.evidence, workloads: ran.workloads, ...(ran.ok && boundary ? {boundary: await boundary()} : {})};
    return ran.ok ? {verified: true, evidence} : {verified: false, reason: ran.reason ?? 'PROCESS_TREE_PROBE_WORKLOAD_FAILED', evidence};
  };
}

/**
 * Whether a cached record answers for the DEFAULT probe. R0 lane S: one written before the probe ran the workloads says nothing
 * about them. F-021 (03/10): likewise a VERIFIED one written before the boundary probe existed says nothing about the boundary,
 * so it is measured again once (an unverified one stays: re-probing a broken sandbox at every start would only cost time).
 */
export function recordAnswersForDefaultProbe(record: ProcessTreeProbeResult): boolean {
  return record.evidence?.workloads !== undefined && (!record.verified || record.evidence?.boundary !== undefined);
}

/**
 * Where the host's platform evidence is measured (startup stall, 08/10): an injected probe (tests) wins; otherwise on a worker thread, which is the default on Windows
 * with the real sdk, or wherever a worker script is named; an injected sdk or loader, `supportWorkerFile: false`, or another platform keep the old in-process way.
 */
export function supportMeasurement(options: Pick<Options, 'sdk' | 'sdkLoader' | 'supportProbe' | 'supportWorkerFile'>, platform: NodeJS.Platform): 'probe' | 'worker' | 'in-process' {
  if (options.supportProbe !== undefined) return 'probe';
  if (platform !== 'win32' || options.supportWorkerFile === false) return 'in-process';
  if (typeof options.supportWorkerFile === 'string') return 'worker';
  return options.sdk === undefined && options.sdkLoader === undefined ? 'worker' : 'in-process';
}

export function createVerifiedMxcBackend(options: Options): ExecutionBackend {
  const platform = options.platform ?? process.platform;
  const signal = options.signal ?? isolationCheckSignal();
  const store = options.store ?? createProcessTreeEvidenceStore({cacheRoot: options.paths.cacheRoot});
  let sdkPromise: Promise<MxcSdk> | undefined;
  const getSdk = () => sdkPromise ??= options.sdk !== undefined
    ? Promise.resolve(options.sdk as MxcSdk)
    : options.sdkLoader !== undefined ? (options.sdkLoader as () => Promise<MxcSdk>)() : loadMxcSdk();
  const probe = options.probe ?? withWorkloads(createHostProcessTreeProbe({platform, spawn: mxcSandboxedSpawn(getSdk), signal}), createSandboxWorkloadProbe({platform, spawn: mxcSandboxedSpawn(getSdk), signal}), createSandboxBoundaryProbe({platform, spawn: mxcSandboxedSpawn(getSdk), signal}));
  /*
   * ⛔ R0 lane S: a record written by the default probe before it ran the workloads says nothing about them (a
   *   positive one lives 24 h). Only a record that carries the workload evidence answers for the default probe; an
   *   injected probe owns its own records.
   */
  const answersForThisProbe = (record: ProcessTreeProbeResult) => options.probe !== undefined || recordAnswersForDefaultProbe(record);

  // One measurement per backend instance: the cache lookup and the probe tree both happen at most once.
  let pending: Promise<ProcessTreeProbeResult> | undefined;
  const verify = () => pending ??= track((async () => {
    if (signal.aborted) throw isolationCheckAborted();
    const cached = await store.read();
    if (cached && answersForThisProbe(cached)) return cached;
    /* The probe is tracked too, so quitting waits (bounded) for it to end the processes it started. */
    const measured = await untilAborted(track(probe()), signal);
    /* ⛔ An aborted check is no verdict: a result that lands after the abort is never trusted nor cached. */
    if (signal.aborted) throw isolationCheckAborted();
    /* ⛔ R3: a check that left running a process it could not prove its own is stated, never cached — the next start checks again. */
    if ((measured.evidence?.cleanup?.leftover?.length ?? 0) > 0) return measured;
    // The cache is an optimisation, never a gate: an unwritable cache must not make a verified host unavailable.
    try {await store.write(measured);} catch {}
    return measured;
  })());

  /* Startup stall (08/10, mxc-support-probe.ts): the sdk's host measurement is three synchronous child processes (~115 ms of the main thread on a resume).
     In production it runs on a worker thread, once; injected sdks and loaders (tests) keep the old way unless a worker script is named. */
  const measurement = supportMeasurement(options, platform);
  const supportProbe = options.supportProbe ?? (measurement === 'worker'
    ? createWorkerSupportProbe({...(typeof options.supportWorkerFile === 'string' ? {workerFile: options.supportWorkerFile} : {}), signal, inProcess: async () => (await getSdk()).getPlatformSupport()})
    : undefined);
  return createMxcExecutionBackend({platform, sdkLoader: getSdk, ...(supportProbe ? {supportProbe} : {}), verifyProcessTreeKillOnClose: verify});
}

/*
 * R0 (2026-09-23, owner: wire the real sandbox state into auto mode). One verified backend per cache root and process,
 * shared by the broker and by the auto classifier's isolation source, so the host is probed once and both answer from
 * the same measurement. Injected SDKs, stores or probes (tests) always get their own backend.
 */
const sharedBackends = new Map<string, ExecutionBackend>();
function sharedVerifiedBackend(options: Options): ExecutionBackend {
  if (options.sdk !== undefined || options.sdkLoader !== undefined || options.store !== undefined || options.probe !== undefined) return createVerifiedMxcBackend(options);
  const key = `${options.platform ?? process.platform} ${options.paths.cacheRoot}`;
  let backend = sharedBackends.get(key);
  if (!backend) { backend = createVerifiedMxcBackend(options); sharedBackends.set(key, backend); }
  return backend;
}

export function createCliExecutionBroker(options: Options): ExecutionBroker {
  return createExecutionBroker({platform: options.platform ?? process.platform, windowsSandbox: sharedVerifiedBackend(options)});
}

/*
 * Stress test 0.5.4, suspicion 2: the measurement never keeps TALOS alive (its worker is unref'd, mxc-support-probe.ts), which is right while
 * nobody needs it; but the auto classifier AWAITS this answer, and in a one-shot command (`config permissions dry-run`) nothing else was
 * running, so Node ended the process with exit 0 and no output. Whoever asks holds the process open until the answer lands; quitting still
 * ends the wait through the abort signal. Node docs (worker.unref): "allows the thread to exit if this is the only active handle".
 */
async function holdingTheProcess<T>(work: Promise<T>): Promise<T> {
  const hold = setInterval(() => {}, 1 << 30);
  try {return await work;} finally {clearInterval(hold);}
}

/** Isolation state for the auto classifier: verified only when the same backend the broker uses is available. */
export function cliShellIsolation(options: Options): () => Promise<{verified: boolean; reason?: string; aborted?: boolean}> {
  return async () => {
    const platform = options.platform ?? process.platform;
    if (platform !== 'win32') return {verified: false, reason: `no verified sandbox backend on ${platform}`};
    /* R3: a check stopped because TALOS is quitting answers nothing (`aborted`), never a verdict. */
    const signal = options.signal ?? isolationCheckSignal();
    try {
      const state = await holdingTheProcess(sharedVerifiedBackend(options).available());
      if (signal.aborted) return {verified: false, aborted: true, reason: 'the check was stopped before it finished'};
      return {verified: state.available === true, ...(state.reason ? {reason: state.reason} : {})};
    }
    catch (error) { return signal.aborted ? {verified: false, aborted: true, reason: 'the check was stopped before it finished'} : {verified: false, reason: error instanceof Error ? error.message : String(error)}; }
  };
}
