import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [backend, contesto] = process.argv.slice(2);
assert.equal(process.versions.electron, '44.3.0', 'Verificare con il Node incluso in Electron 44.3.0.');
const requireBackend = createRequire(join(backend, 'package.json'));
const requireContesto = createRequire(join(contesto, 'package.json'));
const pty = requireBackend('node-pty');
assert.equal(typeof pty.spawn, 'function');
assert.ok(requireBackend('@napi-rs/keyring'));
const db = new DatabaseSync(':memory:', { allowExtension: true });
try { requireContesto('sqlite-vec').load(db); assert.match(db.prepare('select vec_version() as v').get().v, /^v?0\.1\.9/); }
finally { db.close(); }
await new Promise((ok, no) => {
  let output = '';
  const terminale = pty.spawn(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', 'echo TALOS-R02-NATIVI'], { cwd: backend, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
  const timer = setTimeout(() => { terminale.kill(); no(Error('PTY senza risposta.')); }, 10000);
  terminale.onData(d => { output += d; });
  terminale.onExit(({ exitCode }) => { clearTimeout(timer); if (exitCode === 0 && output.includes('TALOS-R02-NATIVI')) ok(); else no(Error('PTY di produzione fallito.')); });
});
console.log('Addon reali verificati con Electron 44.3.0: node-pty 1.1.0 (processo), keyring (caricamento), sqlite-vec 0.1.9 (query).');
// La shell è già uscita; node-pty mantiene il suo helper ConPTY fino all'uscita del processo host.
process.exit(0);
