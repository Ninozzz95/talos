import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
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
// Il binding iroh (owner 22/10/2026): dal caricatore dell'app, in modalità app (solo la strada del pacchetto, con l'impronta),
// e un endpoint solo diretto aperto e chiuso — la stessa prova senza rete della CI che lo compila.
const { trovaBindingIroh } = await import(pathToFileURL(join(backend, 'src/remoto/binding.mjs')).href);
const iroh = trovaBindingIroh({ env: { TALOS_DESKTOP_DATA_DIR: 'verifica-nativi' } });
assert.equal(iroh.da, 'pacchetto', `Binding iroh non caricato dal pacchetto: ${iroh.motivo}`);
const costruttore = iroh.modulo.Endpoint.builder();
iroh.modulo.presetMinimal(costruttore);
costruttore.relayMode(iroh.modulo.RelayMode.disabled());
const endpoint = await costruttore.bind();
assert.match(endpoint.id().toString(), /^[0-9a-f]{64}$/);
await endpoint.close();
/*
 * L'helper degli allegati (25/10/2026, revisione del blocco 0.1.38): fino alla 0.1.37 il pacchetto portava l'exe senza il suo lock
 * `.sha256`, e ogni allegato nell'app installata falliva. Qui un salvataggio VERO dal pacchetto preparato, col percorso di serie
 * dell'helper e l'ambiente che il server ha nell'app (`child-bootstrap.mjs` toglie ELECTRON_RUN_AS_NODE prima di caricarlo): se il
 * lock manca o non combacia, il pacchetto si ferma qui invece di arrivare all'owner.
 */
delete process.env.ELECTRON_RUN_AS_NODE;
const { saveChatFile } = await import(pathToFileURL(join(backend, 'src/chat-file-upload.mjs')).href);
/* la cartella usa-e-getta passa dalla radice scratch del prodotto (SCRATCH-CANCELLO-01), mai dalla TEMP di sistema */
const { cartellaScratch } = await import(pathToFileURL(join(backend, 'src/scratch.mjs')).href);
const cartellaAllegati = cartellaScratch('verifica-allegati-');
try {
  const salvato = await saveChatFile({ rootDir: cartellaAllegati, name: 'verifica.txt', source: Readable.from([Buffer.from('TALOS-R02-ALLEGATI')]) });
  assert.equal(readFileSync(join(cartellaAllegati, salvato.percorso), 'utf8'), 'TALOS-R02-ALLEGATI', 'Helper degli allegati: il file salvato non torna.');
} finally {
  rmSync(cartellaAllegati, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
/*
 * Il lanciatore dei comandi (13/11/2026, giudice v1815-v1816): se il pacchetto lo porta, il nucleo DEL PACCHETTO lo trova in modalità
 * app (dove `TALOS_LANCIATORE` non conta) e un comando vero passa da lui: senza `fermaAlbero` sarebbe partito col ripiego di prima.
 */
const exeLanciatore = join(backend, 'native', 'lanciatore-bin', 'talos-lanciatore.exe');
let rigaLanciatore = 'lanciatore dei comandi assente (build locale senza impronta)';
if (existsSync(exeLanciatore)) {
  const L = await import(pathToFileURL(join(backend, 'src/kernel/lanciatore-windows.mjs')).href);
  const ambienteApp = { ...process.env, TALOS_DESKTOP_DATA_DIR: 'verifica-nativi' };
  const trovato = L.trovaLanciatore({ ambiente: ambienteApp });
  assert.equal(trovato.percorso, exeLanciatore, `Lanciatore non trovato dal nucleo del pacchetto: ${trovato.motivo}`);
  const comando = L.lanciaComando('echo TALOS-R02-LANCIATORE', { cwd: backend, shell: true, windowsHide: true }, { ambiente: ambienteApp, log: (riga) => console.warn(riga) });
  assert.equal(typeof comando.fermaAlbero, 'function', 'Il comando non è passato dal lanciatore del pacchetto.');
  let uscitaLanciatore = '';
  comando.stdout.on('data', (d) => { uscitaLanciatore += d; });
  const codiceLanciatore = await new Promise((ok) => comando.once('exit', (codice) => ok(codice)));
  await comando.alberoVuoto;
  assert.equal(codiceLanciatore, 0, 'Comando del lanciatore non riuscito.');
  assert.match(uscitaLanciatore, /TALOS-R02-LANCIATORE/u, 'Il comando del lanciatore non ha scritto la sua riga.');
  rigaLanciatore = 'lanciatore dei comandi (comando vero col suo gruppo)';
}
console.log(`Addon reali verificati con Electron 44.3.0: node-pty 1.1.0 (processo), keyring (caricamento), sqlite-vec 0.1.9 (query), iroh 1.1.0 (endpoint diretto), helper degli allegati (salvataggio vero), ${rigaLanciatore}.`);
// La shell è già uscita; node-pty mantiene il suo helper ConPTY fino all'uscita del processo host.
process.exit(0);
