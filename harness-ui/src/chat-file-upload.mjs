import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { normalizzaSottocartella, WorkspaceFileError } from './workspace-files.mjs';

export const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;
const HELPER = fileURLToPath(new URL('../native/talos-chat-upload.exe', import.meta.url));
const ABORT_FRAME = 0xffffffff;
const ERROR_CODES = new Set(['QUERY_INVALID', 'FOLDER_INVALID', 'FILE_WRITE_FAILED', 'FILE_EXISTS', 'PAYLOAD_LIMIT', 'UPLOAD_ABORTED']);

function checkedName(name) {
  if (typeof name !== 'string' || !name || name.length > 240 || Buffer.byteLength(name, 'utf8') > 255
    || name.includes('/') || name.includes('\\')) {
    throw new WorkspaceFileError('Nome del file non valido', 'QUERY_INVALID');
  }
  try {
    if (normalizzaSottocartella(name) !== name) throw new Error('not one file name');
  } catch {
    throw new WorkspaceFileError('Nome del file non valido', 'QUERY_INVALID');
  }
  return name;
}

function helperError(value) {
  const code = ERROR_CODES.has(value?.code) ? value.code : 'FILE_WRITE_FAILED';
  const message = typeof value?.message === 'string' && value.message.length <= 200
    ? value.message : 'Caricamento del file non riuscito';
  return new WorkspaceFileError(message, code);
}

async function writeBytes(stream, closed, bytes) {
  if (stream.destroyed || stream.writableEnded) throw new Error('Helper di caricamento chiuso');
  if (!stream.write(bytes)) {
    await Promise.race([
      once(stream, 'drain'),
      closed.then(() => { throw new Error('Helper di caricamento terminato'); }),
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
    throw new WorkspaceFileError('Contenuto del file non valido', 'QUERY_INVALID');
  }
  const child = spawn(helperPath, [rootDir, requestedName, randomUUID()], {
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
        : new WorkspaceFileError('Helper di caricamento non disponibile', 'FILE_WRITE_FAILED');
    }

    let sourceError = null;
    let transportError = null;
    let forwarded = 0;
    try {
      for await (const value of source) {
        if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
          sourceError = new WorkspaceFileError('Il file deve contenere byte', 'QUERY_INVALID');
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
      throw new WorkspaceFileError('Helper di caricamento non disponibile', 'FILE_WRITE_FAILED');
    }
    let receipt;
    try { receipt = JSON.parse(final.value); } catch { /* fail closed on malformed helper output */ }
    if (receipt?.ok !== true) throw helperError(receipt);
    const data = receipt.data;
    if (data?.tipo !== 'file' || typeof data.nome !== 'string' || typeof data.percorso !== 'string'
      || !Number.isSafeInteger(data.bytes) || data.bytes < 0 || data.bytes > MAX_CHAT_FILE_BYTES
      || data.percorso !== `allegati/${data.nome}` || data.bytes !== forwarded) {
      throw new WorkspaceFileError('Ricevuta del caricamento non valida', 'FILE_WRITE_FAILED');
    }
    return data;
  } finally {
    lines.close();
    if (child.exitCode === null && !child.killed) child.kill();
    await closed;
  }
}
