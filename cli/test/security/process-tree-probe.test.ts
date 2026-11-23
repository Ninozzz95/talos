import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path,{join} from 'node:path';
import test,{after} from 'node:test';
import {createHostProcessTreeProbe,type ProcessTreeSignal,type SandboxedSpawn,type SandboxedSpawnHandle} from '../../src/security/process-tree-probe.ts';

/**
 * Every probe test below drives a real local `child_process` tree through the injected spawner.
 * No MXC is involved: the logic is exercised against real process identifiers and real files, so a
 * stub that can only answer "yes" cannot pass.
 */

const TIMING = {settleMs: 250, heartbeatWindowMs: 320, descendantTimeoutMs: 15_000, executorExitTimeoutMs: 5_000} as const;

function launch(request: {executable: string; args: string[]; cwd: string}, argv?: string[]) {
  const child = spawn(request.executable, argv ?? request.args, {cwd: request.cwd, stdio: 'ignore', windowsHide: true});
  let done: () => void = () => {};
  const exited = new Promise<void>(resolve => {done = resolve;});
  child.once('exit', () => done());
  child.once('error', () => done());
  return {child, exited};
}

/** Kills only the direct child, exactly like a `CreateProcess` tree with no kill-on-close job. */
function leakySpawn(counter: {calls: number}): SandboxedSpawn {
  return request => {
    counter.calls++;
    const {child, exited} = launch(request);
    const handle: SandboxedSpawnHandle = {pid: child.pid, kill: () => {try {child.kill('SIGKILL');} catch {}}, exited};
    return handle;
  };
}

/** Kills the whole tree, exactly like a job object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. */
function treeKillSpawn(counter: {calls: number}): SandboxedSpawn {
  return request => {
    counter.calls++;
    const {child, exited} = launch(request);
    const handle: SandboxedSpawnHandle = {
      pid: child.pid,
      kill: () => {
        try {
          const beat = JSON.parse(readFileSync(join(request.probeDirectory, 'heartbeat.json'), 'utf8')) as {pid: number};
          process.kill(beat.pid, 'SIGKILL');
        } catch {}
        try {child.kill('SIGKILL');} catch {}
      },
      exited
    };
    return handle;
  };
}

async function procEnumerate(pid: number): Promise<ProcessTreeSignal> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z') ? 'gone' : 'alive';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'gone' : 'unknown';
  }
}

/** On Windows the shipped tasklist enumerator runs for real; elsewhere a real /proc reader does. */
const realEnumeration = process.platform === 'win32' ? {} : {enumerate: procEnumerate};

function isAlive(pid: number): boolean {
  try {process.kill(pid, 0); return true;} catch {return false;}
}

async function heartbeatPid(tempRoot: string): Promise<number> {
  const [directory] = await readdir(tempRoot);
  const beat = JSON.parse(await readFile(join(tempRoot, directory!, 'heartbeat.json'), 'utf8')) as {pid: number};
  return beat.pid;
}

const roots: string[] = [];
async function root(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `talos-probe-${label}-`));
  roots.push(directory);
  return directory;
}
after(async () => {for (const directory of roots) await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});});

test('probe fails when the descendant survives the executor kill', async () => {
  const tempRoot = await root('leak');
  const counter = {calls: 0};
  const probe = createHostProcessTreeProbe({platform: 'win32', tempRoot, spawn: leakySpawn(counter), ...realEnumeration, ...TIMING});
  const result = await probe();
  assert.equal(counter.calls, 1);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED');
  assert.equal(result.evidence.scope, 'createprocess-descendant');
  assert.equal(result.evidence.signals.heartbeat, 'alive');
  assert.equal(result.evidence.signals.signalZero, 'alive');
  assert.equal(result.evidence.signals.enumeration, 'alive');
  const leaked = result.evidence.descendantPid;
  assert.equal(typeof leaked, 'number');
  assert.equal(result.evidence.cleanup.descendantKilled, true);
  assert.equal(isAlive(leaked as number), false, 'cleanup must kill the leaked descendant it found');
  assert.deepEqual(await readdir(tempRoot), []);
});

test('probe verifies only when all three signals agree that the descendant is gone', async () => {
  const tempRoot = await root('agree');
  const counter = {calls: 0};
  const probe = createHostProcessTreeProbe({platform: 'win32', tempRoot, spawn: treeKillSpawn(counter), ...realEnumeration, ...TIMING});
  const result = await probe();
  assert.equal(counter.calls, 1);
  assert.deepEqual(result.evidence.signals, {heartbeat: 'gone', signalZero: 'gone', enumeration: 'gone'});
  assert.equal(result.verified, true);
  assert.equal(result.reason, undefined);
  assert.equal(result.evidence.schema, 'talos.cli.process-tree-evidence.v1');
  assert.equal(result.evidence.scope, 'createprocess-descendant');
  assert.equal(typeof result.evidence.descendantPid, 'number');
  assert.ok(result.evidence.durationMs >= 0);
  assert.deepEqual(await readdir(tempRoot), []);
});

test('an indeterminate enumeration leaves the probe unverified because unknown is not pass', async () => {
  const tempRoot = await root('unknown');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, spawn: treeKillSpawn({calls: 0}), ...TIMING,
    execFile: async () => {throw new Error('tasklist.exe is not available');}
  });
  const result = await probe();
  assert.equal(result.evidence.signals.heartbeat, 'gone');
  assert.equal(result.evidence.signals.signalZero, 'gone');
  assert.equal(result.evidence.signals.enumeration, 'unknown');
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_SIGNALS_INDETERMINATE');
});

test('disagreeing signals are a failure and never a majority vote', async () => {
  const tempRoot = await root('disagree');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, spawn: treeKillSpawn({calls: 0}), ...TIMING,
    execFile: async () => ({stdout: `"node.exe","${await heartbeatPid(tempRoot)}","Console","1","55,296 K"\r\n`})
  });
  const result = await probe();
  assert.equal(result.evidence.signals.heartbeat, 'gone');
  assert.equal(result.evidence.signals.signalZero, 'gone');
  assert.equal(result.evidence.signals.enumeration, 'alive');
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_SIGNALS_DISAGREE');
});

test('a descendant that never appears is a failure and not a pass', async () => {
  const tempRoot = await root('absent');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING, descendantTimeoutMs: 1_200, ...realEnumeration,
    spawn: request => {
      const {child, exited} = launch(request, ['-e', 'setTimeout(()=>{},6000)']);
      return {pid: child.pid, kill: () => {try {child.kill('SIGKILL');} catch {}}, exited};
    }
  });
  const result = await probe();
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_DESCENDANT_NEVER_APPEARED');
  assert.equal(result.evidence.descendantPid, null);
  assert.deepEqual(result.evidence.signals, {heartbeat: 'unknown', signalZero: 'unknown', enumeration: 'unknown'});
  assert.deepEqual(await readdir(tempRoot), []);
});

test('the probe never spawns anything outside Windows', async () => {
  const tempRoot = await root('linux');
  const counter = {calls: 0};
  const probe = createHostProcessTreeProbe({
    platform: 'linux', tempRoot, ...TIMING,
    spawn: () => {counter.calls++; throw new Error('must not spawn');}
  });
  const result = await probe();
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_REQUIRES_WINDOWS');
  assert.equal(counter.calls, 0);
  assert.deepEqual(result.evidence.signals, {heartbeat: 'unknown', signalZero: 'unknown', enumeration: 'unknown'});
  assert.deepEqual(await readdir(tempRoot), [], 'a non-Windows probe must not even create a directory');
});

test('cleanup runs even when the probe throws', async () => {
  const tempRoot = await root('throws');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING,
    spawn: () => {throw new Error('SPAWN_REFUSED');}
  });
  await assert.rejects(() => probe(), /SPAWN_REFUSED/u);
  assert.deepEqual(await readdir(tempRoot), [], 'the probe directory must be removed even on a throw');
});

test('enumeration reads tasklist by absolute path with no /FI filter and matches in JavaScript', async () => {
  const tempRoot = await root('tasklist');
  const calls: {file: string; args: readonly string[]}[] = [];
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, systemRoot: 'C:\\WINDOWS', spawn: treeKillSpawn({calls: 0}), ...TIMING,
    execFile: async (file, args) => {
      calls.push({file, args});
      return {stdout: '"System Idle Process","0","Services","0","8 K"\r\n"explorer.exe","7188","Console","1","120,004 K"\r\n'};
    }
  });
  const result = await probe();
  assert.equal(result.verified, true);
  assert.equal(result.evidence.signals.enumeration, 'gone');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file, path.join('C:\\WINDOWS', 'System32', 'tasklist.exe'));
  assert.deepEqual(calls[0]?.args, ['/FO', 'CSV', '/NH']);
  assert.ok(!calls[0]?.args.some(argument => argument.startsWith('/FI')), 'a /FI filter has been measured to return zero while processes are alive');
});

/*
 * ⭐ B1 slice 12, round 2 — AN EXECUTOR THAT IS ALREADY DEAD CANNOT PRODUCE A DESCENDANT.
 *
 * Measured on this host (Windows 11 Pro 10.0.26200, MXC SDK 0.8.0, production probe policy):
 * `node.exe` inside the sandbox exits 3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED) within
 * 73-139 ms, and the probe then waited the full 15 s for a heartbeat that could never come. The
 * answer stays NEGATIVE — a dead executor proves nothing about kill-on-close — but it must arrive
 * when the executor dies, and it must say how it died.
 */
test('an executor that exits before any heartbeat stops the wait and names its exit status', async () => {
  const tempRoot = await root('early-exit');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING, ...realEnumeration,
    spawn: () => ({pid: undefined, kill: () => {}, exited: Promise.resolve({exitCode: 3221225794, signal: null})})
  });
  const started = Date.now();
  const result = await probe();
  const elapsed = Date.now() - started;
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
  assert.ok(elapsed < 3_000, `the probe must stop when the executor dies, not after the ${TIMING.descendantTimeoutMs} ms descendant timeout; took ${elapsed} ms`);
  assert.equal(result.evidence.descendantPid, null);
  assert.deepEqual(result.evidence.signals, {heartbeat: 'unknown', signalZero: 'unknown', enumeration: 'unknown'});
  assert.deepEqual(await readdir(tempRoot), []);
});

test('a real executor process that exits early is detected and its own code is reported', async () => {
  const tempRoot = await root('early-exit-real');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING, ...realEnumeration,
    spawn: request => {
      const child = spawn(request.executable, ['-e', 'process.exit(5)'], {cwd: request.cwd, stdio: 'ignore', windowsHide: true});
      const exited = new Promise<{exitCode: number | null; signal: string | null}>(resolve => {child.once('exit', (code, signal) => resolve({exitCode: code, signal}));});
      return {pid: child.pid, kill: () => {try {child.kill('SIGKILL');} catch {}}, exited};
    }
  });
  const started = Date.now();
  const result = await probe();
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 5');
  assert.ok(Date.now() - started < 3_000);
});

test('a spawner that cannot report the exit status still stops the wait and says the status is unknown', async () => {
  const tempRoot = await root('early-exit-silent');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING, ...realEnumeration,
    spawn: () => ({pid: undefined, kill: () => {}, exited: Promise.resolve()})
  });
  const started = Date.now();
  const result = await probe();
  assert.equal(result.reason, 'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status not reported by the sandbox spawner');
  assert.ok(Date.now() - started < 3_000);
});

/*
 * ⭐ B1 slice 12, round 4 — ORDERING INVARIANT (review mutation M18).
 * The heartbeat is read before the executor's exit is honoured. An executor whose exit and its
 * descendant's second heartbeat land in the same instant has produced a descendant: that is a
 * measurement to take, not a dead executor to write off. Checking the exit first survived review.
 */
test('an executor that exits in the same instant its descendant beats is measured, not written off as dead', async () => {
  const tempRoot = await root('exit-and-beat');
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING,
    signalZero: () => 'gone', enumerate: async () => 'gone',
    spawn: request => {
      let resolveExit: (value: {exitCode: number; signal: null}) => void = () => {};
      const exited = new Promise<{exitCode: number; signal: null}>(resolve => {resolveExit = resolve;});
      setTimeout(() => {
        writeFileSync(join(request.probeDirectory, 'heartbeat.json'), JSON.stringify({pid: 999_999, seq: 2, atMs: Date.now()}));
        resolveExit({exitCode: 0, signal: null});
      }, 150);
      return {pid: undefined, kill: () => {}, exited};
    }
  });
  const result = await probe();
  assert.equal(result.evidence.descendantPid, 999_999, `the beat that arrived with the exit must be measured; reason was ${result.reason}`);
  assert.notEqual(result.reason?.startsWith('PROCESS_TREE_PROBE_EXECUTOR_EXITED'), true);
  assert.equal(result.verified, true);
  assert.deepEqual(await readdir(tempRoot), []);
});

/*
 * ⭐ B1 slice 12, round 5 — REVIEW MUTATION M9 SURVIVED: removing the heartbeat re-read after an observed
 * executor exit left every test green, because no test made the first read miss a beat that was there by
 * the time the exit was seen. Here the reader is injected: the first read finds nothing, the executor has
 * already exited, and the second read finds the descendant. Without the re-read the probe writes a live
 * descendant off as a dead executor.
 */
test('after the executor exit is observed the heartbeat is read once more before giving up', async () => {
  const tempRoot = await root('reread');
  let reads = 0;
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING,
    signalZero: () => 'gone', enumerate: async () => 'gone',
    readHeartbeat: async () => (++reads === 1 ? null : {pid: 999_998, seq: 2}),
    spawn: () => ({pid: undefined, kill: () => {}, exited: Promise.resolve({exitCode: 0, signal: null})})
  } as any);
  const result = await probe();
  assert.equal(result.evidence.descendantPid, 999_998, `the beat read after the exit must be measured; reason was ${result.reason}`);
  assert.notEqual(result.reason?.startsWith('PROCESS_TREE_PROBE_EXECUTOR_EXITED'), true);
  assert.ok(reads >= 2, `the heartbeat must be read again after the exit is seen (reads: ${reads})`);
  assert.deepEqual(await readdir(tempRoot), []);
});

test('a descendant that starts slowly is still waited for while its executor is alive', async () => {
  const tempRoot = await root('slow-start');
  const delayMs = 1_500;
  const probe = createHostProcessTreeProbe({
    platform: 'win32', tempRoot, ...TIMING, ...realEnumeration,
    spawn: request => {
      /* The executor lives, and only spawns the probe's own descendant after a delay. */
      const slow = `import {spawn} from 'node:child_process';import path from 'node:path';const d=process.argv[1];setTimeout(()=>{spawn(process.execPath,[path.join(d,'descendant.mjs'),d],{cwd:d,stdio:'ignore',windowsHide:true,detached:true}).unref();},${delayMs});setTimeout(()=>process.exit(0),60000);`;
      const child = spawn(request.executable, ['--input-type=module', '-e', slow, request.probeDirectory], {cwd: request.cwd, stdio: 'ignore', windowsHide: true});
      const exited = new Promise<{exitCode: number | null; signal: string | null}>(resolve => {child.once('exit', (code, signal) => resolve({exitCode: code, signal}));});
      return {
        pid: child.pid,
        kill: () => {
          try {process.kill((JSON.parse(readFileSync(join(request.probeDirectory, 'heartbeat.json'), 'utf8')) as {pid: number}).pid, 'SIGKILL');} catch {}
          try {child.kill('SIGKILL');} catch {}
        },
        exited
      };
    }
  });
  const started = Date.now();
  const result = await probe();
  assert.notEqual(result.reason?.startsWith('PROCESS_TREE_PROBE_EXECUTOR_EXITED'), true, `a live executor must not be treated as dead: ${result.reason}`);
  assert.equal(typeof result.evidence.descendantPid, 'number', 'the slow descendant must have been found');
  assert.ok(Date.now() - started >= delayMs, 'the answer cannot predate the descendant it measured');
  assert.equal(result.verified, true);
  assert.deepEqual(await readdir(tempRoot), []);
});
