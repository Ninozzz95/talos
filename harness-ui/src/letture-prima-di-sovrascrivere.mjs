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

/*
 * ⭐ C25 (owner 10/10/2026, «Tutte e due»; audit A-OVERWRITE-GAP, «mutazione stessa mtime/size») — un editor o una copia possono
 *   RIMETTERE la data di modifica: con mtime e dimensione uguali il file cambiato sembrava quello letto. Due difese insieme:
 *   - `ctimeMs` (l'ora di cambio dello stato, che rimettere la mtime aggiorna): costa una `stat`. Misurato su questa macchina il
 *     10/10: cattura la modifica con 30 ms in mezzo, NON due scritture nello stesso istante (ctime identico al decimo di µs);
 *   - l'IMPRONTA dei byte (sha256), presa quando il file diventa «letto per intero» e di nuovo prima di sostituirlo: copre anche lo
 *     stesso istante. Hermes la ricalcola a ogni lettura (`tools/file_tools_read_tracking.py:257-276`, «A byte snapshot, not just
 *     mtime (editors/copy tools can preserve that)»); qui solo quando serve a una decisione.
 *   Un chiamante che non porta `ctimeMs` o l'impronta resta com'era (la CLI fino al riallineamento).
 */
/* ⛔ Il ctime si muove anche per un cambio di attributi o di permessi senza toccare i byte: lì il file risulta «cambiato» e si
   chiede di rileggerlo. È il verso prudente, voluto (review C25 del desktop). */
function stessaIstantanea(voce, { mtimeMs, size, ctimeMs }) {
    if (!voce || voce.mtimeMs !== mtimeMs || voce.size !== size) return false
    return !(Number.isFinite(voce.ctimeMs) && Number.isFinite(ctimeMs)) || voce.ctimeMs === ctimeMs
}

function voceFresca(registro, chiave, istantanea) {
    const voce = registro.get(chiave)
    if (stessaIstantanea(voce, istantanea)) return voce
    const nuova = { mtimeMs: istantanea.mtimeMs, size: istantanea.size, ctimeMs: istantanea.ctimeMs ?? null, righeViste: 0, righeTotali: null,
        sospese: new Map(), scrittoDaSe: false, impronta: null }
    registro.set(chiave, nuova)
    return nuova
}

/**
 * Una pagina di `leggi` a righe: `primaRiga..ultimaRiga` su `righeTotali`, e le righe accorciate di quella pagina.
 * Conta solo se continua ciò che si era già visto (pagine contigue dalla 1): una pagina staccata non riempie un buco.
 */
export function registraLetturaRighe(registro, chiave, { mtimeMs, size, ctimeMs, primaRiga, ultimaRiga, righeTotali, righeAccorciate = [] }) {
    const voce = voceFresca(registro, chiave, { mtimeMs, size, ctimeMs })
    if (Number.isSafeInteger(righeTotali)) voce.righeTotali = righeTotali
    if (Number.isSafeInteger(primaRiga) && Number.isSafeInteger(ultimaRiga) && primaRiga <= voce.righeViste + 1) {
        voce.righeViste = Math.max(voce.righeViste, ultimaRiga)
    }
    /* C25: una riga accorciata ricorda da quale byte manca (`daByte`); un chiamante vecchio passa il solo numero ⇒ `null`. */
    for (const accorciata of righeAccorciate) {
        const riga = typeof accorciata === 'number' ? accorciata : accorciata?.riga
        if (!Number.isSafeInteger(riga)) continue
        const daByte = Number.isSafeInteger(accorciata?.daByte) ? accorciata.daByte : null
        if (!voce.sospese.has(riga)) voce.sospese.set(riga, daByte)
    }
}

/**
 * Una lettura dentro una riga lunga (`byteOffset`): la riga è vista quando le letture la coprono DI FILA dal byte in cui la pagina
 * l'aveva lasciata fino alla sua fine.
 * ⛔ C25 (owner 10/10/2026; audit A-OVERWRITE-GAP, «salto al solo finale di riga lunga»): prima bastava una lettura che ARRIVASSE alla
 *   fine della riga, anche partita a metà ⇒ il centro mai visto contava come letto e `scrivi` poteva sostituirlo. Come Hermes, che
 *   conta solo pagine contigue (`tools/file_tools_read_tracking.py:11`, «contiguous pages that reach the last line»).
 * Un chiamante vecchio (nessun `daByte`) resta com'era: la sola fine basta.
 */
export function registraLetturaDentroRiga(registro, chiave, { mtimeMs, size, ctimeMs, riga, rigaFinita, daByte = null, aByte = null }) {
    const voce = registro.get(chiave)
    if (!stessaIstantanea(voce, { mtimeMs, size, ctimeMs }) || !voce.sospese.has(riga)) return
    const manca = voce.sospese.get(riga)
    if (manca === null || !Number.isSafeInteger(daByte)) {
        if (rigaFinita) voce.sospese.delete(riga)
        return
    }
    if (daByte > manca) return // un salto: il pezzo fra `manca` e `daByte` non è stato visto
    if (rigaFinita) { voce.sospese.delete(riga); return }
    if (Number.isSafeInteger(aByte) && aByte > manca) voce.sospese.set(riga, aByte)
}

/**
 * Una scrittura del modello stesso. Con `intera` (sostituzione completa) conosce tutto il file; un'aggiunta o una modifica
 * mirata aggiornano l'istantanea senza cambiare quanto era noto — la propria modifica non deve rendere il file «cambiato».
 */
export function registraScritturaPropria(registro, chiave, { mtimeMs, size, ctimeMs = null, intera, impronta = null }) {
    if (intera) {
        registro.set(chiave, { mtimeMs, size, ctimeMs, righeViste: 0, righeTotali: null, sospese: new Map(), scrittoDaSe: true, impronta })
        return
    }
    const voce = registro.get(chiave)
    if (voce) { voce.mtimeMs = mtimeMs; voce.size = size; voce.ctimeMs = ctimeMs; voce.impronta = impronta }
}

/** C25: serve l'impronta dei byte di questo file? Sì quando il modello lo conosce per intero e non ce l'ha ancora. */
export function serveImpronta(registro, chiave) {
    const voce = registro.get(chiave)
    return Boolean(voce && voce.impronta === null && visto(voce))
}

/** C25: c'è un'impronta da confrontare prima di sostituire (o da rinnovare dopo una propria scrittura)? */
export function haImpronta(registro, chiave) {
    return typeof registro.get(chiave)?.impronta === 'string'
}

/** C25: l'impronta presa sul disco vale solo se il file è ancora quello dell'istantanea registrata. */
export function registraImpronta(registro, chiave, { mtimeMs, size, ctimeMs, impronta }) {
    const voce = registro.get(chiave)
    if (typeof impronta === 'string' && stessaIstantanea(voce, { mtimeMs, size, ctimeMs })) voce.impronta = impronta
}

function visto(voce) {
    if (voce.scrittoDaSe) return true
    return Number.isSafeInteger(voce.righeTotali) && voce.righeViste >= voce.righeTotali && voce.sospese.size === 0
}

/**
 * Perché NON si può sostituire il file che adesso ha questa istantanea, o `null` se si può.
 * @returns {null|'mai-letto'|'letto-in-parte'|'cambiato'}
 */
export function motivoPerNonSovrascrivere(registro, chiave, { mtimeMs, size, ctimeMs, impronta }) {
    if (size === 0) return null
    const voce = registro.get(chiave)
    if (!voce) return 'mai-letto'
    if (!stessaIstantanea(voce, { mtimeMs, size, ctimeMs })) return 'cambiato'
    if (typeof voce.impronta === 'string' && typeof impronta === 'string' && voce.impronta !== impronta) return 'cambiato'
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
