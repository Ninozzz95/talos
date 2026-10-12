/*
 * 11/10/2026 notte — PUBBLICARE UN FILE UNA VOLTA SOLA, ANCHE DOVE I COLLEGAMENTI SONO VIETATI.
 *
 * I due archivi dei Workflow (`store.mjs`, record immutabili; `result-store.mjs`, risultati per impronta) pubblicano con un hard
 * link dal temporaneo già scritto e sincronizzato al nome finale: niente corsa di sovrascrittura, e il file o c'è intero o non c'è.
 * Sul Pad (Android 16, utente shell, server r4 in una cartella di prova della sessione mobile) `link` dà EACCES: nessun Workflow
 * poteva salvare niente. Lo stesso succede su exFAT/FAT32 e su ReFS su Windows.
 *
 * ⛔ La cura NON è `rename`: sovrascrive il nome finale senza dirlo (libuv usa MOVEFILE_REPLACE_EXISTING; misurato e scritto in
 *   `session-store.mjs`, «⛔ MAI `rename`»). È lo stesso ripiego che l'archivio delle sessioni usa dal 23/09/2026: creazione
 *   ESCLUSIVA del nome finale (`'wx'` = O_CREAT|O_EXCL, CREATE_NEW su Windows), scrittura, `sync`, e rilettura dei byte.
 * ⛔ Promessa più debole, dichiarata: senza link un crash a metà scrittura può lasciare un finale incompleto. Chi legge lo scopre
 *   (il risultato si verifica con la sua impronta; un record immutabile diverso dà conflitto), e qui un finale nostro incompleto si
 *   toglie subito.
 */
import { link, open, readFile, unlink } from 'node:fs/promises';

/** I codici con cui un file system dice «niente collegamenti qui» (gli stessi del ripiego di `session-store.mjs`). */
export const CODICI_SENZA_LINK = Object.freeze(new Set(['EISDIR', 'EPERM', 'EACCES', 'EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL']));

/**
 * Pubblica `bytes` in `path`, già scritti e sincronizzati in `temporary`. Torna `'link'`, `'senza-link'` o `'esisteva'` (il nome
 * c'era già: chi chiama decide se i byte presenti vanno bene). Il temporaneo resta a chi chiama.
 */
export async function pubblicaUnaVolta({ temporary, path, bytes }, { linkFn = link, openFn = open, readFileFn = readFile, unlinkFn = unlink } = {}) {
  try {
    await linkFn(temporary, path);
    return 'link';
  } catch (errore) {
    if (errore?.code === 'EEXIST') return 'esisteva';
    if (!CODICI_SENZA_LINK.has(errore?.code)) throw errore;
  }
  let handle;
  try {
    handle = await openFn(path, 'wx', 0o600);
  } catch (errore) {
    if (errore?.code === 'EEXIST') return 'esisteva';
    throw errore;
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    const riletti = await readFileFn(path);
    if (!Buffer.from(riletti).equals(Buffer.from(bytes))) throw Object.assign(new Error('The bytes read back do not match the bytes written.'), { code: 'EIO' });
    return 'senza-link';
  } catch (errore) {
    try { await handle?.close(); } catch { /* già chiuso */ }
    try { await unlinkFn(path); } catch { /* il nome è nostro: creato con 'wx' */ }
    throw errore;
  }
}
