/** Read-only provenance for local-engine experiments; never an inference benchmark. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_FILES = Object.freeze([
  'harness-ui/src/agent-service.mjs',
  'harness-ui/src/kernel/talosHarness.mjs',
  'harness-ui/src/llama-server-supervisor.mjs',
  'harness-ui/src/local-runtime-llama-server.mjs',
  'harness-ui/src/model-destination.mjs',
  'harness-ui/src/runtime-owner-adapter.mjs',
  'harness-ui/src/session-registry.mjs',
]);

export function sourceFingerprint(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('source bytes are required');
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlobSha: createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex'),
  };
}

export async function captureSourceBaseline({ root = fileURLToPath(new URL('../../', import.meta.url)), paths = SOURCE_FILES } = {}) {
  if (typeof root !== 'string' || !Array.isArray(paths) || paths.length === 0) throw new TypeError('root and source paths are required');
  root = resolve(root);
  const sources = [];
  for (const path of [...new Set(paths)].sort()) {
    if (typeof path !== 'string' || path === '' || isAbsolute(path)) throw new TypeError('source path must be relative');
    const filename = resolve(root, path);
    const rel = relative(root, filename);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new TypeError('source path escapes root');
    sources.push({ path, ...sourceFingerprint(await readFile(filename)) });
  }
  let gitSha = null;
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    if (/^[a-f0-9]{40}$/u.test(value)) gitSha = value;
  } catch { /* An exported source snapshot has no Git metadata. */ }
  return {
    schema: 'talos.local-engine.source-baseline.v1',
    kind: 'source-provenance', realInference: false, gitSha,
    runtime: { node: process.version, platform: platform(), release: release(), arch: arch(), logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
    sources,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureSourceBaseline().then(
    (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
    (error) => { console.error(error.message); process.exitCode = 1; },
  );
}
