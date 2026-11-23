#!/usr/bin/env node
/**
 * Operator-run evidence tool for B1 slice 7.
 *
 * Runs the TALOS host process-tree probe against the real MXC backend on this machine and prints
 * the measurement verbatim. A negative result is a successful run of this tool, not a failure of
 * it: the point is to find out what the host actually does, and a green unit suite is not evidence
 * that this host is isolated.
 *
 * Exit codes: 0 verified, 1 measured and not verified, 2 the tool itself could not run.
 *
 * The evidence cache is bypassed on purpose (both TTLs are zero) so every run measures the host
 * again, while the result is still written to the normal cache location.
 */
import {createVerifiedMxcBackend} from '../src/security/execution-backends.ts';
import {createProcessTreeEvidenceStore, hostFingerprint} from '../src/security/process-tree-evidence-store.ts';
import {ensureCliPaths, resolveCliPaths} from '../src/paths.ts';
import {homedir} from 'node:os';

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

let paths;
try {
  paths = resolveCliPaths(process.env, process.platform, homedir());
  await ensureCliPaths(paths);
} catch (error) {
  print({tool: 'probe-process-tree', ok: false, error: String(error?.message ?? error)});
  process.exit(2);
}

let platformSupport = null;
try {
  const {loadMxcSdk} = await import('../src/security/mxc-execution-backend.ts');
  platformSupport = (await loadMxcSdk()).getPlatformSupport();
} catch (error) {
  platformSupport = {unavailable: String(error?.message ?? error)};
}

const persistent = createProcessTreeEvidenceStore({cacheRoot: paths.cacheRoot, positiveTtlMs: 0, negativeTtlMs: 0});
let measured = null;
const store = {
  read: async () => null,
  write: async result => {
    measured = result;
    try {await persistent.write(result);} catch {}
  }
};

let availability;
try {
  availability = await createVerifiedMxcBackend({paths: {cacheRoot: paths.cacheRoot}, store}).available();
} catch (error) {
  print({tool: 'probe-process-tree', ok: false, hostFingerprint: hostFingerprint(), platformSupport, error: String(error?.stack ?? error)});
  process.exit(2);
}

print({
  tool: 'probe-process-tree',
  ok: true,
  platform: process.platform,
  node: process.version,
  hostFingerprint: hostFingerprint(),
  cacheRoot: paths.cacheRoot,
  platformSupport,
  availability,
  probe: measured
});

process.exit(measured?.verified === true ? 0 : 1);
