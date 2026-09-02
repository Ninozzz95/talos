import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['build', process.execPath, ['scripts/build.mjs']],
  ['unit-and-contract', process.execPath, ['scripts/run-node-tests.mjs']],
  ['determinism', process.execPath, ['scripts/verify-build.mjs']],
  ['laboratory-browser', process.execPath, ['scripts/run-browser-tests.mjs', '--config=playwright.lab.config.mjs']],
];
const results = [];
for (const [id, command, args] of commands) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8' });
  results.push({ id, exitCode: result.status ?? 1, durationMs: Date.now() - startedAt, stdoutTail: String(result.stdout || '').slice(-4_000), stderrTail: String(result.stderr || '').slice(-4_000) });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
}
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await writeFile(path.join(root, 'artifacts/phase-03-verification.json'), `${JSON.stringify({ schema: 'talos.frontend.phase-verification.v1', phase: 3, status: 'pass', commands: results }, null, 2)}\n`, 'utf8');
console.log('Fase 3 verificata: build, contratti, determinismo e laboratorio verdi');
