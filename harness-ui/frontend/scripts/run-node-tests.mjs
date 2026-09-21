import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const files = (await readdir(join(root, 'tests'), { recursive: true }))
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => join(root, 'tests', file));
if (files.length === 0) {
  console.error('Nessun test Node registrato nel frontend.');
  process.exitCode = 2;
} else {
  const child = spawn(process.execPath, ['--test', ...args, ...files], { stdio: 'inherit' });
  child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
}
