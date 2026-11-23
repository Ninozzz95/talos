import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test,{after} from 'node:test';
import {spawn} from 'node:child_process';
import {PROBE_ENVIRONMENT_NAMES,createCliExecutionBroker,createVerifiedMxcBackend,mxcSandboxedSpawn,probeEnvironment,supportMeasurement,withWorkloads} from '../../src/security/execution-backends.ts';
import {createSandboxWorkloadProbe} from '../../src/security/process-tree-probe.ts';
import {loadMxcSdk} from '../../src/security/mxc-execution-backend.ts';
import type {ExecutionRequest} from '../../src/security/execution-broker.ts';
import type {ProcessTreeEvidenceStore} from '../../src/security/process-tree-evidence-store.ts';
import type {ProcessTreeProbeResult} from '../../src/security/process-tree-probe.ts';

function probeResult(verified: boolean): ProcessTreeProbeResult {
  return {
    verified,
    ...(verified ? {} : {reason: 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED'}),
    evidence: {
      schema: 'talos.cli.process-tree-evidence.v1',
      scope: 'createprocess-descendant',
      signals: verified ? {heartbeat: 'gone', signalZero: 'gone', enumeration: 'gone'} : {heartbeat: 'alive', signalZero: 'alive', enumeration: 'alive'},
      executorPid: 101,
      descendantPid: 202,
      observedAtMs: 5,
      durationMs: 6,
      cleanup: {descendantKilled: !verified, executorKilled: true, directoryRemoved: true}
    }
  };
}

function memoryStore(seed: ProcessTreeProbeResult | null = null) {
  const state = {value: seed, writes: [] as ProcessTreeProbeResult[]};
  const store: ProcessTreeEvidenceStore = {
    read: async () => state.value,
    write: async value => {state.writes.push(value); state.value = value;}
  };
  return {store, state};
}

function fakeSdk() {
  return {
    getPlatformSupport: () => ({isSupported: true, availableMethods: ['processcontainer'], isolationTier: 'base-container' as const}),
    createConfigFromPolicy: () => ({version: '0.8.0-alpha', process: {commandLine: ''}}),
    spawnSandboxFromConfig: () => {
      const child = new EventEmitter() as EventEmitter & {stdout: PassThrough; stderr: PassThrough; kill(): boolean};
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      queueMicrotask(() => {child.stdout.end('ok'); child.stderr.end(''); child.emit('close', 0, null);});
      return child;
    }
  };
}

const roots: string[] = [];
after(async () => {for (const directory of roots) await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'talos-backends-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const cacheRoot = join(root, 'cache');
  await mkdir(workspace);
  await mkdir(cacheRoot);
  const request: ExecutionRequest = {
    id: 'run-backends', executable: process.execPath, args: ['--version'], cwd: workspace,
    readWritePaths: [workspace], readOnlyPaths: [], network: 'deny', requiredEnforcement: 'windows-sandbox'
  };
  return {root, workspace, cacheRoot, request};
}

test('the probe runs once per backend instance across available and execute', async () => {
  const f = await fixture();
  let calls = 0;
  const {store} = memoryStore();
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => {calls++; return probeResult(true);}
  });
  assert.equal((await backend.available()).available, true);
  await backend.execute({request: f.request, windowsSandboxPolicy: {version: '0.1.0', identity: 'TALOS_CLI_TEST', appContainer: true, disallowWin32kSystemCalls: false, fsReadWrite: [f.workspace], fsReadOnly: [], capabilities: []}});
  assert.equal(calls, 1, 'inspect() runs for both available() and execute(): without memoisation every command spawns a probe tree');
});

test('cached evidence is reused and the probe is never spawned', async () => {
  const f = await fixture();
  let calls = 0;
  const {store, state} = memoryStore(probeResult(true));
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => {calls++; return probeResult(true);}
  });
  assert.equal((await backend.available()).available, true);
  assert.equal(calls, 0);
  assert.equal(state.writes.length, 0);
});

test('a fresh probe result is persisted to the evidence store', async () => {
  const f = await fixture();
  const {store, state} = memoryStore();
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => probeResult(false)
  });
  assert.equal((await backend.available()).available, false);
  assert.deepEqual(state.writes, [probeResult(false)]);
});

test('an unverified probe leaves the backend unavailable and execute refuses with the probe reason verbatim', async () => {
  const f = await fixture();
  const {store} = memoryStore();
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => probeResult(false)
  });
  const availability = await backend.available();
  assert.equal(availability.available, false);
  assert.equal(availability.reason, 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED');
  await assert.rejects(
    () => backend.execute({request: f.request, windowsSandboxPolicy: {version: '0.1.0', identity: 'TALOS_CLI_TEST', appContainer: true, disallowWin32kSystemCalls: false, fsReadWrite: [f.workspace], fsReadOnly: [], capabilities: []}}),
    {code:'MXC_BACKEND_UNAVAILABLE',message:'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED'}// R2 lane E realignment (gate E6): code on error.code
  );
});

test('the CLI broker fails closed when the process-tree probe is unverified', async () => {
  const f = await fixture();
  const {store} = memoryStore();
  const broker = createCliExecutionBroker({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => probeResult(false)
  });
  await assert.rejects(() => broker.execute(f.request), (error: any) => error?.code === 'SANDBOX_REQUIRED_UNAVAILABLE' && error?.component === 'execution-broker');
});

test('a verified CLI broker run carries the process-tree measurement into the execution evidence', async () => {
  const f = await fixture();
  const {store} = memoryStore();
  const broker = createCliExecutionBroker({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk: fakeSdk(), store,
    probe: async () => probeResult(true)
  });
  const outcome = await broker.execute(f.request);
  assert.equal(outcome.evidence.processTree, 'job-object-kill-on-close');
  assert.deepEqual(outcome.evidence.processTreeEvidence, probeResult(true).evidence);
  assert.equal(outcome.evidence.backend, 'microsoft-mxc-0.8.0');
});

test('the CLI broker never reports a Windows sandbox on another platform', async () => {
  const f = await fixture();
  let calls = 0;
  const {store} = memoryStore();
  const broker = createCliExecutionBroker({
    paths: {cacheRoot: f.cacheRoot}, platform: 'linux', sdk: fakeSdk(), store,
    probe: async () => {calls++; return probeResult(true);}
  });
  await assert.rejects(() => broker.execute(f.request), (error: any) => error?.code === 'SANDBOX_REQUIRED_UNAVAILABLE');
  assert.equal(calls, 0);
});

/*
 * ⭐ B1 slice 12, round 3 — THE SANDBOX SPAWNER SAYS HOW THE EXECUTOR ENDED.
 * Measured on this host with the real SDK and the production probe policy: `node.exe` exits
 * 3221225794 (0xC0000142) within 73-139 ms. The probe can only put that status in its reason if
 * the spawner hands it over; before this round it resolved `exited` with nothing, and the real
 * line read «exit status not reported by the sandbox spawner».
 */
function sdkSpawning(makeChild: () => any) {
  return {
    getPlatformSupport: () => ({isSupported: true, availableMethods: ['processcontainer'], isolationTier: 'base-container' as const}),
    createConfigFromPolicy: () => ({version: '0.8.0-alpha', process: {commandLine: ''}}),
    spawnSandboxFromConfig: () => makeChild()
  };
}
function emitterChild() {
  const child = new EventEmitter() as EventEmitter & {pid: number; kill(): boolean};
  child.pid = 4242;
  child.kill = () => true;
  return child;
}
async function spawnRequest() {
  const f = await fixture();
  return {executable: process.execPath, args: ['--version'], cwd: f.workspace, probeDirectory: f.workspace};
}
const HUNG = Symbol('hung');
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | typeof HUNG> {
  return Promise.race([promise, new Promise<typeof HUNG>(resolve => {setTimeout(() => resolve(HUNG), ms).unref();})]);
}

test('the sandbox spawner resolves a real child exit with its exit code', async () => {
  const handle = await mxcSandboxedSpawn(async () => sdkSpawning(() => spawn(process.execPath, ['-e', 'process.exit(7)'], {stdio: 'ignore', windowsHide: true})) as any)(await spawnRequest());
  assert.deepEqual(await settleWithin(handle.exited, 10_000), {exitCode: 7, signal: null});
});

test('the sandbox spawner resolves a signal-terminated child with the signal and no exit code', async () => {
  const handle = await mxcSandboxedSpawn(async () => sdkSpawning(() => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore', windowsHide: true})) as any)(await spawnRequest());
  await handle.kill();
  assert.deepEqual(await settleWithin(handle.exited, 10_000), {exitCode: null, signal: 'SIGTERM'});
});

test('the sandbox spawner resolves once, from exit, even when close reports something else afterwards', async () => {
  const child = emitterChild();
  const handle = await mxcSandboxedSpawn(async () => sdkSpawning(() => child) as any)(await spawnRequest());
  child.emit('exit', 3221225794, null);
  child.emit('close', 0, null);
  assert.deepEqual(await settleWithin(handle.exited, 1_000), {exitCode: 3221225794, signal: null});
});

test('a close without a prior exit still resolves, with its status when it carries one and never hanging', async () => {
  const withStatus = emitterChild();
  const reported = await mxcSandboxedSpawn(async () => sdkSpawning(() => withStatus) as any)(await spawnRequest());
  withStatus.emit('close', 3221225794, null);
  assert.deepEqual(await settleWithin(reported.exited, 1_000), {exitCode: 3221225794, signal: null});
  const bare = emitterChild();
  const silent = await mxcSandboxedSpawn(async () => sdkSpawning(() => bare) as any)(await spawnRequest());
  bare.emit('close');
  const outcome = await settleWithin(silent.exited, 1_000);
  assert.notEqual(outcome, HUNG, 'a close with nothing to say must still end the wait');
  assert.equal(outcome, undefined, 'and must not invent a status it was not given');
});

test('the real backend reports the executor exit status in its availability reason', async () => {
  const f = await fixture();
  const {store} = memoryStore();
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', store,
    sdk: sdkSpawning(() => {const child = emitterChild(); queueMicrotask(() => child.emit('exit', 3221225794, null)); return child;})
  });
  const availability = await backend.available();
  assert.equal(availability.available, false);
  assert.equal(availability.reason, 'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
});

/*
 * ⭐⭐⭐ R0 lane S — S1 and S2, measured on this host on 2026-09-23 (Windows 11 26200.9457, Node 24.18.0, SDK 0.8.0).
 * S1: with the probe allowlist of B1 slice 19 (no LOCALAPPDATA) every sandboxed process dies before it starts:
 *     `CreateProcessW(PROC_THREAD_ATTRIBUTE_SECURITY_ENVIRONMENT) failed: WIN32_ERROR(203)` (ERROR_ENVVAR_NOT_FOUND);
 *     only LOCALAPPDATA turns it green (microsoft/mxc#1130, closed 2026-09-14: "SystemRoot + LOCALAPPDATA").
 * S2: node.exe and powershell.exe under `ui.allowWindows:false` (DisallowWin32kSystemCalls) exit 3221225794
 *     (0xC0000142 STATUS_DLL_INIT_FAILED); cmd.exe runs either way. Codex keeps Win32k on (codex mxc-sandbox
 *     policy.rs, 2026-09-22). Owner decision 4: Win32k allowed, clipboard and input injection stay blocked.
 */
function policyRecordingSdk() {
  const seen: {policy?: any; environment?: NodeJS.ProcessEnv} = {};
  const sdk = {
    getPlatformSupport: () => ({isSupported: true, availableMethods: ['processcontainer'], isolationTier: 'base-container' as const}),
    createConfigFromPolicy: (policy: any) => {seen.policy = policy; return {version: '0.8.0-alpha', process: {commandLine: ''}};},
    spawnSandboxFromConfig: (_config: unknown, _options: unknown, _cwd: unknown, environment?: NodeJS.ProcessEnv) => {seen.environment = environment; const child = emitterChild(); queueMicrotask(() => child.emit('exit', 0, null)); return child;}
  };
  return {sdk, seen};
}

test('S1 — the probe environment carries what MXC and the real workloads need, System32 first on PATH, and nothing secret', async () => {
  const source: Record<string, string> = {
    SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', SystemDrive: 'C:', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
    USERPROFILE: 'C:\\Users\\u', TEMP: 'C:\\Users\\u\\AppData\\Local\\Temp', TMP: 'C:\\Users\\u\\AppData\\Local\\Temp', PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\system32\\cmd.exe',
    PATH: 'C:\\Program Files\\Git\\usr\\bin;relative\\bin;;C:\\Program Files\\nodejs\\;C:\\Windows\\system32;C:\\Windows',
    OPENAI_API_KEY: 'dummy-lane-s', DATABASE_URL: 'postgres://dummy:dummy@db.invalid/x', GIT_CONFIG_PARAMETERS: 'dummy', HOMEPATH: '\\Users\\u'
  };
  const environment = probeEnvironment(source);
  for (const name of ['SystemRoot', 'windir', 'SystemDrive', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'ComSpec']) assert.ok(Object.keys(environment).some(key => key.toUpperCase() === name.toUpperCase()), `${name} must reach the container`);
  for (const name of ['OPENAI_API_KEY', 'DATABASE_URL', 'GIT_CONFIG_PARAMETERS', 'HOMEPATH']) assert.equal(Object.hasOwn(environment, name), false, `${name} is not on the allowlist`);
  const entries = String(environment.PATH).split(';');
  assert.equal(entries[0], 'C:\\Windows\\System32', 'System32 comes first, so a GNU tool of the same name never shadows it');
  assert.ok(entries.indexOf('C:\\Program Files\\nodejs\\') > entries.indexOf('C:\\Windows\\System32'), 'the host entries follow');
  assert.ok(entries.indexOf('C:\\Program Files\\Git\\usr\\bin') > entries.indexOf('C:\\Windows'), 'Git usr/bin can no longer shadow a Windows tool');
  assert.equal(entries.includes('relative\\bin'), false, 'a relative PATH entry is a planting vector and is dropped');
  assert.equal(entries.includes(''), false);
  assert.equal(entries.filter(entry => entry.toLowerCase().replace(/\\$/u, '') === 'c:\\windows\\system32').length, 1, 'no duplicate System32');
  assert.ok(PROBE_ENVIRONMENT_NAMES.includes('LOCALAPPDATA'));
});

test('S2 — the probe policy allows Win32k and keeps clipboard, input injection, filesystem and network limits', async () => {
  const {sdk, seen} = policyRecordingSdk();
  const request = await spawnRequest();
  const handle = await mxcSandboxedSpawn(async () => sdk as any)(request);
  await handle.exited;
  assert.deepEqual(seen.policy.ui, {allowWindows: true, clipboard: 'none', allowInputInjection: false});
  assert.deepEqual(seen.policy.network, {egress: {default: 'deny'}, ingress: {default: 'deny', hostLoopback: 'deny'}});
  assert.deepEqual(seen.policy.filesystem.readwritePaths, [request.probeDirectory]);
  assert.ok(seen.environment && Object.hasOwn(seen.environment, 'LOCALAPPDATA') === (process.env.LOCALAPPDATA !== undefined));
});

/** Why the REAL MXC process container cannot run here, or `false` when it can. */
async function realSandboxGap(): Promise<string | false> {
  if (process.platform !== 'win32') return `the real MXC sandbox needs win32, and this host is ${process.platform}`;
  try {
    const support = (await loadMxcSdk()).getPlatformSupport();
    if (!support.isSupported || !support.availableMethods.includes('processcontainer') || support.isolationTier !== 'base-container') return `MXC reports no base-container ProcessContainer on this host (${support.isolationTier ?? 'no tier'})`;
  } catch (error: any) {return `the MXC SDK cannot be loaded on this host: ${String(error?.message ?? error)}`;}
  return false;
}
const REAL_SANDBOX_GAP = await realSandboxGap();

test('S1+S2 REAL MXC — cmd, node and Windows PowerShell start inside the container with the probe environment and policy', {skip: REAL_SANDBOX_GAP}, async t => {
  const f = await fixture();
  const systemRoot = process.env.SystemRoot ?? 'C:\Windows';
  const workloads: Array<[string, string, string[]]> = [
    ['cmd', process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'), ['/d', '/c', 'echo TALOS_OK>cmd.ok']],
    ['node', process.execPath, ['-e', "require('fs').writeFileSync('node.ok','TALOS_OK')"]],
    ['powershell', join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', 'Set-Content -LiteralPath powershell.ok -Value TALOS_OK']],
  ];
  for (const [label, executable, args] of workloads) {
    const handle = await mxcSandboxedSpawn(loadMxcSdk)({executable, args, cwd: f.workspace, probeDirectory: f.workspace});
    const exit = await settleWithin(handle.exited, 60_000);
    let written = '';
    try {written = (await readFile(join(f.workspace, `${label}.ok`), 'utf8')).trim();} catch {}
    t.diagnostic(`${label}: ${JSON.stringify(exit)} marker=${JSON.stringify(written)}`);
    assert.deepEqual(exit, {exitCode: 0, signal: null}, `${label} must start and exit 0 inside the container`);
    assert.equal(written, 'TALOS_OK', `${label} must really have run and written inside its granted folder`);
  }
});

/*
 * ⭐⭐ R0 lane S — gate E3: the probe runs the REAL workloads. Unit tests with an injected spawner that plays each
 * workload (writes its marker, or not), so the rules are pinned without the real container.
 */
function workloadSpawn(behaviour: Record<string, 'ok' | 'dll-init' | 'silent-zero' | 'hang'>, seen: string[] = []) {
  const spawnFake = async (request: {executable: string; args: string[]; cwd: string}) => {
    const name = request.args.join(' ').match(/(cmd|node|powershell|pwsh)\.ok/u)![1]!;
    seen.push(name);
    const mode = behaviour[name] ?? 'ok';
    if (mode === 'ok') await writeFile(join(request.cwd, `${name}.ok`), 'TALOS_WORKLOAD_OK');
    let settle: (value: {exitCode: number | null; signal: null}) => void = () => {};
    const exited = new Promise<{exitCode: number | null; signal: null}>(resolve => {settle = resolve;});
    if (mode !== 'hang') queueMicrotask(() => settle({exitCode: mode === 'dll-init' ? 3221225794 : 0, signal: null}));
    return {pid: 1, kill: () => settle({exitCode: null, signal: null}), exited};
  };
  return spawnFake;
}

test('E3 — cmd, node and PowerShell must all run; pwsh is recorded; git-bash is recorded unsupported and never launched', async () => {
  const seen: string[] = [];
  const ok = await createSandboxWorkloadProbe({platform: 'win32', spawn: workloadSpawn({}, seen), pwshExecutable: 'C:\\pwsh\\pwsh.exe'})();
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.workloads, {cmd: 'ok', node: 'ok', powershell: 'ok', pwsh: 'ok', gitBash: 'unsupported: MSYS2 runtimes cannot initialise under processcontainer (microsoft/mxc#1061)'});
  assert.deepEqual(seen, ['cmd', 'node', 'powershell', 'pwsh'], 'git-bash is never launched');
  const broken = await createSandboxWorkloadProbe({platform: 'win32', spawn: workloadSpawn({powershell: 'dll-init'}), pwshExecutable: null})();
  assert.equal(broken.ok, false);
  assert.equal(broken.reason, 'PROCESS_TREE_PROBE_WORKLOAD_FAILED: powershell failed: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED), no marker written');
  assert.equal(broken.workloads.pwsh, 'not-installed');
});

test('E3 — exit 0 without the marker is not "ran", a hung workload is killed, and pwsh failing alone does not unverify', async () => {
  const silent = await createSandboxWorkloadProbe({platform: 'win32', spawn: workloadSpawn({node: 'silent-zero'}), pwshExecutable: null})();
  assert.equal(silent.ok, false);
  assert.equal(silent.workloads.node, 'failed: exit status 0, no marker written');
  const hung = await createSandboxWorkloadProbe({platform: 'win32', spawn: workloadSpawn({cmd: 'hang'}), pwshExecutable: null, timeoutMs: 50})();
  assert.equal(hung.workloads.cmd, 'failed: no exit within 0s');
  assert.equal(hung.ok, false);
  const pwshOnly = await createSandboxWorkloadProbe({platform: 'win32', spawn: workloadSpawn({pwsh: 'dll-init'}), pwshExecutable: 'C:\\pwsh\\pwsh.exe'})();
  assert.equal(pwshOnly.ok, true);
  assert.match(pwshOnly.workloads.pwsh, /^failed: exit status 3221225794/u);
  assert.equal((await createSandboxWorkloadProbe({platform: 'linux', spawn: workloadSpawn({})})()).ok, false);
});

test('E3 — the workloads run only after the process tree verified, and their evidence rides on it either way', async () => {
  let ran = 0;
  const workloads = async () => {ran++; return {ok: false, reason: 'PROCESS_TREE_PROBE_WORKLOAD_FAILED: node failed', workloads: {cmd: 'ok', node: 'failed', powershell: 'ok', pwsh: 'not-installed', gitBash: 'unsupported'}};};
  const unverifiedTree = await withWorkloads(async () => probeResult(false), workloads)();
  assert.equal(ran, 0, 'a failed tree answers with its own reason, as before');
  assert.equal(unverifiedTree.reason, 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED');
  const combined = await withWorkloads(async () => probeResult(true), workloads)();
  assert.equal(combined.verified, false);
  assert.equal(combined.reason, 'PROCESS_TREE_PROBE_WORKLOAD_FAILED: node failed');
  assert.equal(combined.evidence.workloads?.node, 'failed');
  const good = await withWorkloads(async () => probeResult(true), async () => ({ok: true, workloads: {cmd: 'ok', node: 'ok', powershell: 'ok', pwsh: 'ok', gitBash: 'unsupported'}}))();
  assert.equal(good.verified, true);
  assert.equal(good.evidence.workloads?.powershell, 'ok');
});

test('a cached record from the probe that did not run the workloads is not trusted by the default probe', async () => {
  const f = await fixture();
  const {store} = memoryStore(probeResult(true));
  let spawned = 0;
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', store,
    sdk: sdkSpawning(() => {spawned++; const child = emitterChild(); queueMicrotask(() => child.emit('exit', 3221225794, null)); return child;})
  });
  const availability = await backend.available();
  assert.equal(spawned > 0, true, 'the stale positive record was re-measured');
  assert.equal(availability.available, false);
});

/* Startup stall (08/10/2026, mxc-support-probe.test.ts): the TUI asks "is the shell sandboxed?" at mount, and the sdk answers with three synchronous child
   processes (about 115 ms of the main thread before the composer on a resume, measured). With a support worker the answer comes from another thread. */
const supportWorker = (name: string) => fileURLToPath(new URL(`./support-workers/${name}`, import.meta.url));

test('S16 the startup check is measured on a worker thread: the loop keeps ticking and the sdk is not loaded on the main thread', async () => {
  const f = await fixture();
  const {store} = memoryStore(probeResult(true));
  let sdkLoads = 0;
  const backend = createVerifiedMxcBackend({
    paths: {cacheRoot: f.cacheRoot}, platform: 'win32', store,
    sdkLoader: async () => {sdkLoads += 1; throw new Error('the sdk must not be loaded on the main thread to answer availability');},
    supportWorkerFile: supportWorker('blocks-300ms.mjs'),
    probe: async () => probeResult(true),
  });
  const gaps: number[] = [];let last = performance.now();
  const timer = setInterval(() => {const now = performance.now(); gaps.push(now - last); last = now;}, 10);
  let state;
  try {state = await backend.available();} finally {clearInterval(timer);}
  assert.equal(state.available, true);
  assert.equal(sdkLoads, 0);
  assert.ok(gaps.length >= 15, `the loop ticked ${gaps.length} times while the worker blocked 300 ms`);
  assert.ok(Math.max(...gaps) < 100, `the longest stall of the main thread was ${Math.max(...gaps).toFixed(0)} ms`);
});

test('S17 a worker that cannot load the sdk is told the way it always was; one that failed measuring is an error the caller turns into "not verified"', async () => {
  const f = await fixture();
  const make = (file: string) => createVerifiedMxcBackend({paths: {cacheRoot: f.cacheRoot}, platform: 'win32', store: memoryStore(probeResult(true)).store, supportWorkerFile: supportWorker(file), probe: async () => probeResult(true)});
  assert.deepEqual(await make('fails-load.mjs').available(), {available: false, reason: 'MXC SDK failed to load: Cannot find package mxc-sdk'});
  await assert.rejects(make('fails-support.mjs').available(), /dism failed/u);
});

test('S18 quitting while the worker measures ends the check at once (an abort is no verdict)', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const backend = createVerifiedMxcBackend({paths: {cacheRoot: f.cacheRoot}, platform: 'win32', store: memoryStore(probeResult(true)).store, supportWorkerFile: supportWorker('hangs.mjs'), signal: controller.signal, probe: async () => probeResult(true)});
  const waiting = backend.available();
  await new Promise(resolve => setTimeout(resolve, 50));
  controller.abort();
  await assert.rejects(waiting, (error: any) => error.code === 'ABORT_ERR');
});

test('S19 without a support worker (false) the measurement is the old in-process one', async () => {
  const f = await fixture();
  let supportCalls = 0;
  const sdk = fakeSdk();
  const original = (sdk as any).getPlatformSupport.bind(sdk);
  (sdk as any).getPlatformSupport = () => {supportCalls += 1; return original();};
  const backend = createVerifiedMxcBackend({paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk, store: memoryStore(probeResult(true)).store, supportWorkerFile: false, probe: async () => probeResult(true)});
  assert.equal((await backend.available()).available, true);
  assert.equal(supportCalls, 1);
});

test('S19b an injected sdk (tests, a custom loader) is measured in-process unless a worker script is named: the default is not taken for it', async () => {
  const f = await fixture();
  let supportCalls = 0;
  const sdk = fakeSdk();
  const original = (sdk as any).getPlatformSupport.bind(sdk);
  (sdk as any).getPlatformSupport = () => {supportCalls += 1; return original();};
  const backend = createVerifiedMxcBackend({paths: {cacheRoot: f.cacheRoot}, platform: 'win32', sdk, store: memoryStore(probeResult(true)).store, probe: async () => probeResult(true)});
  assert.equal((await backend.available()).available, true);
  assert.equal(supportCalls, 1);
});

test('S20 where the host is measured: the whole table (an injected probe wins; Windows + the real sdk = a worker; a named script = a worker; an injected sdk or loader, false, or another platform = in-process)', () => {
  const win = 'win32', linux = 'linux';
  const sdk = {}, loader = async () => ({}), probe = async () => ({isSupported: true, availableMethods: []});
  assert.equal(supportMeasurement({}, win), 'worker');
  assert.equal(supportMeasurement({sdk}, win), 'in-process');
  assert.equal(supportMeasurement({sdkLoader: loader}, win), 'in-process');
  assert.equal(supportMeasurement({supportWorkerFile: 'x.mjs'}, win), 'worker');
  assert.equal(supportMeasurement({supportWorkerFile: 'x.mjs', sdkLoader: loader}, win), 'worker', 'a named script is used even with an injected loader');
  assert.equal(supportMeasurement({supportWorkerFile: 'x.mjs', sdk}, win), 'worker');
  assert.equal(supportMeasurement({supportWorkerFile: false}, win), 'in-process', 'false switches the worker off even with the real sdk');
  assert.equal(supportMeasurement({}, linux), 'in-process');
  assert.equal(supportMeasurement({supportWorkerFile: 'x.mjs'}, linux), 'in-process', 'another platform never measures with the windows sdk');
  assert.equal(supportMeasurement({supportProbe: probe}, win), 'probe');
  assert.equal(supportMeasurement({supportProbe: probe, supportWorkerFile: 'x.mjs'}, win), 'probe', 'an injected probe wins over a worker script');
  assert.equal(supportMeasurement({supportProbe: probe}, linux), 'probe');
});
