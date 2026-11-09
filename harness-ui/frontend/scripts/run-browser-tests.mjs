import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Decisione 106 dell'owner (03/11/2026): `--server=2` fa girare la suite su due server di prova, ognuno col suo store e con metà
 * dei lavoratori (`playwright.config.mjs`, `TALOS_PW_SERVER`). L'opzione è NOSTRA: si toglie dagli argomenti prima di passarli a
 * Playwright, che non la conosce. Senza l'opzione (o con `--server=1`) la corsa è quella di sempre, un server e nessuna variabile.
 * Una seconda porta si sceglie con `TALOS_HARNESS_UI_TEST_PORT_2` (di serie la prima + 1).
 */
export function leggiOpzioneServer(argomenti) {
  let server = 1;
  const resto = [];
  for (let i = 0; i < argomenti.length; i += 1) {
    const a = argomenti[i];
    let valore = null;
    if (a.startsWith('--server=')) valore = a.slice('--server='.length);
    else if (a === '--server') { valore = argomenti[i + 1] ?? ''; i += 1; }
    else { resto.push(a); continue; }
    if (valore !== '1' && valore !== '2') throw new Error(`--server vuole 1 o 2, non «${valore}»`);
    server = Number(valore);
  }
  return { server, argomenti: resto };
}

const comeChiave = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const ePrincipale = Boolean(process.argv[1]) && comeChiave(resolve(process.argv[1])) === comeChiave(fileURLToPath(import.meta.url));
if (ePrincipale) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let scelta;
  try {
    scelta = leggiOpzioneServer(process.argv.slice(2));
  } catch (error) {
    console.error(`Gate browser bloccato: ${error.message}`);
    process.exitCode = 2;
  }
  if (process.exitCode !== 2) {
    try {
      await access(join(root, 'node_modules', '@playwright', 'test'));
    } catch {
      console.error('Gate browser bloccato: installare le dipendenze frontend pinned prima della prova.');
      process.exitCode = 2;
    }
  }
  if (process.exitCode !== 2) {
    const env = { ...process.env };
    if (scelta.server === 2) env.TALOS_PW_SERVER = '2';
    else delete env.TALOS_PW_SERVER; // un valore ereditato non accende i due server da solo: decide la riga di comando
    // The CLI is shipped by the pinned @playwright/test package. Keeping the
    // path package-local avoids relying on a global `npx` installation.
    const child = spawn(process.execPath, [join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', ...scelta.argomenti], { stdio: 'inherit', env });
    child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
  }
}
