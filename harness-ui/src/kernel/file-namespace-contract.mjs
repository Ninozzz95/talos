import { lstat, readlink } from 'node:fs/promises'
import { win32 } from 'node:path'

/**
 * Windows Node resolves a single-leading-slash path on the current drive, not in WSL.
 * Refuse the ambiguous spelling; explicit host paths still go through existing policy.
 * Node24.18.0 path and Microsoft Win32/WSL contracts: see LEDGER-NAMESPACE35.
 */
/**
 * ⛔⛔ 01/10/2026 (owner: «Rifiuto prefissi NT + chiedo per \\server») — su Windows basta RISOLVERE o TOCCARE un percorso di rete
 *   perché il sistema avvii l'autenticazione SMB, consegnando l'hash NTLM dell'utente al server (Hermes `agent/file_safety.py:
 *   108-176`; GHSA-v6wh-96g9-6wx3; Horizon3 «NTLM Credential Theft in Python Windows Applications»). Si guarda SOLO la stringa:
 *   ogni `stat`/`realpath`/lettura sarebbe già il contatto.
 * @returns {'nt'|'rete'|null} `nt` = prefissi del namespace NT/dispositivi (`\\??\`, `\\.\`, `\\?\UNC\`, `\\?\GLOBALROOT`): mai un
 *   input legittimo, su nessuna piattaforma (come Hermes); `rete` = una condivisione `\\server\…` su Windows; `null` = tutto il
 *   resto, compresi `\\?\C:\…` (locale) e `\\wsl.localhost\…`/`\\wsl$\…` (la casa Linux sulla stessa macchina).
 */
export function classificaPercorsoDiRete(percorso, {platform = process.platform} = {}) {
    if (typeof percorso !== 'string' || percorso.length < 3) return null
    const s = percorso.replaceAll('/', '\\')
    // `\??\` è il prefisso NT vero (una barra); `\\??\` non è una forma Win32 valida ma si rifiuta uguale: mai toccarla.
    if (s.startsWith('\\??\\') || s.startsWith('\\\\??\\') || s.startsWith('\\\\.\\')) return 'nt'
    if (s.startsWith('\\\\?\\')) {
        const resto = s.slice(4).toUpperCase()
        return resto.startsWith('UNC\\') || resto.startsWith('GLOBALROOT') ? 'nt' : null
    }
    if (platform !== 'win32' || !s.startsWith('\\\\')) return null
    const ospite = s.slice(2).split('\\', 1)[0].toLowerCase()
    if (ospite === '' || ospite === 'wsl.localhost' || ospite === 'wsl$') return null
    return 'rete'
}

/** L'host di un percorso `\\host\…` (o `//host/…`). */
export function ospiteDi(percorso) {
    return String(percorso).replaceAll('/', '\\').slice(2).split('\\', 1)[0]
}

/* Il bersaglio di un collegamento come lo dà `readlink`: la forma lunga `\\?\UNC\srv\x` è la stessa condivisione di `\\srv\x`. */
function bersaglioDiRete(bersaglio) {
    const s = String(bersaglio).replaceAll('/', '\\')
    const breve = /^\\\\\?\\UNC\\/iu.test(s) ? `\\\\${s.slice(8)}` : s
    const genere = classificaPercorsoDiRete(breve, { platform: 'win32' })
    return genere ? { genere, ospite: genere === 'rete' ? ospiteDi(breve) : null } : null
}

function dentroCartellaWin(radice, percorso) {
    const r = win32.normalize(radice).replace(/\\+$/u, '')
    const p = win32.normalize(percorso)
    return p === r || p.startsWith(`${r}\\`)
}

/**
 * ⛔⛔ 02/10/2026 (revisione Codex, rilievi critici 1 e 2; owner: «Una domanda per sessione» e «Li seguo senza aprirli, +1 su
 *   Hermes») — DOVE PORTA DAVVERO UN PERCORSO, SENZA MAI SEGUIRE UN COLLEGAMENTO. La sola stringa non basta:
 *   1. un percorso relativo dentro una cartella della sessione che sta su una condivisione (`\\nas\progetto` + `a.txt`) è già
 *      un contatto di rete (`via: 'cartella'`);
 *   2. un collegamento o una giunzione LOCALE che punta a una condivisione (`progetto\link` → `\\srv\x`) fa toccare la rete al
 *      primo `stat`/`open` che lo attraversa (`via: 'collegamento'`). Hermes non lo copre (`agent/file_safety.py:103-170`: solo
 *      la stringa, e le condivisioni normali sono «a policy question»).
 *   Si cammina il percorso un pezzo alla volta con `lstat` (che NON segue il collegamento) e, per ogni collegamento, `readlink`
 *   (che legge il bersaglio scritto nel collegamento stesso, sul disco locale): nessuna delle due apre la destinazione.
 *   Un bersaglio locale si segue a parole e si ricomincia (al più 40 salti, come il limite di `percorsoVero`).
 * ⛔ Un'unità di rete MAPPATA (`Z:`) resta fuori: è una sessione SMB già autenticata dalla persona, non un contatto nuovo.
 * @returns {Promise<{genere:'nt'|'rete', ospite:string|null, via:'stringa'|'cartella'|'collegamento', collegamento?:string}|null>}
 */
export async function destinazioneDiRete(percorso, { cartella = null, platform = process.platform, fs = { lstat, readlink } } = {}) {
    if (typeof percorso !== 'string') return null
    const genere = classificaPercorsoDiRete(percorso, { platform })
    if (genere === 'nt') return { genere, ospite: null, via: 'stringa' }
    if (platform !== 'win32') return null
    const radice = typeof cartella === 'string' && cartella.trim() ? cartella : null
    const assoluto = radice ? win32.resolve(radice, percorso) : win32.resolve(percorso)
    if (classificaPercorsoDiRete(assoluto, { platform }) === 'rete') {
        const dallaCartella = radice !== null && classificaPercorsoDiRete(radice, { platform }) === 'rete' && dentroCartellaWin(radice, assoluto)
        return { genere: 'rete', ospite: ospiteDi(assoluto), via: dallaCartella ? 'cartella' : 'stringa' }
    }
    let davanti = assoluto
    for (let salti = 0; salti <= 40; salti += 1) {
        const { root } = win32.parse(davanti)
        const pezzi = davanti.slice(root.length).split(/[\\/]+/u).filter(Boolean)
        let corrente = root
        let deviato = false
        for (let i = 0; i < pezzi.length; i += 1) {
            corrente = win32.join(corrente, pezzi[i])
            let info
            try { info = await fs.lstat(corrente) }
            catch { return null } // non esiste (o non si legge): da qui il disco non attraversa nessun collegamento
            if (!info.isSymbolicLink()) continue
            let bersaglio
            try { bersaglio = await fs.readlink(corrente) }
            catch { return null }
            const rete = bersaglioDiRete(bersaglio)
            if (rete) return { ...rete, via: 'collegamento', collegamento: corrente }
            davanti = win32.join(win32.resolve(win32.dirname(corrente), bersaglio), ...pezzi.slice(i + 1))
            deviato = true
            break
        }
        if (!deviato) return null
    }
    return null // troppi salti: il disco risponderà ELOOP, senza uscire dalla macchina
}

/**
 * Per le camminate (`disco.elenca`): una voce che è un collegamento verso la rete. `readlink` legge il collegamento stesso,
 * mai la destinazione. `false` anche quando non si riesce a leggere: chi chiama poi non la apre comunque (vedi chi la usa).
 */
export async function collegamentoVersoLaRete(percorsoDelCollegamento, { platform = process.platform, fs = { readlink } } = {}) {
    if (platform !== 'win32') return false
    try { return Boolean(bersaglioDiRete(await fs.readlink(percorsoDelCollegamento))) }
    catch { return false }
}

export function motivoNamespacePercorso(percorso, {platform = process.platform} = {}) {
    if (platform !== 'win32' || typeof percorso !== 'string' || !/^\/(?![\\/])/u.test(percorso)) return null
    return 'FILE_NAMESPACE_MISMATCH: file tools use the Windows host filesystem; selecting a WSL shell does not move them into Linux. '
        + 'Use an explicit Windows drive path or an explicit UNC path obtained with the official wslpath -w conversion. '
        + 'The ambiguous path was not read or written.'
}
