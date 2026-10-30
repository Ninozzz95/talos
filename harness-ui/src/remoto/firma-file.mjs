/*
 * L'impronta di un file del remoto, per rileggerlo solo quando CAMBIA (27/10/2026).
 *
 * Come Hermes (`utils.py:40-60`, `file_signature` + `RACY_MTIME_WINDOW_NS`, letti il 27/10/2026): dispositivo, inode, dimensione, data
 * di modifica e di cambio, in nanosecondi. Lo stat si chiede in `bigint`: su Windows l'inode letto come numero normale perde cifre e due
 * file diversi possono sembrare lo stesso (nodejs/node#12115). Le date del disco hanno una grana (100 ns su NTFS, il secondo su altri
 * file system): un file modificato negli ultimi 2 s può essere riscritto nello stesso istante senza cambiare impronta («racily clean»,
 * come l'indice di git) ⇒ allora l'impronta è `null` e chi la usa rilegge.
 *
 * Torna `'assente'` se il file non c'è, `null` se non si può fidare (troppo recente, stat fallito, fs senza `stat`).
 */
export const FINESTRA_INCERTA_NS = 2_000_000_000n;

export async function firmaDelFile(fs, file, { adessoNs = () => BigInt(Date.now()) * 1_000_000n } = {}) {
  if (typeof fs?.stat !== 'function') return null;
  let st;
  try { st = await fs.stat(file, { bigint: true }); } catch (e) { return e?.code === 'ENOENT' ? 'assente' : null; }
  if (typeof st?.mtimeNs !== 'bigint') return null;
  if (adessoNs() - st.mtimeNs < FINESTRA_INCERTA_NS) return null;
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
}
