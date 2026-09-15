import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true });
  child.on('error', errore => { console.error(errore.code); process.exitCode = 1; });
  child.on('exit', codice => { process.exitCode = codice ?? 1; });
} else {
  const serverRequire = createRequire(join(root, '..', 'server.mjs'));
  const esito = { data: new Date().toISOString(), execPath: process.execPath, versions: process.versions, runAsNode: process.env.ELECTRON_RUN_AS_NODE, modulo: serverRequire.resolve('node-pty'), caricamento: false };
  try {
    const pty = serverRequire('node-pty');
    esito.caricamento = true;
    const terminale = pty.spawn(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/q', '/c', 'echo TALOS-R01'], { cwd: root, env: { ...process.env }, cols: 80, rows: 24 });
    let testo = '';
    terminale.onData(d => { testo += d; });
    const uscita = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { terminale.kill(); reject(new Error('La PTY non è terminata entro 10 secondi.')); }, 10000);
      terminale.onExit(e => { clearTimeout(timer); resolve(e); });
    });
    esito.uscita = uscita; esito.output = testo; esito.ok = uscita.exitCode === 0 && testo.includes('TALOS-R01');
    esito.binari = Object.keys(serverRequire.cache).filter(p => p.endsWith('.node')).map(percorso => ({ percorso, sha256: createHash('sha256').update(readFileSync(percorso)).digest('hex') }));
  } catch (errore) { esito.ok = false; esito.errore = errore.message; }
  writeFileSync(join(root, '..', '.claude', 'R01-pty.json'), JSON.stringify(esito, null, 2));
  console.log(JSON.stringify(esito));
  process.exit(esito.ok ? 0 : 1);
}
