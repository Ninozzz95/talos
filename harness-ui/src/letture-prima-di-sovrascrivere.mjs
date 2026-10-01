/*
 * ⭐ T25/B09 (audit 29/09), decisione owner 30/09/2026 notte: «Come Hermes e Claude Code».
 *
 * `scrivi` sostituiva un file esistente senza nessuna guardia, e l'esito diceva solo «written». L'audit proponeva una conferma
 * della persona; i due concorrenti fanno un'altra cosa, più stretta e senza disturbare: RIFIUTANO, prima di toccare il disco,
 * di sostituire un file che il modello non ha letto per intero o che è cambiato dopo la lettura.
 * - Hermes, `tools/file_tools_write_guards.py:492-525` `_stale_overwrite_blocker`: «an existing file with no full-content
 *   baseline for this task (never read in full, read redacted, only patched)» ⇒ rifiuto; «modified since you last read it
 *   (external edit or concurrent agent). Re-read the file before writing.» File nuovi, file letti tutti (in una pagina o a
 *   pagine contigue fino all'ultima riga) e file scritti dal compito stesso passano.
 * - Claude Code, attrezzo Write: «File has not been read yet. Read it first before writing to it.»
 *
 * Qui il registro di UNA sessione: per ogni file (percorso assoluto) l'istantanea che il modello conosce — mtime e dimensione
 * del momento della lettura — e fin dove l'ha visto. «Per intero» vuol dire: righe viste di fila dalla 1 all'ultima, e
 * nessuna riga accorciata (oltre i 2000 caratteri) rimasta a metà; una riga accorciata si completa leggendola fino in fondo
 * con `byteOffset`. Un file vuoto non si protegge: sostituirlo non perde niente.
 * PURO: nessun I/O, le istantanee le passa il kernel.
 */

/** Il registro vuoto di una sessione. */
export function creaRegistroLetture() {
    return new Map()
}

function voceFresca(registro, chiave, { mtimeMs, size }) {
    const voce = registro.get(chiave)
    if (voce && voce.mtimeMs === mtimeMs && voce.size === size) return voce
    const nuova = { mtimeMs, size, righeViste: 0, righeTotali: null, sospese: new Set(), scrittoDaSe: false }
    registro.set(chiave, nuova)
    return nuova
}

/**
 * Una pagina di `leggi` a righe: `primaRiga..ultimaRiga` su `righeTotali`, e le righe accorciate di quella pagina.
 * Conta solo se continua ciò che si era già visto (pagine contigue dalla 1): una pagina staccata non riempie un buco.
 */
export function registraLetturaRighe(registro, chiave, { mtimeMs, size, primaRiga, ultimaRiga, righeTotali, righeAccorciate = [] }) {
    const voce = voceFresca(registro, chiave, { mtimeMs, size })
    if (Number.isSafeInteger(righeTotali)) voce.righeTotali = righeTotali
    if (Number.isSafeInteger(primaRiga) && Number.isSafeInteger(ultimaRiga) && primaRiga <= voce.righeViste + 1) {
        voce.righeViste = Math.max(voce.righeViste, ultimaRiga)
    }
    for (const riga of righeAccorciate) voce.sospese.add(riga)
}

/** Una lettura dentro una riga lunga (`byteOffset`): se arriva alla fine della riga, quella riga è vista. */
export function registraLetturaDentroRiga(registro, chiave, { mtimeMs, size, riga, rigaFinita }) {
    const voce = registro.get(chiave)
    if (!voce || voce.mtimeMs !== mtimeMs || voce.size !== size) return
    if (rigaFinita) voce.sospese.delete(riga)
}

/**
 * Una scrittura del modello stesso. Con `intera` (sostituzione completa) conosce tutto il file; un'aggiunta o una modifica
 * mirata aggiornano l'istantanea senza cambiare quanto era noto — la propria modifica non deve rendere il file «cambiato».
 */
export function registraScritturaPropria(registro, chiave, { mtimeMs, size, intera }) {
    if (intera) {
        registro.set(chiave, { mtimeMs, size, righeViste: 0, righeTotali: null, sospese: new Set(), scrittoDaSe: true })
        return
    }
    const voce = registro.get(chiave)
    if (voce) { voce.mtimeMs = mtimeMs; voce.size = size }
}

function visto(voce) {
    if (voce.scrittoDaSe) return true
    return Number.isSafeInteger(voce.righeTotali) && voce.righeViste >= voce.righeTotali && voce.sospese.size === 0
}

/**
 * Perché NON si può sostituire il file che adesso ha questa istantanea, o `null` se si può.
 * @returns {null|'mai-letto'|'letto-in-parte'|'cambiato'}
 */
export function motivoPerNonSovrascrivere(registro, chiave, { mtimeMs, size }) {
    if (size === 0) return null
    const voce = registro.get(chiave)
    if (!voce) return 'mai-letto'
    if (voce.mtimeMs !== mtimeMs || voce.size !== size) return 'cambiato'
    return visto(voce) ? null : 'letto-in-parte'
}

/** La frase per il modello: cosa è successo e le due strade che funzionano. */
export function frasePerNonSovrascrivere(percorso, motivo, size) {
    const perche = motivo === 'cambiato'
        ? 'it changed after you last read it (another edit, a command or another agent)'
        : motivo === 'letto-in-parte'
            ? 'you have read only part of it'
            : 'you have not read it in this session'
    return `REFUSED. "${percorso}" already exists (${size} bytes) and ${perche}, so replacing it could destroy content you have not seen. `
        + 'Nothing was written. Read it with `leggi` first (every page, if it is long), then write it again — '
        + 'or change only the part you need with `file_edit`, or add at the end with mode:"append".'
}
