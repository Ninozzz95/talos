import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
try {
  await access(join(root, 'node_modules', '@playwright', 'test'));
} catch {
  console.error('Gate browser bloccato: installare le dipendenze frontend pinned prima della prova.');
  process.exitCode = 2;
}
if (process.exitCode !== 2) {
  // The CLI is shipped by the pinned @playwright/test package. Keeping the
  // path package-local avoids relying on a global `npx` installation.
  const child = spawn(process.execPath, [join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
}
