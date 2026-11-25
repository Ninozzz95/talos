import { lstat, readlink } from 'node:fs/promises'
import { win32 } from 'node:path'
import { hostname } from 'node:os'

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
        if (resto.startsWith('UNC\\') || resto.startsWith('GLOBALROOT')) return 'nt'
        /* BUG-024-UNC giro 2 (20/11/2026): `GLOBAL\` è un altro nome dello stesso spazio (`\GLOBAL??\GLOBAL` → `\GLOBAL??`), quindi
           `\\?\GLOBAL\UNC\ospite` porta alla rete come `\\?\UNC\ospite` (Hermes `file_safety.py:160` guarda solo UNC e GLOBALROOT). Solo
           le forme che vanno alla rete: `\\?\GLOBAL\C:\…` resta locale. Giro 3: `\\?\GLOBAL\GLOBALROOT…` è prefisso NT per intero,
           come `\\?\GLOBALROOT…` qui sopra (LanmanRedirector, `??\UNC`, `DosDevices\UNC`, `GLOBAL??\UNC` portano alla rete). */
        return /^(?:GLOBAL\\)+(?:UNC\\|GLOBALROOT)/u.test(resto) ? 'nt' : null
    }
    if (platform !== 'win32' || !s.startsWith('\\\\')) return null
    const ospite = s.slice(2).split('\\', 1)[0].toLowerCase()
    if (ospite === '' || ospite === 'wsl.localhost' || ospite === 'wsl$') return null
    return 'rete'
}

/**
 * ⛔ Riga 199 (PC 0.2.5, 22/11/2026, giudice v2539) — PORTA A UN ALTRO COMPUTER? Solo il testo, mai il disco. Più stretta di
 *   `classificaPercorsoDiRete` (che dice «nt» anche a `\\.\C:\` e a `\\?\GLOBALROOT\Device\HarddiskVolumeN\` e serve a RIFIUTARE): questa
 *   serve a SALTARE una misura, quindi dice «rete» solo per `UNC\<ospite>` (anche dopo `\\?\`, `\\.\`, `\??\`, `GLOBAL`, `GLOBALROOT`,
 *   `??`, `DosDevices`, `GLOBAL??`), i redirettori di Windows e `\\<ospite>` con due o più barre (cmd e PowerShell collassano le altre).
 *   Questa macchina (`localhost`, `127.x`, `::1`, il suo nome NUDO, WSL) non è «rete»; il suo nome con un dominio dopo sì: per il DNS è
 *   un altro computer. Ogni altro oggetto (`X:`, `Volume{…}`, `HarddiskVolumeN`, `SystemRoot`, `pipe`) si misura come oggi.
 * @returns {{ospite: string, breve: string} | null} `breve` = la forma `\\ospite\…` normalizzata
 */
const NOME_DELLA_MACCHINA = (() => { try { return hostname().toLowerCase() } catch { return '' } })()
const QUESTA_MACCHINA = (o) => /^(?:localhost|127(?:\.\d{1,3}){1,3}|\[?::1\]?|0--1\.ipv6-literal\.net|wsl\$|wsl\.localhost)$/u.test(o) || (NOME_DELLA_MACCHINA !== '' && o === NOME_DELLA_MACCHINA)
export function portaInRete(percorso, { platform = process.platform } = {}) {
    if (platform !== 'win32' || typeof percorso !== 'string') return null
    const s = percorso.replaceAll('/', '\\')
    const prefisso = /^(?:\\\\[?.]|\\\\?\?\?)\\+/u.exec(s)
    let resto = null
    if (prefisso) {
        /* giro unico (A-R1, C-L1): Win32 toglie punti e spazi in coda ai pezzi di `\\.\` (`UNC.` è `UNC`); modello largo, innocuo su `\\?\` */
        let t = s.slice(prefisso[0].length).split('\\').map((p) => (p === '.' || p === '..' ? p : p.replace(/[. ]+$/u, '')))
            .reduce((a, p) => (p === '.' ? a : p === '..' ? a.slice(0, -1) : [...a, p]), []).join('\\') // punto 6: `.`/`..` del testo grezzo, come Win32 su `\\.\`
        for (let m; (m = /^(?:GLOBAL|GLOBALROOT|GLOBAL\?\?|\?\?|DosDevices)\\+/iu.exec(t));) t = t.slice(m[0].length)
        resto = /^(?:UNC|Device\\+(?:Mup|LanmanRedirector|WebDavRedirector|RdpDr))\\+(.*)$/isu.exec(t)?.[1] ?? null
    } else resto = /^\\{2,}(.*)$/su.exec(s)?.[1] ?? null
    const ospite = resto?.split('\\', 1)[0].split('@', 1)[0].toLowerCase()
    if (!ospite || QUESTA_MACCHINA(ospite)) return null
    const breve = win32.normalize(`\\\\${resto}`) // `\\ospite` senza condivisione Node lo dà con una barra sola: resta com'è
    return { ospite, breve: breve.startsWith('\\\\') ? breve : `\\\\${resto}` }
}

/** Riga 199: `percorso` porta a un altro computer e NON sta dentro una delle `radici` (cartella, casa, progetti) che è sulla rete anche lei. */
export function reteEstranea(percorso, radici = [], opzioni = {}) {
    const rete = portaInRete(percorso, opzioni)
    if (!rete) return false
    const p = rete.breve.toLowerCase()
    return !radici.some((r) => {
        const q = portaInRete(r, opzioni)?.breve.toLowerCase().replace(/\\+$/u, '')
        return q !== undefined && (p.replace(/\\+$/u, '') === q || p.startsWith(`${q}\\`))
    })
}

/** Riga 199, giro unico (A-R5, C-L2): in PowerShell `FileSystem::X` e `Microsoft.PowerShell.Core\FileSystem::X` sono il posto `X`. */
export const senzaFornitore = (t) => (typeof t === 'string' ? t.replace(/^(?:Microsoft\.PowerShell\.Core[\\/]+)?FileSystem::/iu, '') : t)

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
export async function destinazioneDiRete(percorso, { cartella = null, platform = process.platform, fs = { lstat, readlink }, visti = null } = {}) {
    if (typeof percorso !== 'string') return null
    /* BUG-024-UNC giro 2 (tempo): `visti` è la memoria di UN comando (`cp` verso 3.237 cartelle): un pezzo già letto con `lstat` o
       `readlink` non si rilegge (come `knownHard` di `realpathSync` in Node). Senza `visti` si legge ogni volta, come prima. */
    const leggi = (porta, p) => {
        if (!(visti instanceof Map)) return fs[porta](p)
        const k = `${porta}\u0000${p}` // maiuscole ESATTE (giro 3): in una cartella che le distingue `link` e `Link` sono due posti
        if (!visti.has(k)) visti.set(k, fs[porta](p))
        return visti.get(k)
    }
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
            try { info = await leggi('lstat', corrente) }
            catch { return null } // non esiste (o non si legge): da qui il disco non attraversa nessun collegamento
            if (!info.isSymbolicLink()) continue
            let bersaglio
            try { bersaglio = await leggi('readlink', corrente) }
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
