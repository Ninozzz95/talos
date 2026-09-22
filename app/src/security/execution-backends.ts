import {createHash} from 'node:crypto';
import path from 'node:path';
import type {SandboxPolicy} from '@microsoft/mxc-sdk';
import {createExecutionBroker,type ExecutionBackend,type ExecutionBroker} from './execution-broker.ts';
import {createMxcExecutionBackend,loadMxcSdk,windowsCommandLine,type MxcSdk} from './mxc-execution-backend.ts';
import {createProcessTreeEvidenceStore,type ProcessTreeEvidenceStore} from './process-tree-evidence-store.ts';
import {createHostProcessTreeProbe,type ProcessTreeProbeResult,type SandboxedSpawn} from './process-tree-probe.ts';

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
 */
export const PROBE_ENVIRONMENT_NAMES: readonly string[] = Object.freeze(['SystemRoot', 'windir', 'SystemDrive', 'TEMP', 'TMP', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']);

/** Only the allowlisted names this host defines. On Windows `process.env` lookups ignore case. */
export function probeEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of PROBE_ENVIRONMENT_NAMES) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

type Options = {
  paths: {cacheRoot: string};
  platform?: NodeJS.Platform;
  sdk?: unknown;
  sdkLoader?: () => Promise<unknown>;
  store?: ProcessTreeEvidenceStore;
  probe?: () => Promise<ProcessTreeProbeResult>;
};

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
      ui: {allowWindows: false, clipboard: 'none', allowInputInjection: false}
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

export function createVerifiedMxcBackend(options: Options): ExecutionBackend {
  const platform = options.platform ?? process.platform;
  const store = options.store ?? createProcessTreeEvidenceStore({cacheRoot: options.paths.cacheRoot});
  let sdkPromise: Promise<MxcSdk> | undefined;
  const getSdk = () => sdkPromise ??= options.sdk !== undefined
    ? Promise.resolve(options.sdk as MxcSdk)
    : options.sdkLoader !== undefined ? (options.sdkLoader as () => Promise<MxcSdk>)() : loadMxcSdk();
  const probe = options.probe ?? createHostProcessTreeProbe({platform, spawn: mxcSandboxedSpawn(getSdk)});

  // One measurement per backend instance: the cache lookup and the probe tree both happen at most once.
  let pending: Promise<ProcessTreeProbeResult> | undefined;
  const verify = () => pending ??= (async () => {
    const cached = await store.read();
    if (cached) return cached;
    const measured = await probe();
    // The cache is an optimisation, never a gate: an unwritable cache must not make a verified host unavailable.
    try {await store.write(measured);} catch {}
    return measured;
  })();

  return createMxcExecutionBackend({platform, sdkLoader: getSdk, verifyProcessTreeKillOnClose: verify});
}

export function createCliExecutionBroker(options: Options): ExecutionBroker {
  return createExecutionBroker({platform: options.platform ?? process.platform, windowsSandbox: createVerifiedMxcBackend(options)});
}
