import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'native', 'chat-file-upload');
const output = join(root, 'native', 'talos-chat-upload.exe');
/* ⭐ BUG-20 (06/10/2026): lock di integrità scritto dalla build ACCANTO all'exe (`<exe>.sha256`).
 * È la prova persistita che quei byte sono quelli prodotti da questa build: la verifica runtime di
 * SOLA LETTURA in src/chat-file-upload.mjs confronta lo SHA256 dell'exe con questo lock. */
const lock = `${output}.sha256`;
/* ⭐ BUG-20 (06/10/2026): la build NON fa MAI `go build -o` direttamente sull'exe finale. Costruisce su
 * un percorso TEMPORANEO e tocca l'exe solo se i byte risultanti cambiano davvero: un exe identico non
 * viene riscritto → mtime stabile → Windows Defender non riapre la scansione al primo upload (11-22 s).
 * Il suffisso col pid evita che due build concorrenti si pestino i piedi sullo stesso temporaneo. */
const bozza = `${output}.${process.pid}.tmp`;
const go = process.env.TALOS_GO_BINARY || 'go';

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: source, encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local', CGO_ENABLED: '0' }, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`Build helper upload non riuscita: ${executable} ${args[0]} (${result.error?.code || result.status})`);
  }
  return result.stdout.trim();
}

function sha256(percorso) {
  return createHash('sha256').update(readFileSync(percorso)).digest('hex');
}

/* ⭐ BUG-20 (06/10/2026): il lock accetta `<digest>` o `<digest>  <nomefile>`; un lock assente,
 * illeggibile o non esadecimale vale "non allineato" e viene riparato qui sotto — mai dato per buono. */
function lockLetto() {
  try {
    const token = readFileSync(lock, 'utf8').trim().split(/\s+/u)[0] ?? '';
    return /^[0-9a-f]{64}$/iu.test(token) ? token.toLowerCase() : null;
  } catch { return null; }
}

/* Rimpiazzo resiliente su Windows: se la destinazione è momentaneamente bloccata (Defender o un helper
 * ancora in esecuzione) si riprova dopo la rimozione, senza lasciare mezzi file. */
function sostituisci(da, verso) {
  try {
    renameSync(da, verso);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
    try { unlinkSync(verso); } catch { /* il rename sotto racconterà l'errore vero */ }
    renameSync(da, verso);
  }
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Il helper upload del desktop 0.1.19 richiede Windows x64.');
}
const version = run(go, ['version']);
if (!/^go version go1\.27\.1 windows\/amd64$/u.test(version)) {
  throw new Error(`Toolchain Go non conforme: ${version}`);
}
run(go, ['test', './...']);
try {
  run(go, ['build', '-trimpath', '-buildvcs=false', '-o', bozza, '.']);
  if (!/^talos-chat-upload 0\.1\.0 go1\.27\.1$/u.test(run(bozza, ['--version']))) {
    throw new Error('Identita del helper upload non conforme.');
  }
  const fresco = sha256(bozza);
  const attuale = existsSync(output) ? sha256(output) : null;
  if (attuale === fresco) {
    /* ⭐ BUG-20 (06/10/2026): byte identici → il temporaneo si elimina e l'exe NON viene toccato
     * (mtime stabile = niente riscansione Defender). Solo il lock può essere riparato: è un file di
     * testo, non un binario che Defender deve riscansionare. */
    if (lockLetto() !== fresco) writeFileSync(lock, `${fresco}\n`);
    process.stdout.write(`Helper upload invariato (byte identici, mtime stabile): ${output}\n`);
  } else {
    /* ⭐ BUG-20 (06/10/2026): byte diversi o exe assente → rimpiazzo dal temporaneo e lock scritto:
     * il nuovo binario nasce già corredato del suo digest per la verifica runtime di sola lettura. */
    sostituisci(bozza, output);
    writeFileSync(lock, `${fresco}\n`);
    process.stdout.write(`Helper upload sostituito e bloccato col lock SHA256: ${output}\n`);
  }
} finally {
  rmSync(bozza, { force: true });
}
