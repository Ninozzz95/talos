/*
 * ⛔⛔ F-001, owner 02/10/2026 «Tutta la guardia di Hermes» — UNA SCRITTURA DI TESTO NON DISTRUGGE UN DOCUMENTO O UN BINARIO.
 *
 * Da quando `leggi` dà il TESTO di docx/xlsx/pptx/pdf (`estrai-documento.mjs`), il modello può credere di avere il file e
 * riscriverlo con `scrivi`/`file_edit`: un testo semplice non è mai un contenitore OOXML/ODF/OLE valido, e il documento è
 * perso. Prima di questa guardia lo fermava solo «leggi prima di sovrascrivere» (T25), e con un motivo FALSO («è cambiato dopo
 * che l'hai letto»: l'istantanea registrata era la dimensione del testo estratto) — il modello rileggeva e riprovava.
 *
 * Porto di Hermes `tools/file_tools_write_guards.py:469-533` (`_check_binary_document_write`, a sua volta da
 * nearai/ironclaw#7109) e `tools/binary_extensions.py` (commit 65ad529, 23/09/2026), liste IDENTICHE:
 *   - documento opaco (OOXML/ODF/EPUB/OLE/RTF): rifiutato SEMPRE, anche un file nuovo;
 *   - file laterale di SQLite (`x.db-wal`, `x.sqlite3-shm`, `x.db-journal`): rifiutato SEMPRE, anche se non esiste;
 *   - PDF e ogni altra estensione binaria: rifiutati solo se il file ESISTE già (la sintassi PDF si scrive a mano, e un
 *     `*.db` di testo per le prove esiste); se non si sa se esiste (casa Linux irraggiungibile) si rifiuta: chiuso, non aperto.
 * Adattato a TALOS: i messaggi nominano i NOSTRI attrezzi (`leggi`, `shell`, `document_create` quando è offerto); in più, su
 * Windows i punti e gli spazi in coda al nome si tolgono prima di guardare l'estensione, perché Win32 li toglie scrivendo
 * (`x.docx.` finisce su `x.docx`). Prove: tests/rev-scrittura-su-binari.test.mjs.
 */

/* Immagini, video, audio, archivi, eseguibili, documenti (.pdf escluso apposta), font, bytecode, database, grafica, Flash, lock. */
export const ESTENSIONI_BINARIE = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff', '.tif',
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpeg', '.mpg',
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.opus',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz', '.z', '.tgz', '.iso',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.obj', '.lib', '.app', '.msi', '.deb', '.rpm',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    '.pyc', '.pyo', '.class', '.jar', '.war', '.ear', '.node', '.wasm', '.rlib',
    '.sqlite', '.sqlite3', '.db', '.mdb', '.idx',
    '.psd', '.ai', '.eps', '.sketch', '.fig', '.xd', '.blend', '.3ds', '.max',
    '.swf', '.fla', '.lockb', '.dat', '.data',
])
/* Contenitori che una scrittura di testo non può MAI produrre validi. Il PDF manca apposta (si scrive a mano). */
export const DOCUMENTI_OPACHI = new Set([
    '.doc', '.docx', '.docm', '.xls', '.xlsx', '.xlsm', '.xlsb',
    '.ppt', '.pps', '.pot', '.pptx', '.pptm', '.ppsx', '.ppsm',
    '.odt', '.ods', '.odp', '.rtf', '.epub',
])
const MARCATORI_SQLITE = ['-wal', '-shm', '-journal']
const ESTENSIONI_SQLITE = new Set(['.db', '.sqlite', '.sqlite3'])
/* I formati che `document_create` sa fare (la sua enum): solo per questi il rifiuto lo suggerisce. */
const CREABILI = new Set(['.docx', '.xlsx', '.pptx'])

/* Il suffisso dall'ULTIMO punto, in minuscolo ("" senza punto): come Hermes `_lower_suffix`, sul percorso intero. */
function suffisso(percorso, { windows = false } = {}) {
    const nome = windows ? String(percorso).replace(/[. ]+$/u, '') : String(percorso)
    const punto = nome.lastIndexOf('.')
    return punto === -1 ? '' : nome.slice(punto).toLowerCase()
}
/* `.db-wal` → `.db`; null se non è un file laterale di SQLite (`x.docx-wal` NON lo è). */
function senzaMarcatoreSqlite(s) {
    for (const m of MARCATORI_SQLITE) {
        if (s.endsWith(m) && ESTENSIONI_SQLITE.has(s.slice(0, -m.length))) return s.slice(0, -m.length)
    }
    return null
}
const haEstensioneIn = (percorso, insieme, opzioni) => { const s = suffisso(percorso, opzioni); return insieme.has(senzaMarcatoreSqlite(s) ?? s) }

export const eLateraleSqlite = (percorso, opzioni) => senzaMarcatoreSqlite(suffisso(percorso, opzioni)) !== null
export const haEstensioneBinaria = (percorso, opzioni) => haEstensioneIn(percorso, ESTENSIONI_BINARIE, opzioni)
export const eDocumentoOpaco = (percorso, opzioni) => haEstensioneIn(percorso, DOCUMENTI_OPACHI, opzioni)
export const ePdf = (percorso, opzioni) => suffisso(percorso, opzioni) === '.pdf'
/* Serve sapere se il file esiste solo per PDF e binari: opachi e laterali si rifiutano comunque. */
export const serveLoStatoDelBersaglio = (percorso, opzioni) =>
    !eDocumentoOpaco(percorso, opzioni) && !eLateraleSqlite(percorso, opzioni) && (ePdf(percorso, opzioni) || haEstensioneBinaria(percorso, opzioni))

/**
 * Il rifiuto per il modello, o null se la scrittura di testo può procedere.
 * @param {string} percorso  il percorso su cui si scriverebbe (l'estensione si legge da qui)
 * @param {{ mostrato?: string, stato?: 'esiste'|'assente'|'ignoto'|null, documentCreate?: boolean, windows?: boolean }} opzioni
 *   `stato` serve solo quando `serveLoStatoDelBersaglio` è vero; `documentCreate` dice se l'attrezzo è offerto in questo giro.
 */
export function motivoPerNonScrivereTesto(percorso, { mostrato = percorso, stato = null, documentCreate = false, windows = false } = {}) {
    const opzioni = { windows }
    const s = suffisso(percorso, opzioni)
    if (eDocumentoOpaco(percorso, opzioni)) {
        const formato = s.slice(1).toUpperCase()
        return `REFUSED. "${mostrato}" is a ${formato} document: a plain-text write can never produce a valid ${formato} file, so it would `
            + 'corrupt it (what leggi shows you of it is its EXTRACTED text, not its bytes). Nothing was written. '
            + (documentCreate && CREABILI.has(s) ? `To make a new ${formato}, use document_create; to change` : 'To create or change')
            + ' this document, use a library through shell (for example python-docx, openpyxl or python-pptx).'
    }
    if (eLateraleSqlite(percorso, opzioni)) {
        return `REFUSED. "${mostrato}" is a SQLite ${s.slice(s.lastIndexOf('-'))} file: it holds raw database pages that SQLite reads on the `
            + 'next open, so text there corrupts the database. Nothing was written. Change the database with the sqlite3 command or a '
            + 'SQLite library through shell.'
    }
    const pdf = s === '.pdf'
    if (!pdf && !haEstensioneBinaria(percorso, opzioni)) return null
    if (stato === 'esiste') {
        return pdf
            ? `REFUSED. "${mostrato}" is an existing PDF: what leggi shows you of it is its EXTRACTED text, not its bytes, so writing text `
                + 'over it would destroy the document. Nothing was written. Change it with a PDF library through shell'
                + (documentCreate ? ', or make a new PDF with document_create' : '') + '. (Writing a NEW .pdf file is allowed.)'
            : `REFUSED. "${mostrato}" is an existing binary file (${s}): leggi does not show you its real content, so writing text over it `
                + 'would destroy it. Nothing was written. Use a tool that understands the format through shell (for a SQLite database, '
                + 'the sqlite3 command or a SQLite library). (Writing a NEW file with this extension is allowed.)'
    }
    if (stato === 'assente') return null
    return `REFUSED. Could not establish whether "${mostrato}" already exists where this write would run (the Linux home may be `
        + 'starting or unreachable), so it could be a binary file this check never saw. Nothing was written: try again once it is reachable.'
}
