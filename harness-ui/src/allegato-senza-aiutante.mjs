/*
 * Decisione 43 dell'owner: gli allegati stanno nei dati di TALOS. `saveChatFile` scrive con `talos-chat-upload.exe`, che esiste solo su Windows:
 * dove non c'è, l'ospite passa questa funzione a `creaArchivioAllegati`, con lo stesso contratto.
 *
 * Contratto del `salva` dell'archivio: `rootDir` è una cartella nuova, `name` non è ancora controllato. Si scrive in `<rootDir>/allegati/<nome>`, si
 * consuma `source` anche quando si rifiuta, si rifiuta con `WorkspaceFileError` e gli stessi codici di `saveChatFile`. Mai fuori da `rootDir`, mai
 * sopra un file esistente, mai un parziale col nome finale.
 *
 * Non sa chi la usa: la scelta sta nell'ospite (ritocco della CLI, che la userà su Mac e Linux). Fuori dall'aiutante manca la sua difesa sulla
 * cartella bloccata: per questo non è un ripiego automatico di `saveChatFile`, ma una scelta dichiarata da chi sa di stare in una cartella sua.
 *
 * A pezzi, con un `await` su ogni scrittura: il file intero non sta mai in memoria (condizione di Performance). `rename` e non `link`: non ogni
 * sistema permette `link()` a un'app.
 */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { MAX_CHAT_FILE_BYTES, checkedName } from './chat-file-upload.mjs';
import { WorkspaceFileError } from './workspace-files.mjs';

const esiste = (percorso) => lstat(percorso).then(() => true, (errore) => {
  if (errore?.code === 'ENOENT') return false;
  throw errore;
});

/** La testa del file resta nei limiti di `tetto`; ciò che segue si legge e si butta, così il corpo della richiesta finisce e si può rispondere. */
async function scriviAPezzi(file, source, tetto) {
  let bytes = 0;
  let rifiuto = null;
  for await (const pezzo of source) {
    if (rifiuto) continue;
    if (!(pezzo instanceof Uint8Array)) { rifiuto = new WorkspaceFileError('The file must contain bytes', 'QUERY_INVALID'); continue; }
    if (bytes + pezzo.byteLength > tetto) { rifiuto = new WorkspaceFileError('The file is too large', 'PAYLOAD_LIMIT'); continue; }
    await file.appendFile(pezzo);
    bytes += pezzo.byteLength;
  }
  if (rifiuto) throw rifiuto;
  if (source.aborted === true || source.complete === false) throw new WorkspaceFileError('The upload was interrupted', 'UPLOAD_ABORTED');
  return bytes;
}

export async function salvaAllegatoSenzaAiutante({ rootDir, name, source, tetto = MAX_CHAT_FILE_BYTES }) {
  if (!source || typeof source[Symbol.asyncIterator] !== 'function') throw new WorkspaceFileError('Invalid file content', 'QUERY_INVALID');
  let nome;
  try {
    nome = checkedName(name);
  } catch (rifiuto) {
    for await (const _ of source) { /* il corpo della richiesta si legge comunque, poi si risponde */ }
    throw rifiuto;
  }
  const cartella = join(rootDir, 'allegati');
  await mkdir(cartella, { recursive: true });
  const parziale = join(cartella, `.talos-upload-${randomUUID()}.part`);
  const finale = join(cartella, nome);
  const file = await open(parziale, 'wx', 0o600);
  try {
    const bytes = await scriviAPezzi(file, source, tetto);
    await file.close();
    if (await esiste(finale)) throw new WorkspaceFileError('A file with this name already exists', 'FILE_EXISTS');
    await rename(parziale, finale);
    return { tipo: 'file', nome, percorso: `allegati/${nome}`, bytes };
  } catch (motivo) {
    await file.close().catch(() => {});
    await rm(parziale, { force: true }).catch(() => {});
    throw motivo;
  }
}
