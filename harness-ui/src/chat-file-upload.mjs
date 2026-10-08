import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizzaSottocartella, WorkspaceFileError } from './workspace-files.mjs';
import { ambienteSenzaVariabiliDelServer } from './ambiente-solo-server.mjs';

export const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;
const HELPER = fileURLToPath(new URL('../native/talos-chat-upload.exe', import.meta.url));
/* ⭐ BUG-20 (06/10/2026): la verifica runtime legge il lock `<exe>.sha256` accanto all'exe e, se serve
 * ricompilare, invoca COSTRUISCI_HELPER (scripts/build-chat-upload-helper.mjs). */
const COSTRUISCI_HELPER = fileURLToPath(new URL('../scripts/build-chat-upload-helper.mjs', import.meta.url));
const ABORT_FRAME = 0xffffffff;
const ERROR_CODES = new Set(['QUERY_INVALID', 'FOLDER_INVALID', 'FILE_WRITE_FAILED', 'FILE_EXISTS', 'PAYLOAD_LIMIT', 'UPLOAD_ABORTED']);

function checkedName(name) {
  if (typeof name !== 'string' || !name || name.length > 240 || Buffer.byteLength(name, 'utf8') > 255
    || name.includes('/') || name.includes('\\')) {
    throw new WorkspaceFileError('Invalid file name', 'QUERY_INVALID');
  }
  try {
    if (normalizzaSottocartella(name) !== name) throw new Error('not one file name');
  } catch {
    throw new WorkspaceFileError('Invalid file name', 'QUERY_INVALID');
  }
  return name;
}

function helperError(value) {
  const code = ERROR_CODES.has(value?.code) ? value.code : 'FILE_WRITE_FAILED';
  const message = typeof value?.message === 'string' && value.message.length <= 200
    ? value.message : 'File upload failed';
  return new WorkspaceFileError(message, code);
}

/* ⭐ BUG-20 (06/10/2026): impronta SHA256 di sola LETTURA; un exe o un lock illeggibili valgono
 * "non verificato" — non un motivo per eseguire lo stesso. */
function impronta(percorso) {
  try { return createHash('sha256').update(readFileSync(percorso)).digest('hex'); }
  catch { return null; }
}

/* ⭐ BUG-20 (06/10/2026): il lock scritto dalla build porta il digest (da solo o seguito dal nome file);
 * assente, illeggibile o non esadecimale → nessuna fiducia. */
function improntaNelLock(lock) {
  try {
    const token = readFileSync(lock, 'utf8').trim().split(/\s+/u)[0] ?? '';
    return /^[0-9a-f]{64}$/iu.test(token) ? token.toLowerCase() : null;
  } catch { return null; }
}

/*
 * ⛔ SPAWN-AMBIENTE-HELPER (08/10/2026, bugfixer; rosso di SPAWN-AMBIENTE-01 da 2d3d02c86) — l'ambiente della build dell'helper:
 *   quello del server MENO le sue variabili (token della API locale, chiavi delle ricevute e della ricerca, come ogni lancio di
 *   `src/`). Senza `env` il figlio ereditava `process.env` intero (nodejs.org/api/child_process.html).
 * ⛔ Ma `ELECTRON_RUN_AS_NODE` resta, se c'è: la build rilancia `process.execPath`, che nell'app installata è Electron
 *   (`desktop/runtime.mjs` avvia il server così), e un figlio di quel binario parte come Node SOLO se la variabile è nel SUO
 *   ambiente (Electron, «Environment Variables»: «only supported in … spawned child processes that set ELECTRON_RUN_AS_NODE»).
 *   Togliendola, la ricompilazione aprirebbe una seconda app invece di eseguire lo script.
 */
export function ambienteDellaBuildHelper(env = process.env) {
  const nome = Object.keys(env).find((k) => k.toUpperCase() === 'ELECTRON_RUN_AS_NODE');
  return { ...ambienteSenzaVariabiliDelServer(env), ...(nome && env[nome] !== undefined ? { ELECTRON_RUN_AS_NODE: env[nome] } : {}) };
}

/* ⭐ BUG-20 (06/10/2026): unica porta verso l'esecuzione dell'helper. NESSUN byte viene eseguito senza
 * verifica: SHA256 dell'exe contro il lock `<exe>.sha256`, confronto di SOLA LETTURA (mai eseguire per
 * controllare). Lock assente o non combaciante → ricompilazione via build script → riverifica; se
 * ancora non combacia l'upload fallisce ONESTAMENTE con errore parlante: mai esecuzione di byte non
 * verificati, mai fallback silenzioso. */
async function helperVerificato(helperPath) {
  const lock = `${helperPath}.sha256`;
  const combacia = () => {
    const attuale = impronta(helperPath);
    return attuale !== null && attuale === improntaNelLock(lock);
  };
  if (combacia()) return helperPath;
  if (helperPath !== HELPER) {
    // Percorso iniettato (es. dai test): qui la ricompilazione non è legittima → fallimento onesto.
    throw new WorkspaceFileError('Upload helper not verified: SHA256 lock missing or not matching', 'FILE_WRITE_FAILED');
  }
  try {
    await new Promise((risolvi, rifiuta) => {
      const build = spawn(process.execPath, [COSTRUISCI_HELPER], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: ambienteDellaBuildHelper() });
      let dettaglio = '';
      build.stderr.on('data', (pezzo) => { if (dettaglio.length < 2000) dettaglio += pezzo; });
      build.once('error', rifiuta);
      build.once('close', (code) => {
        if (code === 0) { risolvi(); return; }
        rifiuta(new Error(`helper build exited with code ${code}${dettaglio.trim() ? `: ${dettaglio.trim()}` : ''}`));
      });
    });
  } catch (error) {
    throw new WorkspaceFileError(`Upload helper not verified and rebuild failed (${error.message})`, 'FILE_WRITE_FAILED');
  }
  if (!combacia()) {
    throw new WorkspaceFileError('Upload helper not verified: the exe SHA256 still differs from the lock after the rebuild', 'FILE_WRITE_FAILED');
  }
  return helperPath;
}

async function writeBytes(stream, closed, bytes) {
  if (stream.destroyed || stream.writableEnded) throw new Error('Upload helper closed');
  if (!stream.write(bytes)) {
    await Promise.race([
      once(stream, 'drain'),
      closed.then(() => { throw new Error('Upload helper terminated'); }),
    ]);
  }
}

async function writeFrame(stream, closed, bytes, { abort = false } = {}) {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(abort ? ABORT_FRAME : bytes.length, 0);
  await writeBytes(stream, closed, header);
  if (bytes.length) await writeBytes(stream, closed, bytes);
}

/** Persist an HTTP byte stream through the pinned-directory helper; never fall back to path-based writes. */
export async function saveChatFile({ rootDir, name, source, helperPath = HELPER }) {
  const requestedName = checkedName(name);
  if (!source || typeof source[Symbol.asyncIterator] !== 'function') {
    throw new WorkspaceFileError('Invalid file content', 'QUERY_INVALID');
  }
  /* ⭐ BUG-20 (06/10/2026): verifica di SOLA LETTURA dei byte dell'helper PRIMA di ogni spawn — mai
   * eseguire un exe non verificato. In caso di rifiuto la richiesta viene drenata come per un helper
   * morto: risposta onesta, nessuna ricevuta, nessun processo avviato. */
  let eseguibile;
  try {
    eseguibile = await helperVerificato(helperPath);
  } catch (error) {
    for await (const _ of source) { /* drain the HTTP request before responding */ }
    throw error;
  }
  const child = spawn(eseguibile, [rootDir, requestedName, randomUUID()], {
    env: {}, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let launchError = null;
  let pipeError = null;
  child.on('error', (error) => { launchError = error; });
  child.stdin.on('error', (error) => { pipeError = error; });
  child.stderr.resume();
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const received = lines[Symbol.asyncIterator]();
  let first;
  try {
    first = await received.next();
    let ready;
    try { ready = JSON.parse(first.value); } catch { /* a missing/broken helper is not an upload receipt */ }
    if (first.done || ready?.ready !== true) {
      for await (const _ of source) { /* drain the HTTP request before responding */ }
      await closed;
      throw ready?.ok === false ? helperError(ready)
        : new WorkspaceFileError('Upload helper not available', 'FILE_WRITE_FAILED');
    }

    let sourceError = null;
    let transportError = null;
    let forwarded = 0;
    try {
      for await (const value of source) {
        if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
          sourceError = new WorkspaceFileError('The file must contain bytes', 'QUERY_INVALID');
          continue;
        }
        if (sourceError || transportError) continue;
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        const remaining = MAX_CHAT_FILE_BYTES + 1 - forwarded;
        if (remaining <= 0) continue;
        const part = chunk.subarray(0, remaining);
        if (!part.length) continue;
        try { await writeFrame(child.stdin, closed, part); forwarded += part.length; }
        catch (error) { transportError = error; }
      }
    } catch (error) { sourceError = error; }

    const abort = Boolean(sourceError || transportError || source.aborted === true || source.complete === false);
    try { await writeFrame(child.stdin, closed, Buffer.alloc(0), { abort }); }
    catch (error) { transportError ??= error; }
    child.stdin.end();
    const final = await received.next();
    const exit = await closed;
    if (sourceError) throw sourceError;
    if (transportError || pipeError || launchError || exit.code !== 0 || final.done) {
      throw new WorkspaceFileError('Upload helper not available', 'FILE_WRITE_FAILED');
    }
    let receipt;
    try { receipt = JSON.parse(final.value); } catch { /* fail closed on malformed helper output */ }
    if (receipt?.ok !== true) throw helperError(receipt);
    const data = receipt.data;
    if (data?.tipo !== 'file' || typeof data.nome !== 'string' || typeof data.percorso !== 'string'
      || !Number.isSafeInteger(data.bytes) || data.bytes < 0 || data.bytes > MAX_CHAT_FILE_BYTES
      || data.percorso !== `allegati/${data.nome}` || data.bytes !== forwarded) {
      throw new WorkspaceFileError('Invalid upload receipt', 'FILE_WRITE_FAILED');
    }
    /* ⛔ BUG-20 (05/10/2026): il percorso relativo `allegati/<nome>` non è risolvibile dal modello quando la
     * radice di lavoro della sessione non è la base del file (Full access → radice del disco) o la base è una
     * copia usa-e-getta. L'assoluto viaggia ACCANTO, senza sostituire la chiave di validazione. */
    return { ...data, assoluto: join(rootDir, 'allegati', data.nome) };
  } finally {
    lines.close();
    if (child.exitCode === null && !child.killed) child.kill();
    await closed;
  }
}
