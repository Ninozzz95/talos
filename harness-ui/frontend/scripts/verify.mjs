import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['build', process.execPath, ['scripts/build.mjs']],
  ['unit-and-contract', process.execPath, ['scripts/run-node-tests.mjs']],
  ['determinism', process.execPath, ['scripts/verify-build.mjs']],
  /*
   * ⛔ 08/09/2026 — questa riga puntava a `playwright.lab.config.mjs`, che il commit `d706c8fe`
   *   (via la suite ASTRA) ha cancellato insieme all'unica prova che quel config lanciava
   *   (`tests/parity/parita.spec.mjs`). Il riferimento è rimasto: da quel momento `npm run verify`
   *   moriva subito — «does not exist» — cioè il cancello che doveva dire se la Fase 3 è verde
   *   NON HA PIÙ CONTROLLATO NIENTE, e non lo diceva a nessuno.
   *   ⇒ Al suo posto il cancello che è SOPRAVVISSUTO a quella rimozione: la parità dei componenti
   *     contro il mockup approvato (`playwright.componenti.config.mjs`), quella che `npm test` già
   *     lancia. Chi cancella una suite cancella anche chi la nomina.
   */
  ['parita-componenti', process.execPath, ['scripts/run-browser-tests.mjs', '--config=playwright.componenti.config.mjs']],
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
console.log('Fase 3 verificata: build, contratti, determinismo e parita dei componenti verdi');
