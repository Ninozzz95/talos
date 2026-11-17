import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argomentiDelRunner } from './argomenti-prove-node.mjs'; // 15/10: un tetto a ogni prova, e l'uscita a fine file
import { ambienteDelleProve } from './argomenti-prove-node.mjs'; // 12/11: i browser delle prove partono anche col profilo finto

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* Round (k), 11/11/2026 (owner «aggancio in OGNI node --test»): every test process of the frontend carries the keyring hook of the
   desktop tests, which marks every child and stops the real keyring (`../desktop/tests/gancio-portachiavi.mjs`). */
const GANCIO_PORTACHIAVI = '--import=' + pathToFileURL(join(root, '..', 'desktop', 'tests', 'gancio-portachiavi.mjs')).href;
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
  // 12/11/2026: i binari di Playwright e la AppData\Local che servono ai browser delle prove col profilo finto (vedi argomenti-prove-node.mjs).
  const { ambiente, cartelleDaCreare } = ambienteDelleProve(process.env);
  for (const cartella of cartelleDaCreare) mkdirSync(cartella, { recursive: true });
  const child = spawn(process.execPath, ['--test', ...argomentiDelRunner(args), GANCIO_PORTACHIAVI, 'tests/**/*.test.mjs'], { stdio: 'inherit', cwd: root, env: ambiente });
  child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
}
