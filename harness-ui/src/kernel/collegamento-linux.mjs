/*
 * ⛔⛔ 5a, programma «filesystem guest» (owner 01/10/2026: «errore onesto e spiegato», mai «non esiste») — I COLLEGAMENTI
 *   SIMBOLICI CREATI DA LINUX SU UN DISCO DI WINDOWS. Finding AUDITV2-F10, T08, B03.
 *
 * Misurato il 01/10/2026 sulla macchina dell'owner (Ubuntu in WSL, `ln -s` dentro una cartella di C:):
 *   · Node su Windows: `lstat` → isSymbolicLink() vero; `readlink` → la destinazione Linux (`vero.txt`, `/etc/hostname`, `d`);
 *     `stat`, `open`, `readdir`, `writeFile`, `realpath` → **EACCES**, anche quando il collegamento è valido;
 *   · ripgrep: `rg: <percorso>: Impossibile accedere al file. (os error 1920)` per ogni collegamento;
 *   · oggi gli attrezzi dicevano «EACCES: permission denied» (leggi, scrivi), «does not exist» (file_edit), «not a readable
 *     folder» (elenca), «ripgrep reported an error» (cerca) — mai il perché.
 * Perché: Windows riconosce il punto di analisi LX ma non lo sa seguire (Trail of Bits, «Why Windows can't follow WSL
 *   symlinks», 12/02/2024; NtCreateFile → STATUS_IO_REPARSE_TAG_NOT_HANDLED; microsoft/WSL#353). È un limite del confine
 *   Windows/WSL, non di TALOS: la diagnosi NAMESPACE26 (30/09) dice di NON riscrivere il codice in ENOENT, che sarebbe falso
 *   per un collegamento valido. ⇒ Il codice EACCES resta nel testo; accanto si dice che cos'è, dove punta e che cosa fare.
 *
 * ⛔ Le giunzioni e i collegamenti di Windows (mklink) restano fuori: Windows li segue (`stat` riesce), oppure — rotti —
 *   rispondono ENOENT, non EACCES; e `readlink` di una giunzione dà un percorso Windows (`C:\…`). Qui conta solo la terna
 *   «collegamento + EACCES/EPERM nel seguirlo + destinazione in forma Linux».
 */
import { lstat, readlink, stat } from 'node:fs/promises'
import { lstatSync, readlinkSync, statSync } from 'node:fs'
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path'

const CODICI_NON_SEGUITO = new Set(['EACCES', 'EPERM'])

/** Una destinazione scritta come la scrive Linux (non `C:\…`, non `\\server\…`). */
export function destinazioneInFormaLinux(destinazione) {
    const d = String(destinazione ?? '')
    return d !== '' && !/^[A-Za-z]:[\\/]/u.test(d) && !d.startsWith('\\\\') && !d.includes('\\')
}

function componenti(percorsoAssoluto) {
    const assoluto = resolve(percorsoAssoluto)
    const radice = parse(assoluto).root
    const parti = assoluto.slice(radice.length).split(/[\\/]+/u).filter(Boolean)
    return parti.map((_, i) => resolve(radice, ...parti.slice(0, i + 1)))
}

/** La regola, pura: collegamento + seguirlo fallisce con EACCES/EPERM + destinazione in forma Linux. Altrimenti `null`. */
export function collegamentoNonSeguito(p, info, seguito, destinazione) {
    if (!info.isSymbolicLink()) return null
    if (seguito === true) return null
    if (!CODICI_NON_SEGUITO.has(seguito) || !destinazioneInFormaLinux(destinazione)) return null
    return { collegamento: p, destinazione }
}

/**
 * Il primo componente di `percorsoAssoluto` che è un collegamento Linux che Windows non sa seguire, o `null`.
 * Si cammina dalla radice del disco: un collegamento può stare anche su una cartella a metà strada (`linkdir/f.txt`).
 * Solo su Windows: altrove un collegamento rotto risponde ENOENT e il caso non esiste.
 */
export async function collegamentoLinuxSulPercorso(percorsoAssoluto, { piattaforma = process.platform } = {}) {
    if (piattaforma !== 'win32' || typeof percorsoAssoluto !== 'string' || percorsoAssoluto === '') return null
    for (const p of componenti(percorsoAssoluto)) {
        let info
        try { info = await lstat(p) } catch { return null }
        if (info.isSymbolicLink()) {
            const seguito = await stat(p).then(() => true, (e) => e?.code ?? 'ERRORE')
            const destinazione = seguito === true ? '' : await readlink(p).catch(() => '')
            const trovato = collegamentoNonSeguito(p, info, seguito, destinazione)
            if (trovato) return trovato
            if (seguito !== true) return null
        }
        else if (!info.isDirectory()) return null
    }
    return null
}

/** La stessa ricerca, sincrona: la usa l'avviso di `cerca`, che si compone in modo sincrono (al più 20 voci, solo su errore). */
export function collegamentoLinuxSulPercorsoSync(percorsoAssoluto, { piattaforma = process.platform } = {}) {
    if (piattaforma !== 'win32' || typeof percorsoAssoluto !== 'string' || percorsoAssoluto === '') return null
    for (const p of componenti(percorsoAssoluto)) {
        let info
        try { info = lstatSync(p) } catch { return null }
        if (info.isSymbolicLink()) {
            let seguito = true
            try { statSync(p) } catch (e) { seguito = e?.code ?? 'ERRORE' }
            let destinazione = ''
            if (seguito !== true) { try { destinazione = readlinkSync(p) } catch { destinazione = '' } }
            const trovato = collegamentoNonSeguito(p, info, seguito, destinazione)
            if (trovato) return trovato
            if (seguito !== true) return null
        }
        else if (!info.isDirectory()) return null
    }
    return null
}

/* Dove punta, visto da Windows: relativa alla cartella del collegamento, oppure `/mnt/<x>/…` → `X:\…`. `null` = dentro Linux. */
function destinazioneSuWindows(collegamento, destinazione) {
    const montaggio = /^\/mnt\/([a-z])(?:\/(.*))?$/u.exec(destinazione)
    if (montaggio) return resolve(`${montaggio[1].toUpperCase()}:\\`, (montaggio[2] ?? '').split('/').join(sep))
    if (destinazione.startsWith('/')) return null
    return resolve(dirname(collegamento), destinazione.split('/').join(sep))
}

function esiste(p) {
    try { lstatSync(p); return true } catch { return false }
}

function comeLoVedeIlModello(cartella, assoluto) {
    if (typeof cartella === 'string' && cartella !== '') {
        const rel = relative(resolve(cartella), assoluto)
        if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/')
    }
    return assoluto
}

/**
 * La frase onesta per il modello. `codice` è quello vero dell'errore (di solito EACCES): resta in testa, come chiede la
 * diagnosi NAMESPACE26 («non riscrivere il codice»).
 */
export function spiegazioneCollegamentoLinux({ collegamento, destinazione }, { richiesto = null, cartella = null, codice = 'EACCES' } = {}) {
    const nome = comeLoVedeIlModello(cartella, collegamento)
    const sulPercorso = richiesto && resolve(richiesto) !== resolve(collegamento)
        ? ` It is a folder on the way to "${comeLoVedeIlModello(cartella, resolve(richiesto))}".` : ''
    const suWindows = destinazioneSuWindows(collegamento, destinazione)
    let dove
    if (suWindows === null) dove = ` Its target is a path inside Linux that Windows cannot see: use the shell (for example cat "${destinazione}" or ls "${destinazione}").`
    else if (!esiste(suWindows)) dove = ' Its target does not exist: the link is broken.'
    else if (sulPercorso) {
        /* Una cartella collegata a metà strada: il percorso utile è quello che passa dalla destinazione (`linkdir/f.txt` → `d/f.txt`). */
        const equivalente = resolve(suWindows, relative(resolve(collegamento), resolve(richiesto)))
        dove = ` Its target is "${comeLoVedeIlModello(cartella, suWindows)}": use "${comeLoVedeIlModello(cartella, equivalente)}" instead.`
    }
    else dove = ` Its target is "${comeLoVedeIlModello(cartella, suWindows)}": use that path instead.`
    return `${codice} — "${nome}" is a symbolic link created by Linux (WSL) on a Windows drive, pointing to "${destinazione}". `
        + 'Windows cannot follow Linux symbolic links, so the file tools cannot open it: it is not a missing file, and not a permission that can be granted.'
        + sulPercorso + dove
}

/* ripgrep su Windows: `rg: <percorso>: <messaggio localizzato> (os error 1920)` — ERROR_CANT_ACCESS_FILE. */
const RIGA_RG_NON_ACCESSIBILE = /^rg: (.+?): .*\(os error 1920\)\s*$/u

/**
 * Dallo stderr di ripgrep: i collegamenti Linux che non ha potuto leggere (al più `massimo` nominati, come li vede il modello)
 * e quanti ALTRI errori ha riportato. Ogni percorso si verifica sul disco: una riga 1920 che non è un collegamento Linux
 * resta fra gli altri errori, non si nomina come collegamento.
 */
export function erroriDiRipgrep(stderr, cartella, { massimo = 20, piattaforma = process.platform } = {}) {
    const esito = { collegamenti: [], collegamentiTotali: 0, altri: 0 }
    if (typeof stderr !== 'string' || stderr === '') return esito
    for (const riga of stderr.split(/\r?\n/u)) {
        if (!riga.startsWith('rg: ')) continue
        const m = RIGA_RG_NON_ACCESSIBILE.exec(riga)
        const trovato = m ? collegamentoLinuxSulPercorsoSync(resolve(cartella, m[1]), { piattaforma }) : null
        if (!trovato) { esito.altri++; continue }
        esito.collegamentiTotali++
        if (esito.collegamenti.length < massimo) esito.collegamenti.push({ percorso: comeLoVedeIlModello(cartella, trovato.collegamento), destinazione: trovato.destinazione })
    }
    return esito
}

/** L'avviso di `cerca` per i collegamenti Linux non letti, o '' se non ce ne sono. */
export function avvisoCollegamentiDiRipgrep({ collegamenti, collegamentiTotali }) {
    if (!collegamentiTotali) return ''
    const elenco = collegamenti.map((c) => `${c.percorso} → ${c.destinazione}`).join(', ')
    const altri = collegamentiTotali > collegamenti.length ? ` and ${collegamentiTotali - collegamenti.length} more` : ''
    return `⚠ incomplete scan: ${collegamentiTotali} symbolic link(s) created by Linux (WSL) on this Windows drive cannot be read by Windows and were not searched: ${elenco}${altri}. `
        + 'Search their targets instead, or use the shell (for example grep -rn).'
}
