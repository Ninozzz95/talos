import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argomentiDelRunner } from './argomenti-prove-node.mjs'; // 15/10: un tetto a ogni prova, e l'uscita a fine file

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const files = (await readdir(join(root, 'tests'), { recursive: true }))
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => join(root, 'tests', file));
if (files.length === 0) {
  console.error('Nessun test Node registrato nel frontend.');
  process.exitCode = 2;
} else {
  /* ⛔ 15/10/2026 — UN GLOB, non la lista dei percorsi: con ~280 percorsi ASSOLUTI la riga di comando passava il limite di Windows
     (32.767 caratteri) e la suite non partiva affatto (`spawn ENAMETOOLONG`, misurato in AVM-integrazione-r4, il cui percorso è più
     lungo). Node espande da sé i pattern di `--test` (nodejs.org/api/test.html, «Running tests from the command line», da Node 21):
     stessi file (tutti i `.test.mjs` sotto `tests/`), riga corta. La lista resta per il controllo «nessun test» qui sopra. */
  const child = spawn(process.execPath, ['--test', ...argomentiDelRunner(args), 'tests/**/*.test.mjs'], { stdio: 'inherit', cwd: root });
  child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
}
