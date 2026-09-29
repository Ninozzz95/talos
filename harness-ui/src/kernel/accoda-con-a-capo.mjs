/*
 * accoda-con-a-capo.mjs — T-15 (audit ZIP revisione, 28/09/2026; owner: «Sì, nella 19»).
 *
 * `scrivi` con mode:"append" e `document_create` con mode:"append" passano il pezzo com'è
 * al flag `'a'` di Node: se il file non finisce con `\n` e il pezzo non inizia con `\n`,
 * l'ultima riga vecchia e la prima nuova ne nascono SALDATE («TOKEN_OK_V4LINEA_APPEND_V4»).
 * Nessun tool a righe (diff, git, log) le rileggerebbe come due righe: è il marker
 * «No newline at end of file» di GNU diff3/freebsd-cgit, la ragione per cui un append
 * responsabile separa.
 *
 * Qui sta l'UNA implementazione (piano 0.1.19 §1.2), con due chiamanti voluti:
 * l'attrezzo `scrivi` del kernel (`talosHarness.mjs`) e `document_create`
 * (`workspace-files.mjs`). Vive in `src/kernel/` e non dentro `talosHarness.mjs`
 * perché `workspace-files.mjs` è dichiaratamente fuori dal kernel (azioni dell'owner,
 * niente kernel benchmarkato): importare QUESTO modulo non porta il kernel con sé.
 *
 * ⛔ L'ultimo byte si legge con un handle a posizione `size-1` (stessa API di
 *   `leggiTestoLimitato`), MAI leggendo il file intero: un append a un file lungo
 *   non deve pagare il file lungo solo per sapere come finisce.
 * ⛔ Chi non sa leggere non indovina: un `ENOENT` (il file non c'è: l'append lo
 *   creerà) e un file di ZERO byte non separano niente — non c'è riga da fondere —
 *   mentre qualunque altro errore di lettura SALE: la scrittura che segue fallirebbe
 *   per lo stesso motivo, e un ripiego silenzioso qui sarebbe una fusione dichiarata
 *   riuscita. Un handle che legge ZERO byte a `size-1` (file accorciato sotto i piedi
 *   fra `stat` e `read`) non separa: sul file di adesso non c'è ultima riga.
 * ⛔ La decisione è una FOTOGRAFIA presa prima dei cancelli: se un altro processo
 *   scrive un `\n` finale nel frattempo, il separatore in più resta — una sola append
 *   per chiamata (atomicità conservata), il caso è dichiarato qui.
 *
 * Fonti (28/09/2026): GNU diffutils/freebsd-cgit «No newline at end of file»;
 * GitHub, issue sull'Edit tool di Claude Code (read-before-edit). Concorrenti letti
 * nel codice: nessuno espone un append al modello (opencode `tool/write.ts` write
 * piena con diff; Hermes `file_tools.py:853` write, `:948` patch; claude-code
 * `sdk-tools.d.ts` solo Edit; codex `ext/history-notes` `append_to_file` remoto):
 * il separatore non ha precedenti da copiare, la best practice viene dal diff stesso.
 */
import { open } from 'node:fs/promises';

/**
 * Il pezzo che davvero andrà in append: con UN `\n` davanti quando il file esiste,
 * non è vuoto, non finisce già con `\n` e il pezzo stesso non inizia con `\n`.
 * Il chiamante scrive il pezzo ritornato con UNA sola append (flag `'a'`).
 *
 * @param {string} percorsoAssoluto il file su disco, già risolto dentro la radice
 * @param {string} pezzo il testo da accodare (per i binari NON si chiama: un `0x0A`
 *   in mezzo a byte binari non separa righe, le corrompe)
 * @param {{apriFn?:function}} [opzioni] iniettabile per le prove
 * @returns {Promise<{pezzo:string, separatore:boolean}>}
 */
export async function pezzoConSeparatore(percorsoAssoluto, pezzo, { apriFn = open } = {}) {
    if (!pezzo || pezzo.startsWith('\n')) return { pezzo, separatore: false }
    let handle
    try {
        handle = await apriFn(percorsoAssoluto, 'r')
    }
    catch (rotta) {
        if (rotta?.code === 'ENOENT') return { pezzo, separatore: false }
        throw rotta
    }
    try {
        const { size } = await handle.stat()
        if (size === 0) return { pezzo, separatore: false }
        const ultimo = Buffer.alloc(1)
        const { bytesRead } = await handle.read(ultimo, 0, 1, size - 1)
        if (bytesRead === 0) return { pezzo, separatore: false }
        return ultimo[0] === 0x0a ? { pezzo, separatore: false } : { pezzo: `\n${pezzo}`, separatore: true }
    }
    finally {
        await handle.close()
    }
}
